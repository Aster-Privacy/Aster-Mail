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
import { describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ failures_left: 0, retry_calls: 0 }));

vi.mock("@/utils/lazy_with_retry", async (import_original) => {
  const actual =
    await import_original<typeof import("@/utils/lazy_with_retry")>();

  return {
    ...actual,
    import_with_retry: <T>(import_fn: () => Promise<T>) => {
      h.retry_calls += 1;

      if (h.failures_left > 0) {
        h.failures_left -= 1;

        return Promise.reject(new Error("chunk load failed"));
      }

      return actual.import_with_retry(import_fn, 0, 0);
    },
  };
});

import { load_openpgp } from "@/services/crypto/openpgp_loader";
import { MAX_DECOMPRESSED_MESSAGE_SIZE } from "@/services/crypto/openpgp_limits";

describe("load_openpgp", () => {
  it("loads through the chunk retry helper and retries after a failure", async () => {
    h.failures_left = 1;

    await expect(load_openpgp()).rejects.toThrow("chunk load failed");

    const openpgp = await load_openpgp();

    expect(typeof openpgp.readKey).toBe("function");
    expect(h.retry_calls).toBe(2);
  });

  it("shares one module load across callers", () => {
    expect(load_openpgp()).toBe(load_openpgp());
  });

  it("applies the decompression limit before handing out the module", async () => {
    const openpgp = await load_openpgp();

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
