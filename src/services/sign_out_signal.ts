//
// Aster Communications Inc.
//
// Copyright (c) 2026 Aster Communications Inc.
//
// This file is part of this project.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the AGPLv3 as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
// AGPLv3 for more details.
//
// You should have received a copy of the AGPLv3
// along with this program. If not, see <https://www.gnu.org/licenses/>.
//
export const SIGN_OUT_COOKIE = "aster_signed_out";
export const SIGN_OUT_CHANNEL = "aster-sign-out";

const HASH_PREFIX = "aster-sign-out:";
const HASH_LENGTH = 16;
const MAX_HASHES = 20;
const MARKER_MAX_AGE_SECONDS = 120;
const SHARED_COOKIE_DOMAIN = "astermail.org";
const POLL_INTERVAL_MS = 1000;
const RETRY_DELAY_MS = 2000;
const MAX_ATTEMPTS = 3;
const HASH_PATTERN = /^[0-9a-f]{16}$/;

export interface SignOutMarker {
  issued_at: number;
  hashes: string[];
}

export async function hash_account_id(user_id: string): Promise<string | null> {
  const subtle = globalThis.crypto?.subtle;

  if (!subtle || !user_id) return null;

  try {
    const digest = await subtle.digest(
      "SHA-256",
      new TextEncoder().encode(`${HASH_PREFIX}${user_id}`),
    );

    return Array.from(new Uint8Array(digest))
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("")
      .slice(0, HASH_LENGTH);
  } catch {
    return null;
  }
}

