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
  on_vault_cleared: () => () => {},
  on_vault_stored: () => () => {},
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
import {
  clear_attachment_keys,
  get_attachment_key,
} from "@/services/crypto/inbound_attachment_keys";

const PASSPHRASE = "sent evidence passphrase";

interface TestKey {
  private_key: string;
  public_key: string;
}

let own_key: TestKey;

function envelope(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    subject: "Hello",
    body_text: "Body",
    from: { name: "", email: "sender@example.com" },
    to: [{ name: "", email: "owner@astermail.org" }],
    cc: [],
    bcc: [],
    sent_at: "2026-11-10T10:00:00.000Z",
    ...extra,
  };
}

function as_base64(text: string): string {
  return array_to_base64(new TextEncoder().encode(text));
}

async function seal_to_own(text: string): Promise<string> {
  return (await openpgp.encrypt({
    message: await openpgp.createMessage({ text }),
    encryptionKeys: await openpgp.readKey({ armoredKey: own_key.public_key }),
    format: "armored",
  })) as string;
}

beforeAll(async () => {
  const { privateKey, publicKey } = await openpgp.generateKey({
    type: "ecc",
    curve: "curve25519Legacy",
    userIDs: [{ email: "owner@astermail.org" }],
    passphrase: PASSPHRASE,
    format: "armored",
  });

  own_key = { private_key: privateKey, public_key: publicKey };
}, 30000);

beforeEach(() => {
  clear_attachment_keys();
  h.vault = {
    identity_key: own_key.private_key,
    previous_keys: [],
    signed_prekey: "",
    signed_prekey_private: "",
    recovery_codes: [],
  };
  h.passphrase = PASSPHRASE;
});

describe("decrypt_mail_envelope trust claims in stored envelopes", () => {
  it("an unencrypted envelope cannot claim a verified sender", async () => {
    const opened = await decrypt_mail_envelope<Record<string, unknown>>(
      as_base64(JSON.stringify(envelope({ sender_verification: "verified" }))),
      "",
    );

    expect(opened?.subject).toBe("Hello");
    expect(opened?.sender_verification).toBeUndefined();
  });

  it("a passphrase sealed envelope cannot claim a verified sender", async () => {
    const sealed = await encrypt_envelope_with_bytes(
      envelope({ sender_verification: "verified" }),
      new Uint8Array(32).fill(1),
    );
    const opened = await decrypt_mail_envelope<Record<string, unknown>>(
      sealed.encrypted,
      array_to_base64(new Uint8Array([1])),
    );

    expect(opened?.subject).toBe("Hello");
    expect(opened?.sender_verification).toBeUndefined();
  });

  it("an unsigned PGP envelope reports unsigned whatever it claims", async () => {
    const opened = await decrypt_mail_envelope<Record<string, unknown>>(
      as_base64(
        await seal_to_own(
          JSON.stringify(envelope({ sender_verification: "verified" })),
        ),
      ),
      "",
    );

    expect(opened?.sender_verification).toBe("unsigned");
  });
});

describe("decrypt_mail_envelope attachment keys from unencrypted envelopes", () => {
  it("still registers keys for unencrypted inbound mail", async () => {
    await decrypt_mail_envelope(
      as_base64(
        JSON.stringify(
          envelope({ attachment_keys: [{ seq: 0, key: "server-key" }] }),
        ),
      ),
      "",
      "item-plain",
    );

    expect(get_attachment_key("item-plain", 0)).toBe("server-key");
  });

  it("never replaces a key that came from an encrypted envelope", async () => {
    await decrypt_mail_envelope(
      as_base64(
        await seal_to_own(
          JSON.stringify(
            envelope({ attachment_keys: [{ seq: 0, key: "sealed-key" }] }),
          ),
        ),
      ),
      "",
      "item-mixed",
    );
    expect(get_attachment_key("item-mixed", 0)).toBe("sealed-key");

    await decrypt_mail_envelope(
      as_base64(
        JSON.stringify(
          envelope({ attachment_keys: [{ seq: 0, key: "swapped-key" }] }),
        ),
      ),
      "",
      "item-mixed",
    );

    expect(get_attachment_key("item-mixed", 0)).toBe("sealed-key");
  });
});
