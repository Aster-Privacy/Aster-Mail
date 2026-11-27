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
import type { UndoSendCancelOutcome } from "@/hooks/use_undo_send";

export function undo_send_toast_key(id: string): string {
  return `undo_send:${id}`;
}

export interface PlannedUndoSendResult {
  message_key: TranslationKey;
  tone: "error";
  keep_undo: boolean;
}

export function plan_undo_send_result(
  outcome: UndoSendCancelOutcome,
  still_pending: boolean,
): PlannedUndoSendResult | null {
  switch (outcome) {
    case "cancelled":
      return null;
    case "too_late":
      return {
        message_key: "common.undo_send_already_sent",
        tone: "error",
        keep_undo: false,
      };
    case "offline":
      return {
        message_key: "common.undo_send_failed_offline",
        tone: "error",
        keep_undo: still_pending,
      };
    default:
      return {
        message_key: "common.undo_send_failed",
        tone: "error",
        keep_undo: still_pending,
      };
  }
}
