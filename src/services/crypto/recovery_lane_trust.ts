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
import type { LaneFreshness, LaneSenderPin } from "./ratchet_lane_sender_pin";
import type { RecoveryLaneBinding } from "./ratchet_recovery_lane";
import type { SenderIdentityContinuity } from "./sender_identity_authentication";

export type RecoveryLaneVerdict = "confirmed" | "unconfirmed" | "refused";

export interface RecoveryLaneEvidence {
  binding: RecoveryLaneBinding;
  freshness: LaneFreshness;
  continuity: SenderIdentityContinuity;
  user_confirmed: boolean;
  sender_pin: LaneSenderPin;
}

export function recovery_lane_verdict(
  evidence: RecoveryLaneEvidence,
): RecoveryLaneVerdict {
  if (evidence.binding === "none" && evidence.sender_pin === "pinned") {
    return "refused";
  }

  if (evidence.freshness !== "fresh") return "unconfirmed";

  if (evidence.binding === "transcript") {
    return evidence.continuity === "known" || evidence.user_confirmed
      ? "confirmed"
      : "unconfirmed";
  }

  if (evidence.binding === "legacy") {
    return evidence.continuity === "known" &&
      evidence.sender_pin === "unpinned"
      ? "confirmed"
      : "unconfirmed";
  }

  return "unconfirmed";
}
