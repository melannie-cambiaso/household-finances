import Link from "next/link";
import { Suspense } from "react";

import { signInErrorMessage } from "@/lib/auth-errors";

async function SignInError({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const message = signInErrorMessage(error);

  return (
    <div className="flex w-full max-w-sm flex-col items-center gap-6 rounded-card border border-line bg-surface p-10 text-center">
      <h1 className="text-2xl">{message.title}</h1>
      <p className="text-muted">{message.body}</p>
      <Link
        href="/login"
        className="rounded-full bg-accent px-6 py-2 text-page transition-opacity hover:opacity-90"
      >
        Back to sign in
      </Link>
    </div>
  );
}

// Better Auth sends people here, with ?error=<code>, when a sign-in is rejected.
// It lives under /login so the proxy leaves it public. Reading searchParams must
// sit inside <Suspense>, or the production build cannot prerender the route.
export default function SignInErrorPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  return (
    <main className="flex flex-1 items-center justify-center p-8">
      <Suspense fallback={<p>Loading...</p>}>
        <SignInError searchParams={searchParams} />
      </Suspense>
    </main>
  );
}
