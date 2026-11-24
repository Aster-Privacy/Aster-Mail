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
import { array_to_base64, base64_to_array } from "./base64";
import { is_usable_identity_key } from "./identity_key_required";

export const SCHEDULED_TAG_CONTEXT = "astermail-scheduled-tag-v1";
export const SCHEDULED_TAG_FIELD = "content_tag";

export interface ScheduledTaggedFields {
  to_recipients?: string[];
  cc_recipients?: string[];
  bcc_recipients?: string[];
  subject?: string;
  body?: string;
  plain_body?: string;
  is_plain_text?: boolean;
  plain_text?: boolean;
  from?: { name?: string; email?: string };
  in_reply_to?: string;
  thread_id?: string;
  reply_to_id?: string;
}

function text_of(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function list_of(value: unknown): string[] {
  return Array.isArray(value) ? value.map(text_of) : [];
}

export function scheduled_tag_message(
  content: ScheduledTaggedFields,
): Uint8Array {
  const encoder = new TextEncoder();
  const plain = content.is_plain_text === true || content.plain_text === true;
  const items: string[] = [
    text_of(content.subject),
    text_of(content.body),
    text_of(content.plain_body),
    plain ? "1" : "0",
    text_of(content.from?.name),
    text_of(content.from?.email),
    text_of(content.in_reply_to),
    text_of(content.thread_id),
    text_of(content.reply_to_id),
  ];

  for (const list of [
    list_of(content.to_recipients),
    list_of(content.cc_recipients),
    list_of(content.bcc_recipients),
  ]) {
    items.push(String(list.length), ...list);
  }

  const parts = [
    encoder.encode(SCHEDULED_TAG_CONTEXT),
    ...items.map((item) => encoder.encode(item)),
  ];
  const total = parts.reduce(
    (sum, part, index) => sum + part.length + (index === 0 ? 0 : 4),
    0,
  );
  const message = new Uint8Array(total);
  const view = new DataView(message.buffer);
  let offset = 0;

  parts.forEach((part, index) => {
    if (index > 0) {
      view.setUint32(offset, part.length);
      offset += 4;
    }
    message.set(part, offset);
    offset += part.length;
  });

  return message;
}

async function tag_key(identity_key: string): Promise<CryptoKey> {
  if (!is_usable_identity_key(identity_key)) {
    throw new Error("identity key unavailable");
  }

  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(identity_key + SCHEDULED_TAG_CONTEXT),
  );

  return crypto.subtle.importKey(
    "raw",
    digest,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

export async function compute_scheduled_content_tag(
  identity_key: string,
  content: ScheduledTaggedFields,
): Promise<string> {
  const signature = await crypto.subtle.sign(
    "HMAC",
    await tag_key(identity_key),
    scheduled_tag_message(content),
  );

  return array_to_base64(new Uint8Array(signature));
}

export async function verify_scheduled_content_tag(
  identity_keys: (string | null | undefined)[],
  content: ScheduledTaggedFields,
  tag: unknown,
): Promise<boolean> {
  if (typeof tag !== "string" || tag.length === 0) return false;

  let tag_bytes: Uint8Array;

  try {
    tag_bytes = base64_to_array(tag);
  } catch {
    return false;
  }

  const message = scheduled_tag_message(content);

  for (const identity_key of identity_keys) {
    if (!is_usable_identity_key(identity_key)) continue;

    if (
      await crypto.subtle.verify(
        "HMAC",
        await tag_key(identity_key),
        tag_bytes,
        message,
      )
    ) {
      return true;
    }
  }

  return false;
}
