"use client";

import { authClient } from "@/lib/auth-client";

export default function LoginPage() {
  return (
    <main className="flex flex-1 items-center justify-center p-8">
      <div className="flex w-full max-w-sm flex-col items-center gap-6 rounded-card border border-line bg-surface p-10">
        <h1 className="text-2xl">Household finances</h1>
        <button
          type="button"
          className="rounded-full bg-accent px-6 py-2 text-page transition-opacity hover:opacity-90"
          onClick={() =>
            authClient.signIn.social({ provider: "google", callbackURL: "/" })
          }
        >
          Sign in with Google
        </button>
      </div>
    </main>
  );
}
