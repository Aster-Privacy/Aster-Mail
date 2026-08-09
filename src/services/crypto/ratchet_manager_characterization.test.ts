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

const h = vi.hoisted(() => ({
  passphrase: null as string | null,
}));

vi.mock("@/services/api/client", () => ({
  api_client: {
    get: vi.fn(),
    put: vi.fn(),
    post: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock("@/services/crypto/memory_key_store", () => ({
  get_passphrase_from_memory: () => h.passphrase,
  get_derived_encryption_key: () => null,
  get_vault_from_memory: () => null,
  get_passphrase_bytes: () => null,
  has_passphrase_in_memory: () => h.passphrase !== null,
}));

vi.mock("@/services/api/keys", async (import_original) => {
  const actual = await import_original<Record<string, unknown>>();

  return {
    ...actual,
    get_recipient_public_key: vi.fn(async () => ({ data: null, error: "no" })),
  };
});

import { api_client } from "@/services/api/client";
import {
  derive_conversation_id,
  is_post_quantum_recipient_data,
  build_ratchet_envelope,
  parse_ratchet_envelope,
  upload_prekey_bundle,
  generate_ratchet_keys,
  generate_pq_identity_keys,
  derive_pq_identity_from_seed,
  resolve_pq_identity_secret,
  RecoveryLaneUnavailableError,
  type RatchetRecipientData,
} from "./ratchet_manager";
import { array_to_base64, base64_to_array } from "./base64";
import type { EncryptedVault } from "./key_manager";

function recipient_data(
  overrides: Partial<RatchetRecipientData> = {},
): RatchetRecipientData {
  return {
    ephemeral_key: "eph",
    header: { dh_public: "dh", previous_chain_length: 0, message_number: 0 },
    ciphertext: "ct",
    nonce: "nc",
    ...overrides,
  };
}

describe("derive_conversation_id", () => {
  it("returns the same id regardless of participant order", async () => {
    const a = await derive_conversation_id("a@astermail.org", "b@astermail.org");
    const b = await derive_conversation_id("b@astermail.org", "a@astermail.org");

    expect(a).toBe(b);
  });

  it("ignores address case", async () => {
    const lower = await derive_conversation_id("a@astermail.org", "b@astermail.org");
    const mixed = await derive_conversation_id("A@AsterMail.org", "B@astermail.ORG");

    expect(mixed).toBe(lower);
  });

  it("separates distinct conversations", async () => {
    const one = await derive_conversation_id("a@astermail.org", "b@astermail.org");
    const two = await derive_conversation_id("a@astermail.org", "c@astermail.org");

    expect(one).not.toBe(two);
  });

  it("derives a 256-bit digest encoded as base64", async () => {
    const id = await derive_conversation_id("a@astermail.org", "b@astermail.org");

    expect(base64_to_array(id)).toHaveLength(32);
  });

  it("matches a hand-computed digest of the sorted joined addresses", async () => {
    const expected_digest = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode("a@astermail.org:b@astermail.org"),
    );

    expect(
      await derive_conversation_id("b@astermail.org", "a@astermail.org"),
    ).toBe(array_to_base64(new Uint8Array(expected_digest)));
  });
});

describe("is_post_quantum_recipient_data", () => {
  it("accepts data carrying both a ciphertext and a key id", () => {
    expect(
      is_post_quantum_recipient_data(
        recipient_data({ pq_ciphertext: "pq", pq_key_id: 3 }),
      ),
    ).toBe(true);
  });

  it("accepts a key id of zero", () => {
    expect(
      is_post_quantum_recipient_data(
        recipient_data({ pq_ciphertext: "pq", pq_key_id: 0 }),
      ),
    ).toBe(true);
  });

  it("accepts the signed placeholder key id", () => {
    expect(
      is_post_quantum_recipient_data(
        recipient_data({ pq_ciphertext: "pq", pq_key_id: -1 }),
      ),
    ).toBe(true);
  });

  it("rejects data with a ciphertext but no key id", () => {
    expect(
      is_post_quantum_recipient_data(recipient_data({ pq_ciphertext: "pq" })),
    ).toBe(false);
  });

  it("rejects data with a key id but no ciphertext", () => {
    expect(is_post_quantum_recipient_data(recipient_data({ pq_key_id: 2 }))).toBe(
      false,
    );
  });

  it("rejects classical data, null and undefined", () => {
    expect(is_post_quantum_recipient_data(recipient_data())).toBe(false);
    expect(is_post_quantum_recipient_data(null)).toBe(false);
    expect(is_post_quantum_recipient_data(undefined)).toBe(false);
  });
});

describe("ratchet envelope framing", () => {
  it("round-trips a built envelope through the parser", () => {
    const recipients = { "a@astermail.org": recipient_data() };
    const parsed = parse_ratchet_envelope(
      build_ratchet_envelope("sender-identity", recipients),
    );

    expect(parsed).not.toBeNull();
    expect(parsed?.type).toBe("double_ratchet_v2");
    expect(parsed?.sender_identity_key).toBe("sender-identity");
    expect(parsed?.recipients["a@astermail.org"]).toEqual(recipient_data());
  });

  it("still accepts the v1 envelope type", () => {
    const body = JSON.stringify({
      type: "double_ratchet_v1",
      sender_identity_key: "sender",
      recipients: {},
    });

    expect(parse_ratchet_envelope(body)?.type).toBe("double_ratchet_v1");
  });

  it("rejects bodies that do not start with an object", () => {
    expect(parse_ratchet_envelope("hello")).toBeNull();
    expect(parse_ratchet_envelope("")).toBeNull();
    expect(parse_ratchet_envelope("[1,2]")).toBeNull();
  });

  it("rejects malformed json", () => {
    expect(parse_ratchet_envelope("{not json")).toBeNull();
  });

  it("rejects an unknown envelope type", () => {
    expect(
      parse_ratchet_envelope(
        JSON.stringify({
          type: "double_ratchet_v3",
          sender_identity_key: "s",
          recipients: {},
        }),
      ),
    ).toBeNull();
  });

  it("rejects an envelope missing the sender identity or recipients", () => {
    expect(
      parse_ratchet_envelope(
        JSON.stringify({ type: "double_ratchet_v2", recipients: {} }),
      ),
    ).toBeNull();
    expect(
      parse_ratchet_envelope(
        JSON.stringify({ type: "double_ratchet_v2", sender_identity_key: "s" }),
      ),
    ).toBeNull();
  });
});

describe("RecoveryLaneUnavailableError", () => {
  it("names the recipient and keeps a stable error name", () => {
    const err = new RecoveryLaneUnavailableError("a@astermail.org");

    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe("RecoveryLaneUnavailableError");
    expect(err.message).toContain("a@astermail.org");
  });
});

describe("upload_prekey_bundle", () => {
  beforeEach(() => {
    h.passphrase = null;
    vi.mocked(api_client.put).mockReset();
    vi.mocked(api_client.put).mockResolvedValue({ data: {}, error: undefined });
  });

  it("refuses to upload when the vault has no ratchet identity", async () => {
    const uploaded = await upload_prekey_bundle({
      ratchet_identity_public: "",
      ratchet_signed_prekey_public: "prekey",
    } as unknown as EncryptedVault);

    expect(uploaded).toBe(false);
    expect(api_client.put).not.toHaveBeenCalled();
  });

  it("refuses to upload when the vault has no signed prekey", async () => {
    const uploaded = await upload_prekey_bundle({
      ratchet_identity_public: "identity",
      ratchet_signed_prekey_public: "",
    } as unknown as EncryptedVault);

    expect(uploaded).toBe(false);
    expect(api_client.put).not.toHaveBeenCalled();
  });

  it("falls back to the legacy hash binding with no passphrase in memory", async () => {
    const uploaded = await upload_prekey_bundle({
      identity_key: "armored",
      ratchet_identity_public: "identity",
      ratchet_signed_prekey_public: "prekey",
      ratchet_pq_identity_public: "pq",
    } as unknown as EncryptedVault);

    expect(uploaded).toBe(true);

    const [path, payload] = vi.mocked(api_client.put).mock.calls[0] as [
      string,
      Record<string, unknown>,
    ];

    expect(path).toBe("/crypto/v1/ratchet/prekey-bundle");

    const expected_digest = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode("identityprekey"),
    );

    expect(payload.signed_prekey_signature).toBe(
      array_to_base64(new Uint8Array(expected_digest)),
    );
    expect(payload.kem_identity_key).toBe("identity");
    expect(payload.signed_prekey).toBe("prekey");
    expect(payload.one_time_prekeys).toEqual([]);
    expect(payload.pq_kem_public_key).toBe("pq");
  });

  it("sends a null post-quantum key when the vault has none", async () => {
    await upload_prekey_bundle({
      identity_key: "armored",
      ratchet_identity_public: "identity",
      ratchet_signed_prekey_public: "prekey",
    } as unknown as EncryptedVault);

    const [, payload] = vi.mocked(api_client.put).mock.calls[0] as [
      string,
      Record<string, unknown>,
    ];

    expect(payload.pq_kem_public_key).toBeNull();
  });

  it("reports failure when the upload request errors", async () => {
    vi.mocked(api_client.put).mockResolvedValue({
      data: null,
      error: "server down",
    });

    const uploaded = await upload_prekey_bundle({
      identity_key: "armored",
      ratchet_identity_public: "identity",
      ratchet_signed_prekey_public: "prekey",
    } as unknown as EncryptedVault);

    expect(uploaded).toBe(false);
  });
});

describe("ratchet key generation", () => {
  it("produces distinct exportable identity and prekey material", async () => {
    const keys = await generate_ratchet_keys();

    expect(keys).not.toBeNull();
    expect(keys!.identity_jwk).not.toBe(keys!.signed_prekey_jwk);
    expect(keys!.identity_public).not.toBe(keys!.signed_prekey_public);
    expect(JSON.parse(keys!.identity_jwk).d).toBeTruthy();
    expect(base64_to_array(keys!.pq_identity_seed)).toHaveLength(64);
    expect(base64_to_array(keys!.pq_identity_public)).toHaveLength(1184);
    expect(base64_to_array(keys!.pq_identity_secret)).toHaveLength(2400);
  });

  it("never repeats identity material across calls", async () => {
    const first = await generate_ratchet_keys();
    const second = await generate_ratchet_keys();

    expect(first!.identity_public).not.toBe(second!.identity_public);
    expect(first!.pq_identity_seed).not.toBe(second!.pq_identity_seed);
  });

  it("regenerates the same post-quantum identity from its seed", async () => {
    const keys = await generate_ratchet_keys();
    const derived = derive_pq_identity_from_seed(keys!.pq_identity_seed);

    expect(derived).not.toBeNull();
    expect(derived!.pq_identity_public).toBe(keys!.pq_identity_public);
    expect(derived!.pq_identity_secret).toBe(keys!.pq_identity_secret);
  });

  it("generates standalone post-quantum identities that match their seed", async () => {
    const keys = await generate_pq_identity_keys();
    const derived = derive_pq_identity_from_seed(keys.pq_identity_seed);

    expect(derived!.pq_identity_public).toBe(keys.pq_identity_public);
  });

  it("rejects a seed of the wrong length or unreadable input", () => {
    expect(
      derive_pq_identity_from_seed(array_to_base64(new Uint8Array(32))),
    ).toBeNull();
    expect(derive_pq_identity_from_seed("")).toBeNull();
  });
});

describe("resolve_pq_identity_secret", () => {
  it("prefers a stored secret over the seed", async () => {
    const keys = await generate_pq_identity_keys();

    expect(resolve_pq_identity_secret("stored", keys.pq_identity_seed)).toBe(
      "stored",
    );
  });

  it("derives the secret from the seed when none is stored", async () => {
    const keys = await generate_pq_identity_keys();

    expect(resolve_pq_identity_secret(null, keys.pq_identity_seed)).toBe(
      keys.pq_identity_secret,
    );
  });

  it("returns null when neither a secret nor a seed is available", () => {
    expect(resolve_pq_identity_secret(null, null)).toBeNull();
    expect(resolve_pq_identity_secret(undefined, undefined)).toBeNull();
    expect(resolve_pq_identity_secret("", "")).toBeNull();
  });
});
