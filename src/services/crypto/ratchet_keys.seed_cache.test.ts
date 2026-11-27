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
import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => ({ keygens: 0 }));

vi.mock("@noble/post-quantum/ml-kem.js", async (import_original) => {
  const actual =
    await import_original<typeof import("@noble/post-quantum/ml-kem.js")>();

  return {
    ...actual,
    ml_kem768: {
      ...actual.ml_kem768,
      keygen: (seed?: Uint8Array) => {
        h.keygens += 1;

        return actual.ml_kem768.keygen(seed);
      },
    },
  };
});

import { array_to_base64 } from "./base64";
import {
  clear_pq_seed_identity_cache,
  derive_pq_identity_from_seed,
  resolve_pq_identity_secret,
} from "./ratchet_keys";

function seed(fill: number): string {
  return array_to_base64(new Uint8Array(64).fill(fill));
}

describe("seed-derived PQ identities", () => {
  beforeEach(() => {
    clear_pq_seed_identity_cache();
    h.keygens = 0;
  });

  it("runs keygen once per seed across many decrypts", () => {
    const seeds = [seed(1), seed(2), seed(3)];
    const first = seeds.map((s) => derive_pq_identity_from_seed(s));

    for (let i = 0; i < 50; i++) {
      for (const s of seeds) {
        expect(resolve_pq_identity_secret(null, s)).toBe(
          first[seeds.indexOf(s)]?.pq_identity_secret,
        );
      }
    }

    expect(h.keygens).toBe(3);
  });

  it("derives the same keys as an uncached keygen", () => {
    const cached = derive_pq_identity_from_seed(seed(4));

    clear_pq_seed_identity_cache();

    expect(derive_pq_identity_from_seed(seed(4))).toEqual(cached);
    expect(h.keygens).toBe(2);
  });

  it("hands out copies the caller cannot change", () => {
    const first = derive_pq_identity_from_seed(seed(5));

    if (first) first.pq_identity_secret = "changed";

    expect(derive_pq_identity_from_seed(seed(5))?.pq_identity_secret).not.toBe(
      "changed",
    );
  });

  it("derives again after the cache is cleared with the vault", () => {
    derive_pq_identity_from_seed(seed(6));
    clear_pq_seed_identity_cache();
    derive_pq_identity_from_seed(seed(6));

    expect(h.keygens).toBe(2);
  });

  it("remembers an invalid seed without retrying keygen", () => {
    expect(
      derive_pq_identity_from_seed(array_to_base64(new Uint8Array(3))),
    ).toBe(null);
    expect(
      derive_pq_identity_from_seed(array_to_base64(new Uint8Array(3))),
    ).toBe(null);
    expect(h.keygens).toBe(0);
  });
});
