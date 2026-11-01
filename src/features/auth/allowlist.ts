/** Parses a comma-separated list of emails into trimmed, lowercased entries. */
export function parseAllowedEmails(raw: string | undefined): string[] {
  return (raw ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter((email) => email.length > 0);
}

/** An empty list allows nobody, so the app is closed by default. */
export function isAllowedEmail(
  email: string,
  raw: string | undefined,
): boolean {
  return parseAllowedEmails(raw).includes(email.trim().toLowerCase());
}
