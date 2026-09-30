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
  passphrase: "sent copy passphrase" as string | null,
  capabilities: { data: { format_writes: true } } as unknown,
  capability_fetches: 0,
  sender_public_key: "" as string,
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
    get: vi.fn(async (url: string) => {
      if (url === "/crypto/v1/keys/account-key/capabilities") {
        h.capability_fetches++;
        if (h.capabilities instanceof Error) throw h.capabilities;

        return h.capabilities;
      }

      return { code: "NOT_FOUND" };
    }),
    put: vi.fn(async () => ({ data: {} })),
    post: vi.fn(async () => ({ data: {} })),
    delete: vi.fn(async () => ({})),
  },
}));

vi.mock("@/services/api/keys", async (import_original) => ({
  ...(await import_original<Record<string, unknown>>()),
  get_recipient_public_key: vi.fn(async () => ({
    data: { public_key: h.sender_public_key },
  })),
}));

vi.mock("@/services/account_manager", async (import_original) => ({
  ...(await import_original<Record<string, unknown>>()),
  get_current_account: vi.fn(async () => ({ user: { id: "user-1" } })),
}));

import {
  seal_sent_envelope,
  seal_sent_envelope_when_enabled,
} from "./sent_copy_seal";
import { encrypt_message } from "./key_manager_pgp_messages";
import { array_to_base64, base64_to_array } from "./envelope";

import { decrypt_mail_envelope } from "@/components/email/shared/decrypt_envelope";
import { reset_account_key_capabilities_cache } from "@/services/api/account_key";

const PASSPHRASE = "sent copy passphrase";

const ENVELOPE = {
  version: 1,
  subject: "Quarterly plan",
  body_text: "Body text",
  body_html: "<p>Body text</p>",
  from: { name: "", email: "owner@astermail.org" },
  to: [{ name: "", email: "friend@example.com" }],
  cc: [],
  bcc: [],
  sent_at: "2026-09-19T10:00:00.000Z",
};

interface TestKey {
  private_key: string;
  public_key: string;
}

let own_key: TestKey;
let other_key: TestKey;

async function generate(passphrase: string): Promise<TestKey> {
  const { privateKey, publicKey } = await openpgp.generateKey({
    type: "ecc",
    curve: "curve25519Legacy",
    userIDs: [{ email: "owner@astermail.org" }],
    passphrase,
    format: "armored",
  });

  return { private_key: privateKey, public_key: publicKey };
}

function vault_with(identity_key: string, previous_keys: string[] = []) {
  return {
    identity_key,
    previous_keys,
    signed_prekey: "",
    signed_prekey_private: "",
    recovery_codes: [],
  };
}

async function seal_own(): Promise<{
  encrypted_envelope: string;
  envelope_nonce: string;
}> {
  const sealed = await seal_sent_envelope(
    ENVELOPE,
    own_key.private_key,
    PASSPHRASE,
  );

  if (!sealed) throw new Error("seal failed");

  return sealed;
}

beforeAll(async () => {
  own_key = await generate(PASSPHRASE);
  other_key = await generate(PASSPHRASE);
}, 30000);

beforeEach(() => {
  reset_account_key_capabilities_cache();
  h.vault = vault_with(own_key.private_key);
  h.passphrase = PASSPHRASE;
  h.capabilities = { data: { format_writes: true } };
  h.capability_fetches = 0;
  h.sender_public_key = own_key.public_key;
});

