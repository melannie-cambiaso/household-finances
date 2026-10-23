"use client";

import { authClient } from "@/lib/auth-client";

export default function LoginPage() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 p-8">
      <h1 className="text-2xl font-semibold">Household finances</h1>
      <button
        type="button"
        className="rounded-md bg-black px-4 py-2 text-white dark:bg-white dark:text-black"
        onClick={() =>
          authClient.signIn.social({ provider: "google", callbackURL: "/" })
        }
      >
        Sign in with Google
      </button>
    </main>
  );
}
