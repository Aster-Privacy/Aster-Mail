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
import { confirm_internal_key_trust } from "./key_trust_consent";
import {
  check_post_quantum_status,
  type PostQuantumCoverage,
} from "./send_queue_encryption";

import { get_active_translations } from "@/lib/i18n/translations";

export type PostQuantumPromptHandler = (
  recipients: string[],
  downgraded: string[],
) => Promise<boolean>;

export interface PostQuantumConsent {
  proceed: boolean;
  allow_non_post_quantum: boolean;
  blocked_by?: PostQuantumConsentBlock;
}

export type PostQuantumConsentBlock =
  | "errors.recipient_key_untrusted"
  | "errors.recipient_key_unreadable"
  | "errors.key_trust_check_failed";

export function describe_consent_block(block: PostQuantumConsentBlock): string {
  const errors = get_active_translations().errors;

  if (block === "errors.recipient_key_untrusted") {
    return errors.recipient_key_untrusted;
  }

  return block === "errors.recipient_key_unreadable"
    ? errors.recipient_key_unreadable
    : errors.key_trust_check_failed;
}

let prompt_handler: PostQuantumPromptHandler | null = null;

export function set_post_quantum_prompt_handler(
  handler: PostQuantumPromptHandler | null,
): void {
  prompt_handler = handler;
}

export async function request_post_quantum_send_confirmation(
  recipients: string[],
  downgraded: string[] = [],
): Promise<boolean> {
  if (!prompt_handler) return false;

  return prompt_handler(recipients, downgraded);
}

const BLOCKED: PostQuantumConsent = {
  proceed: false,
  allow_non_post_quantum: false,
};

function coverage_block(
  coverage: PostQuantumCoverage,
): PostQuantumConsentBlock | null {
  if (coverage.untrusted.length > 0) return "errors.recipient_key_untrusted";
  if (coverage.unreadable.length > 0) return "errors.recipient_key_unreadable";

  return null;
}

async function resolve_key_trust(
  recipients: string[],
  sender_email: string | undefined,
  coverage: PostQuantumCoverage,
): Promise<PostQuantumCoverage | PostQuantumConsent> {
  const block = coverage_block(coverage);

  if (!block) return coverage;

  const result = await confirm_internal_key_trust(
    coverage.untrusted,
    coverage.unreadable,
    sender_email,
  );

  if (result === "declined") return BLOCKED;
  if (result === "unavailable") return { ...BLOCKED, blocked_by: block };

  const rechecked = await check_post_quantum_status(recipients, sender_email);
  const still_blocked = coverage_block(rechecked);

  return still_blocked ? { ...BLOCKED, blocked_by: still_blocked } : rechecked;
}

function is_consent(
  value: PostQuantumCoverage | PostQuantumConsent,
): value is PostQuantumConsent {
  return "proceed" in value;
}

export async function ensure_post_quantum_consent(
  recipients: string[],
  sender_email?: string,
): Promise<PostQuantumConsent> {
  let missing: string[];
  let downgraded: string[];

  try {
    const initial = await check_post_quantum_status(recipients, sender_email);
    const coverage = await resolve_key_trust(recipients, sender_email, initial);

    if (is_consent(coverage)) return coverage;

    missing = coverage.missing;
    downgraded = coverage.downgraded;
  } catch {
    return { ...BLOCKED, blocked_by: "errors.key_trust_check_failed" };
  }

  if (missing.length === 0) {
    return { proceed: true, allow_non_post_quantum: false };
  }

  const allowed = await request_post_quantum_send_confirmation(
    missing,
    downgraded,
  );

  return { proceed: allowed, allow_non_post_quantum: allowed };
}
