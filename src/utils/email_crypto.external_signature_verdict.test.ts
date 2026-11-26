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

const PASSPHRASE = "external signature passphrase";
const OUTSIDE_SENDER = "sender@example.test";
const OWNER = "owner@astermail.org";

const h = vi.hoisted(() => ({
  vault: null as unknown,
  discovered: new Map<string, ExternalKeyInfo>(),
}));

vi.mock("@/services/crypto/ratchet_identity_pin", async (import_original) => ({
  ...(await import_original<Record<string, unknown>>()),
  check_owner_key_pin: vi.fn(async () => "first"),
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
    const found = h.discovered.get(email.toLowerCase());

    return found ? { data: found } : { error: "not found" };
  }),
  get_recipient_public_key: vi.fn(async () => ({ error: "not found" })),
}));

import { resolve_inbound_pgp_body } from "@/utils/email_crypto";
import { process_envelope_body } from "@/components/email/shared/build_email_from_envelope";
import {
  displayed_sender_verification,
  shows_end_to_end,
} from "@/services/crypto/sent_encryption_evidence";

interface ArmoredPair {
  privateKey: string;
  publicKey: string;
}

let own: ArmoredPair;
let sender: ArmoredPair;
let impostor: ArmoredPair;
let sender_key_id: string;

const CRLF = "\r\n";

async function make_key(email: string, passphrase?: string) {
  return openpgp.generateKey({
    type: "ecc",
    curve: "ed25519Legacy",
    userIDs: [{ email }],
    ...(passphrase ? { passphrase } : {}),
    format: "armored",
  });
}

function lines(...parts: string[]): string {
  return parts.join(CRLF);
}

function attached_key_part(): string {
  const filename = `publickey - ${OUTSIDE_SENDER} - 0x${sender_key_id}.asc`;

  return lines(
    `Content-Type: application/pgp-keys; name="${filename}"`,
    `Content-Disposition: attachment; filename="${filename}"`,
    "Content-Transfer-Encoding: 7bit",
    "",
    sender.publicKey.trim().split(/\r?\n/).join(CRLF),
  );
}

function mixed_body(text: string): string {
  return lines(
    'Content-Type: multipart/mixed; boundary="mixed-b"',
    "",
    "--mixed-b",
    'Content-Type: text/plain; charset="utf-8"',
    "Content-Transfer-Encoding: 7bit",
    "",
    text,
    "--mixed-b",
    attached_key_part(),
    "--mixed-b--",
    "",
  );
}

async function detached_signature(data: string, signer: string) {
  return (await openpgp.sign({
    message: await openpgp.createMessage({
      binary: new TextEncoder().encode(data),
    }),
    signingKeys: await openpgp.readPrivateKey({ armoredKey: signer }),
    detached: true,
    format: "armored",
  })) as string;
}

async function multipart_signed(text: string, signer: string) {
  const signed_part = mixed_body(text).replace(/\r\n$/, "");
  const signature = await detached_signature(signed_part, signer);

  return lines(
    "Content-Type: multipart/signed; micalg=pgp-sha512;",
    ' protocol="application/pgp-signature"; boundary="signed-b"',
    "",
    "This is an OpenPGP/MIME signed message (RFC 4880 and 3156)",
    "--signed-b",
    signed_part,
    "--signed-b",
    'Content-Type: application/pgp-signature; name="OpenPGP_signature.asc"',
    "Content-Description: OpenPGP digital signature",
    'Content-Disposition: attachment; filename="OpenPGP_signature.asc"',
    "",
    signature.trim().split(/\r?\n/).join(CRLF),
    "--signed-b--",
    "",
  );
}

async function encrypt_to_owner(text: string, signer?: string) {
  return (await openpgp.encrypt({
    message: await openpgp.createMessage({ text }),
    encryptionKeys: await openpgp.readKey({ armoredKey: own.publicKey }),
    ...(signer
      ? { signingKeys: await openpgp.readPrivateKey({ armoredKey: signer }) }
      : {}),
    format: "armored",
  })) as string;
}

const fixtures: Record<
  string,
  (text: string, signer?: string) => Promise<string>
> = {
  sign_and_encrypt: async (text, signer = sender.privateKey) =>
    encrypt_to_owner(mixed_body(text), signer),
  signed_inside_encrypted: async (text, signer = sender.privateKey) =>
    encrypt_to_owner(await multipart_signed(text, signer)),
};

function publish_sender_key() {
  h.discovered.set(OUTSIDE_SENDER, {
    email: OUTSIDE_SENDER,
    found: true,
    public_key: sender.publicKey,
    fingerprint: null,
    source: "wkd",
    expires_at: null,
    will_encrypt: false,
    fingerprint_change: null,
  });
}

