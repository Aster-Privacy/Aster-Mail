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
import type { EncryptedVault } from "./key_manager_core";

import { describe, it, expect } from "vitest";

import { base64_to_array } from "./base64";
import {
  SIGNED_PREKEY_ROTATION_ENABLED,
  SIGNED_PREKEY_ROTATION_INTERVAL_MS,
  SIGNED_PREKEY_RETAINED_LIMIT,
  apply_signed_prekey_rotation,
  generate_signed_prekey,
  rotate_signed_prekey_if_due,
  signed_prekey_rotation_due,
  type FreshSignedPrekey,
  type SignedPrekeyRotationDeps,
} from "./signed_prekey_rotation";
import { compute_signed_prekey_id } from "./x3dh";

function make_vault(index = 0): EncryptedVault {
  return {
    identity_key: "pgp-identity",
    signed_prekey: "pgp-signed-prekey",
    signed_prekey_private: "pgp-signed-prekey-private",
    recovery_codes: [],
    ratchet_identity_key: "identity-private",
    ratchet_identity_public: "identity-public",
    ratchet_signed_prekey: `signed-prekey-private-${index}`,
    ratchet_signed_prekey_public: `signed-prekey-public-${index}`,
    ratchet_pq_identity_key: "pq-private",
    ratchet_pq_identity_public: "pq-public",
    ratchet_pq_identity_seed: "pq-seed",
  };
}

function fresh(index: number): FreshSignedPrekey {
  return {
    signed_prekey_jwk: `signed-prekey-private-${index}`,
    signed_prekey_public: `signed-prekey-public-${index}`,
  };
}

interface Harness {
  deps: SignedPrekeyRotationDeps;
  persisted: EncryptedVault[];
  published: EncryptedVault[];
  recorded: number[];
}

function make_harness(
  overrides: Partial<SignedPrekeyRotationDeps> = {},
): Harness {
  const persisted: EncryptedVault[] = [];
  const published: EncryptedVault[] = [];
  const recorded: number[] = [];

  const deps: SignedPrekeyRotationDeps = {
    enabled: true,
    now: () => 5_000_000_000,
    last_rotated_at: () => null,
    vault: () => make_vault(0),
    generate: async () => fresh(1),
    persist: async (next) => {
      persisted.push(next);

      return next;
    },
    publish: async (vault) => {
      published.push(vault);

      return true;
    },
    record_rotation: (rotated_at) => {
      recorded.push(rotated_at);
    },
    ...overrides,
  };

  return { deps, persisted, published, recorded };
}

describe("signed prekey rotation schedule", () => {
  it("ships with the rotation timer switched off", () => {
    expect(SIGNED_PREKEY_ROTATION_ENABLED).toBe(false);
  });

  it("is never due while the timer is off", () => {
    expect(signed_prekey_rotation_due(null, 1_000)).toBe(false);
    expect(
      signed_prekey_rotation_due(0, SIGNED_PREKEY_ROTATION_INTERVAL_MS * 10),
    ).toBe(false);
    expect(signed_prekey_rotation_due(null, 1_000, false)).toBe(false);
  });

  it("is due once the interval has passed when switched on", () => {
    const start = 1_000_000;

    expect(signed_prekey_rotation_due(null, start, true)).toBe(true);
    expect(signed_prekey_rotation_due(NaN, start, true)).toBe(true);
    expect(signed_prekey_rotation_due(start, start, true)).toBe(false);
    expect(
      signed_prekey_rotation_due(
        start,
        start + SIGNED_PREKEY_ROTATION_INTERVAL_MS - 1,
        true,
      ),
    ).toBe(false);
    expect(
      signed_prekey_rotation_due(
        start,
        start + SIGNED_PREKEY_ROTATION_INTERVAL_MS,
        true,
      ),
    ).toBe(true);
    expect(signed_prekey_rotation_due(start, start - 1, true)).toBe(true);
  });
});

