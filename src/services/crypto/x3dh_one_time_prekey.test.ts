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
  binding_enabled: true,
  one_time_secrets: new Map<number, JsonWebKey>(),
  pq_secrets: new Map<number, Uint8Array>(),
}));

vi.mock("./crypto_enforcement_policy", async (import_original) => {
  const original =
    await import_original<typeof import("./crypto_enforcement_policy")>();

  return {
    ...original,
    is_pqxdh_transcript_binding_enabled: () => h.binding_enabled,
  };
});

vi.mock("./pq_prekey_store", () => ({
  save_pq_secret: vi.fn(async () => {}),
  load_pq_secret: vi.fn(async (key_id: number) => {
    const secret = h.pq_secrets.get(key_id);

    return secret ? new Uint8Array(secret) : null;
  }),
  delete_pq_secret: vi.fn(async () => {}),
}));

vi.mock("./pq_secret_reconciler", () => ({
  handle_missing_pq_secret: vi.fn(async () => {}),
}));

vi.mock("./ec_prekey_store", () => ({
  load_ec_one_time_secret: vi.fn(
    async (key_id: number) => h.one_time_secrets.get(key_id) ?? null,
  ),
}));

import { ml_kem768 } from "@noble/post-quantum/ml-kem.js";

import {
  perform_x3dh_sender,
  perform_x3dh_receiver,
  bundle_offers_one_time_prekey,
  compute_signed_prekey_id,
  negotiate_x3dh_version,
  X3DH_VERSION_LEGACY,
  X3DH_VERSION_KEY_BOUND,
  X3DH_VERSION_ONE_TIME_BOUND,
  type PrekeyBundle,
  type X3dhSenderResult,
} from "./x3dh";

const ONE_TIME_PREKEY_ID = 4242;
const PQ_PREKEY_ID = 77;

function array_to_base64(arr: Uint8Array): string {
  let binary = "";

  arr.forEach((b) => (binary += String.fromCharCode(b)));

  return btoa(binary);
}

function to_hex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function generate_keypair(): Promise<{
  public_key_raw: Uint8Array;
  secret_key_jwk: JsonWebKey;
}> {
  const keypair = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveBits"],
  );

  return {
    public_key_raw: new Uint8Array(
      await crypto.subtle.exportKey("raw", keypair.publicKey),
    ),
    secret_key_jwk: await crypto.subtle.exportKey("jwk", keypair.privateKey),
  };
}

interface PartyOptions {
  x3dh_max_version?: number | null;
  with_one_time_prekey?: boolean;
  with_pq_prekey?: boolean;
}

async function build_parties(options: PartyOptions = {}) {
  const sender_identity = await generate_keypair();
  const recipient_identity = await generate_keypair();
  const recipient_signed_prekey = await generate_keypair();
  const recipient_one_time_prekey = await generate_keypair();

  const bundle: PrekeyBundle = {
    kem_identity_key: array_to_base64(recipient_identity.public_key_raw),
    signed_prekey: array_to_base64(recipient_signed_prekey.public_key_raw),
    signed_prekey_signature: "",
    x3dh_max_version: options.x3dh_max_version,
  };

  if (options.with_one_time_prekey) {
    bundle.ec_one_time_prekey = {
      key_id: ONE_TIME_PREKEY_ID,
      public_key: array_to_base64(recipient_one_time_prekey.public_key_raw),
    };
    h.one_time_secrets.set(ONE_TIME_PREKEY_ID, {
      kty: "EC",
      crv: "P-256",
      d: recipient_one_time_prekey.secret_key_jwk.d,
    });
  }

  if (options.with_pq_prekey) {
    const pq_keypair = ml_kem768.keygen();

    bundle.pq_prekey = {
      key_id: PQ_PREKEY_ID,
      public_key: array_to_base64(pq_keypair.publicKey),
    };
    h.pq_secrets.set(PQ_PREKEY_ID, pq_keypair.secretKey);
  }

  return {
    sender_identity,
    recipient_identity,
    recipient_signed_prekey,
    recipient_one_time_prekey,
    bundle,
  };
}

type Parties = Awaited<ReturnType<typeof build_parties>>;

