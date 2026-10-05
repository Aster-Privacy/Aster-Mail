//
// Aster Communications Inc.
//
// Copyright (c) 2026 Aster Communications Inc.
//
// This file is part of this project.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
// GNU Affero General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License
// along with this program. If not, see <https://www.gnu.org/licenses/>.
//
import type { UndoCancelResult } from "@/services/undo_send_manager";

export interface ReplyCancelPlan {
  toast_key:
    | "common.something_went_wrong_try_again"
    | "common.undo_send_too_late"
    | null;
  is_sent: boolean;
  keeps_text: boolean;
}

export function plan_reply_cancel(outcome: UndoCancelResult): ReplyCancelPlan {
  if (outcome === "cancelled") {
    return { toast_key: null, is_sent: false, keeps_text: false };
  }

  if (outcome === "expired") {
    return {
      toast_key: "common.undo_send_too_late",
      is_sent: true,
      keeps_text: false,
    };
  }

  return {
    toast_key: "common.something_went_wrong_try_again",
    is_sent: false,
    keeps_text: true,
  };
}
