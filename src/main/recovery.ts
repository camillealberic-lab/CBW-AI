import type { Dictation } from './history';

/**
 * Façade fine (c3, c4, c6) : le pipeline s'enregistre ici à sa création, pour que main.ts / les IPC / les raccourcis
 * appellent des fonctions simples sans importer Pipeline.
 */
export interface RecoveryHost {
  retry(id: string, opts?: { insert?: boolean }): Promise<Dictation>;
  pasteRaw(id?: string, opts?: { undoFirst?: boolean }): Promise<boolean>;
  recoverLast(): Promise<Dictation | null>;
}
let host: RecoveryHost | null = null;
export const bindRecovery = (h: RecoveryHost): void => {
  host = h;
};
const need = (): RecoveryHost => {
  if (!host) throw new Error('Pipeline non initialisé');
  return host;
};

/** Retranscrit l'audio gardé de la dictée `id`, renettoie, met l'historique à jour (et colle si `insert`). */
export const retry = (id: string, opts?: { insert?: boolean }): Promise<Dictation> => need().retry(id, opts);
/** Colle la version brute (Whisper) de la dictée `id`, ou de la dernière dictée collée. */
export const pasteRaw = (id?: string, opts?: { undoFirst?: boolean }): Promise<boolean> => need().pasteRaw(id, opts);
/** Récupère la dernière dictée annulée (Échap) ou en échec : retranscrit si besoin, puis colle. null s'il n'y en a pas. */
export const recoverLast = (): Promise<Dictation | null> => need().recoverLast();
