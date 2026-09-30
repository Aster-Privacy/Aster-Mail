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
const CHANNEL = "aster_account_link";
const DEV_HUB_ORIGIN = "http://localhost:5173";
const BRIDGE_PATH = "/bridge.html";
const FRAME_READY_TIMEOUT_MS = 30_000;
const ACCOUNTS_TIMEOUT_MS = 10_000;
const LINK_TIMEOUT_MS = 20_000;
const SIGN_OUT_TIMEOUT_MS = 8_000;
const SET_CURRENT_TIMEOUT_MS = 5_000;
const MAX_ACCOUNTS = 20;
const MAX_ID_LENGTH = 128;
const MAX_EMAIL_LENGTH = 320;
const MAX_DISPLAY_NAME_LENGTH = 200;
const MAX_PROFILE_PICTURE_LENGTH = 512_000;
const COLOR_PATTERN = /^#[0-9a-f]{3,8}$/i;
const ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;
const ERROR_PATTERN = /^[a-z_]{1,64}$/;
const PROFILE_PICTURE_PATTERN =
  /^(https:\/\/|data:image\/(png|jpeg|webp|gif);base64,)/i;
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

type hub_action = "accounts" | "link" | "sign_out" | "set_current";

export interface hub_account {
  id: string;
  email: string;
  display_name: string | null;
  profile_color: string | null;
  profile_picture: string | null;
  is_current: boolean;
  linkable: boolean;
}

export class HubAccountError extends Error {
  code: string;
  constructor(code: string) {
    super(`account hub request failed: ${code}`);
    this.code = code;
  }
}

interface hub_reply {
  channel: string;
  id?: string;
  action: string;
  accounts?: unknown;
  ok?: boolean;
  error?: unknown;
}

let frame_promise: Promise<HTMLIFrameElement> | null = null;
let push_listener: ((event: MessageEvent) => void) | null = null;
const change_listeners = new Set<() => void>();

function normalized_origin(value: string): string | null {
  try {
    const parsed = new URL(value.trim());

    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      return null;
    }

    return parsed.origin;
  } catch {
    return null;
  }
}

function is_own_origin(origin: string): boolean {
  if (origin === window.location.origin) return true;

  const target = new URL(origin);

  return (
    LOOPBACK_HOSTS.has(target.hostname) &&
    LOOPBACK_HOSTS.has(window.location.hostname) &&
    target.port === window.location.port &&
    target.protocol === window.location.protocol
  );
}

export function account_hub_origin(): string | null {
  const configured =
    (import.meta.env.VITE_ACCOUNT_HUB_ORIGIN as string | undefined)?.trim() ||
    (import.meta.env.VITE_MAIL_ORIGIN as string | undefined)?.trim();
  const raw = configured || (import.meta.env.DEV ? DEV_HUB_ORIGIN : "");

  if (!raw) return null;

  const origin = normalized_origin(raw);

  if (!origin || is_own_origin(origin)) return null;

  return origin;
}

export function uses_account_hub(): boolean {
  return typeof window !== "undefined" && account_hub_origin() !== null;
}

export function account_hub_url(path: string): string | null {
  const origin = account_hub_origin();

  if (!origin || !path.startsWith("/") || path.startsWith("//")) return null;

  return origin + path;
}

function sanitize_account(value: unknown): hub_account | null {
  if (typeof value !== "object" || value === null) return null;

  const candidate = value as Record<string, unknown>;
  const { id, email, display_name, profile_color, profile_picture } = candidate;

  if (
    typeof id !== "string" ||
    id.length > MAX_ID_LENGTH ||
    !ID_PATTERN.test(id)
  ) {
    return null;
  }

  if (
    typeof email !== "string" ||
    email.length === 0 ||
    email.length > MAX_EMAIL_LENGTH ||
    !email.includes("@")
  ) {
    return null;
  }

  return {
    id,
    email,
    display_name:
      typeof display_name === "string" && display_name.length > 0
        ? display_name.slice(0, MAX_DISPLAY_NAME_LENGTH)
        : null,
    profile_color:
      typeof profile_color === "string" && COLOR_PATTERN.test(profile_color)
        ? profile_color
        : null,
    profile_picture:
      typeof profile_picture === "string" &&
      profile_picture.length <= MAX_PROFILE_PICTURE_LENGTH &&
      PROFILE_PICTURE_PATTERN.test(profile_picture)
        ? profile_picture
        : null,
    is_current: candidate.is_current === true,
    linkable: candidate.linkable === true,
  };
}

function is_hub_message(
  event: MessageEvent,
  origin: string,
  frame: HTMLIFrameElement,
): hub_reply | null {
  if (event.origin !== origin || event.source !== frame.contentWindow) {
    return null;
  }

  const reply = event.data as hub_reply | null;

  if (
    typeof reply !== "object" ||
    reply === null ||
    reply.channel !== CHANNEL ||
    typeof reply.action !== "string"
  ) {
    return null;
  }

  return reply;
}

