// Pure helpers for the sign-in error screen. No framework imports, so they can be
// unit tested with Node's built-in runner.

/** Code carried by the sign-in rejection for an email outside the allowlist. */
export const EMAIL_NOT_ALLOWED = "EMAIL_NOT_ALLOWED";

export type SignInErrorMessage = { title: string; body: string };

/** What to tell the person who was sent back to the login with an error code. */
export function signInErrorMessage(code: string | undefined): SignInErrorMessage {
  if (code === EMAIL_NOT_ALLOWED) {
    return {
      title: "This email is not allowed",
      body: "That Google account is not on the list of people who can use this app. Try again with another account.",
    };
  }
  return {
    title: "We could not sign you in",
    body: "Something went wrong while signing in. Try again.",
  };
}
