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
import { type RecoveryLaneData } from "./ratchet_recovery_lane";

export interface RatchetRecipientData {
  ephemeral_key: string;
  header: {
    dh_public: string;
    previous_chain_length: number;
    message_number: number;
    v?: number;
  };
  ciphertext: string;
  nonce: string;
  pq_ciphertext?: string;
  pq_key_id?: number;
  recovery?: RecoveryLaneData;
}

export class RecoveryLaneUnavailableError extends Error {
  constructor(recipient_email: string) {
    super(`recovery lane unavailable for ${recipient_email}`);
    this.name = "RecoveryLaneUnavailableError";
  }
}

export interface RatchetEnvelope {
  type: "double_ratchet_v1" | "double_ratchet_v2";
  sender_identity_key: string;
  recipients: Record<string, RatchetRecipientData>;
}

export function build_ratchet_envelope(
  sender_identity_public: string,
  recipients: Record<string, RatchetRecipientData>,
): string {
  const envelope: RatchetEnvelope = {
    type: "double_ratchet_v2",
    sender_identity_key: sender_identity_public,
    recipients,
  };

  return JSON.stringify(envelope);
}

export function parse_ratchet_envelope(body: string): RatchetEnvelope | null {
  if (!body.startsWith("{")) return null;

  try {
    const parsed = JSON.parse(body);

    if (
      parsed.type !== "double_ratchet_v1" &&
      parsed.type !== "double_ratchet_v2"
    ) {
      return null;
    }
    if (!parsed.sender_identity_key || !parsed.recipients) return null;

    return parsed as RatchetEnvelope;
  } catch {
    return null;
  }
}

export function is_post_quantum_recipient_data(
  data: RatchetRecipientData | null | undefined,
): boolean {
  return Boolean(data?.pq_ciphertext) && data?.pq_key_id !== undefined;
}
