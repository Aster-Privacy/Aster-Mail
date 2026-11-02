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
import {
  build_handoff_message,
  is_handoff_user_id,
  parse_handoff_port_request,
  parse_handoff_user,
  type HandoffBridgeReply,
  type HandoffSession,
  type HandoffUser,
} from "@/lib/session_handoff/session_handoff_protocol";

const ENCRYPTED_VAULT_KEY_PREFIX = "astermail_encrypted_vault_";
const VAULT_NONCE_KEY_PREFIX = "astermail_vault_nonce_";
const SESSION_PASSPHRASE_KEY_PREFIX = "astermail_session_passphrase_";
const SESSION_PASSPHRASE_IV_KEY_PREFIX = "astermail_session_passphrase_iv_";
const SESSION_TIMEOUT_CONFIG_KEY = "astermail_session_timeout_config";
const SESSION_TIMEOUT_MIGRATED_KEY = "astermail_session_timeout_migrated_v2";
const LAST_ACTIVITY_KEY_PREFIX = "astermail_last_activity_";
const APP_LOCK_KEY_PREFIX = "aster:app_lock:";
const MIN_TIMEOUT_MINUTES = 5;
const DEFAULT_TIMEOUT_MINUTES = 30;

export interface BridgeStorage {
  get(key: string): string | null;
  keys(): string[];
}

export interface BridgeDeps {
  storage: BridgeStorage;
  now(): number;
  load_session_key(): Promise<CryptoKey | null>;
  fetch_current_user(): Promise<unknown>;
  decrypt(
    key: CryptoKey,
    ciphertext: Uint8Array,
    iv: Uint8Array,
  ): Promise<ArrayBuffer>;
}

function decode_base64(value: string): Uint8Array | null {
  try {
    return Uint8Array.from(atob(value), (c) => c.charCodeAt(0));
  } catch {
    return null;
  }
}

function is_session_timed_out(
  storage: BridgeStorage,
  user_id: string,
  now: number,
): boolean {
  const migrated = storage.get(SESSION_TIMEOUT_MIGRATED_KEY);
  const raw_config = storage.get(SESSION_TIMEOUT_CONFIG_KEY);

  if (!migrated || !raw_config) return false;

  let enabled = false;
  let timeout_minutes = DEFAULT_TIMEOUT_MINUTES;

  try {
    const config = JSON.parse(raw_config) as {
      enabled?: unknown;
      timeout_minutes?: unknown;
    };

    enabled = config.enabled === true;
    if (
      typeof config.timeout_minutes === "number" &&
      config.timeout_minutes > 0
    ) {
      timeout_minutes = config.timeout_minutes;
    }
  } catch {
    return true;
  }

  if (!enabled) return false;

  const last_activity = Number.parseInt(
    storage.get(LAST_ACTIVITY_KEY_PREFIX + user_id) ?? "",
    10,
  );

  if (!Number.isFinite(last_activity) || last_activity <= 0) return true;

  const timeout_ms = Math.max(MIN_TIMEOUT_MINUTES, timeout_minutes) * 60 * 1000;

  return now - last_activity >= timeout_ms;
}

function has_app_lock(storage: BridgeStorage, user_id: string): boolean {
  const raw = storage.get(APP_LOCK_KEY_PREFIX + user_id);

  if (raw === null) return false;

  try {
    const config = JSON.parse(raw) as { enabled?: unknown };

    return config.enabled !== false;
  } catch {
    return true;
  }
}

interface LocalSession {
  encrypted_passphrase: string;
  passphrase_iv: string;
  encrypted_vault: string;
  vault_nonce: string;
}

export function read_local_session(
  storage: BridgeStorage,
  user_id: string,
  now: number,
): LocalSession | null {
  if (!is_handoff_user_id(user_id)) return null;

  const encrypted_passphrase = storage.get(
    SESSION_PASSPHRASE_KEY_PREFIX + user_id,
  );
  const passphrase_iv = storage.get(SESSION_PASSPHRASE_IV_KEY_PREFIX + user_id);
  const encrypted_vault = storage.get(ENCRYPTED_VAULT_KEY_PREFIX + user_id);
  const vault_nonce = storage.get(VAULT_NONCE_KEY_PREFIX + user_id);

  if (!encrypted_passphrase || !passphrase_iv) return null;
  if (!encrypted_vault || !vault_nonce) return null;
  if (has_app_lock(storage, user_id)) return null;
  if (is_session_timed_out(storage, user_id, now)) return null;

  return { encrypted_passphrase, passphrase_iv, encrypted_vault, vault_nonce };
}

export function list_local_session_user_ids(storage: BridgeStorage): string[] {
  return storage
    .keys()
    .filter(
      (key) =>
        key.startsWith(SESSION_PASSPHRASE_KEY_PREFIX) &&
        !key.startsWith(SESSION_PASSPHRASE_IV_KEY_PREFIX),
    )
    .map((key) => key.slice(SESSION_PASSPHRASE_KEY_PREFIX.length))
    .filter(is_handoff_user_id);
}

function user_from_me_response(value: unknown): HandoffUser | null {
  if (typeof value !== "object" || value === null) return null;

  const me = value as Record<string, unknown>;

  return parse_handoff_user({
    id: me.user_id,
    username: me.username,
    email: me.email,
    display_name: me.display_name ?? undefined,
    profile_color: me.profile_color ?? undefined,
    profile_picture: me.profile_picture ?? undefined,
  });
}

async function decrypt_passphrase(
  deps: BridgeDeps,
  local: LocalSession,
): Promise<string | null> {
  const key = await deps.load_session_key();

  if (!key) return null;

  const ciphertext = decode_base64(local.encrypted_passphrase);
  const iv = decode_base64(local.passphrase_iv);

  if (!ciphertext || !iv || iv.length !== 12) return null;

  try {
    const plain = await deps.decrypt(key, ciphertext, iv);

    return new TextDecoder("utf-8", { fatal: true }).decode(plain);
  } catch {
    return null;
  }
}

export async function handle_probe(deps: BridgeDeps): Promise<boolean> {
  const now = deps.now();
  const candidates = list_local_session_user_ids(deps.storage).filter(
    (id) => read_local_session(deps.storage, id, now) !== null,
  );

  if (candidates.length === 0) return false;

  try {
    return (await deps.load_session_key()) !== null;
  } catch {
    return false;
  }
}

export async function handle_request(
  deps: BridgeDeps,
  user_id: string,
): Promise<HandoffSession | null> {
  const local = read_local_session(deps.storage, user_id, deps.now());

  if (!local) return null;

  let me: unknown;

  try {
    me = await deps.fetch_current_user();
  } catch {
    return null;
  }

  const user = user_from_me_response(me);

  if (!user || user.id !== user_id) return null;

  let passphrase: string | null;

  try {
    passphrase = await decrypt_passphrase(deps, local);
  } catch {
    return null;
  }

  if (!passphrase) return null;

  return {
    user,
    passphrase,
    encrypted_vault: local.encrypted_vault,
    vault_nonce: local.vault_nonce,
  };
}

export async function answer_port_message(
  deps: BridgeDeps,
  data: unknown,
): Promise<HandoffBridgeReply | null> {
  const request = parse_handoff_port_request(data);

  if (!request) return null;

  if (request.type === "probe") {
    return { type: "probe_result", available: await handle_probe(deps) };
  }

  const session = await handle_request(deps, request.user_id);

  return session ? { type: "session", session } : { type: "unavailable" };
}

export function to_wire(reply: HandoffBridgeReply): object {
  return build_handoff_message(reply);
}
