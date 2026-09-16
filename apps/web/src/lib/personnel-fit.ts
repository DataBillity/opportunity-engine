import type { GraphPerson } from "@/lib/mock-data";
import { isArchivedStatus } from "@/lib/mock-data";

const STOP = new Set([
  "a", "an", "and", "the", "of", "for", "to", "in", "on", "lead", "senior", "jr", "sr",
]);

export function roleTokens(role: string): string[] {
  return role
    .toLowerCase()
    .replace(/[^a-z0-9\s+/&-]/g, " ")
    .split(/[\s+/&-]+/)
    .map(token => token.trim())
    .filter(token => token.length > 1 && !STOP.has(token));
}

function personCorpus(person: GraphPerson): string {
  return [
    person.role,
    ...(person.roles ?? []),
    ...(person.skills ?? []),
    ...(person.technologies ?? []),
    person.expertise,
    ...(person.industries ?? []),
  ].join(" ").toLowerCase();
}

export function scorePersonForRole(role: string, person: GraphPerson): number {
  const tokens = roleTokens(role);
  if (!tokens.length) return 0;
  const corpus = personCorpus(person);
  const roleTitle = [person.role, ...(person.roles ?? [])].join(" ").toLowerCase();
  let score = 0;

  if (roleTitle && (roleTitle === role.toLowerCase() || roleTitle.includes(role.toLowerCase()) || role.toLowerCase().includes(roleTitle))) {
    score += 8;
  }

  for (const token of tokens) {
    if (roleTitle.includes(token)) score += 4;
    else if (corpus.includes(token)) score += 2;
  }

  return score;
}

export function rankPeopleForRole(role: string, people: GraphPerson[]): GraphPerson[] {
  return people
    .filter(person => !isArchivedStatus(person.status))
    .map(person => ({ person, score: scorePersonForRole(role, person) }))
    .filter(entry => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.person.name.localeCompare(b.person.name))
    .map(entry => entry.person);
}
