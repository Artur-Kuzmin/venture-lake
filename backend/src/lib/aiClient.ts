// Single place for all AI calls (Foundation Bible, Section 4.7 / Section 6).
//
// Every model call goes through this client. It MUST return strict JSON and
// parse it safely, rejecting malformed output rather than guessing. The
// frontend never calls the AI provider directly — it calls a backend endpoint
// that calls this client.
//
// When AI_API_KEY is set, calls the Anthropic Messages API. Otherwise falls back
// to a deterministic, profile-grounded intro-sprint generator so the flow works
// in local dev without a key.

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

// Minimal profile shape the generators need (FounderProfile is assignable).
export interface ProfileInputForAi {
  skills: string[];
  industryInterests: string[];
  primaryRole: string;
  availabilityHoursPerWeek: number;
  languages: string[];
}

export interface GenerateIdeaInput {
  profiles: ProfileInputForAi[];
}

export interface RegenerateIdeaInput extends GenerateIdeaInput {
  previousIdeas: { title: string; description: string; category: string }[];
  feedback: { rejectReason: string | null; feedbackNote: string | null }[];
  generationNumber: number;
}

const AI_API_KEY = process.env.AI_API_KEY ?? '';
const AI_MODEL = process.env.AI_MODEL ?? 'claude-opus-4-8';

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

function assertMissionIdea(value: unknown): MissionIdeaResult {
  const v = value as Partial<MissionIdeaResult>;
  if (
    !v ||
    typeof v.title !== 'string' ||
    typeof v.description !== 'string' ||
    typeof v.category !== 'string' ||
    typeof v.reasoning !== 'string' ||
    !v.title.trim() ||
    !v.description.trim()
  ) {
    throw new Error('AI returned a malformed mission idea.');
  }
  return { title: v.title, description: v.description, category: v.category, reasoning: v.reasoning };
}

// ---- Anthropic call ------------------------------------------------------

async function callAnthropic(system: string, user: string): Promise<MissionIdeaResult> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': AI_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: AI_MODEL,
      max_tokens: 700,
      system,
      messages: [{ role: 'user', content: user }],
    }),
  });
  if (!res.ok) {
    throw new Error(`AI provider error (${res.status}).`);
  }
  const data = (await res.json()) as { content?: { text?: string }[] };
  const text = data.content?.[0]?.text ?? '';
  return assertMissionIdea(parseStrictJson<MissionIdeaResult>(text));
}

// ---- Prompt + profile summarisation -------------------------------------

const STRICT_JSON_SYSTEM =
  'You generate startup mission ideas for founder teams. Reply with ONLY a single ' +
  'JSON object with exactly these string keys: title, description, category, reasoning. ' +
  'No prose, no markdown, no code fences.';

function summariseTeam(profiles: ProfileInputForAi[]): string {
  const skills = [...new Set(profiles.flatMap((p) => p.skills))];
  const interests = [...new Set(profiles.flatMap((p) => p.industryInterests))];
  const roles = [...new Set(profiles.map((p) => p.primaryRole))];
  const langs = [...new Set(profiles.flatMap((p) => p.languages))];
  const avgAvail = Math.round(
    profiles.reduce((s, p) => s + p.availabilityHoursPerWeek, 0) / Math.max(1, profiles.length)
  );
  return [
    `Team of ${profiles.length}.`,
    `Skills: ${skills.join(', ') || 'n/a'}.`,
    `Roles: ${roles.join(', ') || 'n/a'}.`,
    `Industry interests: ${interests.join(', ') || 'n/a'}.`,
    `Languages: ${langs.join(', ') || 'n/a'}.`,
    `Avg availability: ${avgAvail}h/week.`,
  ].join(' ');
}

// ---- Deterministic fallback (no API key) --------------------------------

const INTRO_SPRINTS: { title: string; category: string; description: string }[] = [
  {
    title: 'Landing page for a student budgeting tool',
    category: 'Fintech',
    description:
      'Design and ship a single, convincing landing page for a budgeting app aimed at students: hero, value props, a mock dashboard screenshot, and an email waitlist signup.',
  },
  {
    title: 'Pitch for a finance assistant app',
    category: 'Fintech',
    description:
      'Prepare a tight pitch (deck + one-paragraph narrative) for an AI finance assistant: the problem, the wedge, a simple mockup, and why this team can build it.',
  },
  {
    title: 'Prototype for a nightlife discovery app',
    category: 'Consumer',
    description:
      'Design a clickable prototype for discovering nearby nightlife: a feed of venues, filters, and an event detail screen, plus a one-line positioning statement.',
  },
  {
    title: 'First lineup and brand for a clothing label',
    category: 'Commerce',
    description:
      'Create a first capsule concept for a clothing brand: name, logo direction, 3-piece lineup mockups, and a launch landing page with a waitlist.',
  },
  {
    title: 'Landing page for a local services marketplace',
    category: 'Marketplace',
    description:
      'Validate a local-services marketplace by building a landing page that explains the two-sided value, shows 3 sample listings, and captures interest from both sides.',
  },
  {
    title: 'Concept and demo for a habit-tracking app',
    category: 'Consumer',
    description:
      'Shape a focused habit-tracking concept: define the core loop, design 3 key screens as a prototype, and write a short go-to-market note.',
  },
];

