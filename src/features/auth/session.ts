import { headers } from "next/headers";

import { auth } from "@/features/auth/server";
import { isAllowedEmail } from "@/features/auth/allowlist";

// Returns the current session only if its user is still on the allowlist, so
// removing an email from ALLOWED_EMAILS also cuts sessions that already exist.
export async function getAllowedSession() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;
  if (!isAllowedEmail(session.user.email, process.env.ALLOWED_EMAILS)) {
    return null;
  }
  return session;
}
