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
  /** 'note' : prise de notes (message « NOTE · mm:ss ») ; 'brainstorm' : vidage du mode Brainstorm (« BRAINSTORM · mm:ss »).
   *  Un mode inconnu de la pastille est affiché comme une écoute avec `message` pour libellé. */
  mode?: 'dictation' | 'note' | 'brainstorm';
  elapsedMs?: number;    // prise de notes / brainstorm : durée enregistrée (pauses exclues)
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

// ── Mode « Brainstorm → master prompt » (docs/APP_API.md) ──────────────────────────────

export type SlotKey = 'contexte' | 'role' | 'action' | 'format' | 'cible' | 'contraintes' | 'criteres' | 'exemples';
export const SLOT_KEYS: readonly SlotKey[] = ['contexte', 'role', 'action', 'format', 'cible', 'contraintes', 'criteres', 'exemples'];
export interface Slot {
  value: string;
  status: 'vide' | 'partiel' | 'ok';
  evidence?: string;
}
export type BrainstormTarget = 'claude-code' | 'cursor';
export interface BQuestion {
  id: string;
  slot: SlotKey;
  question: string;
  why: string;
  suggestions: string[];
}
export type BrainstormState = 'recording' | 'analyzing' | 'questions' | 'compiling' | 'done' | 'error';
export interface Brainstorm {
  id: string;
  title: string;
  createdAt: string;
  target: BrainstormTarget;
  state: BrainstormState;
  transcript: string;
  slots: Record<SlotKey, Slot>;
  questions: BQuestion[];
  answers: Record<string, string>;
  prompt?: string;
  path?: string;
  message?: string;
  /** Pendant le vidage : durée (ms), mots transcrits, niveau micro 0..1. */
  elapsedMs?: number;
  words?: number;
  level?: number;
  /** Fournisseur LLM de la dernière étape (analyse / compilation). */
  provider?: string;
  /** « Encore des questions » déjà utilisé (une seule fois par session). */
  askedMore?: boolean;
  /** Brainstorm v2 : questions posées en direct pendant le vidage (bulles). */
  live?: LiveQuestion[];
}

/** Bulle de question en direct (docs/APP_API.md › Brainstorm v2). */
export interface LiveQuestion {
  id: string;
  slot: SlotKey;
  question: string;
  suggestions: string[];
  state: 'open' | 'answered' | 'dismissed';
  answer?: string;
  /** ms depuis le début du vidage (durée enregistrée) au moment où la question est posée. */
  askedAt: number;
}

/** État poussé à la fenêtre des bulles (window.cbwBubbles.onState). */
export interface BubblesState {
  live: LiveQuestion[];
  title: string;
  recording: boolean;
  elapsedMs: number;
}

export interface LiveBrainstormInput {
  target: BrainstormTarget;
  slots: Record<SlotKey, Slot>;
  open: { id: string; question: string }[];
  asked: string[];
  said: string;
  fresh: string;
  maxNew: number;
}
export interface LiveBrainstormResult {
  slots: Record<SlotKey, Slot>;
  resolved: { id: string; answer: string }[];
  questions: { slot: SlotKey; question: string; suggestions: string[] }[];
  title: string;
  provider: string;
}

/** Fonctions de src/llm/brainstorm.ts (exportées par le bundle du router). */
export interface AnalyzeBrainstormInput {
  transcript: string;
  target: BrainstormTarget;
  slots?: Record<SlotKey, Slot>;
  qa?: { question: string; answer: string }[];
  maxQuestions: number;
}
export interface AnalyzeBrainstormResult {
  title: string;
  slots: Record<SlotKey, Slot>;
  questions: { slot: SlotKey; question: string; why: string; suggestions: string[] }[];
  provider: string;
}
export interface CompileMasterPromptInput {
  transcript: string;
  target: BrainstormTarget;
  title: string;
  slots: Record<SlotKey, Slot>;
  qa: { question: string; answer: string }[];
}
export interface CompileMasterPromptResult {
  prompt: string;
  title: string;
  provider: string;
}
