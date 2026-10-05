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
import type { TranslationKey } from "@/lib/i18n/types";

export type openpgp_module = typeof import("openpgp");

const LOAD_ATTEMPTS = 3;
const LOAD_RETRY_BASE_DELAY_MS = 250;

export class CryptoModuleLoadError extends Error {
  readonly i18n_key: TranslationKey = "errors.crypto_module_unavailable";
  readonly source: unknown;

  constructor(source: unknown, message = "crypto_module_unavailable") {
    super(message);
    this.name = "CryptoModuleLoadError";
    this.source = source;
  }
}

export function is_crypto_module_load_error(
  value: unknown,
): value is CryptoModuleLoadError {
  return value instanceof CryptoModuleLoadError;
}

let pending: Promise<openpgp_module> | null = null;

function import_openpgp(): Promise<openpgp_module> {
  return Promise.all([
    import("openpgp"),
    import("@/services/crypto/openpgp_limits"),
  ]).then(([openpgp]) => openpgp);
}

async function localized_load_message(): Promise<string | undefined> {
  try {
    const { get_active_translations } = await import("@/lib/i18n/translations");

    return get_active_translations().errors.crypto_module_unavailable;
  } catch {
    return undefined;
  }
}

async function import_with_backoff(): Promise<openpgp_module> {
  let last_error: unknown;

  for (let attempt = 0; attempt < LOAD_ATTEMPTS; attempt++) {
    if (attempt > 0) {
      const delay = LOAD_RETRY_BASE_DELAY_MS * 2 ** (attempt - 1);

      await new Promise((resolve) => setTimeout(resolve, delay));
    }

    try {
      return await import_openpgp();
    } catch (error) {
      last_error = error;
    }
  }

  throw new CryptoModuleLoadError(last_error, await localized_load_message());
}

export function load_openpgp(): Promise<openpgp_module> {
  if (!pending) {
    pending = import_with_backoff().catch((error: unknown) => {
      pending = null;

      throw error;
    });
  }

  return pending;
}

export function preload_openpgp(): void {
  load_openpgp().catch(() => {});
}
