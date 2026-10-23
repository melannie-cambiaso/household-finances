import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { auth } from "@/lib/auth";

import { SignOutButton } from "./sign-out-button";

async function SessionPanel() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");

  return (
    <>
      <p>Signed in as {session.user.email}</p>
      <SignOutButton />
    </>
  );
}

export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 p-8">
      <h1 className="text-2xl font-semibold">Household finances</h1>
      <Suspense fallback={<p>Loading...</p>}>
        <SessionPanel />
      </Suspense>
    </main>
  );
}
