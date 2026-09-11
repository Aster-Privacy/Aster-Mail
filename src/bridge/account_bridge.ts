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
import type { StoredAccount } from "@/services/account_manager";

import {
  ACCOUNTS_CHANGED_EVENT,
  accounts_storage_unreadable,
  get_all_accounts,
  get_current_account_id,
  remove_account,
  switch_account,
  update_account_tokens,
} from "@/services/account_manager";
import {
  clear_session_passphrase,
  clear_stored_encrypted_vault,
  get_session_passphrase,
  get_stored_encrypted_vault,
  has_stored_session_passphrase,
} from "@/contexts/auth/session_passphrase";
import { api_client } from "@/services/api/client";
import {
  API_BASE_URL,
  CLIENT_PLATFORM_HEADER,
  type ApiErrorCode,
} from "@/services/api/client/helpers";
import {
  confirm_device_code,
  verify_device_code,
  type DeviceCodeVerifyResponse,
} from "@/services/api/devices";
import { unlink_account_device } from "@/services/api/switch";
import { get_device_id } from "@/services/device_id";
import { clear_session_timeout_data } from "@/services/session_timeout_service";
import {
  clear_app_lock_config,
  clear_session_unlock,
} from "@/services/app_lock_store";
import {
  base64url_decode,
  base64url_encode,
  seal_vault_key_for_device,
} from "@/lib/crypto/device_envelope";

const CHANNEL = "aster_account_link";
const DEV_LINK_ORIGINS = ["http://localhost:5175", "http://localhost:5176"];
const MAX_LINK_ATTEMPTS_PER_LOAD = 3;
const MAX_ACCOUNTS = 20;
const MAX_PROFILE_PICTURE_LENGTH = 512_000;
const CODE_PATTERN = /^[A-Za-z0-9_-]{4,128}$/;
const ACCOUNT_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;
const PROFILE_PICTURE_PATTERN =
  /^(https:\/\/|data:image\/(png|jpeg|webp|gif);base64,)/i;
const ACCOUNTS_CHANGED_DEBOUNCE_MS = 150;

type bridge_error =
  | "rate_limited"
  | "session"
  | "code_not_found"
  | "storage_unreadable"
  | "unsupported"
  | "unavailable";

interface bridge_request {
  channel: string;
  id: string;
  action: string;
  code?: unknown;
  account_id?: unknown;
  account_ids?: unknown;
  all?: unknown;
}

interface bridge_result {
  ok: boolean;
  error?: bridge_error;
  [key: string]: unknown;
}

interface token_session {
  access_token: string;
  csrf_token: string;
}

interface session_call<T> {
  data?: T;
  error?: bridge_error;
}

let link_attempts = 0;
let link_completed = false;
let parent_origin: string | null = null;
let changed_timer: number | null = null;

function allowed_origins(): string[] {
  const configured =
    (import.meta.env.VITE_ACCOUNT_LINK_ORIGINS as string | undefined) ?? "";
  const list = configured
    .split(",")
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0 && origin !== window.location.origin);

  return list.length > 0 || !import.meta.env.DEV ? list : DEV_LINK_ORIGINS;
}

function error_from_api_code(code: ApiErrorCode | undefined): bridge_error {
  if (code === "UNAUTHORIZED" || code === "FORBIDDEN") return "session";
  if (code === "NOT_FOUND" || code === "VALIDATION_ERROR") {
    return "code_not_found";
  }
  if (code === "RATE_LIMIT_EXCEEDED") return "rate_limited";

  return "unavailable";
}

function error_from_status(status: number): bridge_error {
  if (status === 401 || status === 403) return "session";
  if (status === 400 || status === 404 || status === 410 || status === 422) {
    return "code_not_found";
  }
  if (status === 429) return "rate_limited";

  return "unavailable";
}

function base_headers(): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-Aster-Client": CLIENT_PLATFORM_HEADER,
  };
  const device_id = get_device_id();

  if (device_id) headers["X-Aster-Device-Id"] = device_id;

  return headers;
}

function profile_picture_of(account: StoredAccount): string | null {
  const picture = account.user.profile_picture;

  if (
    typeof picture !== "string" ||
    picture.length > MAX_PROFILE_PICTURE_LENGTH ||
    !PROFILE_PICTURE_PATTERN.test(picture)
  ) {
    return null;
  }

  return picture;
}

function has_unlock_material(account_id: string): boolean {
  return (
    get_stored_encrypted_vault(account_id) !== null &&
    has_stored_session_passphrase(account_id)
  );
}

function personal_accounts(accounts: StoredAccount[]): StoredAccount[] {
  return accounts
    .filter((account) => account.kind !== "shared")
    .slice(0, MAX_ACCOUNTS);
}

