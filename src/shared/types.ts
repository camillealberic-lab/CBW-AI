// Contrat partagé entre les modules de Dicta AI.
// Ne pas modifier sans coordination (voir docs/ARCHITECTURE.md).

/** État global affiché dans l'overlay et l'icône de barre de menus. */
export type DictaState =
  | 'idle'          // rien en cours
  | 'recording'     // raccourci maintenu, micro ouvert
  | 'transcribing'  // Whisper local en cours
  | 'cleaning'      // LLM en cours (nettoyage)
  | 'inserting'     // collage dans l'app active
  | 'done'          // succès (affiché ~1 s puis retour à idle)
  | 'error';        // échec (message dans DictaStatus.message)

export interface DictaStatus {
  state: DictaState;
  message?: string;      // texte court optionnel (erreur, provider utilisé…)
  partialText?: string;  // transcription provisoire (live)
  level?: number;        // niveau micro 0..1 pour l'animation des barres
  /** 'note' : prise de notes (message « NOTE · mm:ss »).
   *  Un mode inconnu de la pastille est affiché comme une écoute avec `message` pour libellé. */
  mode?: 'dictation' | 'note';
  elapsedMs?: number;    // prise de notes : durée enregistrée (pauses exclues)
}

export type ProviderId = 'gemini' | 'groq' | 'zai' | 'mistral' | 'cloudflare' | 'openrouter' | 'ollama';

export interface CleanResult {
  text: string;
  provider: ProviderId | 'passthrough';
  model: string;
  latencyMs: number;
}

/**
 * Point d'entrée unique du nettoyage, implémenté dans src/llm/router.ts :
 *   cleanTranscript(raw: string, opts?: CleanOptions): Promise<CleanResult>
 * Le router utilise src/llm/prompt.ts (buildMessages / postProcess).
 */
export interface CleanOptions {
  /** Ordre de fallback. Défaut : depuis la config utilisateur. */
  providers?: ProviderId[];
  /** Langue principale de dictée. Défaut 'fr'. */
  language?: string;
  /** Niveau de nettoyage. Défaut : config (cleanup.level, 'standard'). */
  level?: 'light' | 'standard';
  /** Vocabulaire propre (noms, jargon) à respecter. Défaut : config (cleanup.vocabulary). */
  vocabulary?: string[];
  signal?: AbortSignal;
}

/** Interface que chaque provider (src/llm/providers/*.ts) doit implémenter. */
export interface LLMProvider {
  id: ProviderId;
  /** true si clé présente / serveur joignable. Doit être rapide (<300 ms). */
  isAvailable(): Promise<boolean>;
  /** Envoie les messages (system + user) et renvoie le texte brut du modèle. */
  complete(req: {
    system: string;
    user: string;
    temperature: number;
    maxTokens: number;
    signal?: AbortSignal;
  }): Promise<{ text: string; model: string }>;
}

/** Erreur typée pour que le router sache s'il doit passer au suivant. */
export type ProviderErrorKind = 'quota' | 'auth' | 'network' | 'timeout' | 'bad_output' | 'unknown';

// Champs assignés explicitement (pas de "parameter properties") pour rester
// compatible avec `node --experimental-strip-types`.
export class ProviderError extends Error {
  provider: ProviderId;
  kind: ProviderErrorKind;
  constructor(provider: ProviderId, kind: ProviderErrorKind, message: string) {
    super(message);
    this.name = 'ProviderError';
    this.provider = provider;
    this.kind = kind;
  }
}
