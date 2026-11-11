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
  INVALID_RECOVERY_EMAIL_CODE,
  is_readable_recovery_email,
  is_valid_recovery_email,
  RECOVERY_EMAIL_KEY_UNAVAILABLE_CODE,
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
const EARLIER_CLIENT_ADDRESSES = [
  '"first last"@example.com',
  "user@[192.0.2.1]",
  "user@mail_host.example.com",
  `${"x".repeat(65)}@example.com`,
];
const INTERNATIONAL_ADDRESSES = [
  "jürgen@müller.example",
  "用户@例子.公司",
];
const HIDDEN_CHARACTER_ADDRESSES = [
  "user\u202e@example.com",
  "user@\u202dexample.com",
  "us\u2066er\u2069@example.com",
  "user\u200b@example.com",
  "user@exa\u200dmple.com",
  "user@exa\u200cmple.com",
  "us\ufeffer@example.com",
  "user\u00ad@example.com",
  "user\u061c@example.com",
  "user@example.com\u0085x",
  "user\u007f@example.com",
  "user\u001b@example.com",
  "user\u2029@example.com",
  "user\ue000@example.com",
];

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

async function retired_context_key(
  context: string,
): Promise<{ key: CryptoKey; encoded: string }> {
  const raw = new Uint8Array(
    await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode("undefined" + context),
    ),
  );
  const key = await crypto.subtle.importKey(
    "raw",
    raw,
    { name: "AES-GCM" },
    false,
    ["encrypt", "decrypt"],
  );

  return { key, encoded: to_base64(raw) };
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
      "a@b.co\tc",
      "a@b@c.co",
      "@example.com",
      "user@",
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

  it("opens an address sealed under the retired key while the vault holds it", async () => {
    const retired = await retired_context_key(RECOVERY_CONTEXT);
    const holding = {
      ...vault,
      legacy_keks: [
        { k: retired.encoded, added_at: "2026-01-01T00:00:00.000Z" },
      ],
    } as Vault;

    offer(await seal(retired.key, "retired@example.com"));

    const { data } = await get_recovery_email(holding);

    await settle();

    expect(data.email).toBe("retired@example.com");
    expect(post_calls).toEqual([]);
    expect(put_calls.map((call) => call.url)).toEqual([
      "/core/v1/recovery/email/reseal",
    ]);
    expect(Object.keys(put_calls[0].body as object).sort()).toEqual([
      "email_hash",
      "email_nonce",
      "encrypted_email",
    ]);
    expect((put_calls[0].body as { email_hash: string }).email_hash).toBe(
      "hash:retired@example.com",
    );

    const moved = put_calls[0].body as SealedBlob;

    clear_recovery_email_cache();
    put_calls.length = 0;
    offer(moved);
    expect((await get_recovery_email(vault)).data.email).toBe(
      "retired@example.com",
    );
    await settle();
    expect(put_calls).toEqual([]);
    expect(post_calls.length).toBe(1);
    post_calls.length = 0;
    offer(await seal(retired.key, "retired@example.com"));

    const carried = await reencrypt_recovery_email(
      server_response.encrypted_email as string,
      server_response.email_nonce as string,
      holding,
      next_vault,
    );

    expect(carried).not.toBeNull();
    clear_recovery_email_cache();
    server_response = { ...carried, verified: false, has_server_enc: true };
    expect((await get_recovery_email(next_vault)).data.email).toBe(
      "retired@example.com",
    );
  });

  it("opens what a vault without an identity key sealed", async () => {
    const retired = await retired_context_key(RECOVERY_CONTEXT);

    for (const bare of [{}, { legacy_keks: [] }] as unknown as Vault[]) {
      clear_recovery_email_cache();
      offer(await seal(retired.key, "retired@example.com"));

      expect((await get_recovery_email(bare)).data.email).toBe(
        "retired@example.com",
      );

      await settle();
      expect(post_calls).toEqual([]);
      expect(put_calls).toEqual([]);
    }
  });

  it("does not seal an address for a vault without an identity key", async () => {
    for (const bare of [{}, { identity_key: "" }] as unknown as Vault[]) {
      await expect(
        encrypt_recovery_email("own@example.com", bare),
      ).rejects.toThrow();

      const saved = await save_recovery_email("own@example.com", bare);

      expect(saved.data.success).toBe(false);
      expect(saved.code).toBe(RECOVERY_EMAIL_KEY_UNAVAILABLE_CODE);
      expect(
        await reencrypt_recovery_email(
          "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
          "AAAAAAAAAAAAAAAA",
          vault,
          bare,
        ),
      ).toBeNull();
    }

    expect(put_calls).toEqual([]);
    expect(post_calls).toEqual([]);
  });

  it("tries the next key when an opened blob is not an address", async () => {
    const holding = { ...vault, previous_keys: [OLD_IDENTITY_KEY] } as Vault;

    offer(
      await seal(
        await identity_context_key(OLD_IDENTITY_KEY, RECOVERY_CONTEXT),
        "old.user@example.com",
      ),
    );

    const decrypt = vi
      .spyOn(crypto.subtle, "decrypt")
      .mockImplementationOnce(async () => new Uint8Array([255, 254]).buffer);

    try {
      const { data } = await get_recovery_email(holding);

      expect(data.email).toBe("old.user@example.com");
      expect(decrypt.mock.calls.length).toBeGreaterThan(1);
    } finally {
      decrypt.mockRestore();
    }
  });

  it("does not show an address that carries hidden characters", async () => {
    const recovery_key = await identity_context_key(
      IDENTITY_KEY,
      RECOVERY_CONTEXT,
    );

    for (const text of HIDDEN_CHARACTER_ADDRESSES) {
      clear_recovery_email_cache();
      offer(await seal(recovery_key, text));

      const { data } = await get_recovery_email(vault);

      await settle();

      expect(data.email).toBeNull();
      expect(data.exists).toBe(true);
    }

    expect(post_calls).toEqual([]);
  });

  it("opens addresses that earlier clients accepted", async () => {
    for (const address of EARLIER_CLIENT_ADDRESSES) {
      clear_recovery_email_cache();

      const sealed = await encrypt_recovery_email(address, vault);

      offer({ encrypted_email: sealed.encrypted, email_nonce: sealed.nonce });

      const { data } = await get_recovery_email(vault);

      expect(data.email).toBe(address);

      const carried = await reencrypt_recovery_email(
        sealed.encrypted,
        sealed.nonce,
        vault,
        next_vault,
      );

      expect(carried).not.toBeNull();
    }
  });

  it("stops opening the retired key once the vault no longer holds it", async () => {
    const retired = await retired_context_key(RECOVERY_CONTEXT);
    const other = await retired_context_key("astermail-draft-v1");

    for (const holder of [
      {},
      { legacy_keks: [] },
      { legacy_keks: [{ k: other.encoded, added_at: "" }] },
    ]) {
      clear_recovery_email_cache();
      offer(await seal(retired.key, "retired@example.com"));

      const { data } = await get_recovery_email({
        ...vault,
        ...holder,
      } as Vault);

      expect(data.email).toBeNull();
      expect(data.exists).toBe(true);
    }

    clear_recovery_email_cache();
    offer(await seal(other.key, "retired@example.com"));

    const { data } = await get_recovery_email({
      ...vault,
      legacy_keks: [
        { k: retired.encoded, added_at: "" },
        { k: other.encoded, added_at: "" },
      ],
    } as Vault);

    await settle();

    expect(data.email).toBeNull();
    expect(post_calls).toEqual([]);
  });

  it("opens an internationalized address", async () => {
    for (const address of INTERNATIONAL_ADDRESSES) {
      clear_recovery_email_cache();

      const sealed = await encrypt_recovery_email(address, vault);

      offer({ encrypted_email: sealed.encrypted, email_nonce: sealed.nonce });

      const { data } = await get_recovery_email(vault);

      expect(data.email).toBe(address);

      const carried = await reencrypt_recovery_email(
        sealed.encrypted,
        sealed.nonce,
        vault,
        next_vault,
      );

      expect(carried).not.toBeNull();
    }
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
    expect(rejected.code).toBe(INVALID_RECOVERY_EMAIL_CODE);
    expect(put_calls).toEqual([]);

    const accepted = await save_recovery_email(" User@Example.com ", vault);

    expect(accepted.data.success).toBe(true);
    expect(put_calls.length).toBe(1);
    expect(
      (put_calls[0].body as { plaintext_email: string }).plaintext_email,
    ).toBe("user@example.com");
  });

  it("keeps the strict check for saving", async () => {
    for (const address of EARLIER_CLIENT_ADDRESSES) {
      expect(is_readable_recovery_email(address)).toBe(true);
      expect(is_valid_recovery_email(address)).toBe(false);
      expect((await save_recovery_email(address, vault)).data.success).toBe(
        false,
      );
    }

    expect(put_calls).toEqual([]);
  });

  it("reads only a single line with one separator", () => {
    expect(is_readable_recovery_email("user@example.com")).toBe(true);
    expect(is_readable_recovery_email("a@b.co\nsecond line")).toBe(false);
    expect(is_readable_recovery_email("a@b.co\r")).toBe(false);
    expect(is_readable_recovery_email("a@b.co\u2028c")).toBe(false);
    expect(is_readable_recovery_email("a@b.co\u0000")).toBe(false);
    expect(is_readable_recovery_email("a@b.co, c@d.co")).toBe(false);
    expect(is_readable_recovery_email("no-at-sign")).toBe(false);
    expect(is_readable_recovery_email("@example.com")).toBe(false);
    expect(is_readable_recovery_email("user@")).toBe(false);
    expect(is_readable_recovery_email("")).toBe(false);
    expect(is_readable_recovery_email(null)).toBe(false);
    for (const address of HIDDEN_CHARACTER_ADDRESSES) {
      expect(is_readable_recovery_email(address)).toBe(false);
    }
    for (const address of INTERNATIONAL_ADDRESSES) {
      expect(is_readable_recovery_email(address)).toBe(true);
    }
    expect(is_readable_recovery_email(`${"x".repeat(243)}@example.com`)).toBe(
      false,
    );
    expect(is_readable_recovery_email(`${"x".repeat(242)}@example.com`)).toBe(
      true,
    );
  });

  it("accepts ordinary addresses and rejects everything else", () => {
    expect(is_valid_recovery_email("user@example.com")).toBe(true);
    expect(is_valid_recovery_email("first.last+tag@sub.example.org")).toBe(
      true,
    );
    for (const address of INTERNATIONAL_ADDRESSES) {
      expect(is_valid_recovery_email(address)).toBe(true);
    }
    expect(is_valid_recovery_email("jürgen m@example.com")).toBe(false);
    expect(is_valid_recovery_email("a@b.co;c@d.co")).toBe(false);
    expect(is_valid_recovery_email("a@b@c.co")).toBe(false);
    expect(
      is_valid_recovery_email(
        `${"ü".repeat(60)}@${"ü".repeat(70)}.example`,
      ),
    ).toBe(false);
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