async function handle_accounts(): Promise<bridge_result> {
  const accounts = await get_all_accounts();

  if (accounts_storage_unreadable()) {
    return { ok: false, error: "storage_unreadable" };
  }

  const current_id = await get_current_account_id();

  return {
    ok: true,
    accounts: personal_accounts(accounts).map((account) => {
      const is_current = account.id === current_id;

      return {
        id: account.id,
        email: account.user.email,
        display_name: account.user.display_name ?? null,
        profile_color: account.user.profile_color ?? null,
        profile_picture: profile_picture_of(account),
        is_current,
        linkable:
          has_unlock_material(account.id) &&
          (is_current || Boolean(account.refresh_token)),
      };
    }),
  };
}

async function open_token_session(
  account: StoredAccount,
): Promise<token_session | null> {
  if (!account.refresh_token) return null;

  const response = await fetch(`${API_BASE_URL}/core/v1/auth/refresh`, {
    method: "POST",
    credentials: "omit",
    headers: base_headers(),
    body: JSON.stringify({
      refresh_token: account.refresh_token,
      expected_user_id: account.id,
    }),
  });

  if (!response.ok) return null;

  const body = (await response.json().catch(() => null)) as {
    csrf_token?: unknown;
    access_token?: unknown;
    refresh_token?: unknown;
  } | null;

  if (
    !body ||
    typeof body.csrf_token !== "string" ||
    typeof body.access_token !== "string"
  ) {
    return null;
  }

  if (typeof body.refresh_token === "string") {
    await update_account_tokens(
      account.id,
      body.access_token,
      body.refresh_token,
    );
  }

  return { access_token: body.access_token, csrf_token: body.csrf_token };
}

async function post_with_token<T>(
  session: token_session,
  path: string,
  payload: Record<string, string>,
): Promise<session_call<T>> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: "POST",
    credentials: "omit",
    headers: {
      ...base_headers(),
      Authorization: `Bearer ${session.access_token}`,
      "X-CSRF-Token": session.csrf_token,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) return { error: error_from_status(response.status) };

  const data = (await response.json().catch(() => null)) as T | null;

  return data === null ? { data: {} as T } : { data };
}

interface link_client {
  verify: (code: string) => Promise<session_call<DeviceCodeVerifyResponse>>;
  confirm: (code: string, envelope: string) => Promise<session_call<unknown>>;
}

const current_session_client: link_client = {
  verify: async (code) => {
    const result = await verify_device_code(code);

    return result.error || !result.data
      ? { error: error_from_api_code(result.code) }
      : { data: result.data };
  },
  confirm: async (code, envelope) => {
    const result = await confirm_device_code(code, envelope);

    return result.error
      ? { error: error_from_api_code(result.code) }
      : { data: result.data };
  },
};

function token_session_client(session: token_session): link_client {
  return {
    verify: (code) =>
      post_with_token<DeviceCodeVerifyResponse>(
        session,
        "/core/v1/auth/device/code/verify",
        { code },
      ),
    confirm: (code, envelope) =>
      post_with_token<unknown>(session, "/core/v1/auth/device/code/confirm", {
        code,
        sealed_envelope: envelope,
      }),
  };
}

async function handle_link(
  code: string,
  account_id: string,
): Promise<bridge_result> {
  if (link_completed || link_attempts >= MAX_LINK_ATTEMPTS_PER_LOAD) {
    return { ok: false, error: "rate_limited" };
  }

  link_attempts += 1;

  const accounts = personal_accounts(await get_all_accounts());
  const account = accounts.find((candidate) => candidate.id === account_id);

  if (!account || !has_unlock_material(account.id)) {
    return { ok: false, error: "session" };
  }

  const current_id = await get_current_account_id();
  let client: link_client;

  if (account.id === current_id) {
    client = current_session_client;
  } else {
    const session = await open_token_session(account).catch(() => null);

    if (!session) return { ok: false, error: "session" };
    client = token_session_client(session);
  }

  const verified = await client.verify(code);

  if (verified.error || !verified.data) {
    return { ok: false, error: verified.error ?? "code_not_found" };
  }

  const passphrase = await get_session_passphrase(account.id).catch(() => null);

  if (!passphrase) return { ok: false, error: "session" };

  const passphrase_bytes = new TextEncoder().encode(passphrase);
  let envelope: Uint8Array;

  try {
    envelope = await seal_vault_key_for_device(
      passphrase_bytes,
      base64url_decode(verified.data.ed25519_pk),
      base64url_decode(verified.data.mlkem_pk),
      base64url_decode(verified.data.x25519_pk),
    );
  } finally {
    passphrase_bytes.fill(0);
  }

  const confirmed = await client.confirm(code, base64url_encode(envelope));

  if (confirmed.error) return { ok: false, error: confirmed.error };

  link_completed = true;

  return { ok: true };
}

function clear_account_material(account_id: string): Promise<void> {
  clear_stored_encrypted_vault(account_id);
  clear_session_timeout_data(account_id);
  clear_app_lock_config(account_id);
  clear_session_unlock(account_id);

  return clear_session_passphrase(account_id);
}

