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

type importKeyFn = typeof crypto.subtle.importKey;

const AES_KW = "AES-KW";

let serialized: Promise<unknown> = Promise.resolve();

function algorithm_name(algorithm: Parameters<importKeyFn>[2]): string {
  return typeof algorithm === "string" ? algorithm : algorithm?.name;
}

function unsupported_error(): Error {
  const error = new Error("AES-KW is unavailable in this runtime");

  error.name = "NotSupportedError";

  return error;
}

async function run_with_software_aes_kw<T>(
  operation: () => Promise<T>,
): Promise<T> {
  const subtle = globalThis.crypto?.subtle;

  if (!subtle?.importKey) {
    return operation();
  }

  const original = subtle.importKey;
  const call_original = original.bind(subtle) as importKeyFn;

  const patched = ((...args: Parameters<importKeyFn>) => {
    if (algorithm_name(args[2]) === AES_KW) {
      return Promise.reject(unsupported_error());
    }

    return call_original(...args);
  }) as importKeyFn;

  subtle.importKey = patched;

  try {
    return await operation();
  } finally {
    if (subtle.importKey === patched) {
      subtle.importKey = original;
    }
  }
}

export async function with_aes_kw_fallback<T>(
  operation: () => Promise<T>,
): Promise<T> {
  try {
    return await operation();
  } catch (first_error) {
    const attempt = serialized
      .catch(() => undefined)
      .then(() => run_with_software_aes_kw(operation));

    serialized = attempt.catch(() => undefined);

    try {
      return await attempt;
    } catch {
      throw first_error;
    }
  }
}
