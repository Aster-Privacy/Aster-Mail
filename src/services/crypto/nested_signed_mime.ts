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
import type { sender_verification_status } from "@/services/crypto/key_manager_pgp_messages";

import { load_openpgp } from "@/services/crypto/openpgp_loader";
import {
  judge_signatures,
  type checked_signature,
} from "@/services/crypto/pgp_signature_verdict";

const MAX_SIGNED_MIME_BYTES = 64 * 1024 * 1024;

export interface nested_signed_part {
  signed_text: string;
  armored_signature: string;
}

function header_param(header: string, name: string): string | null {
  const match = new RegExp(
    `;\\s*${name}\\s*=\\s*(?:"([^"]*)"|([^;\\s]+))`,
    "i",
  ).exec(header);

  return match ? (match[1] ?? match[2] ?? null) : null;
}

function split_entity(raw: string): { headers: string; body: string } | null {
  const end = raw.indexOf("\r\n\r\n");

  if (end < 0) return null;

  return {
    headers: raw.slice(0, end).replace(/\r\n[ \t]+/g, " "),
    body: raw.slice(end + 4),
  };
}

function content_type_line(headers: string): string | null {
  const match = /(?:^|\r\n)content-type\s*:\s*([^\r\n]*)/i.exec(headers);

  return match ? match[1] : null;
}

export function find_nested_signed_part(
  plaintext: string,
): nested_signed_part | null {
  if (plaintext.length > MAX_SIGNED_MIME_BYTES) return null;

  const canonical = plaintext.replace(/\r?\n/g, "\r\n");
  const entity = split_entity(canonical);

  if (!entity) return null;

  const content_type = content_type_line(entity.headers);

  if (!content_type || !/^\s*multipart\/signed\b/i.test(content_type)) {
    return null;
  }

  const protocol = header_param(content_type, "protocol");
  const boundary = header_param(content_type, "boundary");

  if (!boundary || protocol?.toLowerCase() !== "application/pgp-signature") {
    return null;
  }

  const delimiter = `--${boundary}`;
  const body = `\r\n${entity.body}`;
  const first = body.indexOf(`\r\n${delimiter}\r\n`);

  if (first < 0) return null;

  const signed_start = first + delimiter.length + 4;
  const second = body.indexOf(`\r\n${delimiter}\r\n`, signed_start);

  if (second < 0) return null;

  const signature_start = second + delimiter.length + 4;
  const closing = body.indexOf(`\r\n${delimiter}--`, signature_start);

  if (closing < 0) return null;

  const signature_entity = split_entity(body.slice(signature_start, closing));
  const signature_type = signature_entity
    ? content_type_line(signature_entity.headers)
    : null;

  if (
    !signature_entity ||
    !signature_type ||
    !/^\s*application\/pgp-signature\b/i.test(signature_type) ||
    !signature_entity.body.includes("-----BEGIN PGP SIGNATURE-----")
  ) {
    return null;
  }

  return {
    signed_text: body.slice(signed_start, second),
    armored_signature: signature_entity.body.trim(),
  };
}

export async function verify_nested_signed_part(
  part: nested_signed_part,
  armored_keys: string[],
): Promise<sender_verification_status> {
  const openpgp = await load_openpgp();

  try {
    const signature = await openpgp.readSignature({
      armoredSignature: part.armored_signature,
    });
    const keys = (
      await Promise.all(
        armored_keys.map((armored) =>
          openpgp.readKey({ armoredKey: armored }).catch(() => null),
        ),
      )
    ).filter((key): key is NonNullable<typeof key> => key !== null);
    const result = await openpgp.verify({
      message: await openpgp.createMessage({
        binary: new TextEncoder().encode(part.signed_text),
      }),
      signature,
      verificationKeys: keys,
      format: "binary",
    });

    return (
      await judge_signatures(
        result.signatures as checked_signature[] | undefined,
        keys,
      )
    ).status;
  } catch {
    return "unknown";
  }
}