describe("signed prekey replacement", () => {
  it("generates a fresh P-256 key pair", async () => {
    const first = await generate_signed_prekey();
    const second = await generate_signed_prekey();
    const raw = base64_to_array(first.signed_prekey_public);
    const jwk = JSON.parse(first.signed_prekey_jwk) as JsonWebKey;

    expect(raw.length).toBe(65);
    expect(raw[0]).toBe(0x04);
    expect(jwk.kty).toBe("EC");
    expect(jwk.crv).toBe("P-256");
    expect(typeof jwk.d).toBe("string");
    expect(first.signed_prekey_public).not.toBe(second.signed_prekey_public);
    expect(await compute_signed_prekey_id(raw)).toMatch(/^[0-9a-f]{16}$/);
  });

  it("installs the fresh key and keeps the replaced one readable", () => {
    const vault = make_vault(0);
    const next = apply_signed_prekey_rotation(vault, fresh(1));

    expect(next).not.toBeNull();
    expect(next!.ratchet_signed_prekey).toBe("signed-prekey-private-1");
    expect(next!.ratchet_signed_prekey_public).toBe("signed-prekey-public-1");
    expect(next!.ratchet_identity_key).toBe("identity-private");
    expect(next!.ratchet_identity_public).toBe("identity-public");
    expect(next!.ratchet_pq_identity_seed).toBe("pq-seed");
    expect(next!.ratchet_previous_keys).toEqual([
      {
        ratchet_identity_key: "identity-private",
        ratchet_identity_public: "identity-public",
        ratchet_signed_prekey: "signed-prekey-private-0",
        ratchet_signed_prekey_public: "signed-prekey-public-0",
        ratchet_pq_identity_key: "pq-private",
        ratchet_pq_identity_public: "pq-public",
        ratchet_pq_identity_seed: "pq-seed",
      },
    ]);
  });

  it("does not change the vault it was given", () => {
    const vault = make_vault(0);
    const before = JSON.stringify(vault);

    apply_signed_prekey_rotation(vault, fresh(1));

    expect(JSON.stringify(vault)).toBe(before);
  });

  it("keeps the most recently replaced keys first", () => {
    let vault = make_vault(0);

    for (let index = 1; index <= 3; index++) {
      vault = apply_signed_prekey_rotation(vault, fresh(index))!;
    }

    expect(
      vault.ratchet_previous_keys!.map((set) => set.ratchet_signed_prekey_public),
    ).toEqual([
      "signed-prekey-public-2",
      "signed-prekey-public-1",
      "signed-prekey-public-0",
    ]);
  });

  it("bounds how many replaced keys are kept", () => {
    let vault = make_vault(0);
    const rotations = SIGNED_PREKEY_RETAINED_LIMIT + 8;

    for (let index = 1; index <= rotations; index++) {
      vault = apply_signed_prekey_rotation(vault, fresh(index))!;
    }

    const kept = vault.ratchet_previous_keys!;

    expect(kept).toHaveLength(SIGNED_PREKEY_RETAINED_LIMIT);
    expect(kept[0].ratchet_signed_prekey_public).toBe(
      `signed-prekey-public-${rotations - 1}`,
    );
    expect(
      kept.some(
        (set) => set.ratchet_signed_prekey_public === "signed-prekey-public-0",
      ),
    ).toBe(false);
    expect(vault.ratchet_signed_prekey_public).toBe(
      `signed-prekey-public-${rotations}`,
    );
  });

  it("refuses a vault without ratchet keys", () => {
    const vault = make_vault(0);

    delete vault.ratchet_signed_prekey;

    expect(apply_signed_prekey_rotation(vault, fresh(1))).toBeNull();
  });

  it("refuses an empty or unchanged replacement", () => {
    const vault = make_vault(0);

    expect(
      apply_signed_prekey_rotation(vault, {
        signed_prekey_jwk: "",
        signed_prekey_public: "signed-prekey-public-1",
      }),
    ).toBeNull();
    expect(
      apply_signed_prekey_rotation(vault, {
        signed_prekey_jwk: "signed-prekey-private-1",
        signed_prekey_public: "",
      }),
    ).toBeNull();
    expect(apply_signed_prekey_rotation(vault, fresh(0))).toBeNull();
  });
});

describe("signed prekey rotation run", () => {
  it("does nothing by default", async () => {
    const harness = make_harness();

    delete harness.deps.enabled;

    expect(await rotate_signed_prekey_if_due(harness.deps)).toBe("disabled");
    expect(harness.persisted).toHaveLength(0);
    expect(harness.published).toHaveLength(0);
    expect(harness.recorded).toHaveLength(0);
  });

  it("does nothing when explicitly off", async () => {
    const harness = make_harness({ enabled: false });

    expect(await rotate_signed_prekey_if_due(harness.deps)).toBe("disabled");
    expect(harness.persisted).toHaveLength(0);
  });

  it("waits until the interval has passed", async () => {
    const harness = make_harness({
      last_rotated_at: () => 5_000_000_000 - 1_000,
    });

    expect(await rotate_signed_prekey_if_due(harness.deps)).toBe("not_due");
    expect(harness.persisted).toHaveLength(0);
    expect(harness.recorded).toHaveLength(0);
  });

  it("stores, publishes and records a rotation that is due", async () => {
    const harness = make_harness();

    expect(await rotate_signed_prekey_if_due(harness.deps)).toBe("rotated");
    expect(harness.persisted).toHaveLength(1);
    expect(harness.persisted[0].ratchet_signed_prekey_public).toBe(
      "signed-prekey-public-1",
    );
    expect(
      harness.persisted[0].ratchet_previous_keys![0]
        .ratchet_signed_prekey_public,
    ).toBe("signed-prekey-public-0");
    expect(harness.published).toEqual(harness.persisted);
    expect(harness.recorded).toEqual([5_000_000_000]);
  });

  it("publishes nothing when the vault cannot be stored", async () => {
    const harness = make_harness({ persist: async () => null });

    expect(await rotate_signed_prekey_if_due(harness.deps)).toBe("failed");
    expect(harness.published).toHaveLength(0);
    expect(harness.recorded).toHaveLength(0);
  });

  it("does not record a rotation that was not published", async () => {
    const harness = make_harness({ publish: async () => false });

    expect(await rotate_signed_prekey_if_due(harness.deps)).toBe("failed");
    expect(harness.recorded).toHaveLength(0);
  });

  it("fails without throwing when a step throws", async () => {
    const without_vault = make_harness({ vault: () => null });
    const broken_generator = make_harness({
      generate: async () => {
        throw new Error("no entropy");
      },
    });
    const broken_store = make_harness({
      persist: async () => {
        throw new Error("storage closed");
      },
    });

    expect(await rotate_signed_prekey_if_due(without_vault.deps)).toBe(
      "failed",
    );
    expect(await rotate_signed_prekey_if_due(broken_generator.deps)).toBe(
      "failed",
    );
    expect(await rotate_signed_prekey_if_due(broken_store.deps)).toBe("failed");
    expect(broken_store.published).toHaveLength(0);
    expect(broken_store.recorded).toHaveLength(0);
  });
});
