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
import { blake3 } from "@noble/hashes/blake3";

export const SUBJECT_THREAD_WINDOW_DAYS = 7;
export const SUBJECT_THREAD_WINDOW_MS = SUBJECT_THREAD_WINDOW_DAYS * 86_400_000;
export const SUBJECT_THREAD_MAX_MESSAGES = 100;
export const THREAD_TOKEN_BYTES = 16;

const REPLY_PREFIXES = [
  "re",
  "r",
  "aw",
  "antw",
  "ant",
  "sv",
  "svar",
  "vs",
  "vl",
  "res",
  "rif",
  "ref",
  "réf",
  "rv",
  "odp",
  "pd",
  "ynt",
  "fw",
  "fwd",
  "wg",
  "tr",
  "enc",
  "doorst",
  "отв",
  "пересл",
  "回复",
  "答复",
  "转发",
  "回覆",
  "轉寄",
  "轉發",
  "返信",
  "転送",
  "회신",
  "답장",
  "전달",
];

const REPLY_PREFIX_PATTERN = new RegExp(
  String.raw`^\s*(?:` +
    [...REPLY_PREFIXES].sort((a, b) => b.length - a.length).join("|") +
    String.raw`)\s*(?:\[\d+\]|\(\d+\)|\^\d+)?\s*[:\uff1a]\s*`,
  "u",
);

function strip_reply_prefix_once(subject: string): string | null {
  const match = REPLY_PREFIX_PATTERN.exec(subject);

  if (!match) return null;

  return subject.slice(match[0].length);
}

export function normalize_subject(subject: string): string {
  let current = subject.trim().toLowerCase();

  for (;;) {
    const stripped = strip_reply_prefix_once(current);

    if (stripped === null) break;
    current = stripped;
  }

  return current.trim();
}

export function has_reply_prefix(subject: string): boolean {
  return strip_reply_prefix_once(subject.trim().toLowerCase()) !== null;
}

export function normalize_sender(sender_email: string): string {
  return sender_email.trim().toLowerCase();
}

export function normalize_account_address(address: string): string {
  const lowered = address.trim().toLowerCase();
  const at = lowered.lastIndexOf("@");

  if (at < 0) return lowered;

  const local = lowered.slice(0, at);
  const domain = lowered.slice(at + 1);
  const plus = local.indexOf("+");
  const base = plus >= 0 ? local.slice(0, plus) : local;

  return `${base.replace(/\./g, "")}@${domain}`;
}

export function strip_angle_brackets(msgid: string): string {
  return msgid.trim().replace(/^<+/, "").replace(/>+$/, "");
}

export function is_usable_msgid(msgid: string | null | undefined): boolean {
  if (!msgid) return false;

  const trimmed = strip_angle_brackets(msgid);
  const at = trimmed.indexOf("@");

  if (at <= 0) return false;

  const local = trimmed.slice(0, at).trim();
  const domain = trimmed.slice(at + 1).trim();

  return local.length > 0 && domain.length > 0;
}

export function uint8_to_base64(bytes: Uint8Array): string {
  let binary = "";

  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }

  return btoa(binary);
}

function hash_prefix(input: string): Uint8Array {
  return blake3(new TextEncoder().encode(input)).slice(0, THREAD_TOKEN_BYTES);
}

export function thread_token_from_root(
  user_id: string,
  root_msgid: string,
): string {
  const normalized = strip_angle_brackets(root_msgid);

  return uint8_to_base64(
    hash_prefix(`inbound_thread_msgid:${user_id}:${normalized}`),
  );
}

export function hash_message_id(user_id: string, msgid: string): string {
  const normalized = strip_angle_brackets(msgid).trim().toLowerCase();

  return uint8_to_base64(hash_prefix(`msgid_index:${user_id}:${normalized}`));
}

export function thread_token_from_item(
  user_id: string,
  item_id: string,
): string {
  return uint8_to_base64(hash_prefix(`rethread_group:${user_id}:${item_id}`));
}
