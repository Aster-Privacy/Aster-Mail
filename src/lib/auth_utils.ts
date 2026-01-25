const AUTH_PAGE_PREFIXES = [
  "/sign-in",
  "/register",
  "/signup",
  "/forgot-password",
];

export function is_auth_page(): boolean {
  const pathname = window.location.pathname.replace(/\/$/, "");

  return AUTH_PAGE_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(prefix + "/"),
  );
}
