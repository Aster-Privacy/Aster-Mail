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
  abuse_block_message,
  abuse_message_key,
  build_registration_ratchet_fields,
  publish_registration_prekey_bundle,
  register_error_message,
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

    await expect(
      publish_registration_prekey_bundle(vault, [0, 0]),
    ).resolves.toBe(true);
    expect(upload_prekey_bundle).toHaveBeenCalledTimes(2);
  });

  it("keeps retrying through every backoff step before giving up", async () => {
    upload_prekey_bundle.mockResolvedValue(false);

    const vault: EncryptedVault = {
      ...base_vault(),
      ratchet_identity_public: "identity_public_value",
      ratchet_signed_prekey_public: "signed_prekey_public_value",
    };

    await expect(
      publish_registration_prekey_bundle(vault, [0, 0]),
    ).resolves.toBe(false);
    expect(upload_prekey_bundle).toHaveBeenCalledTimes(3);
  });

  it("never throws when the upload rejects", async () => {
    upload_prekey_bundle.mockRejectedValue(new Error("network down"));

    const vault: EncryptedVault = {
      ...base_vault(),
      ratchet_identity_public: "identity_public_value",
      ratchet_signed_prekey_public: "signed_prekey_public_value",
    };

    await expect(
      publish_registration_prekey_bundle(vault, [0, 0]),
    ).resolves.toBe(false);
    expect(upload_prekey_bundle).toHaveBeenCalledTimes(3);
  });

  it("skips the upload when the vault has no ratchet publics", async () => {
    await expect(
      publish_registration_prekey_bundle(base_vault()),
    ).resolves.toBe(false);
    expect(upload_prekey_bundle).not.toHaveBeenCalled();
  });
});

const fake_t = (key: string, params?: Record<string, string | number>) =>
  params ? `${key}:${JSON.stringify(params)}` : key;

describe("registration block messages", () => {
  it("maps each block kind to its own message", () => {
    expect(abuse_message_key("device")).toBe("auth.abuse_blocked_device");
    expect(abuse_message_key("network")).toBe("auth.abuse_blocked_network");
    expect(abuse_message_key("proof")).toBe("auth.abuse_blocked_proof");
    expect(abuse_message_key("fan_out")).toBe("auth.abuse_blocked_risk");
    expect(abuse_message_key("risk")).toBe("auth.abuse_blocked_risk");
    expect(abuse_message_key(null)).toBe("auth.abuse_flagged_message");
  });

  it("keeps the reference next to the message", () => {
    expect(
      abuse_block_message({ kind: "network", reference: "0a1b2c3d" }, fake_t),
    ).toBe(
      'auth.abuse_blocked_network auth.abuse_block_reference:{"reference":"0a1b2c3d"}',
    );
    expect(abuse_block_message({ kind: null, reference: null }, fake_t)).toBe(
      "auth.abuse_flagged_message",
    );
  });

  it("translates known register error codes instead of the server text", () => {
    expect(
      register_error_message(
        { error: "raw", code: "SERVER_ERROR", server_code: "SERVICE_UNAVAILABLE" },
        fake_t,
      ),
    ).toBe("auth.sign_up_temporarily_unavailable");
    expect(
      register_error_message(
        { error: "raw", code: "FORBIDDEN", server_code: "CAPTCHA_FAILED" },
        fake_t,
      ),
    ).toBe("auth.complete_captcha_first");
    expect(
      register_error_message(
        { error: "raw", code: "NOT_FOUND", server_code: "GONE" },
        fake_t,
      ),
    ).toBe("settings.fam_kids_claim_invalid_title");
    expect(
      register_error_message({ error: "raw", code: "RATE_LIMIT_EXCEEDED" }, fake_t),
    ).toBe("errors.rate_limited");
    expect(register_error_message({ error: "kept" }, fake_t)).toBe("kept");
    expect(register_error_message({}, fake_t)).toBe("auth.registration_failed");
  });
});
