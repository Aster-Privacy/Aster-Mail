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
import type { MetadataHelpers } from "./use_metadata_helpers";
import type { ActionToastConfig } from "@/components/toast/action_toast";

import { useCallback } from "react";

import {
  emit_mail_item_updated,
  type MailItemUpdatedEventDetail,
} from "../mail_events";
import {
  type ActionType,
  is_view_changing_action,
  emit_mail_changed,
  emit_mail_action,
} from "../email_action_types";

import {
  hide_action_toast,
  show_action_toast,
} from "@/components/toast/action_toast";
import { use_i18n } from "@/lib/i18n/context";
import { use_preferences } from "@/contexts/preferences_context";
import { user_facing_error } from "@/utils/user_facing_error";

export function use_single_actions_core(
  state_ctx: ActionStateContext,
  metadata: MetadataHelpers,
) {
  const { t } = use_i18n();
  const { preferences } = use_preferences();
  const {
    set_action_loading,
    set_action_error,
    clear_action_state,
    create_pending_action,
    remove_pending_action,
    rollback_action,
    config,
  } = state_ctx;
  const { update_with_metadata } = metadata;

  const execute_single_action = useCallback(
    async <T>(
      email: InboxEmail,
      action_type: ActionType,
      optimistic_update: Partial<InboxEmail>,
      api_call: () => Promise<{ data?: T; error?: string }>,
      should_remove_from_list = false,
      optimistic_toast?: ActionToastConfig,
    ): Promise<boolean> => {
      const original_state: Partial<InboxEmail> = {};

      for (const key of Object.keys(
        optimistic_update,
      ) as (keyof InboxEmail)[]) {
        original_state[key] = email[key] as never;
      }

      create_pending_action(email.id, action_type, original_state);
      set_action_loading(action_type, true);
      config.on_optimistic_update?.(email.id, optimistic_update);
      if (optimistic_toast) show_action_toast(optimistic_toast);

      try {
        const result = await api_call();

        if (result.error) {
          if (optimistic_toast) hide_action_toast();
          rollback_action(email.id, action_type);
          set_action_error(action_type, result.error);

          return false;
        }

        remove_pending_action(email.id, action_type);
        clear_action_state(action_type);

        if (should_remove_from_list) {
          config.on_remove_from_list?.(email.id);
        }

        if (is_view_changing_action(action_type)) {
          emit_mail_changed();
        } else {
          const metadata_update =
            result.data &&
            typeof result.data === "object" &&
            "encrypted_metadata" in result.data
              ? {
                  encrypted_metadata: (
                    result.data as {
                      encrypted_metadata?: string;
                      metadata_nonce?: string;
                    }
                  ).encrypted_metadata,
                  metadata_nonce: (
                    result.data as {
                      encrypted_metadata?: string;
                      metadata_nonce?: string;
                    }
                  ).metadata_nonce,
                }
              : {};

          emit_mail_item_updated({
            id: email.id,
            ...optimistic_update,
            ...metadata_update,
          } as MailItemUpdatedEventDetail);
        }
        emit_mail_action(action_type, [email.id]);
        config.on_success?.(action_type, email.id);

        return true;
      } catch (err) {
        if (optimistic_toast) hide_action_toast();
        rollback_action(email.id, action_type);
        const error_message = user_facing_error(
          err,
          t("common.unexpected_error"),
        );

        set_action_error(action_type, error_message);

        return false;
      }
    },
    [
      create_pending_action,
      set_action_loading,
      config,
      rollback_action,
      set_action_error,
      remove_pending_action,
      clear_action_state,
      t,
    ],
  );

  return {
    t,
    preferences,
    set_action_loading,
    set_action_error,
    clear_action_state,
    config,
    update_with_metadata,
    execute_single_action,
  };
}
