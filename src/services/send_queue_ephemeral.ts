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
import { array_to_base64 } from "./crypto/envelope";

const FIELD_ID_RECIPIENTS = 0x01;
const FIELD_ID_SUBJECT = 0x02;
const FIELD_ID_BODY = 0x03;

function derive_field_nonce(
  base_nonce: Uint8Array,
  field_id: number,
): Uint8Array {
  const derived = new Uint8Array(12);

  derived.set(base_nonce.subarray(0, 11));
  derived[11] = base_nonce[11] ^ field_id;

  return derived;
}

export async function encrypt_with_ephemeral_key(
  recipients: { to: string[]; cc?: string[]; bcc?: string[] },
  subject: string,
  body: string,
): Promise<{
  encrypted_recipients: string;
  encrypted_subject: string;
  encrypted_body: string;
  ephemeral_key: string;
  nonce: string;
}> {
  const key = await crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt"],
  );

  const base_nonce = crypto.getRandomValues(new Uint8Array(12));

  const encoder = new TextEncoder();

  const recipients_nonce = derive_field_nonce(base_nonce, FIELD_ID_RECIPIENTS);
  const recipients_data = encoder.encode(JSON.stringify(recipients));
  const encrypted_recipients_buffer = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: recipients_nonce },
    key,
    recipients_data,
  );

  const subject_nonce = derive_field_nonce(base_nonce, FIELD_ID_SUBJECT);
  const subject_data = encoder.encode(subject);
  const encrypted_subject_buffer = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: subject_nonce },
    key,
    subject_data,
  );

  const body_nonce = derive_field_nonce(base_nonce, FIELD_ID_BODY);
  const body_data = encoder.encode(body);
  const encrypted_body_buffer = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: body_nonce },
    key,
    body_data,
  );

  const raw_key = await crypto.subtle.exportKey("raw", key);

  return {
    encrypted_recipients: array_to_base64(
      new Uint8Array(encrypted_recipients_buffer),
    ),
    encrypted_subject: array_to_base64(
      new Uint8Array(encrypted_subject_buffer),
    ),
    encrypted_body: array_to_base64(new Uint8Array(encrypted_body_buffer)),
    ephemeral_key: array_to_base64(new Uint8Array(raw_key)),
    nonce: array_to_base64(base_nonce),
  };
}
