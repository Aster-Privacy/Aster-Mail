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
import { beforeEach, describe, expect, it, vi } from "vitest";

const post_calls: { url: string; body: unknown }[] = [];
const put_calls: { url: string; body: unknown }[] = [];
let server_response: Record<string, unknown> = {};

vi.mock("./client", () => ({
  api_client: {
    get: vi.fn(async () => ({ data: server_response, error: undefined })),
    post: vi.fn(async (url: string, body: unknown) => {
      post_calls.push({ url, body });

      return { data: { success: true }, error: undefined };
    }),
    put: vi.fn(async (url: string, body: unknown) => {
      put_calls.push({ url, body });

      return { data: { success: true }, error: undefined };
    }),
  },
}));

vi.mock("@/services/crypto/key_manager", () => ({
  hash_recovery_email: vi.fn(async (email: string) => `hash:${email}`),
}));

import {
  clear_recovery_email_cache,
  encrypt_recovery_email,
  get_recovery_email,
  is_valid_recovery_email,
  reencrypt_recovery_email,
  save_recovery_email,
} from "./recovery_email";

import {
  clear_account_key_derived_keks,
  clear_legacy_keks_from_memory,
  get_account_data_crypto_keys,
  get_account_key_generation,
  get_legacy_crypto_keys,
  load_account_key_derived_keks_into_memory,
  load_previous_key_derived_keks_into_memory,
} from "@/services/crypto/legacy_keks";
import { derive_account_data_key_raw } from "@/services/crypto/account_data_key";

type Vault = NonNullable<Parameters<typeof get_recovery_email>[0]>;
type SealedBlob = { encrypted_email: string; email_nonce: string };

const IDENTITY_KEY = "current-identity-key";
const OLD_IDENTITY_KEY = "old-identity-key";
const ACCOUNT_KEY = new Uint8Array(32).map((_, i) => (i * 7 + 3) % 256);
const DRAFT_TEXT = "private draft body that stays on this device";
const RECOVERY_CONTEXT = "astermail-recovery-email-v1";

const vault = { identity_key: IDENTITY_KEY } as unknown as Vault;
const next_vault = { identity_key: "next-identity-key" } as unknown as Vault;

function to_base64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}

async function identity_context_key(
  identity_key: string,
  context: string,
): Promise<CryptoKey> {
  const hash = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(identity_key + context),
  );

  return crypto.subtle.importKey("raw", hash, { name: "AES-GCM" }, false, [
    "encrypt",
    "decrypt",
  ]);
}

async function account_context_key(
  context: Parameters<typeof derive_account_data_key_raw>[1],
): Promise<CryptoKey> {
  const raw = await derive_account_data_key_raw(ACCOUNT_KEY, context);

  return crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, false, [
    "encrypt",
    "decrypt",
  ]);
}

async function seal(key: CryptoKey, text: string): Promise<SealedBlob> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(text),
  );

  return {
    encrypted_email: to_base64(new Uint8Array(ciphertext)),
    email_nonce: to_base64(iv),
  };
}

async function settle(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 20));
}

function offer(blob: SealedBlob): void {
  server_response = { ...blob, verified: true, has_server_enc: false };
}

