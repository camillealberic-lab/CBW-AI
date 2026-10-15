import { execFile } from 'node:child_process';

/**
 * f5 : import de noms depuis Contacts (et Calendrier) vers le dictionnaire, SUR DEMANDE uniquement (bouton).
 * macOS demande l'autorisation « Automatisation » à ce moment précis (osascript pilote Contacts / Calendrier).
 * Rien d'automatique, rien n'est envoyé : les noms restent sur le Mac, sans journaliser un seul nom.
 * Les fonctions pures (cleanNames, mergeVocabulary) n'importent pas Electron.
 */
export type ContactSource = 'contacts' | 'calendar';
export interface ContactImport {
  /** Noms propres propres et dédoublonnés, prêts à ajouter à `cleaning.vocabulary`. */
  names: string[];
  fromContacts: number;
  fromCalendar: number;
  /** Source refusée / indisponible (autorisation macOS refusée, app absente, délai dépassé). */
  errors: { source: ContactSource; reason: 'denied' | 'timeout' | 'failed' }[];
}

export const MAX_IMPORT = 300;

// Prénom + nom des fiches (personnes seulement), plus prénoms seuls : la dictée butte surtout sur les prénoms rares.
const JXA_CONTACTS = `
const app = Application('Contacts');
const out = [];
const ppl = app.people;
const first = ppl.firstName(), last = ppl.lastName(), nick = ppl.nickname();
for (let i = 0; i < first.length; i++) {
  const f = first[i] || '', l = last[i] || '', n = nick[i] || '';
  if (f && l) out.push(f + ' ' + l);
  if (f) out.push(f);
  if (n) out.push(n);
}
JSON.stringify(out);
`;
// Participants des événements entre -7 et +14 jours.
const JXA_CALENDAR = `
const app = Application('Calendar');
const now = new Date();
const from = new Date(now.getTime() - 7 * 86400000), to = new Date(now.getTime() + 14 * 86400000);
const out = [];
for (const cal of app.calendars()) {
  let evs = [];
  try { evs = cal.events.whose({ _and: [{ startDate: { _greaterThan: from } }, { startDate: { _lessThan: to } }] })(); } catch (e) { continue; }
  for (const ev of evs.slice(0, 200)) {
    try { for (const a of ev.attendees()) { const n = a.displayName(); if (n) out.push(n); } } catch (e) {}
  }
}
JSON.stringify(out);
`;

/** Garde des noms plausibles : lettres (accents, tirets, apostrophes), 2-40 car., pas d'adresse ni de numéro. */
export function cleanNames(raw: unknown[], max = MAX_IMPORT): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const r of raw) {
    if (typeof r !== 'string') continue;
    const n = r.replace(/\s+/g, ' ').trim();
    if (n.length < 2 || n.length > 40) continue;
    if (/[@\d_/\\<>(){}[\]:;=+*#]/.test(n)) continue; // e-mails, numéros, identifiants
    if (!/^\p{L}[\p{L}'’. -]*$/u.test(n)) continue;
    if (n.split(' ').length > 4) continue;
    const k = n.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(n);
    if (out.length >= max) break;
  }
  return out;
}

/** Ajoute `names` à `existing` (insensible à la casse), sans dépasser `max` ; renvoie la liste finale et le nombre ajouté. */
export function mergeVocabulary(existing: string[], names: string[], max = 200): { list: string[]; added: number } {
  const have = new Set(existing.map((s) => s.trim().toLowerCase()));
  const list = [...existing];
  let added = 0;
  for (const n of names) {
    const k = n.trim().toLowerCase();
    if (!k || have.has(k) || list.length >= max) continue;
    have.add(k);
    list.push(n.trim());
    added++;
  }
  return { list, added };
}

function runJxa(script: string, timeoutMs: number): Promise<{ ok: true; data: unknown[] } | { ok: false; reason: 'denied' | 'timeout' | 'failed' }> {
  return new Promise((resolve) => {
    execFile('/usr/bin/osascript', ['-l', 'JavaScript', '-e', script], { timeout: timeoutMs, maxBuffer: 8 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) {
        const msg = `${stderr ?? ''}`;
        if ((err as any).killed) return resolve({ ok: false, reason: 'timeout' });
        // -1743 : « non autorisé à envoyer des événements Apple » ; -1728/-10004 : privilège refusé
        return resolve({ ok: false, reason: /-1743|-10004|not authorized|n’est pas autorisé|not allowed/i.test(msg) ? 'denied' : 'failed' });
      }
      try {
        const v = JSON.parse(stdout.trim());
        resolve({ ok: true, data: Array.isArray(v) ? v : [] });
      } catch {
        resolve({ ok: false, reason: 'failed' });
      }
    });
  });
}

/**
 * À appeler depuis un bouton « Importer depuis mes contacts ». L'autorisation macOS est demandée ici, à la première
 * utilisation. `calendar` (défaut false) ajoute les participants des événements de ±1-2 semaines.
 * Aucune écriture : l'appelant fusionne avec mergeVocabulary() puis enregistre `cleaning.vocabulary`.
 */
export async function importContactNames(opts: { contacts?: boolean; calendar?: boolean } = {}): Promise<ContactImport> {
  if (process.platform !== 'darwin') return { names: [], fromContacts: 0, fromCalendar: 0, errors: [{ source: 'contacts', reason: 'failed' }] };
  const res: ContactImport = { names: [], fromContacts: 0, fromCalendar: 0, errors: [] };
  let all: unknown[] = [];
  if (opts.contacts !== false) {
    const r = await runJxa(JXA_CONTACTS, 60_000);
    if (r.ok) {
      const c = cleanNames(r.data);
      res.fromContacts = c.length;
      all = all.concat(c);
    } else res.errors.push({ source: 'contacts', reason: r.reason });
  }
  if (opts.calendar) {
    const r = await runJxa(JXA_CALENDAR, 60_000);
    if (r.ok) {
      const c = cleanNames(r.data);
      res.fromCalendar = c.length;
      all = all.concat(c);
    } else res.errors.push({ source: 'calendar', reason: r.reason });
  }
  res.names = cleanNames(all);
  return res;
}