function attach_push_listener(origin: string, frame: HTMLIFrameElement) {
  if (push_listener) window.removeEventListener("message", push_listener);

  push_listener = (event: MessageEvent) => {
    const reply = is_hub_message(event, origin, frame);

    if (!reply || reply.id !== undefined) return;
    if (reply.action !== "accounts_changed") return;

    for (const listener of Array.from(change_listeners)) {
      try {
        listener();
      } catch {
        continue;
      }
    }
  };
  window.addEventListener("message", push_listener);
}

function ensure_frame(origin: string): Promise<HTMLIFrameElement> {
  if (frame_promise) return frame_promise;

  frame_promise = new Promise((resolve, reject) => {
    const frame = document.createElement("iframe");

    function fail() {
      window.clearTimeout(timer);
      window.removeEventListener("message", on_ready);
      frame.remove();
      frame_promise = null;
      reject(new HubAccountError("unavailable"));
    }

    function on_ready(event: MessageEvent) {
      const reply = is_hub_message(event, origin, frame);

      if (!reply || reply.action !== "ready") return;

      window.clearTimeout(timer);
      window.removeEventListener("message", on_ready);
      attach_push_listener(origin, frame);
      resolve(frame);
    }

    const timer = window.setTimeout(fail, FRAME_READY_TIMEOUT_MS);

    frame.hidden = true;
    frame.tabIndex = -1;
    frame.setAttribute("aria-hidden", "true");
    frame.setAttribute("sandbox", "allow-scripts allow-same-origin");
    frame.setAttribute("referrerpolicy", "no-referrer");
    window.addEventListener("message", on_ready);
    frame.addEventListener("error", fail);
    frame.src = origin + BRIDGE_PATH;
    document.body.appendChild(frame);
  });

  return frame_promise;
}

async function call(
  action: hub_action,
  payload: Record<string, unknown>,
  timeout_ms: number,
): Promise<hub_reply> {
  const origin = account_hub_origin();

  if (!origin) throw new HubAccountError("unavailable");

  const frame = await ensure_frame(origin);
  const target = frame.contentWindow;

  if (!target) throw new HubAccountError("unavailable");

  const id = crypto.randomUUID();

  return new Promise<hub_reply>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      window.removeEventListener("message", on_message);
      reject(new HubAccountError("unavailable"));
    }, timeout_ms);

    function on_message(event: MessageEvent) {
      const reply = is_hub_message(event, origin as string, frame);

      if (!reply || reply.id !== id) return;

      window.clearTimeout(timer);
      window.removeEventListener("message", on_message);
      resolve(reply);
    }

    window.addEventListener("message", on_message);
    target.postMessage({ ...payload, channel: CHANNEL, id, action }, origin);
  });
}

function reply_error(reply: hub_reply): HubAccountError {
  return new HubAccountError(
    typeof reply.error === "string" && ERROR_PATTERN.test(reply.error)
      ? reply.error
      : "unavailable",
  );
}

export async function read_hub_accounts(): Promise<hub_account[] | null> {
  try {
    const reply = await call("accounts", {}, ACCOUNTS_TIMEOUT_MS);

    if (reply.ok !== true || !Array.isArray(reply.accounts)) return null;

    const seen = new Set<string>();

    return reply.accounts
      .slice(0, MAX_ACCOUNTS)
      .map(sanitize_account)
      .filter((account): account is hub_account => {
        if (!account || seen.has(account.id)) return false;
        seen.add(account.id);

        return true;
      });
  } catch {
    return null;
  }
}

export async function hub_accounts(): Promise<hub_account[]> {
  return (await read_hub_accounts()) ?? [];
}

export async function confirm_hub_link(
  code: string,
  account_id: string,
): Promise<void> {
  const reply = await call("link", { code, account_id }, LINK_TIMEOUT_MS);

  if (reply.ok !== true) throw reply_error(reply);
}

export async function sign_out_hub_accounts(
  target: string[] | "all",
): Promise<boolean> {
  const payload =
    target === "all"
      ? { all: true }
      : { account_ids: target.filter((id) => ID_PATTERN.test(id)) };

  if (target !== "all" && (payload.account_ids ?? []).length === 0) {
    return true;
  }

  try {
    const reply = await call("sign_out", payload, SIGN_OUT_TIMEOUT_MS);

    return reply.ok === true;
  } catch {
    return false;
  }
}

export async function set_hub_current_account(
  account_id: string,
): Promise<boolean> {
  if (!ID_PATTERN.test(account_id)) return false;

  try {
    const reply = await call(
      "set_current",
      { account_id },
      SET_CURRENT_TIMEOUT_MS,
    );

    return reply.ok === true;
  } catch {
    return false;
  }
}

export function on_hub_accounts_changed(listener: () => void): () => void {
  const origin = account_hub_origin();

  if (!origin) return () => undefined;

  change_listeners.add(listener);
  ensure_frame(origin).catch(() => undefined);

  return () => {
    change_listeners.delete(listener);
  };
}
