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
import { describe, it, expect, vi } from "vitest";

vi.mock("@/services/crypto/key_manager", () => ({
  generate_identity_keypair: vi.fn(async () => ({
    public_key: "public",
    secret_key: "-----BEGIN PGP PRIVATE KEY BLOCK-----new",
    fingerprint: "ABC",
  })),
  prepare_pgp_key_data: vi.fn(async () => ({ fingerprint: "ABC" })),
}));

import {
  build_identity_key_install,
  derive_missing_identity_keks,
  vault_lacks_identity_key,
} from "./install_missing_identity_key";

import { array_to_base64 } from "@/services/crypto/base64";

async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(text),
  );

  return array_to_base64(new Uint8Array(digest));
}

describe("install_missing_identity_key", () => {
  it("only flags vaults that exist without an identity key", () => {
    expect(vault_lacks_identity_key(null)).toBe(false);
    expect(vault_lacks_identity_key({ identity_key: "key" } as never)).toBe(
      false,
    );
    expect(vault_lacks_identity_key({} as never)).toBe(true);
    expect(vault_lacks_identity_key({ identity_key: "" } as never)).toBe(true);
  });

  it("derives the keys data was written with while the identity key was missing", async () => {
    const keks = await derive_missing_identity_keks();
    const encoded = keks.map((raw) => array_to_base64(raw));

    expect(encoded).toContain(
      await sha256("undefinedastermail-preferences-v1"),
    );
    expect(encoded).toContain(await sha256("undefinedastermail-draft-v2"));
    expect(encoded).toContain(await sha256("undefinedastermail-labels-v1"));
  });

  it("installs a new identity key and keeps old data readable", async () => {
    const existing = { k: "existing", added_at: "2026-01-01T00:00:00.000Z" };
    const { new_vault, pgp_key_data } = await build_identity_key_install(
      {
        identity_private_key: "ratchet",
        legacy_keks: [existing],
      } as never,
      "passphrase",
      "zein@astermail.org",
      "zein",
    );

    expect(new_vault.identity_key).toContain("BEGIN PGP PRIVATE KEY");
    expect(
      (new_vault as unknown as Record<string, unknown>).identity_private_key,
    ).toBe("ratchet");
    expect(pgp_key_data).toEqual({ fingerprint: "ABC" });

    const kek_values = (new_vault.legacy_keks ?? []).map((entry) => entry.k);

    expect(kek_values).toContain(
      await sha256("undefinedastermail-preferences-v1"),
    );
    expect(kek_values).toContain("existing");
  });
});
