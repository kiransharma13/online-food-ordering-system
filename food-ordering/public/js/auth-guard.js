export async function getSession() {
  try {
    return await fetch("/api/me", { credentials: "same-origin" }).then((r) => r.json());
  } catch {
    return { user: null };
  }
}

/** @returns session object if signed in, otherwise redirects to home and returns null */
export async function redirectIfSignedOut() {
  const me = await getSession();
  if (!me.user) {
    window.location.replace("index.html?open=login");
    return null;
  }
  return me;
}
