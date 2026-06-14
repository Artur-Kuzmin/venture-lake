import type { FounderProfile, PrimaryRole, Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';

// Automatic matchmaking by SKILL COVERAGE (Foundation Bible, Phase 3.1).
//
// Teams are 2–5 users. The engine groups queued units (a party is one
// indivisible unit; a solo is a unit of one) and greedily assembles teams that
// cover the four required areas. A human-readable explanation is stored on each
// formed team. Unmatched users stay queued.

export type CoverageArea = 'BUILD' | 'DESIGN' | 'GROWTH' | 'BUSINESS';

export const COVERAGE_AREAS: CoverageArea[] = ['BUILD', 'DESIGN', 'GROWTH', 'BUSINESS'];

const AREA_LABELS: Record<CoverageArea, string> = {
  BUILD: 'build/technical execution',
  DESIGN: 'design/product',
  GROWTH: 'growth/distribution',
  BUSINESS: 'business/operations',
};

const ROLE_LABELS: Record<PrimaryRole, string> = {
  BUILDER: 'Builder',
  DESIGNER: 'Designer',
  GROWTH_SALES: 'Growth/Sales',
  BUSINESS_OPERATIONS: 'Business/Operations',
};

// Section 5 controlled skill list -> coverage area.
const SKILL_AREA: Record<string, CoverageArea> = {
  'Frontend development': 'BUILD',
  'Backend development': 'BUILD',
  'No-code building': 'BUILD',
  'Data/AI': 'BUILD',
  'UI/UX design': 'DESIGN',
  Branding: 'DESIGN',
  'Product management': 'DESIGN',
  Sales: 'GROWTH',
  Marketing: 'GROWTH',
  'Content creation': 'GROWTH',
  'Community building': 'GROWTH',
  'Market research': 'GROWTH',
  Pitching: 'BUSINESS',
  Finance: 'BUSINESS',
  Operations: 'BUSINESS',
};

const ROLE_AREA: Record<PrimaryRole, CoverageArea> = {
  BUILDER: 'BUILD',
  DESIGNER: 'DESIGN',
  GROWTH_SALES: 'GROWTH',
  BUSINESS_OPERATIONS: 'BUSINESS',
};

const MIN_TEAM_SIZE = 2;
const MAX_TEAM_SIZE = 5;
const MIN_AREAS = 3; // "strong coverage" threshold for sub-5 teams

// Stable, application-wide key for the matchmaking advisory lock. Ensures only
// one matchmaking run executes at a time across all backend instances.
const MATCHMAKING_LOCK_KEY = 778899;

interface Member {
  userId: string;
  entryId: string;
  profile: FounderProfile;
}

// A queued unit: a whole party, or a single solo user. Treated indivisibly.
interface Unit {
  key: string;
  partyId: string | null;
  members: Member[];
  queuedAt: Date;
}

export interface FormedTeamSummary {
  teamId: string;
  memberUserIds: string[];
  size: number;
  coveredAreas: CoverageArea[];
  partyIds: string[];
  matchExplanation: string;
}

export interface MatchRunResult {
  formed: FormedTeamSummary[];
  formedCount: number;
  remainingQueued: number;
}

// ---- helpers -------------------------------------------------------------

const norm = (s: string) => s.trim().toLowerCase();

function membersOf(team: Unit[]): Member[] {
  return team.flatMap((u) => u.members);
}

function teamSize(team: Unit[]): number {
  return team.reduce((n, u) => n + u.members.length, 0);
}

function areasOfMember(p: FounderProfile): Set<CoverageArea> {
  const areas = new Set<CoverageArea>();
  for (const skill of p.skills) {
    const area = SKILL_AREA[skill];
    if (area) areas.add(area);
  }
  areas.add(ROLE_AREA[p.primaryRole]);
  return areas;
}

function coverageOf(members: Member[]): Set<CoverageArea> {
  const areas = new Set<CoverageArea>();
  for (const m of members) for (const a of areasOfMember(m.profile)) areas.add(a);
  return areas;
}

// Languages common to every member (case-insensitive). Empty => can't team.
function commonLanguages(members: Member[]): string[] {
  if (members.length === 0) return [];
  const sets = members.map((m) => new Set(m.profile.languages.map(norm)));
  const [first, ...rest] = sets;
  const result: string[] = [];
  for (const lang of first) {
    if (rest.every((s) => s.has(lang))) result.push(lang);
  }
  // Return display-cased values from the first member.
  return members[0].profile.languages.filter((l) => result.includes(norm(l)));
}

function hasCommonLanguage(members: Member[]): boolean {
  return commonLanguages(members).length > 0;
}

function newAreasAdded(team: Unit[], unit: Unit): number {
  const before = coverageOf(membersOf(team));
  const after = coverageOf([...membersOf(team), ...unit.members]);
  return after.size - before.size;
}

// Soft score for choosing which unit to merge next. New coverage dominates.
function scoreCandidate(team: Unit[], unit: Unit): number {
  const team_ = membersOf(team);
  const cand = unit.members;
  const all = [...team_, ...cand];

  const newAreas = newAreasAdded(team, unit);
  const sharedLangs = commonLanguages(all).length;

  const teamInterests = new Set(team_.flatMap((m) => m.profile.industryInterests.map(norm)));
  const interestOverlap = cand.reduce(
    (n, m) => n + m.profile.industryInterests.filter((i) => teamInterests.has(norm(i))).length,
    0
  );

  const teamTz = new Set(team_.map((m) => norm(m.profile.timezone)));
  const teamRegions = new Set(team_.map((m) => norm(m.profile.timezone).split('/')[0]));
  let tzScore = 0;
  for (const m of cand) {
    const tz = norm(m.profile.timezone);
    if (teamTz.has(tz)) tzScore = Math.max(tzScore, 10);
    else if (teamRegions.has(tz.split('/')[0])) tzScore = Math.max(tzScore, 4);
  }

  const teamAvg = team_.reduce((s, m) => s + m.profile.availabilityHoursPerWeek, 0) / team_.length;
  const candAvg = cand.reduce((s, m) => s + m.profile.availabilityHoursPerWeek, 0) / cand.length;
  const availScore = Math.max(0, 5 - Math.floor(Math.abs(teamAvg - candAvg) / 10));

  const teamRoles = new Set(team_.map((m) => m.profile.primaryRole));
  const roleDiversity = cand.some((m) => !teamRoles.has(m.profile.primaryRole)) ? 3 : 0;

  return newAreas * 1000 + sharedLangs * 20 + interestOverlap * 8 + tzScore + availScore + roleDiversity;
}

function isValidTeam(team: Unit[]): boolean {
  const members = membersOf(team);
  const size = members.length;
  if (size < MIN_TEAM_SIZE || size > MAX_TEAM_SIZE) return false;
  if (!hasCommonLanguage(members)) return false;
  if (size === MAX_TEAM_SIZE) return true;
  return coverageOf(members).size >= MIN_AREAS;
}

function buildExplanation(team: Unit[]): string {
  const members = membersOf(team);
  const covered = coverageOf(members);
  const coveredLabels = COVERAGE_AREAS.filter((a) => covered.has(a)).map((a) => AREA_LABELS[a]);
  const gaps = COVERAGE_AREAS.filter((a) => !covered.has(a)).map((a) => AREA_LABELS[a]);
  const langs = commonLanguages(members);
  const timezones = [...new Set(members.map((m) => m.profile.timezone))];
  const roles = [...new Set(members.map((m) => m.profile.primaryRole))].map((r) => ROLE_LABELS[r]);

  const interestCounts = new Map<string, number>();
  for (const m of members) {
    for (const i of new Set(m.profile.industryInterests.map((x) => x.trim()))) {
      interestCounts.set(i, (interestCounts.get(i) ?? 0) + 1);
    }
  }
  const sharedInterests = [...interestCounts.entries()].filter(([, n]) => n >= 2).map(([i]) => i);

  const partyCount = team.filter((u) => u.partyId).length;

  let s = `Matched ${members.length} founders`;
  if (partyCount > 0) s += ` (incl. ${partyCount} pre-formed part${partyCount === 1 ? 'y' : 'ies'})`;
  s += ` covering ${coveredLabels.join(', ')}.`;
  if (gaps.length) s += ` Coverage gaps: ${gaps.join(', ')}.`;
  if (langs.length) s += ` Shared language: ${langs.join(', ')}.`;
  s += ` Timezones: ${timezones.join(', ')}.`;
  if (sharedInterests.length) s += ` Common interests: ${sharedInterests.join(', ')}.`;
  s += ` Roles: ${roles.join(', ')}.`;
  return s;
}

// ---- engine --------------------------------------------------------------

// Persists one planned team using the caller's transaction client, so all
// writes (and the queue read in tryMatchQueue) share the advisory-locked
// transaction. The matchmaking outcome is unchanged.
async function persistTeam(
  tx: Prisma.TransactionClient,
  team: Unit[]
): Promise<FormedTeamSummary> {
  const members = membersOf(team);
  const userIds = members.map((m) => m.userId);
  const entryIds = members.map((m) => m.entryId);
  const partyIds = [...new Set(team.map((u) => u.partyId).filter((p): p is string => Boolean(p)))];
  const matchExplanation = buildExplanation(team);
  const coveredAreas = COVERAGE_AREAS.filter((a) => coverageOf(members).has(a));

  const createdTeam = await tx.team.create({
    data: { status: 'LOBBY', matchExplanation },
  });
  await tx.teamMember.createMany({
    data: userIds.map((userId) => ({ teamId: createdTeam.id, userId })),
  });
  await tx.queueEntry.updateMany({
    where: { id: { in: entryIds } },
    data: { status: 'MATCHED', matchedAt: new Date() },
  });
  if (partyIds.length > 0) {
    await tx.party.updateMany({ where: { id: { in: partyIds } }, data: { status: 'MATCHED' } });
  }

  return {
    teamId: createdTeam.id,
    memberUserIds: userIds,
    size: userIds.length,
    coveredAreas,
    partyIds,
    matchExplanation,
  };
}

/**
 * Form as many valid teams as possible from the current global queue.
 * Returns the formed teams and how many users remain queued.
 */
export async function tryMatchQueue(): Promise<MatchRunResult> {
  // Serialize matchmaking across all backend instances: a transaction-scoped
  // Postgres advisory lock is acquired before the queue is read, so two
  // concurrent runs can never plan teams from the same queued entries. The lock
  // releases automatically when the transaction ends. Matchmaking does only
  // fast DB + in-memory work (no AI/network), so the lock is held briefly.
  return prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${MATCHMAKING_LOCK_KEY}::bigint)`;
      console.log('[matchmaking] run start (advisory lock acquired)');

      const entries = await tx.queueEntry.findMany({
        where: { status: 'QUEUED' },
        orderBy: { queuedAt: 'asc' },
        include: { user: { include: { founderProfile: true } } },
      });

  // Group queued entries into indivisible units (party or solo).
  const unitMap = new Map<string, Unit>();
  for (const e of entries) {
    const profile = e.user.founderProfile;
    if (!profile) continue; // safety; queueing requires a profile
    const key = e.partyId ?? `solo:${e.userId}`;
    let unit = unitMap.get(key);
    if (!unit) {
      unit = { key, partyId: e.partyId, members: [], queuedAt: e.queuedAt };
      unitMap.set(key, unit);
    }
    unit.members.push({ userId: e.userId, entryId: e.id, profile });
    if (e.queuedAt < unit.queuedAt) unit.queuedAt = e.queuedAt;
  }

  // Oldest-waiting units seed first (FIFO fairness). Drop oversized units.
  const units = [...unitMap.values()]
    .filter((u) => u.members.length <= MAX_TEAM_SIZE)
    .sort((a, b) => a.queuedAt.getTime() - b.queuedAt.getTime());

  const used = new Set<string>();
  const plannedTeams: Unit[][] = [];

  for (const seed of units) {
    if (used.has(seed.key)) continue;
    const team: Unit[] = [seed];

    const available = () =>
      units.filter((u) => !used.has(u.key) && !team.includes(u));

    // 1) Greedily add coverage-improving units until full or all areas covered.
    let improved = true;
    while (
      teamSize(team) < MAX_TEAM_SIZE &&
      coverageOf(membersOf(team)).size < COVERAGE_AREAS.length &&
      improved
    ) {
      improved = false;
      let best: Unit | null = null;
      let bestScore = -1;
      for (const c of available()) {
        if (teamSize(team) + c.members.length > MAX_TEAM_SIZE) continue;
        if (!hasCommonLanguage([...membersOf(team), ...c.members])) continue;
        if (newAreasAdded(team, c) <= 0) continue;
        const s = scoreCandidate(team, c);
        if (s > bestScore) {
          bestScore = s;
          best = c;
        }
      }
      if (best) {
        team.push(best);
        improved = true;
      }
    }

    // 2) If still a lone unit, pull in any language-compatible unit to reach min size.
    if (teamSize(team) < MIN_TEAM_SIZE) {
      let best: Unit | null = null;
      let bestScore = -1;
      for (const c of available()) {
        if (teamSize(team) + c.members.length > MAX_TEAM_SIZE) continue;
        if (!hasCommonLanguage([...membersOf(team), ...c.members])) continue;
        const s = scoreCandidate(team, c);
        if (s > bestScore) {
          bestScore = s;
          best = c;
        }
      }
      if (best) team.push(best);
    }

    if (isValidTeam(team)) {
      for (const u of team) used.add(u.key);
      plannedTeams.push(team);
    }
    // Otherwise leave the seed (and any tentatively considered units) queued.
  }

      const formed: FormedTeamSummary[] = [];
      for (const team of plannedTeams) {
        formed.push(await persistTeam(tx, team));
      }

      const remainingQueued = await tx.queueEntry.count({ where: { status: 'QUEUED' } });
      console.log(
        `[matchmaking] run end: formed ${formed.length} team(s), ${remainingQueued} still queued`
      );
      return { formed, formedCount: formed.length, remainingQueued };
    },
    // Generous bounds: under contention a run waits on the advisory lock inside
    // the transaction. Fast otherwise (no external calls).
    { maxWait: 10000, timeout: 30000 }
  );
}

export default tryMatchQueue;
