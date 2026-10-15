import { EventEmitter } from 'node:events';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { isMaskedValue } from '../shared/redact';
import { dataDir, log } from './paths';
import { hasSecret, initSecrets, isSecretKey, maskedSecret, purgeSecretItems, secretsEncrypted, setSecret, SECRET_KEYS, unreadableSecrets } from './secrets';

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
  'context.enabled': boolean; // lit l'app active (Accessibilité) pour orthographier les noms ; rien n'est enregistré
  'dictionary.autoLearn': boolean; // apprend les termes que la personne corrige après un collage
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
  'context.enabled': true,
  'dictionary.autoLearn': true,

  // ── Parité Wispr (chantiers/wispr-parite/api-*.md) ──
  // Micro (api-audio.md)
  'audio.inputDeviceId': '', // vide = micro par défaut du système
  'audio.avoidBluetooth': true, // préférer le micro du Mac aux AirPods / écouteurs Bluetooth
  'audio.maxDurationMin': 20, // 0 = illimitée, plafond 120
  'audio.pauseMedia': true, // Musique / Spotify en pause pendant la dictée
  'audio.lowVoice': false, // voix basse : micro plus sensible
  // Nettoyage (api-llm.md)
  'cleaning.promptMode': 'auto', // 'auto' | 'on' | 'off'
  'cleaning.toneByApp': true,
  'cleaning.frenchTypography': true,
  'context.readBefore': true, // ≤ 300 car. avant le curseur, envoyés au moteur IA avec la dictée
  // Dictionnaire (api-pipe.md : c'est le pipeline qui lit ces clés)
  'dictionary.priority': [], // mots prioritaires (sous-ensemble de cleaning.vocabulary)
  'dictionary.replacements': [], // « avant => après »
  // Historique, collage (api-pipe.md)
  'history.keepAudio': true,
  'history.audioDays': 14,
  'paste.restoreDelayOverrides': [], // « bundleId=ms »
  'paste.rawUndoFirst': false,
  // Snippets, réécriture (chaînes JSON : validateSetting n'accepte pas de tableau d'objets)
  'snippets.enabled': true,
  'snippets.list': '[]',
  'rewrite.enabled': true,
  'rewrite.presets': '', // défini plus bas (suggestions de src/llm/rewrite.ts › DEFAULT_PRESETS)
  // Raccourcis, pastille (api-keys.md)
  'shortcuts.pasteLast': 'Control+Command+V',
  'shortcuts.copyLast': 'Control+Command+C',
  'shortcuts.rewrite': 'Control+Command+R',
  'shortcuts.mouseButton': 0, // 0 = aucun, 4 / 5 = boutons latéraux
  'overlay.livePreview': false,
  'overlay.hiddenUntil': 0,
  // Bloc-notes vocal (api-notes.md)
  'notepad.enabled': false,
};

/**
 * Copie de DEFAULT_PRESETS (src/llm/rewrite.ts) : le bundle LLM est chargé dynamiquement, on ne l'importe pas ici.
 * Format de `rewrite.presets` (lu par src/main/rewrite.ts) : chaîne JSON [{id,name,instruction}], ≤ 20.
 */
export const DEFAULT_REWRITE_PRESETS = [
  { id: 'poli', name: 'Plus poli', instruction: 'Réécris le texte sur un ton plus poli et courtois, sans changer le fond ni rien ajouter.' },
  { id: 'court', name: 'Plus court', instruction: 'Raccourcis le texte en gardant tous les faits importants.' },
  { id: 'corriger', name: 'Corriger', instruction: "Corrige seulement l'orthographe, la grammaire et la ponctuation, sans reformuler." },
  { id: 'liste', name: 'En liste', instruction: 'Transforme le texte en liste à puces, un élément par ligne, sans rien ajouter.' },
  { id: 'resume3', name: 'Résumé en 3 points', instruction: 'Résume le texte en trois points courts, sous forme de liste à puces.' },
  { id: 'linkedin', name: 'Version LinkedIn', instruction: 'Réécris pour un post LinkedIn : ton professionnel et direct, phrases courtes, aucun hashtag ni emoji, sans rien inventer.' },
  { id: 'anglais', name: 'Traduire en anglais', instruction: 'Traduis le texte en anglais, fidèlement.' },
];
DEFAULTS['rewrite.presets'] = JSON.stringify(DEFAULT_REWRITE_PRESETS);

const LANG_CODES = ['auto', 'fr', 'en', 'es', 'de', 'it', 'pt', 'nl'];
const MODS = /^(command|cmd|control|ctrl|commandorcontrol|cmdorctrl|alt|option|shift|super|meta)$/i;
/** Accélérateur Electron (au moins un modificateur) ou '' (désactivé). Même règle que keysLogic.validAccelerator. */
function isAccelOrEmpty(v: unknown): boolean {
  if (v === '') return true;
  if (typeof v !== 'string' || v.length > 60) return false;
  const parts = v.split('+').map((p) => p.trim());
  return parts.length >= 2 && parts.every(Boolean) && parts.slice(0, -1).every((m) => MODS.test(m));
}
const isInt = (v: unknown, min: number, max: number): boolean => typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max;
const isStrList = (v: unknown, maxItems: number, maxLen: number, re?: RegExp): boolean =>
  Array.isArray(v) && v.length <= maxItems && v.every((x) => typeof x === 'string' && x.length <= maxLen && (!re || re.test(x)));
