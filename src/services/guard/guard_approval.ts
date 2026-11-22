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
import type {
  GuardRequestSummary,
  StepUpProof,
} from "@/services/api/guard";
import type { GuardDevice } from "@/services/guard/guard_device";

import {
  base64url_decode,
  base64url_encode,
  choose_envelope_version,
  seal_vault_key_for_device,
} from "@/lib/crypto/device_envelope";
import {
  approve_subject,
  GUARD_ACTION,
  id_subject,
  is_guard_number,
} from "@/lib/crypto/guard_action";
import { context_aad } from "@/lib/crypto/guard_seal";
import {
  approve_guard_request,
  deny_guard_request,
  list_guard_requests,
} from "@/services/api/guard";
import {
  bytes_equal,
  device_code_digest,
} from "@/services/guard/device_code_approval";
import { sign_guard_action } from "@/services/guard/sign_action";

export interface GuardRequestContext {
  device_type: string;
  browser: string;
  os: string;
  city: string;
  country: string;
  country_code?: string;
  requested_at: string;
}

export interface GuardRequestView {
  summary: GuardRequestSummary;
  context: GuardRequestContext | null;
}

export type GuardApproveOutcome =
  | { kind: "approved" }
  | { kind: "wrong_number" }
  | { kind: "number_rejected" }
  | { kind: "gone" }
  | { kind: "locked" }
  | { kind: "keys_changed" }
  | { kind: "canceled" }
  | { kind: "error" };

export type GuardDenyOutcome =
  | { kind: "denied" }
  | { kind: "canceled" }
  | { kind: "gone" }
  | { kind: "error" };

export interface GuardApproveInput {
  request: GuardRequestSummary;
  number: number;
  user_id: string;
  device: GuardDevice;
  request_proof: () => Promise<StepUpProof | null>;
  read_passphrase: () => string | null;
}

const GONE_CODES = new Set(["GUARD_REQUEST_GONE"]);

function text_field(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function country_code_field(value: unknown): string | undefined {
  return typeof value === "string" && /^[A-Za-z]{2}$/.test(value)
    ? value.toUpperCase()
    : undefined;
}

function parse_context(bytes: Uint8Array): GuardRequestContext | null {
  try {
    const raw: unknown = JSON.parse(new TextDecoder().decode(bytes));

    if (!raw || typeof raw !== "object") return null;
    const obj = raw as Record<string, unknown>;

    return {
      device_type: text_field(obj.device_type),
      browser: text_field(obj.browser),
      os: text_field(obj.os),
      city: text_field(obj.city),
      country: text_field(obj.country),
      country_code: country_code_field(obj.country_code),
      requested_at: text_field(obj.requested_at),
    };
  } catch {
    return null;
  }
}

export async function open_request_context(
  device: GuardDevice,
  request: GuardRequestSummary,
): Promise<GuardRequestContext | null> {
  if (!request.context) return null;
  const device_id = await device.device_id();

  if (!device_id) return null;

  try {
    const opened = await device.open_seal(
      base64url_decode(request.context),
      context_aad(request.id, device_id),
    );

    try {
      return parse_context(opened);
    } finally {
      opened.fill(0);
    }
  } catch {
    return null;
  }
}

export async function load_guard_requests(
  device: GuardDevice,
): Promise<GuardRequestView[]> {
  const response = await list_guard_requests();

  if (response.error || !response.data) return [];

  const views: GuardRequestView[] = [];

  for (const summary of response.data.requests) {
    views.push({
      summary,
      context: await open_request_context(device, summary),
    });
  }

  return views;
}

function is_gone(status: number | undefined, code: string | undefined): boolean {
  return status === 410 || (code !== undefined && GONE_CODES.has(code));
}

export async function approve_guard_sign_in(
  input: GuardApproveInput,
): Promise<GuardApproveOutcome> {
  const { request, number, user_id, device } = input;

  if (!is_guard_number(number)) return { kind: "wrong_number" };

  const digest = device_code_digest(request.new_device);
  let server_digest: Uint8Array;

  try {
    server_digest = base64url_decode(request.new_device.keys_digest);
  } catch {
    return { kind: "keys_changed" };
  }
  if (!bytes_equal(server_digest, digest)) return { kind: "keys_changed" };

  if (!input.read_passphrase()) return { kind: "locked" };

  const proof = await input.request_proof();

  if (!proof) return { kind: "canceled" };

  const passphrase = input.read_passphrase();

  if (!passphrase) return { kind: "locked" };

  const passphrase_bytes = new TextEncoder().encode(passphrase);
  let envelope: Uint8Array;

  try {
    envelope = await seal_vault_key_for_device(
      passphrase_bytes,
      {
        ed25519_pk: base64url_decode(request.new_device.ed25519_pk),
        mlkem_pk: base64url_decode(request.new_device.mlkem_pk),
        x25519_pk: base64url_decode(request.new_device.x25519_pk),
      },
      choose_envelope_version(request.envelope_versions),
    );
  } catch {
    return { kind: "error" };
  } finally {
    passphrase_bytes.fill(0);
  }

  let action;

  try {
    action = await sign_guard_action(
      device,
      user_id,
      GUARD_ACTION.approve,
      approve_subject(request.id, digest, number),
      proof,
    );
  } catch {
    return { kind: "error" };
  }

  const response = await approve_guard_request(request.id, {
    number,
    approval_envelope: base64url_encode(envelope),
    action,
  });

  if (!response.error) return { kind: "approved" };
  if (response.server_code === "GUARD_WRONG_NUMBER") {
    return { kind: "number_rejected" };
  }
  if (is_gone(response.status, response.server_code)) return { kind: "gone" };

  return { kind: "error" };
}

export async function deny_guard_sign_in(
  request: GuardRequestSummary,
  user_id: string,
  device: GuardDevice,
  request_proof: () => Promise<StepUpProof | null>,
): Promise<GuardDenyOutcome> {
  let action;

  try {
    const proof = await request_proof();

    if (!proof) return { kind: "canceled" };
    action = await sign_guard_action(
      device,
      user_id,
      GUARD_ACTION.deny,
      id_subject(request.id),
      proof,
    );
  } catch {
    return { kind: "error" };
  }

  const response = await deny_guard_request(request.id, action);

  if (!response.error) return { kind: "denied" };
  if (is_gone(response.status, response.server_code)) return { kind: "gone" };

  return { kind: "error" };
}
