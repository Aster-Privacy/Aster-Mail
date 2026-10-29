// @vitest-environment happy-dom
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
import type { EncryptedVault } from "@/services/crypto/key_manager_core";

import { describe, it, expect, beforeEach, vi } from "vitest";

import { encrypt_vault } from "@/services/crypto/key_manager";

const h = vi.hoisted(() => ({
  response: null as unknown,
  throws: false,
}));

vi.mock("@/services/api/client", () => ({
  api_client: {
    get: async () => {
      if (h.throws) throw new Error("offline");

      return h.response;
    },
  },
}));

import {
  load_password_change_vault,
  PASSWORD_CHANGE_VAULT_ERROR_KEYS,
} from "./password_change_vault";

import { en } from "@/lib/i18n/translations/en";

const PASSWORD = "current-password";

function vault_with(ratchet_identity_public: string): EncryptedVault {
  return {
    identity_key: "identity-A",
    signed_prekey: "sp",
    signed_prekey_private: "spp",
    recovery_codes: [],
    ratchet_identity_key: `ik-${ratchet_identity_public}`,
    ratchet_identity_public,
    ratchet_signed_prekey: "spk",
    ratchet_signed_prekey_public: "spkpub",
  };
}

async function cache(vault: EncryptedVault, password = PASSWORD) {
  const sealed = await encrypt_vault(vault, password);

  localStorage.setItem("astermail_encrypted_vault_user-A", sealed.encrypted_vault);
  localStorage.setItem("astermail_vault_nonce_user-A", sealed.vault_nonce);
}

async function serve(vault: EncryptedVault, password = PASSWORD) {
  h.response = { data: await encrypt_vault(vault, password) };
}

beforeEach(() => {
  h.response = null;
  h.throws = false;
  localStorage.clear();
});

describe("load_password_change_vault", () => {
  it("uses the server vault even when the cached copy is stale", async () => {
    await cache(vault_with("stale-cache"));
    await serve(vault_with("server"));

    const loaded = await load_password_change_vault("user-A", PASSWORD);

    expect(loaded.kind).toBe("ok");
    if (loaded.kind !== "ok") return;
    expect(loaded.vault.ratchet_identity_public).toBe("server");
    expect(loaded.server_blob).not.toBeNull();
  });

  it("falls back to the cached vault only when the server has none", async () => {
    await cache(vault_with("cache"));
    h.response = { error: "Resource not found", code: "NOT_FOUND" };

    const loaded = await load_password_change_vault("user-A", PASSWORD);

    expect(loaded.kind).toBe("ok");
    if (loaded.kind !== "ok") return;
    expect(loaded.vault.ratchet_identity_public).toBe("cache");
    expect(loaded.server_blob).toBeNull();
  });

  it("stops when the server vault cannot be read", async () => {
    await cache(vault_with("cache"));

    for (const response of [
      { error: "Service unavailable", code: "UNKNOWN_ERROR" },
      { error: "Too many requests", code: "RATE_LIMITED" },
      { data: {} },
    ]) {
      h.response = response;

      expect(await load_password_change_vault("user-A", PASSWORD)).toEqual({
        kind: "error",
        reason: "unavailable",
      });
    }

    h.throws = true;

    expect(await load_password_change_vault("user-A", PASSWORD)).toEqual({
      kind: "error",
      reason: "unavailable",
    });
  });

  it("stops when the password was changed on another device", async () => {
    await cache(vault_with("cache"));
    await serve(vault_with("server"), "password-set-elsewhere");

    expect(await load_password_change_vault("user-A", PASSWORD)).toEqual({
      kind: "error",
      reason: "out_of_date",
    });
  });

  it("reports a wrong current password", async () => {
    await cache(vault_with("cache"));
    await serve(vault_with("server"));

    expect(await load_password_change_vault("user-A", "wrong")).toEqual({
      kind: "error",
      reason: "wrong_password",
    });
  });

  it("reports a wrong current password when nothing is cached", async () => {
    await serve(vault_with("server"));

    expect(await load_password_change_vault("user-A", "wrong")).toEqual({
      kind: "error",
      reason: "wrong_password",
    });
  });

  it("asks the user to sign in again when the server and cache both lack a vault", async () => {
    h.response = { error: "Resource not found", code: "NOT_FOUND" };

    expect(await load_password_change_vault("user-A", PASSWORD)).toEqual({
      kind: "error",
      reason: "session_expired",
    });
  });

  it("maps every failure to an English message", () => {
    for (const key of Object.values(PASSWORD_CHANGE_VAULT_ERROR_KEYS)) {
      const [namespace, name] = key.split(".");
      const bundle = en as unknown as Record<string, Record<string, string>>;

      expect(bundle[namespace][name]).toBeTruthy();
    }
  });
});
