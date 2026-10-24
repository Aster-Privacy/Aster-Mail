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
import type { Attachment } from "@/components/compose/compose_shared";
import type { ExternalKeyInfo } from "./api/keys";

import { discover_external_keys_batch } from "./api/keys";
import { array_to_base64, base64_to_array } from "./crypto/base64";
import { with_aes_kw_fallback } from "./crypto/webcrypto_aes_kw";
import {
  build_protected_mime_entity,
  type ProtectedMimeAttachment,
} from "./pgp_protected_mime";
import { build_signed_mime_payload } from "./send_queue_signed_mime";
import { create_error } from "./send_queue_types";

import { outgoing_html_to_plain_text } from "@/lib/outgoing_plain_text";
import { load_openpgp } from "@/services/crypto/openpgp_loader";
import { get_active_translations } from "@/lib/i18n/translations";

export const CLIENT_COPY_PLACEHOLDER_BODY = " ";

const MAX_COPY_ATTACHMENT_BYTES = 11 * 1024 * 1024;
const BASE_COPY_BYTES = 10 * 1024 * 1024;
const MAX_COPY_BYTES = 48 * 1024 * 1024;
const MAX_TOTAL_COPY_BYTES = 80 * 1024 * 1024;

export interface ClientPgpCopyParams {
  outside_recipients: string[];
  force_pgp?: boolean;
  require_encryption?: boolean;
  auto_discover_keys?: boolean;
  obscure_subject?: boolean;
  subject: string;
  body: string;
  from: string;
  to: string[];
  cc: string[];
  bcc: string[];
  attachments: Attachment[];
  is_plain_text?: boolean;
}

export type EncryptionDecision = "encrypt" | "server" | "plain";

export function decide_recipient_encryption(
  info: ExternalKeyInfo | undefined,
  params: Pick<ClientPgpCopyParams, "force_pgp" | "require_encryption">,
): EncryptionDecision {
  const found = Boolean(info?.found && info.public_key);
  const explicit =
    params.force_pgp === true || params.require_encryption === true;

  if (explicit) return found ? "encrypt" : "server";

  if (params.force_pgp === false) return "plain";

  if (!found) return "plain";

  return info?.will_encrypt === true ? "encrypt" : "plain";
}

function attachment_bytes(attachments: Attachment[]): number {
  return attachments.reduce(
    (total, att) => total + (att.size_bytes ?? att.data.byteLength ?? 0),
    0,
  );
}

function unique_recipients(recipients: string[]): string[] {
  const seen = new Set<string>();
  const unique: string[] = [];

  for (const recipient of recipients) {
    const trimmed = recipient.trim();
    const key = trimmed.toLowerCase();

    if (trimmed.length === 0 || seen.has(key)) continue;
    seen.add(key);
    unique.push(trimmed);
  }

  return unique;
}

function to_crlf_lines(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\n+$/, "")
    .replace(/\n/g, "\r\n");
}

function random_boundary_token(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));

  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function build_signed_mime_entity(
  mime: Uint8Array,
  signature: string,
  micalg: string,
): Uint8Array {
  const boundary = `--=_astermail_signed_${random_boundary_token()}`;
  const encoder = new TextEncoder();
  const head = encoder.encode(
    `Content-Type: multipart/signed; micalg="${micalg}"; protocol="application/pgp-signature"; boundary="${boundary}"\r\n\r\n--${boundary}\r\n`,
  );
  const tail = encoder.encode(
    `\r\n--${boundary}\r\n` +
      'Content-Type: application/pgp-signature; name="signature.asc"\r\n' +
      "Content-Description: OpenPGP digital signature\r\n" +
      'Content-Disposition: attachment; filename="signature.asc"\r\n\r\n' +
      to_crlf_lines(signature.trim()) +
      `\r\n--${boundary}--\r\n`,
  );
  const out = new Uint8Array(head.length + mime.length + tail.length);

  out.set(head, 0);
  out.set(mime, head.length);
  out.set(tail, head.length + mime.length);

  return out;
}

