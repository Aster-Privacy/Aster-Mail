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
import type { EncryptedVault } from "@/services/crypto/key_manager";
import type { User } from "@/services/account_manager";

import { decrypt_vault_with_lock } from "./vault_decryption";

import {
  await_sibling_approval,
  open_bridge_channel,
  request_sibling_session,
} from "@/lib/session_handoff/session_handoff_client";
import {
  generate_grant_id,
  local_grant_storage,
  write_grant,
} from "@/lib/session_handoff/session_handoff_grant";
import {
  SESSION_APPROVAL_HASH_PREFIX,
  SESSION_BRIDGE_PATH,
  get_handoff_sibling_origin,
  is_handoff_grant_id,
} from "@/lib/session_handoff/session_handoff_protocol";
import {
  safe_session_get,
  safe_session_remove,
  safe_session_set,
} from "@/lib/safe_storage";
import { has_tauri_runtime } from "@/lib/tauri_runtime";
import { api_client } from "@/services/api/client";
import { get_csrf_token_from_cookie } from "@/services/api/csrf";
import { verify_auth_status } from "@/services/api/auth";
import { get_app_lock_config } from "@/services/app_lock_store";

const SKIPPED_PATH_PREFIXES = [
  "/register",
  "/signup",
  "/invite",
  "/forgot-password",
  "/guard/veto",
  "/cancel",
  "/reset-password",
  "/link-device",
  "/family",
  "/view",
  "/book",
];

export const HANDOFF_GRANT_HASH_PREFIX = "#handoff=";

const PENDING_GRANT_KEY = "aster_session_handoff_grant";
const APPROVAL_WINDOW_FEATURES = "popup=yes,width=440,height=400";
const PANEL_GRANT_TTL_MS = 60 * 1000;
const SHARED_ACCOUNT_MARKER_PREFIX = "astermail_shared_grant_epoch_";

export type SiblingSignInResult = "approved" | "blocked" | "failed";

export interface SiblingSessionLogin {
  user: User;
  vault: EncryptedVault;
  passphrase: string;
  encrypted_vault: string;
  vault_nonce: string;
}

export function can_attempt_sibling_handoff(pathname: string): boolean {
  if (typeof window === "undefined") return false;
  if (has_tauri_runtime()) return false;
  if (sibling_app_origin() === null) return false;

  return !SKIPPED_PATH_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

export function has_sibling_session_cookie(): boolean {
  return get_csrf_token_from_cookie() !== null;
}

export function sibling_app_origin(): string | null {
  if (typeof window === "undefined") return null;
  if (has_tauri_runtime()) return null;

  return get_handoff_sibling_origin(window.location.origin);
}

function take_hash_grant(): string | null {
  const { hash, pathname, search } = window.location;

  if (!hash.startsWith(HANDOFF_GRANT_HASH_PREFIX)) return null;

  window.history.replaceState(window.history.state, "", pathname + search);

  const grant = hash.slice(HANDOFF_GRANT_HASH_PREFIX.length);

  return is_handoff_grant_id(grant) ? grant : null;
}

export function has_pending_handoff_grant(): boolean {
  if (typeof window === "undefined") return false;

  const { hash } = window.location;

  if (
    hash.startsWith(HANDOFF_GRANT_HASH_PREFIX) &&
    is_handoff_grant_id(hash.slice(HANDOFF_GRANT_HASH_PREFIX.length))
  ) {
    return true;
  }

  return is_handoff_grant_id(safe_session_get(PENDING_GRANT_KEY));
}

export function should_attempt_boot_handoff(
  has_current_account: boolean,
): boolean {
  return !has_current_account || has_pending_handoff_grant();
}

export function take_pending_handoff_grant(): string | null {
  const from_hash = take_hash_grant();
  const stored = safe_session_get(PENDING_GRANT_KEY);

  if (stored !== null) safe_session_remove(PENDING_GRANT_KEY);
  if (from_hash) return from_hash;

  return is_handoff_grant_id(stored) ? stored : null;
}

export async function start_sibling_sign_in(): Promise<SiblingSignInResult> {
  const sibling_origin = sibling_app_origin();

  if (!sibling_origin || !has_sibling_session_cookie()) return "failed";

  const grant = generate_grant_id();
  const popup = window.open(
    `${sibling_origin}${SESSION_BRIDGE_PATH}${SESSION_APPROVAL_HASH_PREFIX}${grant}`,
    "_blank",
    APPROVAL_WINDOW_FEATURES,
  );

  if (!popup) return "blocked";

  const approved = await await_sibling_approval(
    window.location.origin,
    grant,
    open_bridge_channel,
  );

  if (!approved) return "failed";

  safe_session_set(PENDING_GRANT_KEY, grant);

  return "approved";
}

function is_shared_account(user_id: string): boolean {
  try {
    return (
      window.localStorage.getItem(SHARED_ACCOUNT_MARKER_PREFIX + user_id) !==
      null
    );
  } catch {
    return true;
  }
}

export function mint_panel_handoff_grant(audience: string): string | null {
  if (typeof window === "undefined" || has_tauri_runtime()) return null;
  if (get_handoff_sibling_origin(window.location.origin) !== audience) {
    return null;
  }

  const user_id = api_client.get_cached_user_info()?.user_id;

  if (!user_id) return null;
  if (is_shared_account(user_id)) return null;
  if (get_app_lock_config(user_id) !== null) return null;

  const grant = generate_grant_id();
  const now = Date.now();
  const written = write_grant(
    local_grant_storage,
    grant,
    {
      user_id,
      audience,
      expires_at: now + PANEL_GRANT_TTL_MS,
      state: "approved",
    },
    now,
  );

  return written ? grant : null;
}

export function sibling_app_launch_url(target: string): string {
  let url: URL;

  try {
    url = new URL(target);
  } catch {
    return target;
  }

  if (url.origin !== sibling_app_origin()) return target;

  const grant = mint_panel_handoff_grant(url.origin);

  if (!grant) return target;

  url.hash = HANDOFF_GRANT_HASH_PREFIX + grant;

  return url.href;
}

async function verify_server_session(): Promise<string | null> {
  const valid = await verify_auth_status();

  if (!valid) return null;

  return api_client.get_cached_user_info()?.user_id ?? null;
}

export async function obtain_sibling_session(
  pathname: string,
  expected_user_id?: string,
): Promise<SiblingSessionLogin | null> {
  if (!can_attempt_sibling_handoff(pathname)) return null;

  const grant = take_pending_handoff_grant();

  if (!grant) return null;

  const session = await request_sibling_session(
    {
      origin: window.location.origin,
      has_session_cookie: has_sibling_session_cookie,
      verify_server_session,
      has_local_lock: (user_id) => get_app_lock_config(user_id) !== null,
      open_channel: open_bridge_channel,
    },
    { grant, expected_user_id },
  );

  if (!session) return null;

  let vault: EncryptedVault | null = null;

  try {
    vault = await decrypt_vault_with_lock(
      session.encrypted_vault,
      session.vault_nonce,
      session.passphrase,
      session.user.id,
    );
  } catch {
    vault = null;
  }

  if (!vault) return null;

  return {
    user: { ...session.user },
    vault,
    passphrase: session.passphrase,
    encrypted_vault: session.encrypted_vault,
    vault_nonce: session.vault_nonce,
  };
}
