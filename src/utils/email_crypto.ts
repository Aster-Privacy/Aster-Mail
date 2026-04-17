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

import * as openpgp from "openpgp";

import {
  decrypt_envelope_with_bytes,
  base64_to_array,
} from "@/services/crypto/envelope";
import {
  get_passphrase_bytes,
  get_passphrase_from_memory,
  get_vault_from_memory,
} from "@/services/crypto/memory_key_store";
import {
  parse_ratchet_envelope,
  decrypt_ratchet_message,
} from "@/services/crypto/ratchet_manager";
import { zero_uint8_array } from "@/services/crypto/secure_memory";
import {
  decrypt_message,
  encrypt_message_multi,
} from "@/services/crypto/key_manager";
import {
  discover_external_keys_batch,
  type ExternalKeyInfo,
} from "@/services/api/keys";

export async function decrypt_mail_envelope<T = DecryptedEnvelope>(
  encrypted_envelope: string,
  envelope_nonce: string,
): Promise<T | null> {
  const nonce_bytes = envelope_nonce
    ? base64_to_array(envelope_nonce)
    : new Uint8Array(0);

  if (nonce_bytes.length === 0) {
    try {
      const encrypted_bytes = base64_to_array(encrypted_envelope);
      const text = new TextDecoder().decode(encrypted_bytes);

      if (!text.startsWith("-----BEGIN PGP")) {
        return JSON.parse(text) as T;
      }

      const vault = get_vault_from_memory();
      const pass = get_passphrase_from_memory();

      if (vault?.identity_key && pass) {
        const decrypted = await decrypt_message(text, vault.identity_key, pass);

        return JSON.parse(decrypted) as T;
      }

      return null;
    } catch {
      return null;
    }
  }

  const passphrase_bytes = get_passphrase_bytes();

  if (!passphrase_bytes) return null;

  try {
    const result = await decrypt_envelope_with_bytes<T>(
      encrypted_envelope,
      passphrase_bytes,
    );

    zero_uint8_array(passphrase_bytes);

    return result;
  } catch {
    zero_uint8_array(passphrase_bytes);

    return null;
  }
}

export async function try_decrypt_ratchet_body(
  body_text: string,
  our_email: string,
  sender_email: string,
): Promise<string> {
  if (!body_text.startsWith("{")) return body_text;

  const envelope = parse_ratchet_envelope(body_text);

  if (!envelope) return body_text;

  const vault = get_vault_from_memory();

  if (!vault) return body_text;

  try {
    const decrypted = await decrypt_ratchet_message(
      our_email,
      sender_email,
      envelope,
      vault,
    );

    return decrypted ?? body_text;
  } catch {
    return body_text;
  }
}

const PGP_MESSAGE_BEGIN = "-----BEGIN PGP MESSAGE-----";

function find_header_body_split(
  text: string,
): { headers: string; body: string } | null {
  const crlf = text.indexOf("\r\n\r\n");
  const lf = text.indexOf("\n\n");
  let pos = -1;
  let skip = 2;

  if (crlf >= 0 && lf >= 0) {
    pos = Math.min(crlf, lf);
    skip = crlf <= lf ? 4 : 2;
  } else if (crlf >= 0) {
    pos = crlf;
    skip = 4;
  } else if (lf >= 0) {
    pos = lf;
    skip = 2;
  }

  if (pos < 0) return null;

  return {
    headers: text.substring(0, pos),
    body: text.substring(pos + skip),
  };
}

function decode_transfer_encoding(body: string, headers: string): string {
  const encoding_match = headers.match(
    /content-transfer-encoding\s*:\s*(\S+)/i,
  );
  const encoding = encoding_match?.[1]?.toLowerCase() ?? "7bit";

  if (encoding === "base64") {
    try {
      return atob(body.replace(/\s/g, ""));
    } catch {
      return body;
    }
  }

  if (encoding === "quoted-printable") {
    return body
      .replace(/=\r?\n/g, "")
      .replace(/=([0-9A-Fa-f]{2})/g, (_, hex) =>
        String.fromCharCode(parseInt(hex, 16)),
      );
  }

  return body;
}

function get_boundary(headers: string): string | null {
  const match = headers.match(/boundary="?([^\s";]+)"?/i);

  return match?.[1] ?? null;
}

function extract_text_from_multipart(
  body: string,
  boundary: string,
  prefer_html: boolean,
): string | null {
  const parts = body.split(`--${boundary}`);
  let plain_result: string | null = null;
  let html_result: string | null = null;

  for (const part of parts) {
    const trimmed = part.replace(/^[\r\n]+/, "");

    if (trimmed.startsWith("--") || trimmed.length === 0) continue;

    const split = find_header_body_split(trimmed);

    if (!split) continue;

    const lower_headers = split.headers.toLowerCase();
    const nested_boundary = get_boundary(split.headers);

    if (
      nested_boundary &&
      (lower_headers.includes("multipart/alternative") ||
        lower_headers.includes("multipart/related") ||
        lower_headers.includes("multipart/mixed"))
    ) {
      const nested = extract_text_from_multipart(
        split.body,
        nested_boundary,
        prefer_html,
      );

      if (nested) return nested;

      continue;
    }

    if (lower_headers.includes("text/html")) {
      html_result = decode_transfer_encoding(split.body.trim(), lower_headers);
    } else if (lower_headers.includes("text/plain") && !plain_result) {
      plain_result = decode_transfer_encoding(split.body.trim(), lower_headers);
    }
  }

  if (prefer_html && html_result) return html_result;

  return html_result ?? plain_result;
}

