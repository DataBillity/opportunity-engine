export const QUEUE_NAMES = [
  "discovery",
  "enrichment",
  "scoring",
  "intake",
  "triage",
  "drafting",
  "deadlines",
  "partners",
  "rd",
  "retention",
  "health",
] as const;

export type QueueName = (typeof QUEUE_NAMES)[number];