function hashFeedback(feedback: { rejectReason: string | null; feedbackNote: string | null }[]): number {
  const text = feedback.map((f) => `${f.rejectReason ?? ''}${f.feedbackNote ?? ''}`).join('|');
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function fallbackIdea(
  profiles: ProfileInputForAi[],
  generationNumber: number,
  feedback: { rejectReason: string | null; feedbackNote: string | null }[] = [],
  avoidTitles: string[] = []
): MissionIdeaResult {
  const interests = [...new Set(profiles.flatMap((p) => p.industryInterests))];
  const skills = [...new Set(profiles.flatMap((p) => p.skills))];

  // Base pick reflects team interest; generation + feedback rotate the choice.
  const interestBias = INTRO_SPRINTS.findIndex((s) =>
    interests.some((i) => s.category.toLowerCase().includes(i.toLowerCase()))
  );
  const base = interestBias >= 0 ? interestBias : 0;
  const shift = generationNumber - 1 + (feedback.length ? hashFeedback(feedback) % INTRO_SPRINTS.length : 0);
  let index = (base + shift) % INTRO_SPRINTS.length;
  // Never repeat a previously proposed title on regeneration.
  for (let i = 0; i < INTRO_SPRINTS.length && avoidTitles.includes(INTRO_SPRINTS[index].title); i++) {
    index = (index + 1) % INTRO_SPRINTS.length;
  }
  const pick = INTRO_SPRINTS[index];

  const reasonBits: string[] = [
    `A 72-hour intro sprint matched to the team's skills (${skills.slice(0, 4).join(', ') || 'mixed'})` +
      `${interests.length ? ` and interest in ${interests.slice(0, 2).join(', ')}` : ''}.`,
  ];
  if (feedback.length) {
    const reasons = [...new Set(feedback.map((f) => f.rejectReason).filter(Boolean))];
    const notes = [...new Set(feedback.map((f) => f.feedbackNote).filter(Boolean))];
    reasonBits.push(
      `Regenerated to address previous feedback${reasons.length ? ` (${reasons.join('; ')})` : ''}` +
        `${notes.length ? `: ${notes.join('; ')}` : ''}.`
    );
  }

  return {
    title: pick.title,
    description: pick.description,
    category: pick.category,
    reasoning: reasonBits.join(' '),
  };
}

// ---- Public client -------------------------------------------------------

export const aiClient = {
  async generateMissionIdea(input: GenerateIdeaInput): Promise<MissionIdeaResult> {
    if (AI_API_KEY) {
      const user =
        `${summariseTeam(input.profiles)}\n\n` +
        'Propose ONE straightforward 72-hour intro-sprint startup mission for this team ' +
        '(e.g. a landing page, a pitch, a clickable prototype, or a first brand lineup). ' +
        'Keep it achievable in 72 hours and grounded in the team profile.';
      return callAnthropic(STRICT_JSON_SYSTEM, user);
    }
    return fallbackIdea(input.profiles, 1);
  },

  async regenerateMissionIdea(input: RegenerateIdeaInput): Promise<MissionIdeaResult> {
    if (AI_API_KEY) {
      const prev = input.previousIdeas.map((p) => `- ${p.title}: ${p.description}`).join('\n');
      const fb = input.feedback
        .map((f) => `- ${f.rejectReason ?? 'No reason'}${f.feedbackNote ? `: ${f.feedbackNote}` : ''}`)
        .join('\n');
      const user =
        `${summariseTeam(input.profiles)}\n\n` +
        `Previous rejected ideas:\n${prev || '(none)'}\n\n` +
        `Team's NO-vote feedback:\n${fb || '(none)'}\n\n` +
        'Propose ONE different 72-hour intro-sprint mission that directly addresses the feedback above.';
      return callAnthropic(STRICT_JSON_SYSTEM, user);
    }
    return fallbackIdea(
      input.profiles,
      input.generationNumber,
      input.feedback,
      input.previousIdeas.map((p) => p.title)
    );
  },

  async generateDeliverables(): Promise<DeliverableResult[]> {
    throw new Error('aiClient.generateDeliverables not implemented yet (Phase 5.2)');
  },
};

export default aiClient;
