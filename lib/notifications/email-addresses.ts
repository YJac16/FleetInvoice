const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(value: string): boolean {
  return EMAIL_PATTERN.test(value.trim());
}

/** Parse comma/semicolon-separated email list. */
export function parseEmailList(value: string): string[] {
  return value
    .split(/[,;]+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

export function validateEmailList(
  value: string,
  { required = false }: { required?: boolean } = {}
): { emails: string[]; error: string | null } {
  const emails = parseEmailList(value);
  if (required && emails.length === 0) {
    return { emails, error: "Enter at least one email address" };
  }
  const invalid = emails.find((email) => !isValidEmail(email));
  if (invalid) {
    return { emails, error: `Invalid email: ${invalid}` };
  }
  return { emails, error: null };
}
