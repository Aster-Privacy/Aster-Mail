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
export type ExternalAccountModeValue =
  | "server_sync"
  | "two_way"
  | "send_only"
  | "device";

export type ExternalCapClass = "fetching" | "send_only";

export const MAX_EXTERNAL_ACCOUNTS_KEY = "max_external_accounts";
export const MAX_SEND_ONLY_ACCOUNTS_KEY = "max_send_only_accounts";
export const HAS_EXTERNAL_ACCOUNTS_KEY = "has_external_accounts";
export const PLAN_CAP_PAUSE_REASON = "plan_cap";
export const EXTERNAL_ACCOUNT_LIMIT_CODE = "EXTERNAL_ACCOUNT_LIMIT";
export const SEND_ONLY_ACCOUNT_LIMIT_CODE = "SEND_ONLY_ACCOUNT_LIMIT";
export const OAUTH_EXTERNAL_LIMIT_REASON = "external_account_limit";

const MAX_HOST_LENGTH = 255;
const MAX_USERNAME_LENGTH = 255;
const MAX_PASSWORD_LENGTH = 512;
const MAX_FROM_NAME_LENGTH = 128;
const MAX_ADDRESS_LENGTH = 254;
const HOST_PATTERN =
  /^(?=.{1,255}$)[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i;
const ADDRESS_PATTERN = /^[^\s@<>"(),;:\\[\]]+@[^\s@<>"(),;:\\[\]]+\.[^\s@<>"(),;:\\[\]]+$/;
const ALLOWED_SMTP_PORTS = new Set([465, 587, 2525]);

export interface ModeCarrier {
  mode?: string | null;
  paused_reason?: string | null;
  is_enabled?: boolean;
}

export interface SenderCandidate extends ModeCarrier {
  is_enabled: boolean;
  is_verified?: boolean;
  oauth_provider: string | null;
  email: string;
}

export interface LimitEntry {
  limit: number;
}

export interface PlanLimitsShape {
  limits: Record<string, LimitEntry | undefined>;
}

export interface CapState {
  limit: number;
  used: number;
  at_limit: boolean;
}

export interface ExternalCaps {
  enabled: boolean;
  fetching: CapState;
  send_only: CapState;
}

export interface ExternalLimitError {
  cap_class: ExternalCapClass;
  limit: number | null;
  used: number | null;
}

export interface SendOnlyDraft {
  smtp_host: string;
  smtp_port: number;
  smtp_username: string;
  smtp_password: string;
  from_address: string;
  from_name: string;
  password_required: boolean;
}

export type SendOnlyFieldError =
  | "host"
  | "port"
  | "username"
  | "password"
  | "from_address"
  | "from_name";

export function account_mode(account: ModeCarrier): ExternalAccountModeValue {
  switch (account.mode) {
    case "two_way":
    case "send_only":
    case "device":
      return account.mode;
    default:
      return "server_sync";
  }
}

export function is_send_only(account: ModeCarrier): boolean {
  return account_mode(account) === "send_only";
}

export function is_paused_by_plan(account: ModeCarrier): boolean {
  return account.paused_reason === PLAN_CAP_PAUSE_REASON;
}

export function is_paused(account: ModeCarrier): boolean {
  return !!account.paused_reason;
}

export function fetches_on_server(account: ModeCarrier): boolean {
  const mode = account_mode(account);

  return (mode === "server_sync" || mode === "two_way") && !is_paused(account);
}

export function cap_class_of(account: ModeCarrier): ExternalCapClass {
  return is_send_only(account) ? "send_only" : "fetching";
}

function read_limit(limits: PlanLimitsShape | null | undefined, key: string) {
  const value = limits?.limits[key]?.limit;

  return typeof value === "number" && Number.isFinite(value) ? value : -1;
}

function cap_state(limit: number, used: number, enabled: boolean): CapState {
  return {
    limit,
    used,
    at_limit: !enabled || (limit >= 0 && used >= limit),
  };
}

export function external_caps(
  limits: PlanLimitsShape | null | undefined,
  accounts: ModeCarrier[],
): ExternalCaps {
  const enabled =
    (limits?.limits[HAS_EXTERNAL_ACCOUNTS_KEY]?.limit ?? 1) >= 1;
  const send_only_used = accounts.filter(is_send_only).length;
  const fetching_used = accounts.length - send_only_used;

  return {
    enabled,
    fetching: cap_state(
      read_limit(limits, MAX_EXTERNAL_ACCOUNTS_KEY),
      fetching_used,
      enabled,
    ),
    send_only: cap_state(
      read_limit(limits, MAX_SEND_ONLY_ACCOUNTS_KEY),
      send_only_used,
      enabled,
    ),
  };
}

function as_count(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function parse_external_limit_error(response: {
  server_code?: string | null;
  details?: Record<string, unknown> | null;
}): ExternalLimitError | null {
  const cap_class: ExternalCapClass | null =
    response.server_code === SEND_ONLY_ACCOUNT_LIMIT_CODE
      ? "send_only"
      : response.server_code === EXTERNAL_ACCOUNT_LIMIT_CODE
        ? "fetching"
        : null;

  if (!cap_class) return null;

  return {
    cap_class,
    limit: as_count(response.details?.limit),
    used: as_count(response.details?.used),
  };
}

export function upgrade_resource_for(cap_class: ExternalCapClass): string {
  return cap_class === "send_only" ? "send-only accounts" : "external accounts";
}

export function external_sender_candidates<T extends SenderCandidate>(
  accounts: T[],
): T[] {
  return accounts.filter((account) => {
    if (!account.is_enabled || is_paused(account)) return false;
    if (account.email.endsWith("@import")) return false;
    if (is_send_only(account)) return account.is_verified !== false;

    return !account.oauth_provider;
  });
}

function has_control_characters(value: string): boolean {
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);

    if (code < 32 || code === 127) return true;
  }

  return false;
}

export function is_valid_smtp_port(port: number): boolean {
  return Number.isInteger(port) && ALLOWED_SMTP_PORTS.has(port);
}

export function validate_send_only_draft(
  draft: SendOnlyDraft,
): SendOnlyFieldError | null {
  const host = draft.smtp_host.trim();

  if (host.length === 0 || host.length > MAX_HOST_LENGTH) return "host";
  if (!HOST_PATTERN.test(host)) return "host";
  if (!is_valid_smtp_port(draft.smtp_port)) return "port";

  const username = draft.smtp_username.trim();

  if (
    username.length === 0 ||
    username.length > MAX_USERNAME_LENGTH ||
    has_control_characters(username)
  ) {
    return "username";
  }

  if (
    draft.smtp_password.length > MAX_PASSWORD_LENGTH ||
    has_control_characters(draft.smtp_password) ||
    (draft.password_required && draft.smtp_password.length === 0)
  ) {
    return "password";
  }

  const address = draft.from_address.trim();

  if (
    address.length === 0 ||
    address.length > MAX_ADDRESS_LENGTH ||
    !ADDRESS_PATTERN.test(address)
  ) {
    return "from_address";
  }

  const name = draft.from_name.trim();

  if (name.length > MAX_FROM_NAME_LENGTH || has_control_characters(name)) {
    return "from_name";
  }

  return null;
}
