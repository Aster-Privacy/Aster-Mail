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
import {
  serialize_envelope,
  type ExportAttachment,
  type SerializeOptions,
} from "./rfc5322";
import { mboxrd_quote } from "./mboxrd_transducer";

const enc = new TextEncoder();
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function pad2(n: number): string {
  return n < 10 ? "0" + n : String(n);
}

function asctime_utc(d: Date): string {
  const day_pad = d.getUTCDate() < 10 ? " " + d.getUTCDate() : String(d.getUTCDate());
  return (
    WEEKDAYS[d.getUTCDay()] +
    " " +
    MONTHS[d.getUTCMonth()] +
    " " +
    day_pad +
    " " +
    pad2(d.getUTCHours()) +
    ":" +
    pad2(d.getUTCMinutes()) +
    ":" +
    pad2(d.getUTCSeconds()) +
    " " +
    d.getUTCFullYear()
  );
}

function sanitize_envelope_sender(email: string): string {
  const trimmed = (email || "").trim();
  if (!trimmed) return "MAILER-DAEMON@aster.local";
  if (/[\s<>"]/.test(trimmed)) return "MAILER-DAEMON@aster.local";
  return trimmed;
}

export interface MboxOptions {
  line_ending?: "lf" | "crlf";
}

export async function* frame_mbox_message(
  env: DecryptedEnvelope,
  attachments: ExportAttachment[],
  serialize_opts: SerializeOptions = {},
  mbox_opts: MboxOptions = {},
): AsyncGenerator<Uint8Array> {
  const sep_ending = mbox_opts.line_ending === "crlf" ? "\r\n" : "\n";
  const sender = sanitize_envelope_sender(env.from?.email ?? "");
  const ts = env.sent_at ? new Date(env.sent_at) : new Date();
  const safe_ts = Number.isNaN(ts.getTime()) ? new Date() : ts;
  const from_line = `From ${sender} ${asctime_utc(safe_ts)}${sep_ending}`;
  yield enc.encode(from_line);

  const body_source = serialize_envelope(env, attachments, serialize_opts);
  for await (const chunk of mboxrd_quote(body_source)) yield chunk;

  yield enc.encode(sep_ending);
}

export interface MessageInput {
  envelope: DecryptedEnvelope;
  attachments: ExportAttachment[];
}

export async function write_mbox_stream(
  messages: AsyncIterable<MessageInput>,
  writer: WritableStreamDefaultWriter<Uint8Array>,
  serialize_opts: SerializeOptions = {},
  mbox_opts: MboxOptions = {},
  on_message_done?: (bytes_written: number) => void,
): Promise<{ bytes_written: number; count: number }> {
  let bytes_written = 0;
  let count = 0;
  for await (const { envelope, attachments } of messages) {
    for await (const chunk of frame_mbox_message(
      envelope,
      attachments,
      serialize_opts,
      mbox_opts,
    )) {
      await writer.write(chunk);
      bytes_written += chunk.length;
    }
    count++;
    if (on_message_done) on_message_done(bytes_written);
  }
  return { bytes_written, count };
}
