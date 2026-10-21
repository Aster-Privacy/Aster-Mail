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
import type { EditDraftData } from "@/components/compose/compose_manager";
import type { PendingSend, PendingSendPayload } from "@/hooks/use_undo_send";

import { attachments_to_draft_data } from "@/components/compose/compose_draft_helpers";
import { ignore_error } from "@/lib/ignore_error";

export function undone_send_has_content(
  pending: PendingSend,
  payload?: PendingSendPayload,
): boolean {
  return Boolean(payload) || !pending.is_restored;
}

export function draft_from_undone_send(
  pending: PendingSend,
  payload?: PendingSendPayload,
): EditDraftData {
  const attachments = payload?.attachments?.length
    ? attachments_to_draft_data(payload.attachments)
    : undefined;

  return {
    id: payload?.draft_id ?? "",
    version: payload?.draft_version ?? 0,
    draft_type: payload?.draft_type ?? "new",
    reply_to_id: payload?.reply_to_id,
    rfc_message_id: payload?.rfc_message_id,
    forward_from_id: payload?.forward_from_id,
    expires_at: payload?.expires_at,
    expiry_password: payload?.expiry_password,
    thread_token: payload?.thread_token ?? pending.thread_token,
    to_recipients: payload?.to ?? pending.to ?? [],
    cc_recipients: payload?.cc ?? pending.cc ?? [],
    bcc_recipients: payload?.bcc ?? pending.bcc ?? [],
    subject: payload?.subject ?? pending.subject ?? "",
    message: payload?.body ?? pending.body ?? "",
    from_email: payload?.sender_email ?? pending.sender_email,
    updated_at: new Date().toISOString(),
    attachments,
    is_restored_send: payload?.restore_verbatim,
    is_plain_text: payload?.is_plain_text,
  };
}

export function draft_from_mobile_undo(
  pending: PendingSend | undefined,
  payload: PendingSendPayload | undefined,
  saved_stash: string | null,
): EditDraftData | null {
  if (pending && payload) return draft_from_undone_send(pending, payload);
  if (!saved_stash) return null;

  try {
    const data = JSON.parse(saved_stash) as {
      to_recipients?: string[];
      cc_recipients?: string[];
      bcc_recipients?: string[];
      subject?: string;
      message?: string;
    };

    return {
      id: "",
      version: 0,
      draft_type: "new",
      to_recipients: data.to_recipients ?? [],
      cc_recipients: data.cc_recipients ?? [],
      bcc_recipients: data.bcc_recipients ?? [],
      subject: data.subject ?? "",
      message: data.message ?? "",
      updated_at: new Date().toISOString(),
    };
  } catch (caught) {
    ignore_error("undone_send_draft:draft_from_mobile_undo", caught);

    return null;
  }
}
