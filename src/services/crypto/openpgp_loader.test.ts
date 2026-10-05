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
import { afterEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ failures_left: 0, attempts: 0 }));

vi.mock("@/services/crypto/openpgp_limits", async (import_original) => {
  h.attempts += 1;

  if (h.failures_left > 0) {
    h.failures_left -= 1;

    throw new TypeError("Failed to fetch dynamically imported module");
  }

  return import_original();
});

vi.mock("@/lib/chunk_recovery", async (import_original) => {
  const actual = await import_original<typeof import("@/lib/chunk_recovery")>();

  return { ...actual, trigger_chunk_recovery: vi.fn(() => true) };
});

import {
  CryptoModuleLoadError,
  is_crypto_module_load_error,
  load_openpgp,
} from "@/services/crypto/openpgp_loader";
import { trigger_chunk_recovery } from "@/lib/chunk_recovery";
import { en } from "@/lib/i18n/translations/en";

describe("load_openpgp", () => {
  afterEach(() => {
    h.failures_left = 0;
    h.attempts = 0;
  });

  it("settles with a CryptoModuleLoadError after its retries, without a recovery reload", async () => {
    h.failures_left = 3;

    const error = await load_openpgp().catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(CryptoModuleLoadError);
    expect(is_crypto_module_load_error(error)).toBe(true);
    expect((error as CryptoModuleLoadError).i18n_key).toBe(
      "errors.crypto_module_unavailable",
    );
    expect((error as Error).message).toBe(en.errors.crypto_module_unavailable);
    expect(h.attempts).toBe(3);
    expect(trigger_chunk_recovery).not.toHaveBeenCalled();
  });

  it("recovers on a later call, retrying a transient failure within it", async () => {
    h.failures_left = 4;

    await expect(load_openpgp()).rejects.toBeInstanceOf(CryptoModuleLoadError);

    const openpgp = await load_openpgp();

    expect(typeof openpgp.readKey).toBe("function");
    expect(h.attempts).toBe(5);
  });

  it("shares one module load across callers", () => {
    expect(load_openpgp()).toBe(load_openpgp());
  });

  it("applies the decompression limit before handing out the module", async () => {
    const openpgp = await load_openpgp();
    const { MAX_DECOMPRESSED_MESSAGE_SIZE } =
      await import("@/services/crypto/openpgp_limits");

    expect(openpgp.config.maxDecompressedMessageSize).toBe(
      MAX_DECOMPRESSED_MESSAGE_SIZE,
    );
  });

  it("returns a working openpgp module", async () => {
    const openpgp = await load_openpgp();
    const message = await openpgp.createMessage({ text: "hello" });
    const armored = await openpgp.encrypt({
      message,
      passwords: ["secret"],
    });
    const decrypted = await openpgp.decrypt({
      message: await openpgp.readMessage({ armoredMessage: armored }),
      passwords: ["secret"],
    });

    expect(decrypted.data).toBe("hello");
  });
});
