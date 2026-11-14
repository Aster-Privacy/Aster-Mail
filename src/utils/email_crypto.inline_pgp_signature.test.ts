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
import type { ExternalKeyInfo } from "@/services/api/keys";

import * as openpgp from "openpgp";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const PASSPHRASE = "inline signature passphrase";
const OUTSIDE_SENDER = "sender@example.test";
const ASTER_SENDER = "friend@astermail.org";

const h = vi.hoisted(() => ({
  vault: null as unknown,
  discovered: new Map<string, ExternalKeyInfo>(),
  aster_keys: new Map<string, string>(),
  discover_calls: 0,
  pin_status: "first" as "first" | "ok" | "changed" | "unknown",
}));

vi.mock("@/services/crypto/ratchet_identity_pin", async (import_original) => ({
  ...(await import_original<Record<string, unknown>>()),
  check_owner_key_pin: vi.fn(async () => h.pin_status),
}));

vi.mock("@/services/crypto/memory_key_store", () => ({
  on_vault_stored: () => () => {},
  on_vault_cleared: () => () => {},
  get_vault_account_epoch: () => 0,
  get_vault_from_memory: () => h.vault,
  get_passphrase_from_memory: () => PASSPHRASE,
  get_passphrase_bytes: () => new TextEncoder().encode(PASSPHRASE),
  get_derived_encryption_key: () => new Uint8Array(32).fill(7),
  has_vault_in_memory: () => h.vault !== null,
  wait_for_keys_ready: async () => false,
}));

vi.mock("@/services/crypto/external_pgp_key", () => ({
  get_external_decryption_keys: () => [],
  get_external_unlocked_armored_keys: () => [],
  is_external_pgp_key_loading: () => false,
  settle_external_pgp_key_load: async () => {},
  get_external_signing_key: () => null,
}));

vi.mock("@/utils/unsubscribe_detector", () => ({
  detect_unsubscribe_info: () => undefined,
}));

vi.mock("@/services/api/keys", async (import_original) => ({
  ...(await import_original<Record<string, unknown>>()),
  discover_external_key: vi.fn(async (email: string) => {
    h.discover_calls += 1;
    const found = h.discovered.get(email.toLowerCase());

    return found ? { data: found } : { error: "not found" };
  }),
  get_recipient_public_key: vi.fn(async (_username: string, email: string) => {
    const key = h.aster_keys.get(email.toLowerCase());

    return key ? { data: { public_key: key } } : { error: "not found" };
  }),
}));

import { resolve_inbound_pgp_body } from "@/utils/email_crypto";
import { process_envelope_body } from "@/components/email/shared/build_email_from_envelope";

interface ArmoredPair {
  privateKey: string;
  publicKey: string;
}

let own: ArmoredPair;
let sender: ArmoredPair;
let impostor: ArmoredPair;

async function make_key(email: string, passphrase?: string) {
  return openpgp.generateKey({
    type: "ecc",
    curve: "ed25519Legacy",
    userIDs: [{ email }],
    ...(passphrase ? { passphrase } : {}),
    format: "armored",
  });
}

async function seal(text: string, signer?: string): Promise<string> {
  const signing = signer
    ? { signingKeys: await openpgp.readPrivateKey({ armoredKey: signer }) }
    : {};

  return (await openpgp.encrypt({
    message: await openpgp.createMessage({ text }),
    encryptionKeys: await openpgp.readKey({ armoredKey: own.publicKey }),
    ...signing,
    format: "armored",
  })) as string;
}

function discovered(
  public_key: string,
  overrides: Partial<ExternalKeyInfo> = {},
): ExternalKeyInfo {
  return {
    email: OUTSIDE_SENDER,
    found: true,
    public_key,
    fingerprint: null,
    source: "wkd",
    expires_at: null,
    will_encrypt: false,
    fingerprint_change: null,
    ...overrides,
  };
}

function envelope_from(email: string, body_text: string) {
  return {
    version: 1,
    from: { email, name: "Sender" },
    to: [{ email: "owner@astermail.org", name: "" }],
    cc: [],
    bcc: [],
    subject: "Hello",
    sent_at: "2026-11-10T12:00:00.000Z",
    body_text,
    body_html: "",
  } as unknown as Parameters<typeof process_envelope_body>[0];
}

beforeAll(async () => {
  own = await make_key("owner@astermail.org", PASSPHRASE);
  sender = await make_key(OUTSIDE_SENDER);
  impostor = await make_key("impostor@example.test");
}, 60_000);

beforeEach(() => {
  h.vault = { identity_key: own.privateKey, previous_keys: [] };
  h.discovered.clear();
  h.aster_keys.clear();
  h.discover_calls = 0;
  h.pin_status = "first";
});

