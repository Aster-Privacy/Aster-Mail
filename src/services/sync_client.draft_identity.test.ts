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
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

vi.mock("@/services/api/client", () => ({
  api_client: {
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
    get: vi.fn(),
    get_access_token: () => null,
    refresh_session: async () => {},
    is_authenticated: () => false,
  },
}));

vi.mock("@/services/low_network_state", () => ({
  is_low_network: () => false,
}));

vi.mock("@/hooks/email_list_cache", () => ({
  mark_view_stale: vi.fn(),
}));

vi.mock("@/services/category_index", () => ({
  sync_recent: vi.fn(async () => {}),
}));

vi.mock("@/services/crypto/prekey_service", () => ({
  check_and_replenish_prekeys: vi.fn(),
}));

vi.mock("@/services/routing/connection_store", () => ({
  connection_store: { get_method: () => "direct", subscribe: () => () => {} },
}));

vi.mock("@/lib/onion_host", () => ({
  is_onion_host: () => false,
}));

vi.mock("@/services/lockdown_store", () => ({
  is_any_lockdown_active: () => false,
  LOCKDOWN_CHANGED_EVENT: "astermail:lockdown-changed",
}));

import {
  sync_client,
  sync_get_draft,
  sync_get_preferences,
  sync_save_draft,
} from "./sync_client";
import { clear_legacy_keks_from_memory } from "@/services/crypto/legacy_keks";

const IDENTITY = "own-identity-key-material";
const PLACEHOLDER_IDENTITIES = ["undefined", "null", ""];
const DRAFT = {
  to_recipients: ["friend@example.com"],
  cc_recipients: [],
  bcc_recipients: [],
  subject: "Plans",
  message: "See you then",
};
const PLANTED = { ...DRAFT, subject: "Planted" };

function to_base64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}

async function hkdf_key(identity: string, context: string): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const base = await crypto.subtle.importKey(
    "raw",
    encoder.encode(identity),
    "HKDF",
    false,
    ["deriveKey"],
  );

  return crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: new Uint8Array(32),
      info: encoder.encode(context),
    },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt"],
  );
}

async function seal(
  identity: string,
  context: string,
  content: unknown,
): Promise<{ encrypted: string; nonce: string }> {
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: nonce },
    await hkdf_key(identity, context),
    new TextEncoder().encode(JSON.stringify(content)),
  );

  return {
    encrypted: to_base64(new Uint8Array(encrypted)),
    nonce: to_base64(nonce),
  };
}

function vault(identity_key: string) {
  return { identity_key, previous_keys: [] } as never;
}

describe("sync draft keys", () => {
  beforeEach(() => {
    clear_legacy_keks_from_memory();
    vi.spyOn(sync_client, "is_connected").mockReturnValue(true);
    vi.spyOn(sync_client, "wait_for_connection").mockResolvedValue(true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("opens a draft sealed under the account's own identity", async () => {
    vi.spyOn(sync_client, "get_draft").mockResolvedValue(
      await seal(IDENTITY, "astermail-draft-v1", DRAFT),
    );

    expect(await sync_get_draft(vault(IDENTITY))).toEqual(DRAFT);
  });

  it.each(PLACEHOLDER_IDENTITIES)(
    "refuses a draft keyed to the placeholder identity %j",
    async (placeholder) => {
      vi.spyOn(sync_client, "get_draft").mockResolvedValue(
        await seal(placeholder, "astermail-draft-v1", PLANTED),
      );

      expect(await sync_get_draft(vault(placeholder))).toBeNull();
    },
  );

  it.each(PLACEHOLDER_IDENTITIES)(
    "does not save a draft for the placeholder identity %j",
    async (placeholder) => {
      const save = vi.spyOn(sync_client, "save_draft").mockResolvedValue(true);

      expect(await sync_save_draft(vault(placeholder), DRAFT)).toBe(false);
      expect(save).not.toHaveBeenCalled();
    },
  );

  it.each(PLACEHOLDER_IDENTITIES)(
    "keeps default preferences over ones keyed to the placeholder identity %j",
    async (placeholder) => {
      vi.spyOn(sync_client, "get_preferences").mockResolvedValue(
        await seal(placeholder, "astermail-preferences-v1", { theme: "x" }),
      );

      expect(
        await sync_get_preferences(vault(placeholder), { theme: "default" }),
      ).toEqual({ theme: "default" });
    },
  );
});
