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

const PASSPHRASE = "nested signed display passphrase";
const OUTSIDE_SENDER = "sender@example.test";
const OWNER = "owner@astermail.org";
const SIGNED_TEXT = "signed words from the sender";
const SIGNED_HTML = "<p>signed html from the sender</p>";
const ADDED_HTML = "<p>added html that nobody signed</p>";

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

const CRLF = "\r\n";

let own: { privateKey: string; publicKey: string };
let sender: { privateKey: string; publicKey: string };

function lines(...parts: string[]): string {
  return parts.join(CRLF);
}

function signed_part(): string {
  return lines(
    'Content-Type: multipart/mixed; boundary="mixed-b"',
    "",
    "--mixed-b",
    'Content-Type: multipart/alternative; boundary="alt-b"',
    "",
    "--alt-b",
    'Content-Type: text/plain; charset="utf-8"',
    "",
    SIGNED_TEXT,
    "--alt-b",
    'Content-Type: text/html; charset="utf-8"',
    "",
    SIGNED_HTML,
    "--alt-b--",
    "--mixed-b",
    'Content-Type: application/pdf; name="contract.pdf"',
    'Content-Disposition: attachment; filename="contract.pdf"',
    "Content-Transfer-Encoding: base64",
    "",
    "JVBERi0xLjQKJcfsj6IKJSVFT0YK",
    "--mixed-b--",
  );
}

async function signature_part(): Promise<string> {
  const signature = (await openpgp.sign({
    message: await openpgp.createMessage({
      binary: new TextEncoder().encode(signed_part()),
    }),
    signingKeys: await openpgp.readPrivateKey({
      armoredKey: sender.privateKey,
    }),
    detached: true,
    format: "armored",
  })) as string;

  return lines(
    'Content-Type: application/pgp-signature; name="OpenPGP_signature.asc"',
    'Content-Disposition: attachment; filename="OpenPGP_signature.asc"',
    "",
    signature.trim().split(/\r?\n/).join(CRLF),
  );
}

function added_html_part(): string {
  return lines('Content-Type: text/html; charset="utf-8"', "", ADDED_HTML);
}

function added_file_part(): string {
  return lines(
    'Content-Type: application/pdf; name="invoice.pdf"',
    'Content-Disposition: attachment; filename="invoice.pdf"',
    "Content-Transfer-Encoding: base64",
    "",
    "JVBERi0xLjQKJcfsj6IKJSVFT0YK",
  );
}

const SIGNED_HEADER = lines(
  "Content-Type: multipart/signed; micalg=pgp-sha512;",
  ' protocol="application/pgp-signature"; boundary="signed-b"',
);

async function genuine_message(): Promise<string> {
  return lines(
    SIGNED_HEADER,
    "",
    "This is an OpenPGP/MIME signed message (RFC 4880 and 3156)",
    "--signed-b",
    signed_part(),
    "--signed-b",
    await signature_part(),
    "--signed-b--",
    "",
  );
}

async function html_before_first_boundary(): Promise<string> {
  return lines(
    SIGNED_HEADER,
    "",
    added_html_part(),
    "--signed-b",
    signed_part(),
    "--signed-b",
    await signature_part(),
    "--signed-b--",
    "",
  );
}

async function third_part_after_signature(): Promise<string> {
  return lines(
    SIGNED_HEADER,
    "",
    "--signed-b",
    signed_part(),
    "--signed-b",
    await signature_part(),
    "--signed-b",
    added_html_part(),
    "--signed-b",
    added_file_part(),
    "--signed-b--",
    "",
  );
}

async function extra_boundary_header(): Promise<string> {
  return lines(
    "X-Note: boundary=outer-b",
    SIGNED_HEADER,
    "",
    "--outer-b",
    added_html_part(),
    "--outer-b--",
    "--signed-b",
    signed_part(),
    "--signed-b",
    await signature_part(),
    "--signed-b--",
    "",
  );
}

async function encrypt_to_owner(text: string): Promise<string> {
  return (await openpgp.encrypt({
    message: await openpgp.createMessage({ text }),
    encryptionKeys: await openpgp.readKey({ armoredKey: own.publicKey }),
    format: "armored",
  })) as string;
}

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

function filenames(resolved: {
  decrypted_attachments?: { filename: string }[];
}): string[] {
  return (resolved.decrypted_attachments ?? []).map((a) => a.filename);
}

beforeAll(async () => {
  own = await openpgp.generateKey({
    type: "ecc",
    curve: "ed25519Legacy",
    userIDs: [{ email: OWNER }],
    passphrase: PASSPHRASE,
    format: "armored",
  });
  sender = await openpgp.generateKey({
    type: "ecc",
    curve: "ed25519Legacy",
    userIDs: [{ email: OUTSIDE_SENDER }],
    format: "armored",
  });
}, 60_000);

beforeEach(() => {
  h.vault = { identity_key: own.privateKey, previous_keys: [] };
  h.discovered.clear();
  publish_sender_key();
});

describe("nested signed mail display", () => {
  it("shows a genuine nested signed message as verified with its own parts", async () => {
    const resolved = await resolve_inbound_pgp_body(
      await encrypt_to_owner(await genuine_message()),
      OUTSIDE_SENDER,
      "nested-genuine",
    );

    expect(resolved.sender_verification).toBe("verified");
    expect(resolved.verified).toBe(true);
    expect(resolved.body).toContain(SIGNED_HTML);
    expect(resolved.body).not.toContain("OpenPGP/MIME signed message");
    expect(filenames(resolved)).toEqual(["contract.pdf"]);
  });

  it("shows only the signed part when html sits before the first boundary", async () => {
    const resolved = await resolve_inbound_pgp_body(
      await encrypt_to_owner(await html_before_first_boundary()),
      OUTSIDE_SENDER,
      "nested-preamble",
    );

    expect(resolved.body).not.toContain(ADDED_HTML);
    expect(resolved.body).toContain(SIGNED_HTML);
    expect(resolved.sender_verification).toBe("verified");
  });

  it("shows only the signed part through the envelope path", async () => {
    const envelope = {
      version: 1,
      from: { email: OUTSIDE_SENDER, name: "External Sender" },
      to: [{ email: OWNER, name: "" }],
      cc: [],
      bcc: [],
      subject: "Signed and encrypted",
      sent_at: "2026-11-17T12:00:00.000Z",
      body_text: await encrypt_to_owner(await html_before_first_boundary()),
      body_html: "",
    } as unknown as Parameters<typeof process_envelope_body>[0];
    const shown = await process_envelope_body(envelope, OWNER);

    expect(shown.e2e_sender_bound).toBe(true);
    expect(`${shown.body_text}${shown.safe_html ?? ""}`).not.toContain(
      "added html that nobody signed",
    );
  });

  it("does not verify a message with a third part after the signature", async () => {
    const resolved = await resolve_inbound_pgp_body(
      await encrypt_to_owner(await third_part_after_signature()),
      OUTSIDE_SENDER,
      "nested-third-part",
    );

    expect(resolved.verified).toBe(false);
    expect(resolved.sender_verification).toBe("unknown");
  });

  it("does not verify a message with a second boundary parameter", async () => {
    const resolved = await resolve_inbound_pgp_body(
      await encrypt_to_owner(await extra_boundary_header()),
      OUTSIDE_SENDER,
      "nested-extra-boundary",
    );

    expect(resolved.verified).toBe(false);
    expect(resolved.sender_verification).toBe("unknown");
  });
});