describe("inline PGP end-to-end badge", () => {
  it("decrypts an unsigned body without marking it verified", async () => {
    h.discovered.set(OUTSIDE_SENDER, discovered(sender.publicKey));
    const resolved = await resolve_inbound_pgp_body(
      await seal("no signature"),
      OUTSIDE_SENDER,
    );

    expect(resolved).toEqual({
      body: "no signature",
      decrypted: true,
      verified: false,
    });
    expect(h.discover_calls).toBe(0);
  });

  it("marks a body signed by the published sender key", async () => {
    h.discovered.set(OUTSIDE_SENDER, discovered(sender.publicKey));
    const resolved = await resolve_inbound_pgp_body(
      await seal("signed by sender", sender.privateKey),
      OUTSIDE_SENDER,
    );

    expect(resolved).toEqual({
      body: "signed by sender",
      decrypted: true,
      verified: true,
    });
  });

  it("keeps the mark when the sender key matches the saved one", async () => {
    h.pin_status = "ok";
    h.discovered.set(OUTSIDE_SENDER, discovered(sender.publicKey));
    const resolved = await resolve_inbound_pgp_body(
      await seal("signed by sender", sender.privateKey),
      OUTSIDE_SENDER,
    );

    expect(resolved.verified).toBe(true);
  });

  it("drops the mark when the sender key differs from the saved one", async () => {
    h.discovered.set(OUTSIDE_SENDER, discovered(sender.publicKey));
    const ciphertext = await seal("signed by sender", sender.privateKey);

    for (const status of ["changed", "unknown"] as const) {
      h.pin_status = status;
      const resolved = await resolve_inbound_pgp_body(
        ciphertext,
        OUTSIDE_SENDER,
      );

      expect(resolved.decrypted).toBe(true);
      expect(resolved.verified).toBe(false);
    }
  });

  it("rejects a signature from a key that does not belong to the sender", async () => {
    h.discovered.set(OUTSIDE_SENDER, discovered(sender.publicKey));
    const resolved = await resolve_inbound_pgp_body(
      await seal("signed by someone else", impostor.privateKey),
      OUTSIDE_SENDER,
    );

    expect(resolved.decrypted).toBe(true);
    expect(resolved.verified).toBe(false);
  });

  it("rejects a sender key from a source the sender does not control", async () => {
    const ciphertext = await seal("signed by sender", sender.privateKey);

    for (const source of ["keyserver", "database", "", null]) {
      h.discovered.set(
        OUTSIDE_SENDER,
        discovered(sender.publicKey, { source }),
      );
      const resolved = await resolve_inbound_pgp_body(
        ciphertext,
        OUTSIDE_SENDER,
      );

      expect(resolved.decrypted).toBe(true);
      expect(resolved.verified).toBe(false);
    }
  });

  it("rejects an expired or unreadable sender key expiry", async () => {
    const ciphertext = await seal("signed by sender", sender.privateKey);

    for (const expires_at of ["2000-01-01T00:00:00.000Z", "not a date"]) {
      h.discovered.set(
        OUTSIDE_SENDER,
        discovered(sender.publicKey, { expires_at }),
      );
      const resolved = await resolve_inbound_pgp_body(
        ciphertext,
        OUTSIDE_SENDER,
      );

      expect(resolved.verified).toBe(false);
    }
  });

  it("does not verify without a sender address or a sender key", async () => {
    const ciphertext = await seal("signed by sender", sender.privateKey);

    expect((await resolve_inbound_pgp_body(ciphertext)).verified).toBe(false);
    expect(
      (await resolve_inbound_pgp_body(ciphertext, OUTSIDE_SENDER)).verified,
    ).toBe(false);
  });

  it("verifies an Aster sender against the Aster key directory", async () => {
    const friend = await make_key(ASTER_SENDER);

    h.aster_keys.set(ASTER_SENDER, friend.publicKey);
    const resolved = await resolve_inbound_pgp_body(
      await seal("from an Aster friend", friend.privateKey),
      ASTER_SENDER,
    );

    expect(resolved.verified).toBe(true);
    expect(h.discover_calls).toBe(0);
  });

  it("badges only the message signed by the sender", async () => {
    h.discovered.set(OUTSIDE_SENDER, discovered(sender.publicKey));

    const unsigned = await process_envelope_body(
      envelope_from(OUTSIDE_SENDER, await seal("server injected")),
    );
    const forged = await process_envelope_body(
      envelope_from(
        OUTSIDE_SENDER,
        await seal("claims to be the sender", impostor.privateKey),
      ),
    );
    const genuine = await process_envelope_body(
      envelope_from(
        OUTSIDE_SENDER,
        await seal("really the sender", sender.privateKey),
      ),
    );

    expect(unsigned.body_text).toContain("server injected");
    expect(unsigned.e2e_verified).toBe(true);
    expect(unsigned.e2e_sender_bound).toBe(false);
    expect(forged.body_text).toContain("claims to be the sender");
    expect(forged.e2e_verified).toBe(true);
    expect(forged.e2e_sender_bound).toBe(false);
    expect(genuine.body_text).toContain("really the sender");
    expect(genuine.e2e_verified).toBe(true);
    expect(genuine.e2e_sender_bound).toBe(true);
  });
});
