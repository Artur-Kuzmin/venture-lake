// Single place for all AI calls (Foundation Bible, Section 4.7 / Section 6).
//
// Every model call goes through this client. It MUST return strict JSON and
// parse it safely, rejecting malformed output rather than guessing. The
// frontend never calls the AI provider directly — it calls a backend endpoint
// that calls this client.
//
// Phase 1 scaffolding: this is a stub. The three generation tasks
// (mission idea, idea regeneration, deliverables) are wired up in later phases.

export interface MissionIdeaResult {
  title: string;
  description: string;
  category: string;
  reasoning: string;
}

export interface DeliverableResult {
  title: string;
  description: string;
}

/**
 * Safely parse a model response that is expected to be strict JSON.
 * Strips accidental markdown fences, then JSON.parses. Throws on malformed
 * output so callers never operate on a half-parsed/guessed result.
 */
export function parseStrictJson<T>(raw: string): T {
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?/i, '')
    .replace(/```$/i, '')
    .trim();
  return JSON.parse(cleaned) as T;
}

// Placeholder generators — implemented in later phases. They exist now only so
// the single-entry-point contract is visible and import paths are stable.
export const aiClient = {
  async generateMissionIdea(): Promise<MissionIdeaResult> {
    throw new Error('aiClient.generateMissionIdea not implemented yet (Phase 4.2)');
  },
  async regenerateMissionIdea(): Promise<MissionIdeaResult> {
    throw new Error('aiClient.regenerateMissionIdea not implemented yet (Phase 4.3)');
  },
  async generateDeliverables(): Promise<DeliverableResult[]> {
    throw new Error('aiClient.generateDeliverables not implemented yet (Phase 5.2)');
  },
};

export default aiClient;
