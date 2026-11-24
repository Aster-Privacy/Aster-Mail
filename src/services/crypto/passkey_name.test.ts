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

const h = vi.hoisted(() => ({
  key: null as CryptoKey | null,
  last_post: null as Record<string, unknown> | null,
  last_put: null as Record<string, unknown> | null,
  listed: [] as { id: string; name_encrypted: string | null }[],
  sealed_names: false,
}));

vi.mock("@/services/api/account_key", () => ({
  get_account_key_capabilities: async () => ({
    sealed_passkey_names: h.sealed_names,
  }),
}));

vi.mock("@/services/crypto/storage_write_key", async (import_original) => ({
  ...(await import_original<
    typeof import("@/services/crypto/storage_write_key")
  >()),
  get_storage_write_crypto_key: async () => h.key,
}));

vi.mock("@/services/api/client", () => ({
  api_client: {
    get: vi.fn(async () => ({
      data: {
        keys: h.listed.map((entry) => ({
          ...entry,
          type: "security_key",
          is_passkey: true,
          registered_at: "2026-01-01T00:00:00Z",
          last_used: null,
        })),
      },
    })),
    post: vi.fn(async (_url: string, body: Record<string, unknown>) => {
      h.last_post = body;

      return { data: { success: true } };
    }),
    put: vi.fn(async (_url: string, body: Record<string, unknown>) => {
      h.last_put = body;

      return { data: { success: true } };
    }),
  },
}));

vi.mock("@/services/api/csrf", () => ({ clear_csrf_cache: vi.fn() }));

vi.mock("@/lib/i18n/translations", () => ({
  get_active_translations: () => ({
    errors: { encryption_keys_unavailable: "keys unavailable" },
    passkeys: { unnamed_security_key: "Security key" },
  }),
}));

import {
  is_sealed_passkey_name,
  open_passkey_name,
  seal_passkey_name,
  SEALED_PASSKEY_NAME_PREFIX,
} from "@/services/crypto/passkey_name";
import { array_to_base64 } from "@/services/crypto/base64";
import {
  complete_hardware_key_registration,
  list_hardware_keys,
  rename_hardware_key,
} from "@/services/api/webauthn";

async function new_key(): Promise<CryptoKey> {
  return crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, [
    "encrypt",
    "decrypt",
  ]);
}

async function seal_raw(key: CryptoKey, text: string): Promise<string> {
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const sealed = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: nonce },
      key,
      new TextEncoder().encode(text),
    ),
  );
  const packed = new Uint8Array(12 + sealed.length);

  packed.set(nonce, 0);
  packed.set(sealed, 12);

  return SEALED_PASSKEY_NAME_PREFIX + array_to_base64(packed);
}

function registration(name: string | null) {
  return {
    id: "cred",
    raw_id: "cred",
    response: { attestation_object: "", client_data_json: "" },
    type: "public-key",
    name_encrypted: name,
    challenge_token: "token",
    is_passkey: true,
  };
}

describe("passkey names", () => {
  beforeEach(async () => {
    h.key = await new_key();
    h.last_post = null;
    h.last_put = null;
    h.listed = [];
    h.sealed_names = false;
  });

  it("seals a name so the stored value does not reveal it", async () => {
    const sealed = await seal_passkey_name("Work laptop");

    expect(is_sealed_passkey_name(sealed)).toBe(true);
    expect(sealed).not.toContain("Work laptop");
    expect(await open_passkey_name(sealed)).toBe("Work laptop");
  });

  it("keeps showing names saved in plain text by older apps", async () => {
    expect(await open_passkey_name("Office key")).toBe("Office key");
    expect(await open_passkey_name(null)).toBeNull();
  });

  it("refuses a value the server copied from another sealed field", async () => {
    const other_field = await seal_raw(h.key!, "billing");

    expect(await open_passkey_name(other_field)).toBeNull();
  });

  it("refuses a sealed name that was changed", async () => {
    const sealed = await seal_passkey_name("Work laptop");
    const body = sealed.slice(SEALED_PASSKEY_NAME_PREFIX.length);
    const flipped =
      body.slice(0, 20) + (body[20] === "A" ? "B" : "A") + body.slice(21);

    expect(
      await open_passkey_name(SEALED_PASSKEY_NAME_PREFIX + flipped),
    ).toBeNull();
    expect(await open_passkey_name(SEALED_PASSKEY_NAME_PREFIX + "AAAA")).toBeNull();
  });

  it("refuses a name sealed with a key that is not the account's", async () => {
    const foreign = await seal_raw(
      await new_key(),
      "aster-passkey-name-v1\u0000Planted",
    );

    expect(await open_passkey_name(foreign)).toBeNull();
  });

  it("sends sealed names once the server supports them", async () => {
    h.sealed_names = true;

    await complete_hardware_key_registration(registration("Phone"));
    await rename_hardware_key("key-1", "Desk key");

    const registered = h.last_post?.name_encrypted as string;
    const renamed = h.last_put?.friendly_name as string;

    expect(is_sealed_passkey_name(registered)).toBe(true);
    expect(is_sealed_passkey_name(renamed)).toBe(true);
    expect(await open_passkey_name(registered)).toBe("Phone");
    expect(await open_passkey_name(renamed)).toBe("Desk key");
  });

  it("shows decrypted and old plain names in the list", async () => {
    h.listed = [
      { id: "a", name_encrypted: await seal_passkey_name("Phone") },
      { id: "b", name_encrypted: "Old key" },
      { id: "c", name_encrypted: null },
    ];

    const response = await list_hardware_keys();

    expect(response.data?.keys.map((key) => key.name_encrypted)).toEqual([
      "Phone",
      "Old key",
      null,
    ]);
  });

  it("keeps sending plain names until the server supports sealed ones", async () => {
    await complete_hardware_key_registration(registration("Phone"));
    const renamed = await rename_hardware_key("key-1", "Desk key");

    expect(h.last_post?.name_encrypted).toBe("Phone");
    expect(h.last_put?.friendly_name).toBe("Desk key");
    expect(renamed.error).toBeUndefined();
  });

  it("falls back to the plain name when the account key is missing", async () => {
    h.sealed_names = true;
    h.key = null;

    await complete_hardware_key_registration(registration("Phone"));
    const renamed = await rename_hardware_key("key-1", "Desk key");

    expect(h.last_post?.name_encrypted).toBe("Phone");
    expect(h.last_put?.friendly_name).toBe("Desk key");
    expect(renamed.error).toBeUndefined();
  });

  it("clears a name without sealing anything", async () => {
    h.sealed_names = true;

    await rename_hardware_key("key-1", null);

    expect(h.last_put?.friendly_name).toBeNull();
  });
});
