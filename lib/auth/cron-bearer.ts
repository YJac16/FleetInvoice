import { timingSafeEqual } from "node:crypto";

function bearerToken(authorization: string | null): string | null {
  if (!authorization) return null;
  const prefix = "Bearer ";
  if (!authorization.startsWith(prefix)) return null;
  const token = authorization.slice(prefix.length);
  return token.length > 0 ? token : null;
}

function matchesSecret(token: string, secret: string): boolean {
  if (token.length !== secret.length) return false;
  try {
    return timingSafeEqual(Buffer.from(token), Buffer.from(secret));
  } catch {
    return false;
  }
}

/**
 * Vercel Cron sends CRON_SECRET; manual drains may use NOTIFICATIONS_PROCESS_SECRET.
 * Accept either when configured (constant-time compare; never log secrets).
 */
export function isAuthorizedCronBearer(request: Request): boolean {
  const token = bearerToken(request.headers.get("authorization"));
  if (!token) return false;

  const candidates = [
    process.env.CRON_SECRET,
    process.env.NOTIFICATIONS_PROCESS_SECRET,
  ].filter((value): value is string => Boolean(value));

  if (candidates.length === 0) return false;

  return candidates.some((secret) => matchesSecret(token, secret));
}

export function unauthorizedCronResponse(): Response {
  return Response.json({ error: "Unauthorized" }, { status: 401 });
}
