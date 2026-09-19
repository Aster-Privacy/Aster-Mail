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
import type { EncryptedVault } from "./key_manager_core";

import * as openpgp from "openpgp";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { derive_account_data_key_raw } from "./account_data_key";
import { load_account_keys_for_session } from "./account_key_loader";
import { seal_account_key_token } from "./account_key_token";
import {
  clear_account_key_derived_keks,
  decrypt_aes_gcm_with_fallback,
  get_legacy_crypto_keys,
} from "./legacy_keks";

const api = vi.hoisted(() => ({
  MAX_ACCOUNT_KEY_HISTORY: 64,
  get_account_key_token: vi.fn(),
  get_account_key_token_history: vi.fn(),
}));

vi.mock("@/services/api/account_key", () => api);

const PASS = "pw";

async function make_key() {
  return openpgp.generateKey({
    type: "ecc",
    curve: "ed25519Legacy",
    userIDs: [{ name: "me", email: "me@x.com" }],
    passphrase: PASS,
    format: "armored",
  });
}

function vault_with(identity_key: string, previous_keys: string[] = []) {
  return { identity_key, previous_keys } as unknown as EncryptedVault;
}

function token_row(token: string) {
  return {
    token,
    key_fingerprint: "a".repeat(40),
    version: 1,
    updated_at: "",
  };
}

describe("load_account_keys_for_session", () => {
  beforeEach(() => {
    api.get_account_key_token.mockReset();
    api.get_account_key_token_history.mockReset();
    api.get_account_key_token_history.mockResolvedValue([]);
  });

  afterEach(() => {
    clear_account_key_derived_keks();
  });

  it("does nothing when the account has no token", async () => {
    const me = await make_key();

    api.get_account_key_token.mockResolvedValue(null);

    await expect(
      load_account_keys_for_session(vault_with(me.privateKey), PASS),
    ).resolves.toBe(0);
    expect(api.get_account_key_token_history).not.toHaveBeenCalled();
    expect(get_legacy_crypto_keys()).toHaveLength(0);
  });

  it("loads the current key and older keys from history", async () => {
    const old_identity = await make_key();
    const identity = await make_key();
    const current_key = Uint8Array.from({ length: 32 }, (_, i) => i);
    const older_key = Uint8Array.from({ length: 32 }, (_, i) => 100 + i);

    api.get_account_key_token.mockResolvedValue(
      token_row(
        await seal_account_key_token(current_key, identity.privateKey, PASS),
      ),
    );
    api.get_account_key_token_history.mockResolvedValue([
      {
        ...token_row(
          await seal_account_key_token(
            older_key,
            old_identity.privateKey,
            PASS,
          ),
        ),
        archived_at: "",
      },
    ]);

    await expect(
      load_account_keys_for_session(
        vault_with(identity.privateKey, [old_identity.privateKey]),
        PASS,
      ),
    ).resolves.toBe(2);

    const raw = await derive_account_data_key_raw(
      older_key,
      "astermail-tags-v1",
    );
    const key = await crypto.subtle.importKey("raw", raw, "AES-GCM", false, [
      "encrypt",
    ]);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ciphertext = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      key,
      new TextEncoder().encode("[]"),
    );
    const stale = await crypto.subtle.importKey(
      "raw",
      crypto.getRandomValues(new Uint8Array(32)),
      "AES-GCM",
      false,
      ["decrypt"],
    );
    const plaintext = await decrypt_aes_gcm_with_fallback(
      stale,
      ciphertext,
      iv,
    );

    expect(new TextDecoder().decode(plaintext)).toBe("[]");
  });

  it("skips a token it cannot open without failing", async () => {
    const me = await make_key();
    const stranger = await make_key();

    api.get_account_key_token.mockResolvedValue(
      token_row(
        await seal_account_key_token(
          new Uint8Array(32).fill(9),
          stranger.privateKey,
          PASS,
        ),
      ),
    );

    await expect(
      load_account_keys_for_session(vault_with(me.privateKey), PASS),
    ).resolves.toBe(0);
    expect(get_legacy_crypto_keys()).toHaveLength(0);
  });

  it("keeps the current key when the history request fails", async () => {
    const me = await make_key();

    api.get_account_key_token.mockResolvedValue(
      token_row(
        await seal_account_key_token(
          new Uint8Array(32).fill(4),
          me.privateKey,
          PASS,
        ),
      ),
    );
    api.get_account_key_token_history.mockRejectedValue(new Error("offline"));

    await expect(
      load_account_keys_for_session(vault_with(me.privateKey), PASS),
    ).rejects.toThrow("offline");
    expect(get_legacy_crypto_keys().length).toBeGreaterThan(0);
  });

  it("propagates a failed token request so the caller can retry", async () => {
    const me = await make_key();

    api.get_account_key_token.mockRejectedValue(new Error("offline"));

    await expect(
      load_account_keys_for_session(vault_with(me.privateKey), PASS),
    ).rejects.toThrow("offline");
  });

  it("drops the result when the user signs out mid-load", async () => {
    const me = await make_key();
    const token = await seal_account_key_token(
      new Uint8Array(32).fill(3),
      me.privateKey,
      PASS,
    );

    api.get_account_key_token.mockImplementation(async () => {
      clear_account_key_derived_keks();

      return token_row(token);
    });

    await expect(
      load_account_keys_for_session(vault_with(me.privateKey), PASS),
    ).resolves.toBe(0);
    expect(get_legacy_crypto_keys()).toHaveLength(0);
  });
});
