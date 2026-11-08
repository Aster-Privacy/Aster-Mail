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
import type { TranslationKey } from "@/lib/i18n/types";

export type LinkErrorStage = "keys" | "request" | "pair" | "complete";

export interface LinkErrorView {
  title_key: TranslationKey;
  description_key: TranslationKey;
  action_key: TranslationKey;
  reference: string;
}

const KEYCHAIN_UNAVAILABLE = "keychain_unavailable";
const KEYCHAIN_STORE_FAILED = "keychain_store_failed";
const NETWORK_TOKEN = "network";
const UNKNOWN_TOKEN = "unknown";
const CLIENT_TOKEN = "client";
const CODE_REQUEST_ERROR = "code_generation_failed";
const RATE_LIMITED_STATUS = 429;
const SAFE_TOKEN = /^[a-z0-9_]{1,40}$/;
const STAGES: readonly LinkErrorStage[] = [
  "keys",
  "request",
  "pair",
  "complete",
];

export function error_message(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export function error_status(err: unknown): number | undefined {
  if (typeof err !== "object" || err === null || !("status" in err)) {
    return undefined;
  }
  const status = (err as { status: unknown }).status;

  return typeof status === "number" && status > 0 ? status : undefined;
}

export function keys_failure_detail(err: unknown): string {
  return `keys:${error_message(err)}`;
}

function is_code_request_error(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code: unknown }).code === CODE_REQUEST_ERROR
  );
}

export function request_failure_detail(err: unknown): string {
  const status = error_status(err);
  const token =
    status ?? (is_code_request_error(err) ? NETWORK_TOKEN : CLIENT_TOKEN);

  return `request:${token}:${error_message(err)}`;
}

function split_detail(detail: string): {
  stage: LinkErrorStage | null;
  token: string;
} {
  const [head, rest = ""] = split_once(detail);
  const stage = STAGES.find((candidate) => candidate === head) ?? null;
  const [candidate] = split_once(rest);
  const token = SAFE_TOKEN.test(candidate.trim())
    ? candidate.trim()
    : UNKNOWN_TOKEN;

  return { stage, token };
}

function split_once(value: string): [string, string?] {
  const index = value.indexOf(":");

  return index < 0
    ? [value]
    : [value.slice(0, index), value.slice(index + 1)];
}

function keys_view(token: string): Omit<LinkErrorView, "reference"> {
  const action_key: TranslationKey = "common.try_again";

  if (token === KEYCHAIN_UNAVAILABLE) {
    return {
      title_key: "auth.link_keys_locked_title",
      description_key: "auth.link_keys_locked_description",
      action_key,
    };
  }
  if (token === KEYCHAIN_STORE_FAILED) {
    return {
      title_key: "auth.link_keys_no_keyring_title",
      description_key: "auth.link_keys_no_keyring_description",
      action_key,
    };
  }

  return {
    title_key: "auth.link_keys_failed_title",
    description_key: "auth.link_keys_failed_description",
    action_key,
  };
}

function request_view(token: string): Omit<LinkErrorView, "reference"> {
  const action_key: TranslationKey = "common.try_again";

  if (token === NETWORK_TOKEN) {
    return {
      title_key: "auth.link_code_offline_title",
      description_key: "auth.link_code_offline_description",
      action_key,
    };
  }
  if (token === String(RATE_LIMITED_STATUS)) {
    return {
      title_key: "auth.link_code_rate_limited_title",
      description_key: "auth.link_code_rate_limited_description",
      action_key,
    };
  }

  return {
    title_key: "auth.link_code_failed_title",
    description_key: "auth.link_code_failed_description",
    action_key,
  };
}

export function describe_link_error(detail: string): LinkErrorView {
  const { stage, token } = split_detail(detail);
  const reference = `${stage ?? UNKNOWN_TOKEN}:${token}`;

  if (stage === "keys") return { ...keys_view(token), reference };
  if (stage === "request") return { ...request_view(token), reference };

  return {
    title_key: "auth.link_device_failed",
    description_key: "auth.link_device_try_again",
    action_key: "auth.device_code_get_new",
    reference,
  };
}
