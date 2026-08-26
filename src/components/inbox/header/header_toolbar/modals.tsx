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

import { QUICK_ACTION_CONFIRM_KEYS } from "./helpers";

import { SenderActionModal } from "@/components/modals/sender_action_modal";
import { MassUnsubscribeModal } from "@/components/modals/mass_unsubscribe_modal";
import { SnoozeSimilarModal } from "@/components/modals/snooze_similar_modal";
import { ArchiveNewslettersModal } from "@/components/modals/archive_newsletters_modal";
import { use_folders } from "@/hooks/use_folders";
import { use_i18n } from "@/lib/i18n/context";
import { ConfirmationModal } from "@/components/modals/confirmation_modal";

export interface ToolbarModalsProps {
  is_sender_modal_open: boolean;
  set_is_sender_modal_open: (open: boolean) => void;
  sender_modal_action: "archive" | "delete" | "move";
  is_unsubscribe_modal_open: boolean;
  set_is_unsubscribe_modal_open: (open: boolean) => void;
  is_snooze_modal_open: boolean;
  set_is_snooze_modal_open: (open: boolean) => void;
  is_archive_newsletters_modal_open: boolean;
  set_is_archive_newsletters_modal_open: (open: boolean) => void;
  pending_quick_action: string | null;
  handle_quick_action_confirm: () => void;
  handle_quick_action_cancel: () => void;
  handle_quick_action_dont_ask_again: () => void | Promise<void>;
}

export function ToolbarModals({
  is_sender_modal_open,
  set_is_sender_modal_open,
  sender_modal_action,
  is_unsubscribe_modal_open,
  set_is_unsubscribe_modal_open,
  is_snooze_modal_open,
  set_is_snooze_modal_open,
  is_archive_newsletters_modal_open,
  set_is_archive_newsletters_modal_open,
  pending_quick_action,
  handle_quick_action_confirm,
  handle_quick_action_cancel,
  handle_quick_action_dont_ask_again,
}: ToolbarModalsProps) {
  const { state: folders_state } = use_folders();
  const { t } = use_i18n();
  const quick_action_copy = pending_quick_action
    ? QUICK_ACTION_CONFIRM_KEYS[pending_quick_action]
    : null;

  return (
    <>
      <SenderActionModal
        action_type={sender_modal_action}
        folders={folders_state.folders
          .filter((f) => !f.is_system)
          .map((f) => ({
            token: f.folder_token,
            name: f.name,
            color: f.color,
          }))}
        is_open={is_sender_modal_open}
        on_close={() => set_is_sender_modal_open(false)}
      />

      <MassUnsubscribeModal
        is_open={is_unsubscribe_modal_open}
        on_close={() => set_is_unsubscribe_modal_open(false)}
      />

      <SnoozeSimilarModal
        is_open={is_snooze_modal_open}
        on_close={() => set_is_snooze_modal_open(false)}
      />

      <ArchiveNewslettersModal
        is_open={is_archive_newsletters_modal_open}
        on_close={() => set_is_archive_newsletters_modal_open(false)}
      />

      <ConfirmationModal
        show_dont_ask_again
        is_open={quick_action_copy !== null}
        message={
          quick_action_copy
            ? t(quick_action_copy.message as Parameters<typeof t>[0])
            : ""
        }
        on_cancel={handle_quick_action_cancel}
        on_confirm={handle_quick_action_confirm}
        on_dont_ask_again={handle_quick_action_dont_ask_again}
        title={
          quick_action_copy
            ? t(quick_action_copy.title as Parameters<typeof t>[0])
            : ""
        }
        variant="info"
      />
    </>
  );
}
