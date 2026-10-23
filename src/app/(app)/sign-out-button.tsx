"use client";

import { useRouter } from "next/navigation";

import { authClient } from "@/lib/auth-client";

export function SignOutButton() {
  const router = useRouter();

  return (
    <button
      type="button"
      className="w-full rounded-full border border-line px-4 py-2 text-muted transition-colors hover:bg-surface hover:text-text"
      onClick={async () => {
        await authClient.signOut();
        router.push("/login");
      }}
    >
      Sign out
    </button>
  );
}
