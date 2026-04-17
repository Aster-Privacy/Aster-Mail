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
import type {
  ParsedEmail,
  ParsedAttachment,
  ParseResult,
  ParseProgressCallback,
  PstMessage,
  PstFolder,
} from "./types";

import { MAX_FILE_SIZE } from "./types";
import { secure_hex } from "./mime_utils";

function convert_pst_message(msg: PstMessage, index: number): ParsedEmail {
  const message_id =
    msg.internetMessageId ||
    `pst-import-${index}-${Date.now().toString(36)}-${secure_hex(4)}@astermail.local`;

  const from = msg.senderEmailAddress
    ? msg.senderName
      ? `${msg.senderName} <${msg.senderEmailAddress}>`
      : msg.senderEmailAddress
    : "unknown@unknown.com";

  const to: string[] = [];
  const cc: string[] = [];

  if (msg.displayTo) {
    to.push(
      ...msg.displayTo
        .split(";")
        .map((e: string) => e.trim())
        .filter(Boolean),
    );
  }
  if (msg.displayCC) {
    cc.push(
      ...msg.displayCC
        .split(";")
        .map((e: string) => e.trim())
        .filter(Boolean),
    );
  }

  const subject = msg.subject || "(No Subject)";
  const date = msg.clientSubmitTime || msg.messageDeliveryTime || new Date();

  const html_body = msg.bodyHTML || null;
  const text_body = msg.body || null;

  const attachments: ParsedAttachment[] = [];
  const attachment_count = msg.numberOfAttachments ?? 0;

  if (msg.hasAttachments && attachment_count > 0) {
    for (let i = 0; i < attachment_count; i++) {
      try {
        const att = msg.getAttachment(i);

        if (att && att.filename) {
          const content = att.fileInputStream?.read() || new Uint8Array(0);

          attachments.push({
            filename: att.filename,
            content_type: att.mimeTag || "application/octet-stream",
            content:
              content instanceof Uint8Array ? content : new Uint8Array(content),
            size: att.attachSize || content.length,
          });
        }
      } catch {}
    }
  }

  return {
    message_id: message_id.replace(/[<>]/g, ""),
    from,
    to,
    cc,
    subject,
    date: date instanceof Date ? date : new Date(date),
    html_body,
    text_body,
    attachments,
    raw_headers: {},
  };
}

export async function parse_pst_file(
  file: File,
  on_progress?: ParseProgressCallback,
): Promise<ParseResult> {
  if (file.size > MAX_FILE_SIZE) {
    return {
      emails: [],
      errors: [
        `File too large: ${(file.size / 1024 / 1024).toFixed(1)}MB exceeds 500MB limit`,
      ],
      warnings: [],
    };
  }

  try {
    const { PSTFile } = await import("pst-extractor");
    const buffer = await file.arrayBuffer();
    const pst = new PSTFile(Buffer.from(buffer));

    const emails: ParsedEmail[] = [];
    const errors: string[] = [];
    const warnings: string[] = [];
    let processed = 0;
    let total_estimate = 100;

    const process_folder = (folder: PstFolder) => {
      if (folder.contentCount > 0) {
        total_estimate = Math.max(
          total_estimate,
          processed + folder.contentCount * 2,
        );
        let message = folder.getNextChild();

        while (message !== null) {
          try {
            const parsed = convert_pst_message(message, processed);

            emails.push(parsed);
          } catch (err) {
            warnings.push(
              `Failed to parse PST message: ${err instanceof Error ? err.message : "Unknown error"}`,
            );
          }
          processed++;
          if (on_progress && processed % 10 === 0) {
            on_progress({
              current: processed,
              total: total_estimate,
              percentage: Math.min(
                95,
                Math.round((processed / total_estimate) * 100),
              ),
            });
          }
          message = folder.getNextChild();
        }
      }

      if (folder.hasSubfolders) {
        const subfolders = folder.getSubFolders();

        for (const subfolder of subfolders) {
          process_folder(subfolder);
        }
      }
    };

    const root = pst.getRootFolder();

    process_folder(root);

    if (on_progress) {
      on_progress({ current: processed, total: processed, percentage: 100 });
    }

    if (emails.length === 0) {
      errors.push("No emails found in PST file");
    }

    return { emails, errors, warnings };
  } catch (err) {
    const error_message = err instanceof Error ? err.message : "Unknown error";

    if (
      error_message.includes("Buffer") ||
      error_message.includes("not defined")
    ) {
      return {
        emails: [],
        errors: [
          "PST files require conversion. Please export your emails from Outlook as MBOX format instead, or use individual EML files.",
        ],
        warnings: [],
      };
    }

    return {
      emails: [],
      errors: [
        `Failed to parse PST file: ${error_message}. Try exporting as MBOX format from your email client.`,
      ],
      warnings: [],
    };
  }
}
