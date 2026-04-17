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
import type { InboxEmail } from "@/types/email";
import type { ActionStateContext } from "./use_action_state";

import { useCallback } from "react";

import { use_i18n } from "@/lib/i18n/context";

export interface UtilityActions {
  copy_email_id: (email: InboxEmail) => Promise<boolean>;
  copy_sender_email: (email: InboxEmail) => Promise<boolean>;
}

export function use_utility_actions(
  state_ctx: ActionStateContext,
): UtilityActions {
  const { t } = use_i18n();
  const { config } = state_ctx;

  const copy_email_id = useCallback(
    async (email: InboxEmail): Promise<boolean> => {
      try {
        await navigator.clipboard.writeText(email.id);

        return true;
      } catch {
        config.on_error?.(t("common.failed_to_copy_to_clipboard"), "read");

        return false;
      }
    },
    [config.on_error, t],
  );

  const copy_sender_email = useCallback(
    async (email: InboxEmail): Promise<boolean> => {
      try {
        await navigator.clipboard.writeText(email.sender_email);

        return true;
      } catch {
        config.on_error?.(t("common.failed_to_copy_to_clipboard"), "read");

        return false;
      }
    },
    [config.on_error, t],
  );

  return { copy_email_id, copy_sender_email };
}
