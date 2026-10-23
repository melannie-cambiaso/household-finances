import { headers } from "next/headers";

import { auth } from "@/lib/auth";
import { isAllowedEmail } from "@/lib/allowlist";

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
