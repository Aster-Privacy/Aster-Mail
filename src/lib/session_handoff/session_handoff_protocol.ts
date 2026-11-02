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
export const MAIL_WEB_ORIGIN = "https://app.astermail.org";
export const CALENDAR_WEB_ORIGIN = "https://calendar.astermail.org";
export const SESSION_BRIDGE_PATH = "/session_bridge.html";
export const SESSION_HANDOFF_PROTOCOL = "aster-session-handoff-1";

const SIBLING_ORIGINS: ReadonlyMap<string, string> = new Map([
  [MAIL_WEB_ORIGIN, CALENDAR_WEB_ORIGIN],
  [CALENDAR_WEB_ORIGIN, MAIL_WEB_ORIGIN],
]);

const USER_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BASE64_PATTERN = /^[A-Za-z0-9+/_-]+={0,2}$/;

const MAX_PASSPHRASE_LENGTH = 4096;
const MAX_ENCRYPTED_VAULT_LENGTH = 16 * 1024 * 1024;
const MAX_VAULT_NONCE_LENGTH = 256;
const MAX_USERNAME_LENGTH = 256;
const MAX_EMAIL_LENGTH = 320;
const MAX_DISPLAY_NAME_LENGTH = 512;
const MAX_PROFILE_COLOR_LENGTH = 64;
const MAX_PROFILE_PICTURE_LENGTH = 4 * 1024 * 1024;

export interface HandoffUser {
  id: string;
  username: string;
  email: string;
  display_name?: string;
  profile_color?: string;
  profile_picture?: string;
}

export interface HandoffSession {
  user: HandoffUser;
  passphrase: string;
  encrypted_vault: string;
  vault_nonce: string;
}

export type HandoffPortRequest =
  { type: "probe" } | { type: "request"; user_id: string };

export type HandoffBridgeReply =
  | { type: "probe_result"; available: boolean }
  | { type: "session"; session: HandoffSession }
  | { type: "unavailable" };

export function get_handoff_sibling_origin(origin: string): string | null {
  return SIBLING_ORIGINS.get(origin) ?? null;
}

export function is_handoff_user_id(value: unknown): value is string {
  return typeof value === "string" && USER_ID_PATTERN.test(value);
}

function is_plain_record(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  const proto = Object.getPrototypeOf(value);

  return proto === Object.prototype || proto === null;
}

function has_only_keys(
  record: Record<string, unknown>,
  allowed: readonly string[],
): boolean {
  return Object.keys(record).every((key) => allowed.includes(key));
}

function bounded_string(value: unknown, max_length: number): value is string {
  return (
    typeof value === "string" && value.length > 0 && value.length <= max_length
  );
}

function optional_bounded_string(
  value: unknown,
  max_length: number,
): string | undefined | null {
  if (value === undefined || value === null || value === "") return undefined;

  return bounded_string(value, max_length) ? value : null;
}

function is_protocol_message(
  value: unknown,
): value is Record<string, unknown> & { type: unknown } {
  return is_plain_record(value) && value.protocol === SESSION_HANDOFF_PROTOCOL;
}

export function build_handoff_message<T extends object>(
  message: T,
): T & { protocol: string } {
  return { protocol: SESSION_HANDOFF_PROTOCOL, ...message };
}

export function is_handoff_connect_message(value: unknown): boolean {
  return (
    is_protocol_message(value) &&
    value.type === "connect" &&
    has_only_keys(value, ["protocol", "type"])
  );
}

export function parse_handoff_port_request(
  value: unknown,
): HandoffPortRequest | null {
  if (!is_protocol_message(value)) return null;

  if (value.type === "probe" && has_only_keys(value, ["protocol", "type"])) {
    return { type: "probe" };
  }

  if (
    value.type === "request" &&
    has_only_keys(value, ["protocol", "type", "user_id"]) &&
    is_handoff_user_id(value.user_id)
  ) {
    return { type: "request", user_id: value.user_id };
  }

  return null;
}

export function parse_handoff_user(value: unknown): HandoffUser | null {
  if (!is_plain_record(value)) return null;
  if (!is_handoff_user_id(value.id)) return null;
  if (!bounded_string(value.username, MAX_USERNAME_LENGTH)) return null;
  if (!bounded_string(value.email, MAX_EMAIL_LENGTH)) return null;
  if (!value.email.includes("@")) return null;

  const display_name = optional_bounded_string(
    value.display_name,
    MAX_DISPLAY_NAME_LENGTH,
  );
  const profile_color = optional_bounded_string(
    value.profile_color,
    MAX_PROFILE_COLOR_LENGTH,
  );
  const profile_picture = optional_bounded_string(
    value.profile_picture,
    MAX_PROFILE_PICTURE_LENGTH,
  );

  if (display_name === null || profile_color === null) return null;
  if (profile_picture === null) return null;

  const user: HandoffUser = {
    id: value.id,
    username: value.username,
    email: value.email,
  };

  if (display_name !== undefined) user.display_name = display_name;
  if (profile_color !== undefined) user.profile_color = profile_color;
  if (profile_picture !== undefined) user.profile_picture = profile_picture;

  return user;
}

export function parse_handoff_session(value: unknown): HandoffSession | null {
  if (!is_plain_record(value)) return null;
  if (
    !has_only_keys(value, [
      "user",
      "passphrase",
      "encrypted_vault",
      "vault_nonce",
    ])
  ) {
    return null;
  }

  const user = parse_handoff_user(value.user);

  if (!user) return null;
  if (!bounded_string(value.passphrase, MAX_PASSPHRASE_LENGTH)) return null;
  if (!bounded_string(value.encrypted_vault, MAX_ENCRYPTED_VAULT_LENGTH)) {
    return null;
  }
  if (!BASE64_PATTERN.test(value.encrypted_vault)) return null;
  if (!bounded_string(value.vault_nonce, MAX_VAULT_NONCE_LENGTH)) return null;
  if (!BASE64_PATTERN.test(value.vault_nonce)) return null;

  return {
    user,
    passphrase: value.passphrase,
    encrypted_vault: value.encrypted_vault,
    vault_nonce: value.vault_nonce,
  };
}

export function parse_handoff_bridge_reply(
  value: unknown,
): HandoffBridgeReply | null {
  if (!is_protocol_message(value)) return null;

  if (
    value.type === "probe_result" &&
    has_only_keys(value, ["protocol", "type", "available"]) &&
    typeof value.available === "boolean"
  ) {
    return { type: "probe_result", available: value.available };
  }

  if (
    value.type === "unavailable" &&
    has_only_keys(value, ["protocol", "type"])
  ) {
    return { type: "unavailable" };
  }

  if (
    value.type === "session" &&
    has_only_keys(value, ["protocol", "type", "session"])
  ) {
    const session = parse_handoff_session(value.session);

    return session ? { type: "session", session } : null;
  }

  return null;
}