describe("recovery email read path", () => {
  beforeEach(async () => {
    post_calls.length = 0;
    put_calls.length = 0;
    server_response = {};
    clear_recovery_email_cache();
    clear_legacy_keks_from_memory();
    clear_account_key_derived_keks();
    await load_previous_key_derived_keks_into_memory([
      IDENTITY_KEY,
      OLD_IDENTITY_KEY,
    ]);
    await load_account_key_derived_keks_into_memory(
      ACCOUNT_KEY,
      get_account_key_generation(),
    );
  });

  it("holds the other context keys in the shared pool", () => {
    expect(get_legacy_crypto_keys().length).toBeGreaterThan(10);
    expect(get_account_data_crypto_keys(RECOVERY_CONTEXT).length).toBe(1);
  });

  it("does not open or sync a draft sealed under an identity context key", async () => {
    offer(
      await seal(
        await identity_context_key(IDENTITY_KEY, "astermail-draft-v1"),
        DRAFT_TEXT,
      ),
    );

    const { data } = await get_recovery_email(vault);

    await settle();

    expect(data.email).toBeNull();
    expect(post_calls).toEqual([]);
  });

  it("does not open or sync blobs sealed under other account context keys", async () => {
    for (const context of [
      "astermail-draft-v1",
      "astermail-draft-v2",
      "astermail-preferences-v1",
      "astermail-labels-v1",
      "astermail-tags-v1",
    ] as const) {
      clear_recovery_email_cache();
      offer(await seal(await account_context_key(context), DRAFT_TEXT));

      const { data } = await get_recovery_email(vault);

      await settle();

      expect(data.email).toBeNull();
    }

    expect(post_calls).toEqual([]);
  });

  it("does not sync or cache a recovery blob that is not an address", async () => {
    const recovery_key = await identity_context_key(
      IDENTITY_KEY,
      RECOVERY_CONTEXT,
    );

    for (const text of [
      DRAFT_TEXT,
      "a@b.co\nsecond line",
      "a@b.co, c@d.co",
      `${"x".repeat(250)}@example.com`,
      `${"x".repeat(65)}@example.com`,
      "",
    ]) {
      clear_recovery_email_cache();
      offer(await seal(recovery_key, text));

      const { data } = await get_recovery_email(vault);

      await settle();

      expect(data.email).toBeNull();
    }

    expect(post_calls).toEqual([]);
  });

  it("opens and syncs an address sealed under the current identity key", async () => {
    const sealed = await encrypt_recovery_email("user@example.com", vault);

    offer({ encrypted_email: sealed.encrypted, email_nonce: sealed.nonce });

    const { data } = await get_recovery_email(vault);

    await settle();

    expect(data.email).toBe("user@example.com");
    expect(post_calls).toEqual([
      {
        url: "/core/v1/recovery/email/server-enc",
        body: {
          plaintext_email: "user@example.com",
          email_hash: "hash:user@example.com",
        },
      },
    ]);
  });

  it("opens an address sealed under a retained identity key", async () => {
    const key = await identity_context_key(OLD_IDENTITY_KEY, RECOVERY_CONTEXT);

    for (const holder of [
      { previous_keys: [OLD_IDENTITY_KEY] },
      { legacy_identity_keys: [OLD_IDENTITY_KEY] },
    ]) {
      clear_recovery_email_cache();
      offer(await seal(key, "Old.User@example.com"));

      const { data } = await get_recovery_email({
        ...vault,
        ...holder,
      } as Vault);

      expect(data.email).toBe("Old.User@example.com");
    }
  });

  it("does not open an address sealed under a key the vault lacks", async () => {
    offer(
      await seal(
        await identity_context_key(OLD_IDENTITY_KEY, RECOVERY_CONTEXT),
        "old.user@example.com",
      ),
    );

    const { data } = await get_recovery_email(vault);

    await settle();

    expect(data.email).toBeNull();
    expect(post_calls).toEqual([]);
  });

  it("opens an address sealed under the account recovery context key", async () => {
    offer(
      await seal(
        await account_context_key(RECOVERY_CONTEXT),
        "account@example.com",
      ),
    );

    const { data } = await get_recovery_email(vault);

    expect(data.email).toBe("account@example.com");
  });

  it("does not sync when the server already holds its copy", async () => {
    const sealed = await encrypt_recovery_email("user@example.com", vault);

    server_response = {
      encrypted_email: sealed.encrypted,
      email_nonce: sealed.nonce,
      verified: true,
      has_server_enc: true,
    };

    await get_recovery_email(vault);
    await settle();

    expect(post_calls).toEqual([]);
  });
});

describe("recovery email write paths", () => {
  beforeEach(() => {
    post_calls.length = 0;
    put_calls.length = 0;
    server_response = {};
    clear_recovery_email_cache();
    clear_legacy_keks_from_memory();
    clear_account_key_derived_keks();
  });

  it("refuses to carry a non address through a reset", async () => {
    await load_previous_key_derived_keks_into_memory([IDENTITY_KEY]);

    const draft = await seal(
      await identity_context_key(IDENTITY_KEY, "astermail-draft-v1"),
      DRAFT_TEXT,
    );
    const mislabeled = await seal(
      await identity_context_key(IDENTITY_KEY, RECOVERY_CONTEXT),
      DRAFT_TEXT,
    );

    for (const blob of [draft, mislabeled]) {
      expect(
        await reencrypt_recovery_email(
          blob.encrypted_email,
          blob.email_nonce,
          vault,
          next_vault,
        ),
      ).toBeNull();
    }
  });

  it("carries a real address through a reset", async () => {
    const sealed = await encrypt_recovery_email("user@example.com", vault);
    const carried = await reencrypt_recovery_email(
      sealed.encrypted,
      sealed.nonce,
      vault,
      next_vault,
    );

    expect(carried).not.toBeNull();
    server_response = { ...carried, verified: false, has_server_enc: true };

    const { data } = await get_recovery_email(next_vault);

    expect(data.email).toBe("user@example.com");
  });

  it("saves only a single well formed address", async () => {
    const rejected = await save_recovery_email("not an address", vault);

    expect(rejected.data.success).toBe(false);
    expect(put_calls).toEqual([]);

    const accepted = await save_recovery_email(" User@Example.com ", vault);

    expect(accepted.data.success).toBe(true);
    expect(put_calls.length).toBe(1);
    expect(
      (put_calls[0].body as { plaintext_email: string }).plaintext_email,
    ).toBe("user@example.com");
  });

  it("accepts ordinary addresses and rejects everything else", () => {
    expect(is_valid_recovery_email("user@example.com")).toBe(true);
    expect(is_valid_recovery_email("first.last+tag@sub.example.org")).toBe(
      true,
    );
    expect(is_valid_recovery_email("user@example.com ")).toBe(false);
    expect(is_valid_recovery_email("user@example.com\n")).toBe(false);
    expect(is_valid_recovery_email("a@b.co,c@d.co")).toBe(false);
    expect(is_valid_recovery_email("no-at-sign")).toBe(false);
    expect(is_valid_recovery_email(null)).toBe(false);
    expect(is_valid_recovery_email(`${"x".repeat(250)}@example.com`)).toBe(
      false,
    );
  });
});