async function receive(
  parties: Parties,
  sent: X3dhSenderResult,
  overrides: { version?: number; one_time_prekey_id?: number } = {},
): Promise<Uint8Array> {
  return perform_x3dh_receiver(
    parties.recipient_identity.secret_key_jwk,
    parties.recipient_signed_prekey.secret_key_jwk,
    parties.sender_identity.public_key_raw,
    sent.ephemeral_public_key,
    sent.pq_ciphertext && sent.pq_key_id !== undefined
      ? { pq_ciphertext: sent.pq_ciphertext, pq_key_id: sent.pq_key_id }
      : null,
    null,
    overrides.version ?? sent.x3dh_version,
    "one_time_prekey_id" in overrides
      ? overrides.one_time_prekey_id
      : sent.one_time_prekey_id,
  );
}

beforeEach(() => {
  h.binding_enabled = true;
  h.one_time_secrets.clear();
  h.pq_secrets.clear();
});

describe("x3dh one-time bound handshake", () => {
  it("agrees on a classical secret when a one-time prekey is offered", async () => {
    const parties = await build_parties({
      x3dh_max_version: 4,
      with_one_time_prekey: true,
    });

    expect(bundle_offers_one_time_prekey(parties.bundle)).toBe(true);

    const sent = await perform_x3dh_sender(
      parties.sender_identity.secret_key_jwk,
      parties.bundle,
    );

    expect(sent.x3dh_version).toBe(X3DH_VERSION_ONE_TIME_BOUND);
    expect(sent.one_time_prekey_id).toBe(ONE_TIME_PREKEY_ID);
    expect(sent.signed_prekey_id).toBe(
      await compute_signed_prekey_id(
        parties.recipient_signed_prekey.public_key_raw,
      ),
    );
    expect(sent.pq_mode).toBe("none");

    const sender_secret = to_hex(sent.shared_secret);

    expect(to_hex(await receive(parties, sent))).toBe(sender_secret);
  });

  it("agrees on a post-quantum secret when both one-time keys are offered", async () => {
    const parties = await build_parties({
      x3dh_max_version: 4,
      with_one_time_prekey: true,
      with_pq_prekey: true,
    });

    const sent = await perform_x3dh_sender(
      parties.sender_identity.secret_key_jwk,
      parties.bundle,
    );

    expect(sent.x3dh_version).toBe(X3DH_VERSION_ONE_TIME_BOUND);
    expect(sent.pq_mode).toBe("onetime");
    expect(sent.pq_key_id).toBe(PQ_PREKEY_ID);

    const sender_secret = to_hex(sent.shared_secret);

    expect(to_hex(await receive(parties, sent))).toBe(sender_secret);
  });

  it("writes the key bound version when the server advertises three", async () => {
    const parties = await build_parties({
      x3dh_max_version: 3,
      with_one_time_prekey: true,
    });

    expect(bundle_offers_one_time_prekey(parties.bundle)).toBe(false);

    const sent = await perform_x3dh_sender(
      parties.sender_identity.secret_key_jwk,
      parties.bundle,
    );

    expect(sent.x3dh_version).toBe(X3DH_VERSION_KEY_BOUND);
    expect(sent.one_time_prekey_id).toBeUndefined();
    expect(sent.signed_prekey_id).toBeUndefined();

    const sender_secret = to_hex(sent.shared_secret);

    expect(to_hex(await receive(parties, sent))).toBe(sender_secret);
  });

  it("writes the key bound version when the pool is empty", async () => {
    for (const offered of [undefined, null]) {
      const parties = await build_parties({ x3dh_max_version: 4 });

      parties.bundle.ec_one_time_prekey = offered;

      const sent = await perform_x3dh_sender(
        parties.sender_identity.secret_key_jwk,
        parties.bundle,
      );

      expect(sent.x3dh_version).toBe(X3DH_VERSION_KEY_BOUND);
      expect(sent.one_time_prekey_id).toBeUndefined();

      const sender_secret = to_hex(sent.shared_secret);

      expect(to_hex(await receive(parties, sent))).toBe(sender_secret);
    }
  });

  it("never negotiates above the key bound version without a one-time prekey", () => {
    for (const advertised of [4, 5, 99, Infinity]) {
      expect(negotiate_x3dh_version(advertised, null)).toBeLessThanOrEqual(
        X3DH_VERSION_KEY_BOUND,
      );
      expect(negotiate_x3dh_version(advertised, 4)).toBeLessThanOrEqual(
        X3DH_VERSION_KEY_BOUND,
      );
    }
  });

  it("ignores a malformed one-time prekey and writes the key bound version", async () => {
    const malformed: Array<(parties: Parties) => void> = [
      (parties) => {
        parties.bundle.ec_one_time_prekey!.key_id = 0;
      },
      (parties) => {
        parties.bundle.ec_one_time_prekey!.key_id = -3;
      },
      (parties) => {
        parties.bundle.ec_one_time_prekey!.key_id = 0x80000000;
      },
      (parties) => {
        parties.bundle.ec_one_time_prekey!.key_id = 1.5;
      },
      (parties) => {
        parties.bundle.ec_one_time_prekey!.public_key = array_to_base64(
          parties.recipient_one_time_prekey.public_key_raw.slice(0, 33),
        );
      },
      (parties) => {
        const compressed_marker = new Uint8Array(
          parties.recipient_one_time_prekey.public_key_raw,
        );

        compressed_marker[0] = 0x02;
        parties.bundle.ec_one_time_prekey!.public_key =
          array_to_base64(compressed_marker);
      },
      (parties) => {
        const off_curve = new Uint8Array(65);

        off_curve[0] = 0x04;
        off_curve[64] = 0x01;
        parties.bundle.ec_one_time_prekey!.public_key =
          array_to_base64(off_curve);
      },
      (parties) => {
        parties.bundle.ec_one_time_prekey!.public_key = "%%not base64%%";
      },
    ];

    for (const corrupt of malformed) {
      const parties = await build_parties({
        x3dh_max_version: 4,
        with_one_time_prekey: true,
      });

      corrupt(parties);

      const sent = await perform_x3dh_sender(
        parties.sender_identity.secret_key_jwk,
        parties.bundle,
      );

      expect(sent.x3dh_version).toBe(X3DH_VERSION_KEY_BOUND);
      expect(sent.one_time_prekey_id).toBeUndefined();

      const sender_secret = to_hex(sent.shared_secret);

      expect(to_hex(await receive(parties, sent))).toBe(sender_secret);
    }
  });

  it("writes the legacy version when transcript binding is disabled", async () => {
    h.binding_enabled = false;

    const parties = await build_parties({
      x3dh_max_version: 4,
      with_one_time_prekey: true,
    });

    const sent = await perform_x3dh_sender(
      parties.sender_identity.secret_key_jwk,
      parties.bundle,
    );

    expect(sent.x3dh_version).toBe(X3DH_VERSION_LEGACY);
    expect(sent.one_time_prekey_id).toBeUndefined();
  });

  it("fails cleanly once the one-time secret has been deleted", async () => {
    const parties = await build_parties({
      x3dh_max_version: 4,
      with_one_time_prekey: true,
    });

    const sent = await perform_x3dh_sender(
      parties.sender_identity.secret_key_jwk,
      parties.bundle,
    );
    const sender_secret = to_hex(sent.shared_secret);

    expect(to_hex(await receive(parties, sent))).toBe(sender_secret);

    h.one_time_secrets.delete(ONE_TIME_PREKEY_ID);

    await expect(receive(parties, sent)).rejects.toThrow(
      "Missing one-time prekey secret",
    );
  });

  it("refuses a one-time bound message that carries no key id", async () => {
    const parties = await build_parties({
      x3dh_max_version: 4,
      with_one_time_prekey: true,
    });

    const sent = await perform_x3dh_sender(
      parties.sender_identity.secret_key_jwk,
      parties.bundle,
    );

    await expect(
      receive(parties, sent, { one_time_prekey_id: undefined }),
    ).rejects.toThrow("Missing one-time prekey id");
  });

  it("derives a different secret when read as any older version", async () => {
    const parties = await build_parties({
      x3dh_max_version: 4,
      with_one_time_prekey: true,
    });

    const sent = await perform_x3dh_sender(
      parties.sender_identity.secret_key_jwk,
      parties.bundle,
    );
    const sender_secret = to_hex(sent.shared_secret);

    for (const version of [1, 2, 3]) {
      expect(to_hex(await receive(parties, sent, { version }))).not.toBe(
        sender_secret,
      );
    }
  });

  it("derives a different secret with another one-time key under the same id", async () => {
    const parties = await build_parties({
      x3dh_max_version: 4,
      with_one_time_prekey: true,
    });

    const sent = await perform_x3dh_sender(
      parties.sender_identity.secret_key_jwk,
      parties.bundle,
    );
    const sender_secret = to_hex(sent.shared_secret);
    const substitute = await generate_keypair();

    h.one_time_secrets.set(ONE_TIME_PREKEY_ID, {
      kty: "EC",
      crv: "P-256",
      d: substitute.secret_key_jwk.d,
    });

    expect(to_hex(await receive(parties, sent))).not.toBe(sender_secret);
  });
});
