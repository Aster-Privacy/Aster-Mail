//
// Aster Communications Inc.
//
// Copyright (c) 2026 Aster Communications Inc.
//
// This file is part of this project.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
// GNU Affero General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License
// along with this program. If not, see <https://www.gnu.org/licenses/>.
//
import { get_current_account } from "@/services/account_manager";
import {
  get_session_passphrase,
  get_stored_encrypted_vault,
} from "@/contexts/auth/session_passphrase";
import {
  verify_device_code,
  confirm_device_code,
} from "@/services/api/devices";
import {
  seal_vault_key_for_device,
  base64url_encode,
  base64url_decode,
} from "@/lib/crypto/device_envelope";

const CHANNEL = "aster_account_link";
const DEV_LINK_ORIGINS = ["http://localhost:5175"];

interface bridge_request {
  channel: string;
  id: string;
  action: "accounts" | "link";
  code?: string;
  account_id?: string;
}

function allowed_origins(): string[] {
  const configured = (import.meta.env.VITE_ACCOUNT_LINK_ORIGINS as string | undefined) ?? "";
  const list = configured
    .split(",")
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0 && origin !== window.location.origin);

  return list.length > 0 || !import.meta.env.DEV ? list : DEV_LINK_ORIGINS;
}

async function current_linkable_account() {
  const current = await get_current_account();

  if (!current || current.kind === "shared") return null;
  if (!get_stored_encrypted_vault(current.id)) return null;

  const passphrase = await get_session_passphrase(current.id).catch(() => null);

  if (!passphrase) return null;

  return { account: current, passphrase };
}

async function handle_accounts() {
  const linkable = await current_linkable_account();

  if (!linkable) return { accounts: [] };

  const user = linkable.account.user;

  return {
    accounts: [
      {
        id: linkable.account.id,
        email: user.email,
        display_name: user.display_name ?? null,
        profile_color: user.profile_color ?? null,
        is_current: true,
      },
    ],
  };
}

async function handle_link(code: string, account_id: string) {
  const linkable = await current_linkable_account();

  if (!linkable || linkable.account.id !== account_id) {
    return { ok: false, error: "session" };
  }

  const verified = await verify_device_code(code);

  if (verified.error || !verified.data) {
    return { ok: false, error: verified.error ?? "code_not_found" };
  }

  const passphrase_bytes = new TextEncoder().encode(linkable.passphrase);
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

  const confirmed = await confirm_device_code(code, base64url_encode(envelope));

  if (confirmed.error) {
    return { ok: false, error: confirmed.error };
  }

  return { ok: true };
}

async function handle(request: bridge_request) {
  if (request.action === "accounts") return handle_accounts();
  if (request.action === "link" && request.code && request.account_id) {
    return handle_link(request.code, request.account_id);
  }

  return { ok: false, error: "unsupported" };
}

const origins = allowed_origins();

if (window.parent !== window) {
  for (const origin of origins) {
    window.parent.postMessage({ channel: CHANNEL, action: "ready" }, origin);
  }
}

window.addEventListener("message", (event: MessageEvent) => {
  if (!origins.includes(event.origin)) return;
  if (event.source !== window.parent) return;

  const request = event.data as bridge_request | null;

  if (!request || request.channel !== CHANNEL || typeof request.id !== "string") return;

  handle(request)
    .catch(() => ({ ok: false, error: "unavailable" }))
    .then((result) => {
      window.parent.postMessage(
        { channel: CHANNEL, id: request.id, action: request.action, ...result },
        event.origin,
      );
    });
});
