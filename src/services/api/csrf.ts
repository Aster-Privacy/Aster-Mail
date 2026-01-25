const CSRF_COOKIE_NAME = "csrf_token";

let cached_csrf_token: string | null = null;

export function get_csrf_token_from_cookie(): string | null {
  if (typeof document === "undefined") {
    return cached_csrf_token;
  }

  const cookies = document.cookie.split(";");

  for (const cookie of cookies) {
    const trimmed = cookie.trim();
    const eq_index = trimmed.indexOf("=");

    if (eq_index <= 0) continue;

    const name = trimmed.substring(0, eq_index);
    const value = trimmed.substring(eq_index + 1);

    if (name === CSRF_COOKIE_NAME && value) {
      cached_csrf_token = decodeURIComponent(value);

      return cached_csrf_token;
    }
  }

  return null;
}

export function clear_csrf_cache(): void {
  cached_csrf_token = null;
}

export function has_csrf_token(): boolean {
  return get_csrf_token_from_cookie() !== null;
}

export function is_state_changing_method(method: string): boolean {
  const state_changing_methods = ["POST", "PUT", "PATCH", "DELETE"];

  return state_changing_methods.includes(method.toUpperCase());
}
