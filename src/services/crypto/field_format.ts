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
export const FIELD_FORMAT_V1 = 1;
export const FIELD_FORMAT_V2 = 2;
export const FIELD_KIND_TEMPLATE = "template";

const AAD_PREFIX = "aster-field-v2";

export type FieldFormatVersion = typeof FIELD_FORMAT_V1 | typeof FIELD_FORMAT_V2;

export interface FieldBinding {
  kind: string;
  field: string;
  record_id?: string | null;
}

let write_v2 = false;

export function set_field_format_write_v2(enabled: boolean): void {
  write_v2 = enabled;
}

export function field_format_write_version(): FieldFormatVersion {
  return write_v2 ? FIELD_FORMAT_V2 : FIELD_FORMAT_V1;
}

export function field_aad(binding: FieldBinding): Uint8Array {
  return new TextEncoder().encode(
    `${AAD_PREFIX}|kind=${binding.kind}|field=${binding.field}|record=${binding.record_id ?? ""}`,
  );
}

export function field_aad_candidates(
  binding: FieldBinding,
): (Uint8Array | undefined)[] {
  const candidates: (Uint8Array | undefined)[] = [];

  if (binding.record_id) candidates.push(field_aad(binding));
  candidates.push(field_aad({ ...binding, record_id: null }));
  candidates.push(undefined);

  return candidates;
}

export function field_write_aad(
  binding: FieldBinding,
  opened_with: Uint8Array | undefined,
): Uint8Array | undefined {
  if (opened_with) return opened_with;

  return write_v2 ? field_aad(binding) : undefined;
}

function gcm_params(
  nonce: Uint8Array,
  additional_data: Uint8Array | undefined,
): AesGcmParams {
  return additional_data
    ? { name: "AES-GCM", iv: nonce, additionalData: additional_data }
    : { name: "AES-GCM", iv: nonce };
}

export async function seal_field(
  key: CryptoKey,
  plaintext: Uint8Array,
  nonce: Uint8Array,
  binding: FieldBinding,
  version: FieldFormatVersion = field_format_write_version(),
): Promise<Uint8Array> {
  const additional_data =
    version === FIELD_FORMAT_V2 ? field_aad(binding) : undefined;

  return new Uint8Array(
    await crypto.subtle.encrypt(
      gcm_params(nonce, additional_data),
      key,
      plaintext,
    ),
  );
}

export async function open_bound_field(
  key: CryptoKey,
  ciphertext: Uint8Array,
  nonce: Uint8Array,
  binding: FieldBinding,
): Promise<Uint8Array | null> {
  const candidates = field_aad_candidates(binding).filter(
    (aad): aad is Uint8Array => aad !== undefined,
  );

  for (const additional_data of candidates) {
    try {
      return new Uint8Array(
        await crypto.subtle.decrypt(
          gcm_params(nonce, additional_data),
          key,
          ciphertext,
        ),
      );
    } catch {
      continue;
    }
  }

  return null;
}
