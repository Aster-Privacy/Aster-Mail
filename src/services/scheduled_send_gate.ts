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

import { exceeds_sealed_schedule_window } from "@/lib/schedule_window";

export type ScheduledGateBlock =
  | "common.cannot_mix_recipients"
  | "common.scheduled_requires_encryption"
  | "common.scheduled_too_far_ahead"
  | PostQuantumConsentBlock;

export type ScheduledGateResult =
  | { proceed: true; allow_non_post_quantum: boolean }
  | { proceed: false; blocked_by?: ScheduledGateBlock };

export async function check_scheduled_send(
  recipients: string[],
  sender_email: string | undefined,
  scheduled_at: Date,
  require_encryption: boolean,
): Promise<ScheduledGateResult> {
  if (exceeds_sealed_schedule_window(scheduled_at)) {
    return { proceed: false, blocked_by: "common.scheduled_too_far_ahead" };
  }

  await classify_recipients(recipients);

  const has_external = recipients.some((r) => !is_internal_recipient(r));
  const has_internal = recipients.some((r) => is_internal_recipient(r));

  if (has_external && has_internal) {
    return { proceed: false, blocked_by: "common.cannot_mix_recipients" };
  }

  if (has_external) {
    if (require_encryption) {
      return {
        proceed: false,
        blocked_by: "common.scheduled_requires_encryption",
      };
    }

    return { proceed: true, allow_non_post_quantum: false };
  }

  const consent = await ensure_post_quantum_consent(recipients, sender_email);

  if (!consent.proceed)
    return { proceed: false, blocked_by: consent.blocked_by };

  return {
    proceed: true,
    allow_non_post_quantum: consent.allow_non_post_quantum,
  };
}