async function build_inner_entity(
  params: ClientPgpCopyParams,
): Promise<Uint8Array> {
  const signed = await build_signed_mime_payload({
    subject: params.subject,
    body: params.body,
    from: params.from,
    to: params.to,
    cc: params.cc,
    bcc: params.bcc,
    attachments: params.attachments,
    obscure_subject: params.obscure_subject === true,
    is_plain_text: params.is_plain_text,
  });

  if (signed) {
    return build_signed_mime_entity(
      base64_to_array(signed.signed_mime),
      signed.signed_mime_signature,
      signed.signed_mime_micalg,
    );
  }

  const attachments: ProtectedMimeAttachment[] = params.attachments.map(
    (att) => ({
      filename: att.name,
      content_type: att.mime_type,
      data_base64: array_to_base64(new Uint8Array(att.data)),
      content_id: att.content_id,
    }),
  );

  return new TextEncoder().encode(
    build_protected_mime_entity({
      subject: params.subject,
      body: params.is_plain_text
        ? outgoing_html_to_plain_text(params.body)
        : params.body,
      is_html: !params.is_plain_text,
      from: params.from,
      to: params.to,
      cc: params.cc,
      attachments,
      obscure_subject: params.obscure_subject === true,
    }),
  );
}

async function encrypt_entity_for(
  entity: Uint8Array,
  armored_public_key: string,
): Promise<string | undefined> {
  const openpgp = await load_openpgp();

  try {
    const public_key = await openpgp.readKey({
      armoredKey: armored_public_key,
    });

    await public_key.getEncryptionKey();

    const encrypted = await with_aes_kw_fallback(async () =>
      openpgp.encrypt({
        message: await openpgp.createMessage({ binary: entity }),
        encryptionKeys: public_key,
        format: "armored",
      }),
    );

    return typeof encrypted === "string" ? encrypted : String(encrypted);
  } catch {
    return undefined;
  }
}

export async function build_client_pgp_copies(
  params: ClientPgpCopyParams,
): Promise<Record<string, string> | undefined> {
  const recipients = unique_recipients(params.outside_recipients);

  if (recipients.length === 0) return undefined;

  return build_copies_for(recipients, params);
}

async function build_copies_for(
  recipients: string[],
  params: ClientPgpCopyParams,
): Promise<Record<string, string> | undefined> {
  if (params.force_pgp === false && params.require_encryption !== true) {
    return undefined;
  }

  const total_attachment_bytes = attachment_bytes(params.attachments);

  if (total_attachment_bytes > MAX_COPY_ATTACHMENT_BYTES) return undefined;

  let discovered: ExternalKeyInfo[] | undefined;

  try {
    const response = await discover_external_keys_batch(
      recipients.map((r) => r.toLowerCase()),
    );

    if (response.error) return undefined;
    discovered = response.data;
  } catch {
    return undefined;
  }

  if (!discovered) return undefined;

  const by_address = new Map<string, ExternalKeyInfo>();

  for (const info of discovered) {
    by_address.set(info.email.trim().toLowerCase(), info);
  }

  const keys: { recipient: string; public_key: string }[] = [];

  for (const recipient of recipients) {
    const info = by_address.get(recipient.toLowerCase());

    const decision = decide_recipient_encryption(info, params);

    if (decision === "server") {
      throw create_error(
        "encryption_failed",
        get_active_translations().errors.failed_pgp_encrypt,
      );
    }
    if (decision !== "encrypt") return undefined;
    keys.push({ recipient, public_key: info!.public_key! });
  }

  const entity = await build_inner_entity(params);
  const per_copy_limit = Math.min(
    MAX_COPY_BYTES,
    BASE_COPY_BYTES + 2 * total_attachment_bytes,
  );
  const copies: Record<string, string> = {};
  let total_bytes = 0;

  for (const { recipient, public_key } of keys) {
    const armored = await encrypt_entity_for(entity, public_key);

    if (!armored || !armored.includes("-----BEGIN PGP MESSAGE-----")) {
      return undefined;
    }
    if (armored.length > per_copy_limit) return undefined;
    total_bytes += armored.length;
    if (total_bytes > MAX_TOTAL_COPY_BYTES) return undefined;
    copies[recipient] = armored;
  }

  return copies;
}