/** Chaîne JSON d'un tableau d'objets dont chaque champ texte est borné. */
function isJsonList(v: unknown, maxItems: number, fields: Record<string, number>, required: string[]): boolean {
  if (typeof v !== 'string' || v.length > 19_500) return false;
  if (v === '') return true;
  try {
    const a = JSON.parse(v);
    return (
      Array.isArray(a) &&
      a.length <= maxItems &&
      a.every(
        (o) =>
          o && typeof o === 'object' && !Array.isArray(o) &&
          required.every((k) => typeof o[k] === 'string') &&
          Object.entries(o).every(([k, x]) => k in fields && typeof x === 'string' && x.length <= fields[k]),
      )
    );
  } catch {
    return false;
  }
}

const BOOL_KEYS = new Set([
  'audio.avoidBluetooth', 'audio.pauseMedia', 'audio.lowVoice', 'cleaning.toneByApp', 'cleaning.frenchTypography',
  'context.readBefore', 'history.keepAudio', 'paste.rawUndoFirst', 'snippets.enabled', 'rewrite.enabled',
  'overlay.livePreview', 'notepad.enabled', 'context.enabled', 'dictionary.autoLearn',
]);
/** Règles strictes des clés connues (les autres gardent la règle générique de validateSetting). */
const STRICT: Record<string, (v: unknown) => boolean> = {
  'audio.inputDeviceId': (v) => typeof v === 'string' && v.length <= 200,
  'audio.maxDurationMin': (v) => isInt(v, 0, 120),
  'cleaning.promptMode': (v) => v === 'auto' || v === 'on' || v === 'off',
  'general.language': (v) => typeof v === 'string' && LANG_CODES.includes(v),
  'dictionary.priority': (v) => isStrList(v, 200, 80),
  'dictionary.replacements': (v) => isStrList(v, 500, 300, /^.{1,80}=>.{0,200}$/s),
  'history.audioDays': (v) => isInt(v, 1, 60),
  'paste.restoreDelayMs': (v) => isInt(v, 0, 5000),
  'paste.restoreDelayOverrides': (v) => isStrList(v, 100, 200, /^[A-Za-z0-9.-]{1,150}=\d{1,5}$/),
  'snippets.list': (v) => isJsonList(v, 100, { trigger: 80, text: 5000 }, ['trigger', 'text']),
  'rewrite.presets': (v) => isJsonList(v, 30, { id: 64, name: 60, instruction: 600 }, ['name', 'instruction']),
  'shortcuts.pasteLast': isAccelOrEmpty,
  'shortcuts.copyLast': isAccelOrEmpty,
  'shortcuts.rewrite': isAccelOrEmpty,
  'shortcuts.mouseButton': (v) => v === 0 || isInt(v, 4, 32),
  'overlay.hiddenUntil': (v) => typeof v === 'number' && Number.isFinite(v) && v >= 0,
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
  if (v === null) return; // null = revenir au défaut
  if (BOOL_KEYS.has(k) && typeof v !== 'boolean') throw new Error('Valeur de réglage invalide');
  const rule = STRICT[k];
  if (rule && !rule(v)) throw new Error('Valeur de réglage invalide');
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

  /**
   * v5 : fournisseurs Mistral et Cloudflare retirés de l'app. On les ôte de providers.order, on efface
   * leurs réglages (providers.mistral.* / providers.cloudflare.*, forme plate ou imbriquée) et leurs
   * clés chiffrées dans secrets.json.
   */
  migrateV5(): void {
    if (Number(this.data['settings.version'] ?? 1) >= 5) return;
    const removed = ['mistral', 'cloudflare'];
    const isRemoved = (k: string) => removed.some((id) => k.startsWith(`providers.${id}.`));
    this.load();
    let changed = false;
    const order = this.data['providers.order'];
    if (Array.isArray(order) && order.some((x) => removed.includes(x))) {
      this.data['providers.order'] = order.filter((x) => !removed.includes(x));
      changed = true;
    }
    for (const k of Object.keys(this.data)) if (isRemoved(k)) (delete this.data[k], (changed = true));
    const nested = this.data['providers'] as any;
    if (nested && typeof nested === 'object') {
      for (const id of removed) if (id in nested) (delete nested[id], (changed = true));
      if (Array.isArray(nested.order) && nested.order.some((x: unknown) => removed.includes(x as string))) {
        nested.order = nested.order.filter((x: unknown) => !removed.includes(x as string));
        changed = true;
      }
    }
    if (changed) this.write();
    let purged = 0;
    try {
      purged = purgeSecretItems(isRemoved);
    } catch (e) {
      log('settings: purge des clés retirées impossible', e instanceof Error ? e.message : e);
    }
    this.set('settings.version', 5);
    log(`settings: migration v5 (Mistral et Cloudflare retirés${purged ? `, ${purged} clé(s) effacée(s)` : ''})`);
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
   * Après app.whenReady() : chiffre les clés en clair de config.json (AES, clé locale) puis les efface
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
      log('secrets: chiffrement indisponible → clés conservées dans config.json (0600)');
      return;
    }
    const bad = unreadableSecrets();
    if (bad.legacy || bad.local) log(`secrets: ${bad.legacy} clé(s) de l'ancien trousseau et ${bad.local} clé(s) locale(s) illisibles (gardées, nouvel essai au prochain lancement)`);
    const present = migrated.filter((k) => this.data[k] !== undefined);
    if (!present.length && !this.hasNested()) return;
    for (const k of present) delete this.data[k];
    this.stripNested();
    this.write();
    log(`secrets: ${present.length} clé(s) déplacée(s) de config.json vers secrets.json (chiffré)`);
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

  /** Clé API : chiffrée (secrets.json) ; une valeur masquée renvoyée par l'UI est ignorée. */
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
    // Repli sans chiffrement : comportement historique (config.json 0600).
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
