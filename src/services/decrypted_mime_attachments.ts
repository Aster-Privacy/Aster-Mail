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
import type { MimeAttachmentPart } from "@/utils/mime_attachment_parts";

type Listener = (mail_item_id: string) => void;

const MAX_STORED_MESSAGES = 50;
const MAX_STORED_BYTES = 256 * 1024 * 1024;

const NO_PARTS: MimeAttachmentPart[] = [];

const store = new Map<string, MimeAttachmentPart[]>();
const listeners = new Set<Listener>();

function stored_bytes(): number {
  let total = 0;

  for (const parts of store.values()) {
    for (const part of parts) total += part.data.byteLength;
  }

  return total;
}

export function set_decrypted_mime_attachments(
  mail_item_id: string,
  parts: MimeAttachmentPart[],
): void {
  if (!mail_item_id || parts.length === 0) return;

  store.delete(mail_item_id);
  store.set(mail_item_id, parts);

  while (
    store.size > 1 &&
    (store.size > MAX_STORED_MESSAGES || stored_bytes() > MAX_STORED_BYTES)
  ) {
    const oldest = store.keys().next().value;

    if (oldest === undefined) break;
    store.delete(oldest);
  }

  for (const listener of listeners) listener(mail_item_id);
}

export function get_decrypted_mime_attachments(
  mail_item_id: string | undefined,
): MimeAttachmentPart[] {
  if (!mail_item_id) return NO_PARTS;

  return store.get(mail_item_id) ?? NO_PARTS;
}

export function subscribe_decrypted_mime_attachments(
  listener: Listener,
): () => void {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}

export function clear_decrypted_mime_attachments(): void {
  const cleared = Array.from(store.keys());

  store.clear();
  for (const mail_item_id of cleared) {
    for (const listener of listeners) listener(mail_item_id);
  }
}

export function mime_attachment_bytes(part: MimeAttachmentPart): ArrayBuffer {
  return part.data.buffer.slice(
    part.data.byteOffset,
    part.data.byteOffset + part.data.byteLength,
  ) as ArrayBuffer;
}
