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
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./auth_salt_guard", async (import_original) => ({
  ...(await import_original<typeof import("./auth_salt_guard")>()),
  list_known_login_salts: () => ["c2FsdHNhbHRzYWx0c2FsdA=="],
}));

vi.mock("./memory_key_store", async (import_original) => ({
  ...(await import_original<typeof import("./memory_key_store")>()),
  get_passphrase_bytes: () => null,
  get_vault_from_memory: () => null,
}));

import { array_to_base64 } from "./base64";
import {
  clear_legacy_keks_from_memory,
  get_legacy_crypto_keys,
  load_legacy_keks_into_memory,
} from "./legacy_keks";
import {
  clear_server_derivable_cache,
  is_server_derivable_fallback,
} from "./server_derivable_keks";

import { api_client } from "@/services/api/client";

const PASSPHRASE = new TextEncoder().encode("correct horse battery staple");

function retired_salt(seed: number): string {
  return array_to_base64(new Uint8Array(16).fill(seed));
}

async function vault_fallback_key(): Promise<CryptoKey> {
  await load_legacy_keks_into_memory([
    {
      k: array_to_base64(crypto.getRandomValues(new Uint8Array(32))),
      added_at: "2026-01-01T00:00:00Z",
    },
  ]);

  return get_legacy_crypto_keys()[0];
}

describe("server derivable fallback keys", () => {
  beforeEach(() => {
    clear_server_derivable_cache();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    clear_legacy_keks_from_memory();
    clear_server_derivable_cache();
  });

  it("treats a fallback open as server derivable while retired salts cannot load", async () => {
    const get = vi
      .spyOn(api_client, "get")
      .mockResolvedValue({ error: "unavailable" });
    const key = await vault_fallback_key();

    expect(await is_server_derivable_fallback(key, PASSPHRASE)).toBe(true);

    get.mockResolvedValue({ data: { retired_salts: [] } });

    expect(await is_server_derivable_fallback(key, PASSPHRASE)).toBe(false);
  });

  it("treats a fallback open as server derivable when the retired salt list is too long", async () => {
    vi.spyOn(api_client, "get").mockResolvedValue({
      data: {
        retired_salts: Array.from({ length: 9 }, (_, index) =>
          retired_salt(index + 1),
        ),
      },
    });
    const key = await vault_fallback_key();

    expect(await is_server_derivable_fallback(key, PASSPHRASE)).toBe(true);
  });

  it("derives each login hash once for concurrent opens", async () => {
    vi.spyOn(api_client, "get").mockResolvedValue({
      data: { retired_salts: [] },
    });
    const derive = vi.spyOn(crypto.subtle, "deriveBits");
    const key = await vault_fallback_key();

    const results = await Promise.all(
      [0, 1, 2].map(() => is_server_derivable_fallback(key, PASSPHRASE)),
    );
    const pbkdf2_calls = derive.mock.calls.filter(
      ([params]) => (params as { name: string }).name === "PBKDF2",
    );

    expect(results).toEqual([false, false, false]);
    expect(pbkdf2_calls).toHaveLength(1);
  });
});
