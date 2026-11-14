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
import { argon2idAsync } from "@noble/hashes/argon2";

import { array_to_base64, base64_to_array } from "./envelope";
import { zero_uint8_array } from "./secure_memory";

export interface SecureViewPasswordKdf {
  algorithm: string;
  version: number;
  memory_kib: number;
  iterations: number;
  parallelism: number;
  key_length: number;
  salt: string;
}

const KDF_ALGORITHM = "argon2id";
const KDF_VERSION = 19;
const KEY_LENGTH = 32;
const MIN_MEMORY_KIB = 8;
const MAX_MEMORY_KIB = 262144;
const MAX_ITERATIONS = 16;
const MAX_PARALLELISM = 16;
const MIN_SALT_BYTES = 8;
const MAX_SALT_BYTES = 64;

function in_range(value: unknown, min: number, max: number): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= min &&
    value <= max
  );
}

export function is_supported_secure_view_kdf(
  kdf: SecureViewPasswordKdf | null | undefined,
): kdf is SecureViewPasswordKdf {
  if (!kdf) return false;

  return (
    kdf.algorithm === KDF_ALGORITHM &&
    kdf.version === KDF_VERSION &&
    kdf.key_length === KEY_LENGTH &&
    in_range(kdf.parallelism, 1, MAX_PARALLELISM) &&
    in_range(kdf.iterations, 1, MAX_ITERATIONS) &&
    in_range(
      kdf.memory_kib,
      Math.max(MIN_MEMORY_KIB, 8 * kdf.parallelism),
      MAX_MEMORY_KIB,
    ) &&
    typeof kdf.salt === "string" &&
    kdf.salt.length > 0
  );
}

export async function derive_secure_view_key(
  password: string,
  kdf: SecureViewPasswordKdf,
): Promise<string> {
  if (!is_supported_secure_view_kdf(kdf)) {
    throw new Error("secure_view_kdf_unsupported");
  }

  const salt = base64_to_array(kdf.salt);

  if (salt.length < MIN_SALT_BYTES || salt.length > MAX_SALT_BYTES) {
    throw new Error("secure_view_kdf_unsupported");
  }

  const password_bytes = new TextEncoder().encode(password);

  try {
    const key = await argon2idAsync(password_bytes, salt, {
      m: kdf.memory_kib,
      t: kdf.iterations,
      p: kdf.parallelism,
      dkLen: KEY_LENGTH,
      version: KDF_VERSION,
    });
    const encoded = array_to_base64(key);

    zero_uint8_array(key);

    return encoded;
  } finally {
    zero_uint8_array(password_bytes);
  }
}
