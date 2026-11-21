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
import { describe, it, expect, beforeEach, vi } from "vitest";

const h = vi.hoisted(() => ({
  store: new Map<string, unknown>(),
}));

vi.mock("@/services/crypto/secure_storage", () => ({
  device_store: vi.fn(async (key: string, value: unknown) => {
    h.store.set(key, JSON.parse(JSON.stringify(value)));
    localStorage.setItem(key, "wrapped");
  }),
  device_retrieve: vi.fn(async (key: string) => h.store.get(key) ?? null),
}));

import { clear_auth_salt_session_state } from "@/services/crypto/auth_salt_guard";
import { array_to_base64, base64_to_array } from "@/services/crypto/base64";
import {
  decrypt_envelope_plaintext_with_bytes,
  decrypt_envelope_with_bytes,
  encrypt_envelope_with_bytes,
} from "@/services/crypto/envelope";
import { derive_password_hash } from "@/services/crypto/key_manager_pgp_keygen";

const password = "orchard lantern copper 4471";

function password_bytes(): Uint8Array {
  return new TextEncoder().encode(password);
}

function login_salt(fill: number): Uint8Array {
  const salt = new Uint8Array(16);

  for (let i = 0; i < salt.length; i += 1) {
    salt[i] = (fill + i * 37) & 0xff;
  }

  return salt;
}

async function plant_with_server_hash(
  salt: Uint8Array,
  server_hash_b64: string,
  value: unknown,
): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    base64_to_array(server_hash_b64),
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt"],
  );
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const sealed = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: nonce },
      key,
      new TextEncoder().encode(JSON.stringify(value)),
    ),
  );
  const combined = new Uint8Array(salt.length + nonce.length + sealed.length);

  combined.set(salt, 0);
  combined.set(nonce, salt.length);
  combined.set(sealed, salt.length + nonce.length);

  return array_to_base64(combined);
}

describe("stored envelopes sealed under a login salt", () => {
  beforeEach(() => {
    localStorage.clear();
    h.store.clear();
    clear_auth_salt_session_state();
  });

  it("refuses an envelope keyed by the login hash sent at sign-in", async () => {
    const salt = login_salt(3);
    const { hash } = await derive_password_hash(password, salt);
    const planted = await plant_with_server_hash(salt, hash, {
      subject: "planted",
    });

    expect(await decrypt_envelope_with_bytes(planted, password_bytes())).toBe(
      null,
    );
  });

  it("refuses the plaintext read of the same envelope", async () => {
    const salt = login_salt(11);
    const { hash } = await derive_password_hash(password, salt);
    const planted = await plant_with_server_hash(salt, hash, {
      subject: "planted",
    });

    expect(
      await decrypt_envelope_plaintext_with_bytes(planted, password_bytes()),
    ).toBe(null);
  });

  it("still refuses after a reload clears the session state", async () => {
    const salt = login_salt(29);
    const { hash } = await derive_password_hash(password, salt);
    const planted = await plant_with_server_hash(salt, hash, {
      subject: "planted",
    });

    clear_auth_salt_session_state();

    expect(await decrypt_envelope_with_bytes(planted, password_bytes())).toBe(
      null,
    );
  });

  it("refuses a salt that only the sign-in record remembers", async () => {
    const salt = login_salt(53);
    const { hash } = await derive_password_hash(password, salt);
    const planted = await plant_with_server_hash(salt, hash, {
      subject: "planted",
    });

    localStorage.clear();
    clear_auth_salt_session_state();
    localStorage.setItem(
      "aster:login_salt_records",
      JSON.stringify([{ key: "uh:record", salt: array_to_base64(salt) }]),
    );

    expect(
      await decrypt_envelope_plaintext_with_bytes(planted, password_bytes()),
    ).toBe(null);
  });

  it("keeps reading envelopes sealed with a random salt", async () => {
    await derive_password_hash(password, login_salt(71));

    const sealed = await encrypt_envelope_with_bytes(
      { subject: "kept" },
      password_bytes(),
    );

    expect(
      await decrypt_envelope_with_bytes<{ subject: string }>(
        sealed.encrypted,
        password_bytes(),
      ),
    ).toMatchObject({ subject: "kept" });
  });
});
