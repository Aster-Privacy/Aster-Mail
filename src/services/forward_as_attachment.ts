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
import type { MimeAttachmentPart } from "@/utils/mime_attachment_parts";

import { is_email_drag, read_email_drag } from "@/components/email/inbox/category_drag";
import { is_js_whitespace, trim_end_while } from "@/lib/linear_trim";

export const EML_MIME_TYPE = "message/rfc822";
export const MAX_FORWARD_AS_ATTACHMENT = 20;

const MAX_FILENAME_LENGTH = 80;
const FALLBACK_FILENAME = "message";

function is_dot_or_whitespace(code: number): boolean {
  return code === 0x2e || is_js_whitespace(code);
}

export function eml_filename_for(subject: string | undefined | null): string {
  const collapsed = (subject ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/[\\/:*?"<>|]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^\.+/, "");
  const cleaned = trim_end_while(collapsed, is_dot_or_whitespace)
    .slice(0, MAX_FILENAME_LENGTH)
    .trim();

  return `${cleaned || FALLBACK_FILENAME}.eml`;
}

export function unique_eml_filenames(
  subjects: Array<string | undefined | null>,
): string[] {
  const seen = new Map<string, number>();

  return subjects.map((subject) => {
    const name = eml_filename_for(subject);
    const key = name.toLowerCase();
    const count = (seen.get(key) ?? 0) + 1;

    seen.set(key, count);
    if (count === 1) return name;

    return `${name.slice(0, -4)} (${count}).eml`;
  });
}

export function has_dropped_files(data_transfer: DataTransfer | null): boolean {
  if (!data_transfer) return false;
  if (data_transfer.files && data_transfer.files.length > 0) return true;

  return Array.from(data_transfer.types ?? []).includes("Files");
}

export function dropped_mail_ids(data_transfer: DataTransfer | null): string[] {
  if (has_dropped_files(data_transfer)) return [];
  if (!is_email_drag(data_transfer)) return [];

  const payload = read_email_drag(data_transfer);

  if (!payload || payload.is_scope) return [];

  return Array.from(new Set(payload.ids.filter((id) => !!id))).slice(
    0,
    MAX_FORWARD_AS_ATTACHMENT,
  );
}

function attachment_key(name: string, size: number): string {
  return `${name.toLowerCase()}\u0000${size}`;
}

export function merge_eml_attachments(
  stored: ExportAttachment[],
  mime_parts: MimeAttachmentPart[],
): ExportAttachment[] {
  const result = [...stored];
  const known = new Set(
    stored.map((a) => attachment_key(a.filename, a.size ?? -1)),
  );

  for (const part of mime_parts) {
    const key = attachment_key(part.filename, part.data.byteLength);

    if (known.has(key)) continue;
    known.add(key);
    result.push({
      filename: part.filename,
      mime_type: part.content_type || "application/octet-stream",
      size: part.data.byteLength,
      is_inline: part.is_inline || !!part.content_id,
      content_id: part.content_id,
      open: () => part.data,
    });
  }

  return result;
}

export interface EmlSource {
  envelope: DecryptedEnvelope;
  attachments: ExportAttachment[];
}

export async function eml_file_from_source(
  source: EmlSource,
  filename: string,
): Promise<File> {
  const { serialize_envelope_to_bytes } = await import("@/utils/export");
  const bytes = await serialize_envelope_to_bytes(
    source.envelope,
    source.attachments,
    { drop_bcc: true, generate_message_id_if_missing: true },
  );

  return new File([bytes as BlobPart], filename, { type: EML_MIME_TYPE });
}

async function resolve_our_email(): Promise<string | undefined> {
  try {
    const { get_current_account } = await import("@/services/account_manager");
    const account = await get_current_account();

    return account?.user.email || undefined;
  } catch {
    return undefined;
  }
}

export async function load_eml_source(
  mail_id: string,
): Promise<EmlSource | null> {
  const [
    { get_mail_item },
    { decrypt_mail_envelope },
    { readable_export_envelope },
    { build_attachments },
    { get_decrypted_mime_attachments },
  ] = await Promise.all([
    import("@/services/api/mail"),
    import("@/components/email/shared/decrypt_envelope"),
    import("@/services/export/readable_envelope"),
    import("@/services/export/message_source"),
    import("@/services/decrypted_mime_attachments"),
  ]);

  const response = await get_mail_item(mail_id);
  const item = response.data;

  if (!item?.encrypted_envelope) return null;

  const decrypted = await decrypt_mail_envelope<DecryptedEnvelope>(
    item.encrypted_envelope,
    item.envelope_nonce,
    item.id,
  );

  if (!decrypted) return null;

  const readable = await readable_export_envelope(
    decrypted,
    resolve_our_email,
    item.id,
  );

  if (!readable) return null;

  const stored = await build_attachments(item.id, item.has_attachments);
  const attachments = merge_eml_attachments(
    stored,
    get_decrypted_mime_attachments(item.id),
  );

  return { envelope: readable, attachments };
}

export interface EmlBuildResult {
  files: File[];
  subjects: string[];
  failed: number;
}

export async function build_message_eml_files(
  mail_ids: string[],
): Promise<EmlBuildResult> {
  const sources: EmlSource[] = [];
  let failed = 0;

  for (const mail_id of mail_ids.slice(0, MAX_FORWARD_AS_ATTACHMENT)) {
    try {
      const source = await load_eml_source(mail_id);

      if (source) sources.push(source);
      else failed += 1;
    } catch {
      failed += 1;
    }
  }

  const subjects = sources.map((s) => s.envelope.subject ?? "");
  const names = unique_eml_filenames(subjects);
  const files: File[] = [];

  for (let i = 0; i < sources.length; i++) {
    try {
      files.push(await eml_file_from_source(sources[i], names[i]));
    } catch {
      failed += 1;
    }
  }

  return { files, subjects, failed };
}

export type EmlBuilder = (mail_ids: string[]) => Promise<EmlBuildResult>;

export function handle_mail_drop(
  data_transfer: DataTransfer | null,
  add_files: (files: File[]) => void,
  on_failed?: (failed: number) => void,
  build: EmlBuilder = build_message_eml_files,
): Promise<void> | null {
  const mail_ids = dropped_mail_ids(data_transfer);

  if (mail_ids.length === 0) return null;

  return build(mail_ids)
    .then((result) => {
      if (result.files.length > 0) add_files(result.files);
      if (result.failed > 0) on_failed?.(result.failed);
    })
    .catch(() => {
      on_failed?.(mail_ids.length);
    });
}

export const FORWARD_AS_ATTACHMENT_EVENT = "aster:compose-forward-as-attachment";

export interface ForwardAsAttachmentDetail {
  files: File[];
  subject: string;
}

export function forwarded_subject(subjects: string[], prefix: string): string {
  if (subjects.length !== 1) return "";

  const subject = subjects[0].trim();

  if (!subject) return prefix;

  return subject.startsWith(prefix) ? subject : `${prefix} ${subject}`;
}

export async function forward_as_attachment(
  mail_ids: string[],
  subject_prefix: string,
  build: EmlBuilder = build_message_eml_files,
): Promise<EmlBuildResult> {
  const result = await build(mail_ids.slice(0, MAX_FORWARD_AS_ATTACHMENT));

  if (result.files.length > 0 && typeof window !== "undefined") {
    const detail: ForwardAsAttachmentDetail = {
      files: result.files,
      subject: forwarded_subject(result.subjects, subject_prefix),
    };

    window.dispatchEvent(
      new CustomEvent<ForwardAsAttachmentDetail>(FORWARD_AS_ATTACHMENT_EVENT, {
        detail,
      }),
    );
  }

  return result;
}
