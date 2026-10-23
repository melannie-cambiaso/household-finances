"use client";

import { useRouter } from "next/navigation";

import { authClient } from "@/lib/auth-client";

export function SignOutButton() {
  const router = useRouter();

  return (
    <button
      type="button"
      className="rounded-md border px-4 py-2"
      onClick={async () => {
        await authClient.signOut();
        router.push("/login");
      }}
    >
      Sign out
    </button>
  );
}
