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
import type { MimeAttachmentPart } from "@/utils/mime_attachment_parts";

type Listener = (mail_item_id: string) => void;

const MAX_STORED_MESSAGES = 50;
const MAX_STORED_BYTES = 256 * 1024 * 1024;

const NO_PARTS: MimeAttachmentPart[] = [];

interface StoredParts {
  content_tag: string;
  parts: MimeAttachmentPart[];
}

const store = new Map<string, StoredParts>();
const listeners = new Set<Listener>();

function stored_bytes(): number {
  let total = 0;

  for (const entry of store.values()) {
    for (const part of entry.parts) total += part.data.byteLength;
  }

  return total;
}

function notify(mail_item_id: string): void {
  for (const listener of listeners) listener(mail_item_id);
}

export async function decrypted_content_tag(text: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(text),
  );

  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

export function set_decrypted_mime_attachments(
  mail_item_id: string,
  parts: MimeAttachmentPart[],
  content_tag: string,
): void {
  if (!mail_item_id) return;

  if (parts.length === 0) {
    if (store.delete(mail_item_id)) notify(mail_item_id);

    return;
  }

  store.delete(mail_item_id);
  store.set(mail_item_id, { content_tag, parts });

  while (
    store.size > 1 &&
    (store.size > MAX_STORED_MESSAGES || stored_bytes() > MAX_STORED_BYTES)
  ) {
    const oldest = store.keys().next().value;

    if (oldest === undefined) break;
    store.delete(oldest);
  }

  notify(mail_item_id);
}

export function get_decrypted_mime_attachments(
  mail_item_id: string | undefined,
): MimeAttachmentPart[] {
  if (!mail_item_id) return NO_PARTS;

  return store.get(mail_item_id)?.parts ?? NO_PARTS;
}

export function get_shown_decrypted_mime_attachments(
  mail_item_id: string | undefined,
  content_tag: string | undefined,
): MimeAttachmentPart[] {
  if (!mail_item_id || !content_tag) return NO_PARTS;

  const entry = store.get(mail_item_id);

  return entry && entry.content_tag === content_tag ? entry.parts : NO_PARTS;
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
  for (const mail_item_id of cleared) notify(mail_item_id);
}

export function mime_attachment_bytes(part: MimeAttachmentPart): ArrayBuffer {
  return part.data.buffer.slice(
    part.data.byteOffset,
    part.data.byteOffset + part.data.byteLength,
  ) as ArrayBuffer;
}
