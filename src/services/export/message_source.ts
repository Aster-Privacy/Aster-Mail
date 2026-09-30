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
import type {
  ExportScope,
  ExportError,
  ExportSource,
  ExportSourceContext,
  PipelineMessage,
} from "./pipeline";

import { hash_prefix } from "./pipeline";

import { list_mail_items } from "@/services/api/mail";
import { list_attachments } from "@/services/api/attachments";
import { filter_locked_mail_items } from "@/services/locked_folders";
import { decrypt_mail_envelope } from "@/components/email/shared/decrypt_envelope";
import {
  decrypt_attachment_meta,
  decrypt_attachment_data,
} from "@/services/crypto/attachment_crypto";

const PAGE_SIZE = 500;

function date_boundary_local(value: string, end_of_day: boolean): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());

  if (m && +m[2] >= 1 && +m[2] <= 12) {
    return end_of_day
      ? new Date(+m[1], +m[2] - 1, +m[3], 23, 59, 59, 999).getTime()
      : new Date(+m[1], +m[2] - 1, +m[3], 0, 0, 0, 0).getTime();
  }

  return new Date(value).getTime();
}

function in_date_range(iso: string, scope: ExportScope): boolean {
  if (!scope.date_from && !scope.date_to) return true;
  const t = new Date(iso).getTime();

  if (Number.isNaN(t)) return true;
  if (scope.date_from && t < date_boundary_local(scope.date_from, false))
    return false;
  if (scope.date_to && t > date_boundary_local(scope.date_to, true))
    return false;

  return true;
}

async function build_attachments(
  mail_id: string,
  has_attachments?: boolean,
  report_error?: (e: ExportError) => void,
): Promise<ExportAttachment[]> {
  const result: ExportAttachment[] = [];

  if (has_attachments === false) return result;

  let list: Awaited<ReturnType<typeof list_attachments>>;

  try {
    list = await list_attachments(mail_id);
  } catch {
    report_error?.({
      message_id_prefix: await hash_prefix(mail_id),
      kind: "attachment",
      code: "attachment_list_failed",
    });

    return result;
  }

  if (!list.data?.attachments?.length) return result;

  for (const att of list.data.attachments) {
    try {
      const meta = await decrypt_attachment_meta(
        att.encrypted_meta,
        att.meta_nonce,
        att.mail_item_id,
        att.seq_num,
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
      report_error?.({
        message_id_prefix: await hash_prefix(mail_id),
        kind: "attachment",
        code: "attachment_undecryptable",
      });
    }
  }

  return result;
}

export function create_account_message_source(): ExportSource {
  let total = 0;

  return {
    async prepare(
      _scope: ExportScope,
      _signal: AbortSignal,
    ): Promise<ExportSourceContext> {
      const probe = await list_mail_items({
        limit: 1,
        item_type: "all",
        include_spam: true,
      });

      if (probe.error || !probe.data) {
        throw new Error(probe.error ?? "export_probe_failed");
      }

      total = probe.data.total ?? 0;

      return { total, scope: _scope };
    },

    async *messages(
      scope: ExportScope,
      signal: AbortSignal,
      report_error?: (e: ExportError) => void,
    ): AsyncIterable<PipelineMessage> {
      let cursor: string | undefined = undefined;

      while (!signal.aborted) {
        const page = await list_mail_items({
          limit: PAGE_SIZE,
          cursor,
          item_type: "all",
          include_spam: true,
          skip_total: true,
        });

        if (page.error || !page.data) {
          throw new Error(page.error ?? "export_page_failed");
        }

        if (!page.data.items?.length) break;

        for (const item of filter_locked_mail_items(page.data.items)) {
          if (signal.aborted) return;

          const envelope = await decrypt_mail_envelope(
            item.encrypted_envelope,
            item.envelope_nonce,
            item.id,
          );

          if (!envelope) {
            report_error?.({
              message_id_prefix: await hash_prefix(item.id),
              kind: "decrypt",
              code: "envelope_undecryptable",
            });
            continue;
          }

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
          const attachments = await build_attachments(
            item.id,
            item.has_attachments,
            report_error,
          );

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