function extract_mime_body(raw: string): string {
  const split = find_header_body_split(raw);

  if (!split) return raw;
  if (!/^content-type\s*:/im.test(split.headers)) return raw;

  const boundary = get_boundary(split.headers);

  if (boundary) {
    const result = extract_text_from_multipart(split.body, boundary, true);

    if (result) return result;
  }

  const lower_headers = split.headers.toLowerCase();

  if (
    lower_headers.includes("text/plain") ||
    lower_headers.includes("text/html")
  ) {
    return decode_transfer_encoding(split.body.trim(), lower_headers);
  }

  return split.body.trim();
}

export function try_extract_mime_body(text: string): string {
  if (!/^content-type\s*:/im.test(text)) return text;

  try {
    return extract_mime_body(text);
  } catch {
    return text;
  }
}

export async function try_decrypt_pgp_body(body_text: string): Promise<string> {
  if (!body_text.includes(PGP_MESSAGE_BEGIN)) return body_text;

  const vault = get_vault_from_memory();
  const passphrase = get_passphrase_from_memory();

  if (!vault || !passphrase) return body_text;

  const secret_key = vault.identity_key;

  if (!secret_key) return body_text;

  try {
    let decrypted = await decrypt_message(body_text, secret_key, passphrase);

    if (/^content-type\s*:/im.test(decrypted)) {
      decrypted = extract_mime_body(decrypted);
    }

    return decrypted;
  } catch {
    return body_text;
  }
}

export async function decrypt_body_text(
  body_text: string,
  user_email: string,
  sender_email: string,
): Promise<string> {
  if (!body_text) return body_text;

  let result = await try_decrypt_ratchet_body(
    body_text,
    user_email,
    sender_email,
  );

  result = await try_decrypt_pgp_body(result);

  if (/^content-type\s*:/im.test(result)) {
    try {
      result = extract_mime_body(result);
    } catch {
      // pass
    }
  }

  return result;
}

export interface RecipientKeyResult {
  email: string;
  has_key: boolean;
  public_key: string | null;
  fingerprint: string | null;
  source: string | null;
}

export interface ExternalEncryptionResult {
  recipients_with_keys: RecipientKeyResult[];
  recipients_without_keys: string[];
  all_have_keys: boolean;
  any_have_keys: boolean;
}

export async function discover_external_recipient_keys(
  emails: string[],
  auto_discover_enabled: boolean,
): Promise<ExternalEncryptionResult> {
  if (!auto_discover_enabled || emails.length === 0) {
    return {
      recipients_with_keys: [],
      recipients_without_keys: emails,
      all_have_keys: false,
      any_have_keys: false,
    };
  }

  const unique_emails = [...new Set(emails.map((e) => e.toLowerCase()))];
  const response = await discover_external_keys_batch(unique_emails);

  if (!response.data) {
    return {
      recipients_with_keys: [],
      recipients_without_keys: unique_emails,
      all_have_keys: false,
      any_have_keys: false,
    };
  }

  const key_map = new Map<string, ExternalKeyInfo>();

  for (const key_info of response.data) {
    key_map.set(key_info.email.toLowerCase(), key_info);
  }

  const recipients_with_keys: RecipientKeyResult[] = [];
  const recipients_without_keys: string[] = [];

  for (const email of unique_emails) {
    const key_info = key_map.get(email.toLowerCase());

    if (key_info?.found && key_info.public_key) {
      let is_valid_key = false;

      try {
        await openpgp.readKey({ armoredKey: key_info.public_key });
        is_valid_key = true;
      } catch {
        is_valid_key = false;
      }

      if (is_valid_key) {
        recipients_with_keys.push({
          email,
          has_key: true,
          public_key: key_info.public_key,
          fingerprint: key_info.fingerprint,
          source: key_info.source,
        });
      } else {
        recipients_without_keys.push(email);
      }
    } else {
      recipients_without_keys.push(email);
    }
  }

  return {
    recipients_with_keys,
    recipients_without_keys,
    all_have_keys:
      recipients_without_keys.length === 0 && recipients_with_keys.length > 0,
    any_have_keys: recipients_with_keys.length > 0,
  };
}

export async function encrypt_for_external_recipients(
  body: string,
  recipient_keys: RecipientKeyResult[],
): Promise<string> {
  const public_keys = recipient_keys
    .filter((r) => r.has_key && r.public_key)
    .map((r) => r.public_key as string);

  if (public_keys.length === 0) {
    return body;
  }

  try {
    return await encrypt_message_multi(body, public_keys);
  } catch {
    return body;
  }
}
