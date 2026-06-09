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
import type { DecryptedEnvelope } from "@/types/email";
import type { ExportAttachment } from "@/utils/export";
import { list_mail_items } from "@/services/api/mail";
import { list_attachments } from "@/services/api/attachments";
import { decrypt_mail_envelope } from "@/components/email/shared/decrypt_envelope";
import {
  decrypt_attachment_meta,
  decrypt_attachment_data,
} from "@/services/crypto/attachment_crypto";
import type {
  ExportScope,
  ExportSource,
  ExportSourceContext,
  PipelineMessage,
} from "./pipeline";

const PAGE_SIZE = 50;

function in_date_range(iso: string, scope: ExportScope): boolean {
  if (!scope.date_from && !scope.date_to) return true;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return true;
  if (scope.date_from && t < new Date(scope.date_from).getTime()) return false;
  if (scope.date_to && t > new Date(scope.date_to).getTime()) return false;
  return true;
}

async function build_attachments(mail_id: string): Promise<ExportAttachment[]> {
  const result: ExportAttachment[] = [];
  const list = await list_attachments(mail_id);
  if (!list.data?.attachments?.length) return result;

  for (const att of list.data.attachments) {
    try {
      const meta = await decrypt_attachment_meta(
        att.encrypted_meta,
        att.meta_nonce,
      );
      const data_buf = await decrypt_attachment_data(
        att.encrypted_data,
        att.data_nonce,
        meta.session_key,
        att.mail_item_id,
        att.seq_num,
      );
      const bytes = new Uint8Array(data_buf);
      result.push({
        filename: meta.filename,
        mime_type: meta.content_type || "application/octet-stream",
        size: bytes.length,
        is_inline: meta.is_inline === true || !!meta.content_id,
        content_id: meta.content_id,
        open: () => bytes,
      });
    } catch {
      // skip undecryptable attachment, exporting message body is still useful
    }
  }
  return result;
}

export function create_account_message_source(): ExportSource {
  let total = 0;

  return {
    async prepare(_scope: ExportScope, _signal: AbortSignal): Promise<ExportSourceContext> {
      const probe = await list_mail_items({ limit: 1, item_type: "all" });
      total = probe.data?.total ?? 0;
      return { total, scope: _scope };
    },

    async *messages(
      scope: ExportScope,
      signal: AbortSignal,
    ): AsyncIterable<PipelineMessage> {
      let cursor: string | undefined = undefined;

      while (!signal.aborted) {
        const page = await list_mail_items({
          limit: PAGE_SIZE,
          cursor,
          item_type: "all",
        });
        if (!page.data?.items?.length) break;

        for (const item of page.data.items) {
          if (signal.aborted) return;

          const envelope = await decrypt_mail_envelope(
            item.encrypted_envelope,
            item.envelope_nonce,
          );
          if (!envelope) continue;

          const decrypted = envelope as DecryptedEnvelope;
          if (!in_date_range(decrypted.sent_at || item.created_at, scope)) {
            continue;
          }

          const folder_token = item.folder_token;
          if (
            scope.folder_tokens?.length &&
            !scope.folder_tokens.includes(folder_token)
          ) {
            continue;
          }

          const is_sent_or_draft =
            item.item_type === "sent" || item.item_type === "draft";
          const attachments = await build_attachments(item.id);

          yield {
            message_id: item.id,
            envelope: decrypted,
            attachments,
            folder_label: folder_token,
            is_sent_or_draft,
          };
        }

        if (!page.data.has_more || !page.data.next_cursor) break;
        cursor = page.data.next_cursor;
      }
    },
  };
}