function backend_envelope(body_text: string, sealed_verdict?: "unsigned") {
  return {
    version: 1,
    from: { email: OUTSIDE_SENDER, name: "External Sender" },
    to: [{ email: OWNER, name: "" }],
    cc: [],
    bcc: [],
    subject: "Signed and encrypted",
    sent_at: "2026-11-17T12:00:00.000Z",
    body_text,
    body_html: "",
    ...(sealed_verdict ? { sender_verification: sealed_verdict } : {}),
  } as unknown as Parameters<typeof process_envelope_body>[0];
}

function displayed(
  envelope: { sender_verification?: unknown },
  e2e_verified: boolean,
) {
  const flags = {
    is_external: true,
    is_received: true,
    has_recipient_key: true,
    e2e_verified,
    sender_verification: envelope.sender_verification as never,
  };

  return {
    end_to_end: shows_end_to_end(flags),
    sender: displayed_sender_verification(flags),
  };
}

beforeAll(async () => {
  own = await make_key(OWNER, PASSPHRASE);
  sender = await make_key(OUTSIDE_SENDER);
  impostor = await make_key("impostor@example.test");
  sender_key_id = (await openpgp.readKey({ armoredKey: sender.publicKey }))
    .getKeyID()
    .toHex()
    .toUpperCase();
}, 60_000);

beforeEach(() => {
  h.vault = { identity_key: own.privateKey, previous_keys: [] };
  h.discovered.clear();
});

describe.each(Object.entries(fixtures))(
  "external sender %s message",
  (_name, build) => {
    it("reports no_keys, not unsigned, when the sender key is unknown", async () => {
      const resolved = await resolve_inbound_pgp_body(
        await build("hello from outside"),
        OUTSIDE_SENDER,
      );

      expect(resolved.decrypted).toBe(true);
      expect(resolved.body).toContain("hello from outside");
      expect(resolved.verified).toBe(false);
      expect(resolved.sender_verification).toBe("no_keys");
    });

    it("does not trust the key the sender attached to the message", async () => {
      const resolved = await resolve_inbound_pgp_body(
        await build("key attached"),
        OUTSIDE_SENDER,
      );

      expect(resolved.sender_verification).not.toBe("verified");
      expect(resolved.verified).toBe(false);
    });

    it("reports verified when the sender key is published", async () => {
      publish_sender_key();
      const resolved = await resolve_inbound_pgp_body(
        await build("hello from outside"),
        OUTSIDE_SENDER,
      );

      expect(resolved.body).toContain("hello from outside");
      expect(resolved.verified).toBe(true);
      expect(resolved.sender_verification).toBe("verified");
    });

    it("never reports verified or unsigned when someone else signed it", async () => {
      publish_sender_key();
      const resolved = await resolve_inbound_pgp_body(
        await build("forged", impostor.privateKey),
        OUTSIDE_SENDER,
      );

      expect(resolved.verified).toBe(false);
      expect(resolved.sender_verification).not.toBe("verified");
      expect(resolved.sender_verification).not.toBe("unsigned");
    });

    it("replaces the unsigned server seal verdict with the body verdict", async () => {
      const without_key = backend_envelope(
        await build("sealed by the server"),
        "unsigned",
      );
      const shown_without = await process_envelope_body(without_key, OWNER);

      expect(shown_without.body_text).toContain("sealed by the server");
      expect(displayed(without_key, shown_without.e2e_verified)).toEqual({
        end_to_end: false,
        sender: "no_keys",
      });

      publish_sender_key();
      const with_key = backend_envelope(
        await build("sealed by the server"),
        "unsigned",
      );
      const shown_with = await process_envelope_body(with_key, OWNER);

      expect(shown_with.e2e_sender_bound).toBe(true);
      expect(displayed(with_key, shown_with.e2e_verified)).toEqual({
        end_to_end: true,
        sender: "verified",
      });
    });
  },
);

describe("external sender encrypted without a signature", () => {
  it("reports unsigned only when no signature exists anywhere", async () => {
    publish_sender_key();
    const resolved = await resolve_inbound_pgp_body(
      await encrypt_to_owner(mixed_body("no signature here")),
      OUTSIDE_SENDER,
    );

    expect(resolved.decrypted).toBe(true);
    expect(resolved.sender_verification).toBe("unsigned");
  });
});

describe("external sender signed-only cleartext message", () => {
  it.each([false, true])(
    "makes no signature claim when the server kept only the text (key known: %s)",
    async (known) => {
      if (known) publish_sender_key();
      const envelope = backend_envelope("hello in the clear");
      const shown = await process_envelope_body(envelope, OWNER);

      expect(shown.body_text).toContain("hello in the clear");
      expect(displayed(envelope, shown.e2e_verified)).toEqual({
        end_to_end: false,
        sender: undefined,
      });
    },
  );
});