async function sign_out_one(
  account: StoredAccount,
  current_id: string | null,
): Promise<boolean> {
  if (account.id === current_id) {
    await unlink_account_device().catch(() => undefined);
    await api_client
      .post("/core/v1/auth/logout", {}, { skip_session_refresh: true })
      .catch(() => undefined);
    api_client.clear_auth_data();
  } else {
    await unlink_account_device(account.id).catch(() => undefined);

    const session = await open_token_session(account).catch(() => null);

    if (session) {
      await post_with_token(session, "/core/v1/auth/logout", {}).catch(
        () => undefined,
      );
    }
  }

  const result = await remove_account(account.id);

  if (!result.removed) return false;
  await clear_account_material(account.id).catch(() => undefined);

  return true;
}

async function handle_sign_out(
  account_ids: unknown,
  all: unknown,
): Promise<bridge_result> {
  const accounts = personal_accounts(await get_all_accounts());

  if (accounts_storage_unreadable()) {
    return { ok: false, error: "storage_unreadable" };
  }

  if (all === true) {
    const { purge_all_local_data } = await import(
      "@/contexts/auth/purge_local_data"
    );

    await purge_all_local_data();

    return { ok: true, removed: accounts.length };
  }

  if (
    !Array.isArray(account_ids) ||
    account_ids.length === 0 ||
    account_ids.length > MAX_ACCOUNTS ||
    !account_ids.every(
      (id) => typeof id === "string" && ACCOUNT_ID_PATTERN.test(id),
    )
  ) {
    return { ok: false, error: "unsupported" };
  }

  const current_id = await get_current_account_id();
  let removed = 0;

  for (const id of new Set(account_ids as string[])) {
    const account = accounts.find((candidate) => candidate.id === id);

    if (account && (await sign_out_one(account, current_id))) removed += 1;
  }

  return { ok: true, removed };
}

async function handle_set_current(account_id: string): Promise<bridge_result> {
  const accounts = personal_accounts(await get_all_accounts());

  if (accounts_storage_unreadable()) {
    return { ok: false, error: "storage_unreadable" };
  }

  const account = accounts.find((candidate) => candidate.id === account_id);

  if (!account) return { ok: false, error: "session" };
  if ((await get_current_account_id()) === account.id) return { ok: true };

  const switched = await switch_account(account.id);

  return switched ? { ok: true } : { ok: false, error: "unavailable" };
}

function handle(request: bridge_request): Promise<bridge_result> {
  switch (request.action) {
    case "accounts":
      return handle_accounts();
    case "set_current":
      if (
        typeof request.account_id === "string" &&
        ACCOUNT_ID_PATTERN.test(request.account_id)
      ) {
        return handle_set_current(request.account_id);
      }

      return Promise.resolve({ ok: false, error: "unsupported" });
    case "link":
      if (
        typeof request.code === "string" &&
        CODE_PATTERN.test(request.code) &&
        typeof request.account_id === "string" &&
        ACCOUNT_ID_PATTERN.test(request.account_id)
      ) {
        return handle_link(request.code, request.account_id);
      }

      return Promise.resolve({ ok: false, error: "unsupported" });
    case "sign_out":
      return handle_sign_out(request.account_ids, request.all);
    default:
      return Promise.resolve({ ok: false, error: "unsupported" });
  }
}

function post_to_parent(message: Record<string, unknown>, origins: string[]) {
  const targets = parent_origin ? [parent_origin] : origins;

  for (const origin of targets) {
    window.parent.postMessage({ channel: CHANNEL, ...message }, origin);
  }
}

function start_bridge() {
  const origins = allowed_origins();

  if (origins.length === 0) return;

  post_to_parent({ action: "ready" }, origins);

  window.addEventListener(ACCOUNTS_CHANGED_EVENT, () => {
    if (changed_timer !== null) window.clearTimeout(changed_timer);
    changed_timer = window.setTimeout(() => {
      changed_timer = null;
      post_to_parent({ action: "accounts_changed" }, origins);
    }, ACCOUNTS_CHANGED_DEBOUNCE_MS);
  });

  window.addEventListener("message", (event: MessageEvent) => {
    if (!origins.includes(event.origin)) return;
    if (event.source !== window.parent) return;

    const request = event.data as bridge_request | null;

    if (
      typeof request !== "object" ||
      request === null ||
      request.channel !== CHANNEL ||
      typeof request.id !== "string" ||
      request.id.length > 64 ||
      typeof request.action !== "string"
    ) {
      return;
    }

    parent_origin = event.origin;

    handle(request)
      .catch((): bridge_result => ({ ok: false, error: "unavailable" }))
      .then((result) => {
        window.parent.postMessage(
          {
            channel: CHANNEL,
            id: request.id,
            action: request.action,
            ...result,
          },
          event.origin,
        );
      });
  });
}

if (window.parent !== window) {
  start_bridge();
}