export function parse_sign_out_marker(
  cookie_string: string,
): SignOutMarker | null {
  const entry = cookie_string
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${SIGN_OUT_COOKIE}=`));

  if (!entry) return null;

  const value = entry.slice(SIGN_OUT_COOKIE.length + 1);
  const separator = value.indexOf(".");

  if (separator <= 0) return null;

  const issued_at = Number(value.slice(0, separator));

  if (!Number.isSafeInteger(issued_at) || issued_at <= 0) return null;

  const hashes = value
    .slice(separator + 1)
    .split("~")
    .filter((hash) => HASH_PATTERN.test(hash));

  if (hashes.length === 0) return null;

  return { issued_at, hashes: hashes.slice(0, MAX_HASHES) };
}

export function sign_out_cookie_attributes(
  hostname: string,
  protocol: string,
): string {
  const parts = [`Max-Age=${MARKER_MAX_AGE_SECONDS}`, "Path=/", "SameSite=Lax"];
  const is_shared_host =
    hostname === SHARED_COOKIE_DOMAIN ||
    hostname.endsWith(`.${SHARED_COOKIE_DOMAIN}`);

  if (is_shared_host) parts.push(`Domain=.${SHARED_COOKIE_DOMAIN}`);
  if (protocol === "https:") parts.push("Secure");

  return parts.join("; ");
}

function read_cookie_string(): string {
  try {
    return typeof document === "undefined" ? "" : document.cookie;
  } catch {
    return "";
  }
}

function open_channel(): BroadcastChannel | null {
  if (typeof BroadcastChannel === "undefined") return null;

  try {
    return new BroadcastChannel(SIGN_OUT_CHANNEL);
  } catch {
    return null;
  }
}

export async function announce_sign_out(
  user_ids: ReadonlyArray<string | null | undefined>,
  now: number = Date.now(),
): Promise<void> {
  if (typeof document === "undefined") return;

  const fresh: string[] = [];

  for (const user_id of user_ids) {
    if (!user_id) continue;

    const hash = await hash_account_id(user_id);

    if (hash && !fresh.includes(hash)) fresh.push(hash);
  }

  if (fresh.length === 0) return;

  const previous = parse_sign_out_marker(read_cookie_string());
  const carried =
    previous && now - previous.issued_at < MARKER_MAX_AGE_SECONDS * 1000
      ? previous.hashes.filter((hash) => !fresh.includes(hash))
      : [];
  const hashes = [...fresh, ...carried].slice(0, MAX_HASHES);
  const value = `${now}.${hashes.join("~")}`;

  try {
    document.cookie = `${SIGN_OUT_COOKIE}=${value}; ${sign_out_cookie_attributes(
      window.location.hostname,
      window.location.protocol,
    )}`;
  } catch {
    return;
  }

  const channel = open_channel();

  if (!channel) return;

  try {
    channel.postMessage({ issued_at: now, hashes });
  } finally {
    channel.close();
  }
}

export interface SignOutWatchOptions {
  account_id: string;
  on_signal: () => Promise<boolean>;
  since?: number;
  poll_interval_ms?: number;
}

function read_channel_marker(data: unknown): SignOutMarker | null {
  if (typeof data !== "object" || data === null) return null;

  const record = data as Record<string, unknown>;

  if (typeof record.issued_at !== "number") return null;
  if (!Array.isArray(record.hashes)) return null;

  const hashes = record.hashes.filter(
    (hash): hash is string => typeof hash === "string" && HASH_PATTERN.test(hash),
  );

  return hashes.length > 0 ? { issued_at: record.issued_at, hashes } : null;
}

export function watch_sign_out_signal(
  options: SignOutWatchOptions,
): () => void {
  if (typeof window === "undefined") return () => undefined;

  const since = options.since ?? Date.now();
  const handled = new Set<number>();
  let stopped = false;
  let running = false;
  let account_hash: string | null = null;
  let last_cookie = "";
  let retry_timer: ReturnType<typeof setTimeout> | null = null;

  const confirm = async (attempt: number): Promise<void> => {
    if (stopped) return;

    running = true;
    let signed_out = false;

    try {
      signed_out = await options.on_signal();
    } catch {
      signed_out = false;
    } finally {
      running = false;
    }

    if (stopped || signed_out) {
      if (signed_out) stop();

      return;
    }

    if (attempt + 1 < MAX_ATTEMPTS) {
      retry_timer = setTimeout(() => {
        retry_timer = null;
        void confirm(attempt + 1);
      }, RETRY_DELAY_MS);
    }
  };

  const consider = (marker: SignOutMarker | null): void => {
    if (stopped || !marker || !account_hash) return;
    if (marker.issued_at < since) return;
    if (handled.has(marker.issued_at)) return;
    if (!marker.hashes.includes(account_hash)) return;

    handled.add(marker.issued_at);

    if (running || retry_timer !== null) return;

    void confirm(0);
  };

  const check_cookie = (): void => {
    const cookie_string = read_cookie_string();

    if (cookie_string === last_cookie) return;
    last_cookie = cookie_string;
    consider(parse_sign_out_marker(cookie_string));
  };

  const channel = open_channel();
  const on_channel_message = (event: MessageEvent): void => {
    consider(read_channel_marker(event.data));
  };
  const on_visible = (): void => {
    if (document.visibilityState === "visible") check_cookie();
  };

  channel?.addEventListener("message", on_channel_message);
  document.addEventListener("visibilitychange", on_visible);
  window.addEventListener("focus", check_cookie);

  const cookie_store = (
    globalThis as {
      cookieStore?: {
        addEventListener: (type: string, listener: () => void) => void;
        removeEventListener: (type: string, listener: () => void) => void;
      };
    }
  ).cookieStore;

  cookie_store?.addEventListener("change", check_cookie);

  const poll = setInterval(
    check_cookie,
    options.poll_interval_ms ?? POLL_INTERVAL_MS,
  );

  void hash_account_id(options.account_id).then((hash) => {
    account_hash = hash;
    last_cookie = "";
    check_cookie();
  });

  function stop(): void {
    if (stopped) return;
    stopped = true;
    clearInterval(poll);
    if (retry_timer !== null) clearTimeout(retry_timer);
    retry_timer = null;
    channel?.removeEventListener("message", on_channel_message);
    channel?.close();
    document.removeEventListener("visibilitychange", on_visible);
    window.removeEventListener("focus", check_cookie);
    cookie_store?.removeEventListener("change", check_cookie);
  }

  return stop;
}