describe("seal_sent_envelope", () => {
  it("writes an armored PGP envelope with an empty nonce", async () => {
    const sealed = await seal_own();
    const armored = new TextDecoder().decode(
      base64_to_array(sealed.encrypted_envelope),
    );

    expect(sealed.envelope_nonce).toBe("");
    expect(armored.startsWith("-----BEGIN PGP MESSAGE-----")).toBe(true);
    expect(armored).not.toContain("Quarterly plan");
  });

  it("opens through the mail reader with a verified signature", async () => {
    const sealed = await seal_own();
    const opened = await decrypt_mail_envelope<
      typeof ENVELOPE & { sender_verification?: string }
    >(sealed.encrypted_envelope, sealed.envelope_nonce);

    expect(opened?.subject).toBe("Quarterly plan");
    expect(opened?.body_html).toBe("<p>Body text</p>");
    expect(opened?.to).toEqual([{ name: "", email: "friend@example.com" }]);
    expect(opened?.sender_verification).toBe("verified");
  });

  it("still opens after the identity key moves to previous keys", async () => {
    const sealed = await seal_own();

    h.vault = vault_with(other_key.private_key, [own_key.private_key]);

    const opened = await decrypt_mail_envelope<typeof ENVELOPE>(
      sealed.encrypted_envelope,
      sealed.envelope_nonce,
    );

    expect(opened?.subject).toBe("Quarterly plan");
  });

  it("still opens after the key is relocked with a new password", async () => {
    const sealed = await seal_own();
    const unlocked = await openpgp.decryptKey({
      privateKey: await openpgp.readPrivateKey({
        armoredKey: own_key.private_key,
      }),
      passphrase: PASSPHRASE,
    });
    const relocked = await openpgp.encryptKey({
      privateKey: unlocked,
      passphrase: "a brand new password",
    });

    h.vault = vault_with(relocked.armor());
    h.passphrase = "a brand new password";

    const opened = await decrypt_mail_envelope<typeof ENVELOPE>(
      sealed.encrypted_envelope,
      sealed.envelope_nonce,
    );

    expect(opened?.subject).toBe("Quarterly plan");
  });

  it("flags a copy signed by a different key", async () => {
    const forged = await encrypt_message(
      JSON.stringify(ENVELOPE),
      own_key.public_key,
      { armored_secret_key: other_key.private_key, passphrase: PASSPHRASE },
    );
    const opened = await decrypt_mail_envelope<{
      sender_verification?: string;
    }>(array_to_base64(new TextEncoder().encode(forged)), "");

    expect(opened?.sender_verification).toBe("invalid");
  });

  it("returns null for a wrong passphrase", async () => {
    expect(
      await seal_sent_envelope(ENVELOPE, own_key.private_key, "wrong"),
    ).toBeNull();
  });

  it("returns null for a key that is not a PGP key", async () => {
    expect(
      await seal_sent_envelope(
        ENVELOPE,
        JSON.stringify({ kty: "EC" }),
        PASSPHRASE,
      ),
    ).toBeNull();
  });
});

describe("seal_sent_envelope_when_enabled", () => {
  it("seals when the server turns format writes on", async () => {
    const sealed = await seal_sent_envelope_when_enabled(
      ENVELOPE,
      own_key.private_key,
      PASSPHRASE,
    );

    expect(sealed?.envelope_nonce).toBe("");
  });

  it("does nothing when the server predates the flag", async () => {
    h.capabilities = { code: "NOT_FOUND", error: "not found" };

    expect(
      await seal_sent_envelope_when_enabled(
        ENVELOPE,
        own_key.private_key,
        PASSPHRASE,
      ),
    ).toBeNull();
  });

  it("does nothing when the flag is off", async () => {
    h.capabilities = { data: { format_writes: false } };

    expect(
      await seal_sent_envelope_when_enabled(
        ENVELOPE,
        own_key.private_key,
        PASSPHRASE,
      ),
    ).toBeNull();
  });

  it("treats a non-boolean flag as off", async () => {
    h.capabilities = { data: { format_writes: "true" } };

    expect(
      await seal_sent_envelope_when_enabled(
        ENVELOPE,
        own_key.private_key,
        PASSPHRASE,
      ),
    ).toBeNull();
  });

  it("does nothing when the capability request throws", async () => {
    h.capabilities = new Error("offline");

    expect(
      await seal_sent_envelope_when_enabled(
        ENVELOPE,
        own_key.private_key,
        PASSPHRASE,
      ),
    ).toBeNull();
  });

  it("does nothing without a passphrase", async () => {
    expect(
      await seal_sent_envelope_when_enabled(
        ENVELOPE,
        own_key.private_key,
        null,
      ),
    ).toBeNull();
    expect(h.capability_fetches).toBe(0);
  });

  it("asks the server once per cache window", async () => {
    await seal_sent_envelope_when_enabled(
      ENVELOPE,
      own_key.private_key,
      PASSPHRASE,
    );
    await seal_sent_envelope_when_enabled(
      ENVELOPE,
      own_key.private_key,
      PASSPHRASE,
    );

    expect(h.capability_fetches).toBe(1);
  });
});
