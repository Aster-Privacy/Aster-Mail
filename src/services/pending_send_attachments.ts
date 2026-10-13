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
import type { Attachment } from "@/components/compose/compose_shared_core";

export interface PendingSendAttachment {
  id: string;
  filename: string;
  content_type: string;
  size_bytes: number;
  data: ArrayBuffer;
}

const pending_attachments = new Map<string, PendingSendAttachment[]>();

export function set_pending_send_attachments(
  message_id: string,
  attachments: readonly Attachment[] | undefined,
): void {
  if (!message_id) return;

  if (!attachments || attachments.length === 0) {
    pending_attachments.delete(message_id);

    return;
  }

  pending_attachments.set(
    message_id,
    attachments.map((attachment) => ({
      id: `${message_id}:${attachment.id}`,
      filename: attachment.name,
      content_type: attachment.mime_type || "application/octet-stream",
      size_bytes: attachment.size_bytes,
      data: attachment.data,
    })),
  );
}

export function get_pending_send_attachments(
  message_id: string,
): PendingSendAttachment[] | undefined {
  return pending_attachments.get(message_id);
}

export function clear_pending_send_attachments(message_id: string): void {
  pending_attachments.delete(message_id);
}

export function reset_pending_send_attachments(): void {
  pending_attachments.clear();
}
