import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { getAllowedSession } from "@/lib/session";

async function SessionPanel() {
  const session = await getAllowedSession();
  if (!session) redirect("/login");

  return (
    <>
      <p className="text-muted">Signed in as {session.user.email}</p>
      <Link href="/expenses" className="underline">
        Record an expense
      </Link>
    </>
  );
}

export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 p-8">
      <h1 className="text-2xl">Household finances</h1>
      <Suspense fallback={<p>Loading...</p>}>
        <SessionPanel />
      </Suspense>
    </main>
  );
}
