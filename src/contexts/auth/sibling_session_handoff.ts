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
  open_bridge_channel,
  request_sibling_session,
} from "@/lib/session_handoff/session_handoff_client";
import { api_client } from "@/services/api/client";
import { get_csrf_token_from_cookie } from "@/services/api/csrf";
import { verify_auth_status } from "@/services/api/auth";
import { get_app_lock_config } from "@/services/app_lock_store";

const SKIPPED_PATH_PREFIXES = [
  "/register",
  "/signup",
  "/invite",
  "/forgot-password",
  "/reset-password",
  "/link-device",
  "/join",
  "/family",
  "/view",
  "/book",
];

export interface SiblingSessionLogin {
  user: User;
  vault: EncryptedVault;
  passphrase: string;
  encrypted_vault: string;
  vault_nonce: string;
}

export function can_attempt_sibling_handoff(pathname: string): boolean {
  if (typeof window === "undefined") return false;
  if ("__TAURI_INTERNALS__" in window) return false;

  return !SKIPPED_PATH_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
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

  const session = await request_sibling_session(
    {
      origin: window.location.origin,
      has_session_cookie: () => get_csrf_token_from_cookie() !== null,
      verify_server_session,
      has_local_lock: (user_id) => get_app_lock_config(user_id) !== null,
      open_channel: open_bridge_channel,
    },
    { expected_user_id },
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
