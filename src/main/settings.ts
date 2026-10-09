import { EventEmitter } from 'node:events';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { isMaskedValue } from '../shared/redact';
import { dataDir, log } from './paths';
import { hasSecret, initSecrets, isSecretKey, maskedSecret, secretsEncrypted, setSecret, SECRET_KEYS } from './secrets';

/**
 * Réglages de l'app, stockés à plat ("a.b.c") dans ~/.dicta-ai/config.json.
 * Les clés correspondent aux data-setting de design/settings/settings.html.
 * Les clés providers.* / cleaning.* sont lues par src/llm/config.ts (même fichier).
 */
export interface Settings {
  'general.shortcut': string; // accélérateur "Alt+Space", "Control+Alt+Space"…
  'general.insertMode': 'paste' | 'clipboard';
  'general.language': string; // 'fr' | 'en' | 'auto'
  'general.launchAtLogin': boolean;
  'whisper.model': string; // tiny | base | small | medium | large-v3-turbo | large-v3-turbo-q5_0
  'whisper.prompt': string;
  'cleaning.level': 'light' | 'standard';
  'cleaning.keepRawOnFailure': boolean;
  'overlay.idleMode': 'dim' | 'hidden';
  'paste.restoreDelayMs': number;
  'onboarding.done': boolean;
  'general.theme': 'light' | 'dark' | 'system';
  'general.sounds': boolean; // sons discrets de début / fin / erreur
  'notes.systemAudio': boolean; // notes : capte aussi le son du Mac (visios)
  'notes.diarization': boolean; // notes : séparation des voix (qui a dit quoi), locale
  'notes.keepAudio': boolean; // notes : garde ~/.dicta-ai/notes/<id>.wav après l'organisation
  'updates.auto': boolean; // vérifie + télécharge les mises à jour en arrière-plan (src/main/updater.ts)
  [k: string]: unknown;
}

export const DEFAULTS: Settings = {
  'general.shortcut': 'LCtrl×2', // double appui sur Control gauche (mains libres) ou maintenue ; fn reste libre (emoji). Alternatives : 'RCtrl×2', 'Fn×2', 'Alt+Space'
  'general.insertMode': 'paste',
  'general.language': 'fr',
  'general.launchAtLogin': false,
  'whisper.model': 'large-v3-turbo',
  'whisper.prompt': 'Dictée en français, avec une ponctuation correcte.',
  'cleaning.level': 'standard', // audit P0 : l'auto-correction montrée à l'essai doit être active par défaut
  'cleaning.keepRawOnFailure': true,
  'overlay.idleMode': 'dim',
  'paste.restoreDelayMs': 250,
  'onboarding.done': false,
  'general.theme': 'light',
  'general.sounds': true,
  'notes.systemAudio': true,
  'notes.diarization': true,
  'notes.keepAudio': false,
  'updates.auto': true,
};

// Fichier partagé avec src/llm/config.ts (clés plates, mêmes noms que l'UI Réglages).
const file = (): string => path.join(process.env.DICTA_AI_HOME || dataDir(), 'config.json');

/** Clé de réglage acceptée depuis un renderer : « section.nom[.sous…] », jamais __proto__ & co. */
const KEY_RE = /^[a-z][A-Za-z0-9]{0,30}(\.[A-Za-z0-9_-]{1,40}){1,3}$/;
const FORBIDDEN = /(^|\.)(__proto__|prototype|constructor)(\.|$)/;
/** Valide une paire clé / valeur (types simples, tailles bornées). Lance une erreur sinon. */
export function validateSetting(k: unknown, v: unknown): asserts k is string {
  if (typeof k !== 'string' || !KEY_RE.test(k) || FORBIDDEN.test(k)) throw new Error('Réglage invalide');
  const ok =
    v === null ||
    typeof v === 'boolean' ||
    (typeof v === 'number' && Number.isFinite(v)) ||
    (typeof v === 'string' && v.length <= 20_000) ||
    (Array.isArray(v) && v.length <= 2000 && v.every((x) => typeof x === 'string' && x.length <= 500));
  if (!ok) throw new Error('Valeur de réglage invalide');
}

class SettingsStore extends EventEmitter {
  private data: Settings = { ...DEFAULTS };

  load(): void {
    try {
      const raw = JSON.parse(fs.readFileSync(file(), 'utf8'));
      this.data = { ...DEFAULTS, ...raw };
    } catch {
      this.data = { ...DEFAULTS };
    }
  }

  /**
   * Migrations des valeurs par défaut enregistrées par les anciennes versions (qui écrivaient tout le fichier) :
   * v2 → raccourci fn ×2 (si l'ancien défaut ⌥Espace n'avait pas été changé), restauration du presse-papiers 250 ms.
   */
  migrate(): void {
    if (Number(this.data['settings.version'] ?? 1) >= 2) return;
    if (this.data['general.shortcut'] === 'Alt+Space') this.set('general.shortcut', 'Fn×2');
    if (this.data['paste.restoreDelayMs'] === 400) this.set('paste.restoreDelayMs', 250);
    this.set('settings.version', 2);
    log('settings: migration v2 (raccourci fn ×2, collage 250 ms)');
  }

