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

const generate_ratchet_keys = vi.fn();
const upload_prekey_bundle = vi.fn();

vi.mock("@/services/crypto/ratchet_manager", () => ({
  generate_ratchet_keys: () => generate_ratchet_keys(),
  upload_prekey_bundle: (vault: unknown) => upload_prekey_bundle(vault),
}));

import {
  build_registration_ratchet_fields,
  publish_registration_prekey_bundle,
} from "./use_registration";

import type { EncryptedVault } from "@/services/crypto/key_manager_core";

const generated = {
  identity_jwk: "identity_jwk_value",
  identity_public: "identity_public_value",
  signed_prekey_jwk: "signed_prekey_jwk_value",
  signed_prekey_public: "signed_prekey_public_value",
  pq_identity_secret: "pq_identity_secret_value",
  pq_identity_public: "pq_identity_public_value",
  pq_identity_seed: "pq_identity_seed_value",
};

function base_vault(): EncryptedVault {
  return {
    identity_key: "identity",
    signed_prekey: "spk",
    signed_prekey_private: "spk_private",
    recovery_codes: [],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("registration prekey bundle", () => {
  it("maps generated keys onto the vault field names the readers expect", async () => {
    generate_ratchet_keys.mockResolvedValue(generated);

    const fields = await build_registration_ratchet_fields();

    expect(fields).toEqual({
      ratchet_identity_key: "identity_jwk_value",
      ratchet_identity_public: "identity_public_value",
      ratchet_signed_prekey: "signed_prekey_jwk_value",
      ratchet_signed_prekey_public: "signed_prekey_public_value",
      ratchet_pq_identity_key: "pq_identity_secret_value",
      ratchet_pq_identity_public: "pq_identity_public_value",
      ratchet_pq_identity_seed: "pq_identity_seed_value",
      ratchet_regen_v4_done: true,
    });
  });

  it("returns no fields instead of throwing when key generation fails", async () => {
    generate_ratchet_keys.mockRejectedValue(new Error("no subtle crypto"));

    await expect(build_registration_ratchet_fields()).resolves.toEqual({});
  });

  it("returns no fields when key generation yields null", async () => {
    generate_ratchet_keys.mockResolvedValue(null);

    await expect(build_registration_ratchet_fields()).resolves.toEqual({});
  });

  it("uploads the bundle when the vault carries ratchet publics", async () => {
    upload_prekey_bundle.mockResolvedValue(true);

    const vault: EncryptedVault = {
      ...base_vault(),
      ratchet_identity_public: "identity_public_value",
      ratchet_signed_prekey_public: "signed_prekey_public_value",
    };

    await expect(publish_registration_prekey_bundle(vault)).resolves.toBe(true);
    expect(upload_prekey_bundle).toHaveBeenCalledTimes(1);
    expect(upload_prekey_bundle).toHaveBeenCalledWith(vault);
  });

  it("retries once before giving up", async () => {
    upload_prekey_bundle
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);

    const vault: EncryptedVault = {
      ...base_vault(),
      ratchet_identity_public: "identity_public_value",
      ratchet_signed_prekey_public: "signed_prekey_public_value",
    };

    await expect(publish_registration_prekey_bundle(vault)).resolves.toBe(true);
    expect(upload_prekey_bundle).toHaveBeenCalledTimes(2);
  });

  it("never throws when the upload rejects", async () => {
    upload_prekey_bundle.mockRejectedValue(new Error("network down"));

    const vault: EncryptedVault = {
      ...base_vault(),
      ratchet_identity_public: "identity_public_value",
      ratchet_signed_prekey_public: "signed_prekey_public_value",
    };

    await expect(publish_registration_prekey_bundle(vault)).resolves.toBe(
      false,
    );
  });

  it("skips the upload when the vault has no ratchet publics", async () => {
    await expect(
      publish_registration_prekey_bundle(base_vault()),
    ).resolves.toBe(false);
    expect(upload_prekey_bundle).not.toHaveBeenCalled();
  });
});
