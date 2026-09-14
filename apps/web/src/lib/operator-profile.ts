export type OperatorProfile = {
  email: string;
  displayName: string;
  title: string;
};

export function fallbackDisplayName(email: string): string {
  const local = (email.split("@")[0] ?? email).trim();
  if (!local) return "Operator";
  return local
    .split(/[._-]+/)
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function operatorLabel(profile: Pick<OperatorProfile, "email" | "displayName">): string {
  return profile.displayName.trim() || fallbackDisplayName(profile.email);
}

export function operatorInitials(profile: Pick<OperatorProfile, "email" | "displayName">): string {
  const name = operatorLabel(profile);
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0]![0] ?? ""}${parts[parts.length - 1]![0] ?? ""}`.toUpperCase();
  }
  const compact = name.replace(/[^a-zA-Z]/g, "");
  return (compact.slice(0, 2) || "OE").toUpperCase();
}

export function operatorReviewerLabel(profile: OperatorProfile): string {
  const name = operatorLabel(profile);
  const title = profile.title.trim();
  return title ? `${name} (${title})` : name;
}
