import { eq } from "drizzle-orm";
import { betterAuth } from "better-auth";
import { APIError } from "better-auth/api";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";

import { db } from "@/db";
import * as schema from "@/db/schema";
import { isAllowedEmail } from "@/lib/allowlist";

// The household owns all data. With two members there is exactly one, created
// the first time an allowed user signs in.
async function getOrCreateHouseholdId(): Promise<string> {
  // Ordered by id so the seed script picks the same row if there are ever several.
  const [existing] = await db
    .select({ id: schema.households.id })
    .from(schema.households)
    .orderBy(schema.households.id)
    .limit(1);
  if (existing) return existing.id;

  const [created] = await db
    .insert(schema.households)
    .values({ name: "Household" })
    .returning({ id: schema.households.id });
  return created.id;
}

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
    // Keys match the model names configured below.
    schema: {
      users: schema.users,
      auth_sessions: schema.authSessions,
      auth_accounts: schema.authAccounts,
      auth_verifications: schema.authVerifications,
    },
  }),
  // `accounts` is already the household's money accounts, so Better Auth's
  // own tables are prefixed with auth_.
  user: {
    modelName: "users",
    additionalFields: {
      // Not required here: Better Auth validates required fields against the
      // provider profile before the create hook runs, and the profile has no
      // household. The column is NOT NULL and the hook below always sets it.
      householdId: { type: "string", required: false, input: false },
    },
  },
  session: { modelName: "auth_sessions" },
  account: { modelName: "auth_accounts" },
  verification: { modelName: "auth_verifications" },
  advanced: { database: { generateId: "uuid" } },
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID as string,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
    },
  },
  databaseHooks: {
    session: {
      create: {
        // The user hook below only runs when a user is first created. Checking
        // here too means someone removed from the allowlist cannot sign in again.
        before: async (session) => {
          const [user] = await db
            .select({ email: schema.users.email })
            .from(schema.users)
            .where(eq(schema.users.id, session.userId))
            .limit(1);
          if (!user || !isAllowedEmail(user.email, process.env.ALLOWED_EMAILS)) {
            throw new APIError("FORBIDDEN", {
              message: "This email is not allowed to sign in",
            });
          }
        },
      },
    },
    user: {
      create: {
        before: async (user) => {
          // Sign-up is closed: only the allowlisted emails can ever create a user.
          if (!isAllowedEmail(user.email, process.env.ALLOWED_EMAILS)) {
            throw new APIError("FORBIDDEN", {
              message: "This email is not allowed to sign in",
            });
          }
          return {
            data: { ...user, householdId: await getOrCreateHouseholdId() },
          };
        },
      },
    },
  },
  plugins: [nextCookies()],
});
