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

export type ProviderId = 'gemini' | 'groq' | 'zai' | 'openrouter' | 'ollama';

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
/** Contexte de l'app active (lu localement, jamais journalisé). Texte de l'écran = non fiable. */
export interface DictationContext {
  /** Nom affiché de l'app active (« Slack », « Mail », « Cursor »). */
  app?: string;
  bundleId?: string;
  /** Domaine seulement pour un navigateur (« linear.app »), jamais le chemin complet. */
  url?: string;
  /** Noms propres / termes rares vus à l'écran, ≤ 40, chacun ≤ 60 car., dédoublonnés. */
  names?: string[];
  /**
   * m14 : ≤ 300 derniers caractères avant le curseur (texte déjà écrit), pour le raccord
   * (majuscule, espace, ponctuation). Jamais journalisé. Absent = début de champ ou lecture impossible.
   */
  before?: string;
}

/** f4 : règle de remplacement du dictionnaire, appliquée après le LLM (« asian » → « agent »). */
export interface ReplacementRule {
  from: string;
  to: string;
}

/** f3 : raccourci de réécriture personnalisé (nom dit à voix haute → instruction). */
export interface RewritePreset {
  /** Identifiant stable (facultatif, généré par l'UI). */
  id?: string;
  /** Nom court affiché et reconnu à la voix (« version LinkedIn »). */
  name: string;
  /** Consigne envoyée au modèle (« réécris pour LinkedIn, ton pro, sans hashtags »). */
  instruction: string;
}

export interface CleanOptions {
  /** Ordre de fallback. Défaut : depuis la config utilisateur. */
  providers?: ProviderId[];
  /** Langue principale de dictée. Défaut 'fr'. */
  language?: string;
  /** Niveau de nettoyage. Défaut : config (cleanup.level, 'standard'). */
  level?: 'light' | 'standard';
  /** Vocabulaire propre (noms, jargon) à respecter. Défaut : config (cleanup.vocabulary). */
  vocabulary?: string[];
  /** App active + noms visibles à l'écran (bloc <contexte> du message user). */
  context?: DictationContext;
  /** m12 : mode « prompt pour l'IA ». 'auto' (défaut) = actif dans ChatGPT/Claude/Cursor/terminal ; 'on' toujours ; 'off' jamais. */
  promptMode?: 'auto' | 'on' | 'off';
  /** m13 : le ton suit l'app (Slack détendu, Mail soigné) — forme seulement. Défaut true. */
  toneByApp?: boolean;
  /** m6 : espaces fines françaises (avant ; : ? !, dans « »). Défaut true, jamais en terminal/éditeur. */
  frenchTypography?: boolean;
  /** f4 : mots prioritaires du dictionnaire (placés en tête du bloc de vocabulaire). */
  priorityVocabulary?: string[];
  /** f4 : règles de remplacement appliquées après le LLM (aussi en repli sans réseau). */
  replacements?: ReplacementRule[];
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