  /** v4 : nettoyage « standard » par défaut (l'ancien défaut « light » n'appliquait pas les auto-corrections). */
  migrateV4(): void {
    if (Number(this.data['settings.version'] ?? 1) >= 4) return;
    if (this.data['cleaning.level'] === 'light') this.set('cleaning.level', 'standard');
    this.set('settings.version', 4);
    log('settings: migration v4 (nettoyage standard)');
  }

  /** v3 : la dictée passe sur Control gauche, fn redevient libre pour les emoji. */
  migrateV3(): void {
    if (Number(this.data['settings.version'] ?? 1) >= 3) return;
    if (this.data['general.shortcut'] === 'Fn×2') this.set('general.shortcut', 'LCtrl×2');
    this.set('settings.version', 3);
    log('settings: migration v3 (raccourci Control gauche ×2)');
  }

  get<K extends keyof Settings>(k: K): Settings[K] {
    return this.data[k];
  }

  /**
   * Réglages pour un renderer : les clés API sont MASQUÉES (« gsk_…a3f2 ») + `providers.<id>.hasKey`.
   * La vraie valeur ne quitte jamais le process main (src/main/secrets.ts).
   */
  all(): Settings {
    const out: Settings = { ...this.data };
    for (const k of SECRET_KEYS) {
      const plain = typeof out[k] === 'string' ? (out[k] as string) : '';
      const masked = maskedSecret(k) || (plain && !isMaskedValue(plain) ? maskForUi(plain) : '');
      out[k] = masked;
      out[k.replace(/\.apiKey$/, '.hasKey')] = !!masked;
    }
    return out;
  }

  /**
   * Après app.whenReady() : chiffre les clés en clair de config.json (trousseau macOS) puis les efface
   * du fichier. Sans chiffrement disponible, rien ne change (clés en clair, 0600) et c'est journalisé.
   */
  initSecrets(): void {
    this.load();
    let migrated: string[] = [];
    try {
      migrated = initSecrets(this.data);
    } catch (e) {
      log('secrets: initialisation impossible', e instanceof Error ? e.message : e);
    }
    if (!secretsEncrypted()) {
      log('secrets: chiffrement (trousseau) indisponible → clés conservées dans config.json (0600)');
      return;
    }
    const present = migrated.filter((k) => this.data[k] !== undefined);
    if (!present.length && !this.hasNested()) return;
    for (const k of present) delete this.data[k];
    this.stripNested();
    this.write();
    log(`secrets: ${present.length} clé(s) déplacée(s) de config.json vers le trousseau macOS`);
  }

  /** Forme imbriquée {"providers":{"groq":{"apiKey":…}}} (ancienne config manuelle). */
  private hasNested(): boolean {
    const p = this.data['providers'] as any;
    return !!p && typeof p === 'object' && Object.values(p).some((x: any) => x && typeof x === 'object' && 'apiKey' in x);
  }
  private stripNested(): void {
    const p = this.data['providers'] as any;
    if (!p || typeof p !== 'object') return;
    for (const x of Object.values(p) as any[]) if (x && typeof x === 'object') delete x.apiKey;
  }

  private write(): void {
    try {
      const tmp = `${file()}.${process.pid}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2), { mode: 0o600 });
      fs.renameSync(tmp, file());
      fs.chmodSync(file(), 0o600);
    } catch (e) {
      log('settings: write failed', e instanceof Error ? e.message : e);
    }
  }

  set(k: string, v: unknown): void {
    validateSetting(k, v);
    if (isSecretKey(k)) return this.setSecretSetting(k, v);
    if (this.data[k] === v) return;
    this.load(); // relit pour ne pas écraser des modifications externes
    this.data[k] = v;
    this.write();
    this.emit('change', k, v);
  }

  /** Clé API : chiffrée dans le trousseau ; une valeur masquée renvoyée par l'UI est ignorée. */
  private setSecretSetting(k: string, v: unknown): void {
    if (typeof v !== 'string' && v !== null) return;
    const val = String(v ?? '').trim();
    if (isMaskedValue(val)) return; // l'UI renvoie « gsk_…a3f2 » : pas une nouvelle clé
    if (val.length > 400 || /[\s\x00-\x1f]/.test(val)) throw new Error('Clé API invalide');
    if (setSecret(k, val)) {
      if (this.data[k] !== undefined) {
        this.load();
        delete this.data[k];
        this.write();
      }
      this.emit('change', k, maskedSecret(k));
      return;
    }
    // Repli sans trousseau : comportement historique (config.json 0600).
    if (this.data[k] === val) return;
    this.load();
    this.data[k] = val;
    this.write();
    this.emit('change', k, val ? maskForUi(val) : '');
  }

  hasKey(k: string): boolean {
    return hasSecret(k) || (typeof this.data[k] === 'string' && !!(this.data[k] as string).trim());
  }
}

function maskForUi(v: string): string {
  const s = v.trim();
  return s.length < 16 ? '•••' : `${s.slice(0, 4)}…${s.slice(-4)}`;
}

export const settings = new SettingsStore();
