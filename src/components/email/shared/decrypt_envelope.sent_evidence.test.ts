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
import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import * as openpgp from "openpgp";

const h = vi.hoisted(() => ({
  vault: null as unknown,
  passphrase: "sent evidence passphrase" as string | null,
}));

vi.mock("@/services/crypto/memory_key_store", () => ({
  get_vault_from_memory: () => h.vault,
  get_passphrase_from_memory: () => h.passphrase,
  get_passphrase_bytes: () => new Uint8Array(32).fill(1),
  has_vault_in_memory: () => h.vault !== null,
  wait_for_keys_ready: vi.fn(async () => {}),
  store_vault_in_memory: vi.fn(async () => {}),
}));

vi.mock("@/services/api/client", () => ({
  api_client: {
    get: vi.fn(async () => ({ code: "NOT_FOUND" })),
    put: vi.fn(async () => ({ data: {} })),
    post: vi.fn(async () => ({ data: {} })),
    delete: vi.fn(async () => ({})),
  },
}));

vi.mock("@/services/api/keys", async (import_original) => ({
  ...(await import_original<Record<string, unknown>>()),
  get_recipient_public_key: vi.fn(async () => ({ data: { public_key: "" } })),
}));

vi.mock("@/services/account_manager", async (import_original) => ({
  ...(await import_original<Record<string, unknown>>()),
  get_current_account: vi.fn(async () => ({ user: { id: "user-1" } })),
}));

import { decrypt_mail_envelope } from "@/components/email/shared/decrypt_envelope";
import {
  array_to_base64,
  encrypt_envelope_with_bytes,
} from "@/services/crypto/envelope";
import { sent_copy_pgp_verified } from "@/services/crypto/sent_encryption_evidence";

const PASSPHRASE = "sent evidence passphrase";
const FULL_PGP = { outside: 2, outside_pgp: 2, internal_readable: 0 };

interface TestKey {
  private_key: string;
  public_key: string;
}

let own_key: TestKey;
let other_key: TestKey;

async function generate(): Promise<TestKey> {
  const { privateKey, publicKey } = await openpgp.generateKey({
    type: "ecc",
    curve: "curve25519Legacy",
    userIDs: [{ email: "owner@astermail.org" }],
    passphrase: PASSPHRASE,
    format: "armored",
  });

  return { private_key: privateKey, public_key: publicKey };
}

async function unlock(key: TestKey): Promise<openpgp.PrivateKey> {
  return openpgp.decryptKey({
    privateKey: await openpgp.readPrivateKey({ armoredKey: key.private_key }),
    passphrase: PASSPHRASE,
  });
}

function sent_envelope(): Record<string, unknown> {
  return {
    version: 1,
    subject: "Sent copy",
    body_text: "Body text",
    body_html: "<p>Body text</p>",
    from: { name: "", email: "owner@astermail.org" },
    to: [{ name: "", email: "friend@example.com" }],
    cc: [],
    bcc: [],
    sent_at: "2026-11-03T10:00:00.000Z",
    sent_encryption: FULL_PGP,
  };
}

async function seal_to_own(
  text: string,
  signer: TestKey | null,
): Promise<string> {
  return (await openpgp.encrypt({
    message: await openpgp.createMessage({ text }),
    encryptionKeys: await openpgp.readKey({ armoredKey: own_key.public_key }),
    signingKeys: signer ? await unlock(signer) : undefined,
    format: "armored",
  })) as string;
}

async function open(encrypted_envelope: string, envelope_nonce = "") {
  return decrypt_mail_envelope<Record<string, unknown>>(
    encrypted_envelope,
    envelope_nonce,
  );
}

function as_base64(text: string): string {
  return array_to_base64(new TextEncoder().encode(text));
}

beforeAll(async () => {
  own_key = await generate();
  other_key = await generate();
}, 30000);

beforeEach(() => {
  h.vault = {
    identity_key: own_key.private_key,
    previous_keys: [],
    signed_prekey: "",
    signed_prekey_private: "",
    recovery_codes: [],
  };
  h.passphrase = PASSPHRASE;
});

describe("decrypt_mail_envelope sent encryption evidence", () => {
  it("keeps evidence on a copy sealed and signed with the owner's key", async () => {
    const opened = await open(
      as_base64(await seal_to_own(JSON.stringify(sent_envelope()), own_key)),
    );

    expect(opened?.subject).toBe("Sent copy");
    expect(opened?.sent_encryption).toEqual(FULL_PGP);
    expect(sent_copy_pgp_verified(opened)).toBe(true);
  });

  it("drops evidence on a copy signed by another key", async () => {
    const opened = await open(
      as_base64(
        await seal_to_own(JSON.stringify(sent_envelope()), other_key),
      ),
    );

    expect(opened?.subject).toBe("Sent copy");
    expect(opened?.sent_encryption).toBeUndefined();
    expect(sent_copy_pgp_verified(opened)).toBe(false);
  });

  it("drops evidence on an unsigned copy encrypted to the owner's key", async () => {
    const opened = await open(
      as_base64(await seal_to_own(JSON.stringify(sent_envelope()), null)),
    );

    expect(opened?.subject).toBe("Sent copy");
    expect(opened?.sent_encryption).toBeUndefined();
    expect(sent_copy_pgp_verified(opened)).toBe(false);
  });

  it("drops evidence on a readable envelope the server could write", async () => {
    const opened = await open(as_base64(JSON.stringify(sent_envelope())));

    expect(opened?.subject).toBe("Sent copy");
    expect(opened?.sent_encryption).toBeUndefined();
    expect(sent_copy_pgp_verified(opened)).toBe(false);
  });

  it("keeps evidence on a passphrase sealed copy", async () => {
    const sealed = await encrypt_envelope_with_bytes(
      sent_envelope(),
      new Uint8Array(32).fill(1),
    );
    const opened = await open(
      sealed.encrypted,
      array_to_base64(new Uint8Array([1])),
    );

    expect(opened?.subject).toBe("Sent copy");
    expect(sent_copy_pgp_verified(opened)).toBe(true);
  });
});
