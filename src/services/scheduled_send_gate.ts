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
  ensure_post_quantum_consent,
  type PostQuantumConsentBlock,
} from "./post_quantum_consent";
import {
  classify_recipients,
  is_internal_recipient,
} from "./recipient_classification";
import {
  collect_pgp_recipients,
  type RecipientLockScope,
} from "./recipient_lock_state";

import { exceeds_sealed_schedule_window } from "@/lib/schedule_window";
import { is_future_instant } from "@/utils/schedule_targets";

export type ScheduledGateBlock =
  | "common.scheduled_requires_encryption"
  | "common.scheduled_no_pgp"
  | "common.scheduled_too_far_ahead"
  | "mail_rules.snooze_needs_future"
  | PostQuantumConsentBlock;

export type ScheduledGateResult =
  | { proceed: true; allow_non_post_quantum: boolean }
  | { proceed: false; blocked_by?: ScheduledGateBlock };

export async function check_scheduled_send(
  recipients: string[],
  sender_email: string | undefined,
  scheduled_at: Date,
  require_encryption: boolean,
  lock_scope: RecipientLockScope | null = null,
  pgp_override: boolean | null = null,
): Promise<ScheduledGateResult> {
  if (!is_future_instant(scheduled_at)) {
    return { proceed: false, blocked_by: "mail_rules.snooze_needs_future" };
  }

  if (exceeds_sealed_schedule_window(scheduled_at)) {
    return { proceed: false, blocked_by: "common.scheduled_too_far_ahead" };
  }

  try {
    await classify_recipients(recipients);
  } catch {
    return { proceed: false, blocked_by: "errors.key_trust_check_failed" };
  }

  const has_external = recipients.some((r) => !is_internal_recipient(r));
  const internal = recipients.filter((r) => is_internal_recipient(r));

  if (has_external && require_encryption) {
    return {
      proceed: false,
      blocked_by: "common.scheduled_requires_encryption",
    };
  }

  if (
    collect_pgp_recipients(
      lock_scope,
      recipients.filter((r) => !is_internal_recipient(r)),
      pgp_override,
    ).length > 0
  ) {
    return { proceed: false, blocked_by: "common.scheduled_no_pgp" };
  }

  if (!is_future_instant(scheduled_at)) {
    return { proceed: false, blocked_by: "mail_rules.snooze_needs_future" };
  }

  if (internal.length === 0) {
    return { proceed: true, allow_non_post_quantum: false };
  }

  const consent = await ensure_post_quantum_consent(internal, sender_email);

  if (!consent.proceed)
    return { proceed: false, blocked_by: consent.blocked_by };

  if (!is_future_instant(scheduled_at)) {
    return { proceed: false, blocked_by: "mail_rules.snooze_needs_future" };
  }

  return {
    proceed: true,
    allow_non_post_quantum: consent.allow_non_post_quantum,
  };
}
