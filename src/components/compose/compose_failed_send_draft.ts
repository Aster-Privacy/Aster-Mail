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
import type { EncryptedVault } from "@/services/crypto/key_manager";
import type { DraftType } from "@/services/api/multi_drafts";
import type { DraftData, SaveResult } from "@/services/crypto/encrypted_drafts";
import type { FailedSendData } from "@/components/compose/compose_send_actions";
import type { EditDraftData } from "@/components/compose/compose_shared";

import { attachments_to_draft_data } from "@/components/compose/compose_draft_helpers";

export interface FailedSendDraftStore {
  create_context(
    draft_type?: DraftType,
    reply_to_id?: string,
    forward_from_id?: string,
  ): string;
  load_context(
    draft_id: string,
    version: number,
    draft_type?: DraftType,
    reply_to_id?: string,
    forward_from_id?: string,
  ): string;
  save_draft(
    context_id: string,
    data: DraftData,
    vault: EncryptedVault,
  ): Promise<SaveResult>;
  clear_context(context_id: string): void;
}

export async function save_failed_send_as_draft(
  store: FailedSendDraftStore,
  vault: EncryptedVault,
  failed: FailedSendData,
  kept_draft: { id: string; version: number } | null,
  edit_draft?: EditDraftData | null,
): Promise<boolean> {
  const draft_type = edit_draft?.draft_type ?? "new";
  const data: DraftData = {
    to_recipients: failed.to,
    cc_recipients: failed.cc ?? [],
    bcc_recipients: failed.bcc ?? [],
    subject: failed.subject,
    message: failed.body,
    from_email: failed.sender_email,
    attachments: attachments_to_draft_data(failed.attachments ?? []),
  };

  const save_into = async (context_id: string): Promise<boolean> => {
    try {
      const result = await store.save_draft(context_id, data, vault);

      return result.success;
    } catch {
      return false;
    } finally {
      store.clear_context(context_id);
    }
  };

  if (kept_draft) {
    const updated = await save_into(
      store.load_context(
        kept_draft.id,
        kept_draft.version,
        draft_type,
        edit_draft?.reply_to_id,
        edit_draft?.forward_from_id,
      ),
    );

    if (updated) return true;
  }

  return save_into(
    store.create_context(
      draft_type,
      edit_draft?.reply_to_id,
      edit_draft?.forward_from_id,
    ),
  );
}
