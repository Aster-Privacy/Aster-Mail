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
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import * as openpgp from "openpgp";

const h = vi.hoisted(() => ({
  get_mock: vi.fn(),
  identity_key: "",
  passphrase: "draft passphrase",
}));

vi.mock("./client", () => ({
  api_client: {
    get: h.get_mock,
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock("@/services/crypto/legacy_keks", () => ({
  decrypt_aes_gcm_with_fallback: async () => {
    throw new Error("not an account data draft");
  },
  decrypt_account_context_with_fallback: async () => {
    throw new Error("not an account data draft");
  },
  get_account_data_crypto_keys: () => [],
}));

vi.mock("@/hooks/use_mail_stats", () => ({
  invalidate_mail_stats: vi.fn(),
}));

vi.mock("@/services/crypto/vault_refresh", () => ({
  fetch_refreshed_vault: async () => null,
  adopt_refreshed_vault: async () => undefined,
}));

vi.mock("@/services/crypto/vault_key_recovery", () => ({
  recover_pgp_keys_from_history: async () => null,
  keys_added_by_recovery: () => [],
}));

vi.mock("@/workers/pgp_decrypt_pool", async () => {
  const { decrypt_message_with_any_key } =
    await import("@/services/crypto/key_manager_pgp_messages");

  return {
    decrypt_pgp_message_parallel: (
      ciphertext: string,
      keys: string[],
      passphrase: string,
    ) => decrypt_message_with_any_key(ciphertext, keys, passphrase),
  };
});

vi.mock("@/services/crypto/memory_key_store", async (import_original) => {
  const actual =
    await import_original<
      typeof import("@/services/crypto/memory_key_store")
    >();

  return {
    ...actual,
    get_vault_from_memory: () =>
      h.identity_key
        ? { identity_key: h.identity_key, previous_keys: [] }
        : null,
    get_passphrase_from_memory: () => h.passphrase,
    get_passphrase_bytes: () => new TextEncoder().encode(h.passphrase),
    wait_for_keys_ready: async () => undefined,
  };
});

import { get_draft } from "./multi_drafts";
import {
  encrypt_envelope,
  encrypt_envelope_with_identity_key,
} from "@/services/crypto/envelope";
import { get_active_translations } from "@/lib/i18n/translations";

const PLANTED = {
  to_recipients: ["contact@example.com"],
  bcc_recipients: ["hidden@example.net"],
  subject: "Invoice",
  message: "<p>Please see the attached file</p>",
  from_email: "owner@astermail.org",
};

let own_public = "";

function vault() {
  return { identity_key: h.identity_key, previous_keys: [] } as never;
}

function api_draft(encrypted_content: string, content_nonce: string) {
  return {
    id: "d1",
    draft_type: "new",
    encrypted_content,
    content_nonce,
    version: 1,
    content_hash: "",
    size_bytes: 0,
    has_attachments: false,
    attachment_count: 0,
    created_at: "",
    updated_at: "",
    expires_at: "",
  };
}

function to_base64(text: string): string {
  return btoa(String.fromCharCode(...new TextEncoder().encode(text)));
}

async function open_returned_draft(encrypted: string, nonce: string) {
  h.get_mock.mockResolvedValueOnce({ data: api_draft(encrypted, nonce) });

  return get_draft("d1", vault());
}

beforeAll(async () => {
  const { privateKey, publicKey } = await openpgp.generateKey({
    type: "ecc",
    curve: "curve25519Legacy",
    userIDs: [{ email: "owner@astermail.org" }],
    passphrase: "draft passphrase",
    format: "armored",
  });

  h.identity_key = privateKey;
  own_public = publicKey;
}, 30000);

beforeEach(() => {
  h.get_mock.mockReset();
});

describe("draft envelope fallback", () => {
  it("rejects a plain JSON draft with an empty nonce", async () => {
    const result = await open_returned_draft(
      to_base64(JSON.stringify(PLANTED)),
      "",
    );

    expect(result.data).toBeNull();
    expect(result.error).toBe(
      get_active_translations().errors.failed_decrypt_draft,
    );
  });

  it("rejects a draft encrypted to the owner's public key", async () => {
    const armored = await openpgp.encrypt({
      message: await openpgp.createMessage({ text: JSON.stringify(PLANTED) }),
      encryptionKeys: await openpgp.readKey({ armoredKey: own_public }),
    });

    const result = await open_returned_draft(to_base64(armored as string), "");

    expect(result.data).toBeNull();
    expect(result.error).toBe(
      get_active_translations().errors.failed_decrypt_draft,
    );
  }, 30000);

  it("still opens a draft sealed under the owner's identity key", async () => {
    const sealed = await encrypt_envelope_with_identity_key(
      PLANTED,
      h.identity_key,
    );

    const result = await open_returned_draft(sealed.encrypted, sealed.nonce);

    expect(result.error).toBeUndefined();
    expect(result.data?.content.subject).toBe("Invoice");
    expect(result.data?.content.bcc_recipients).toEqual(["hidden@example.net"]);
  });

  it("still opens a draft sealed under the owner's password", async () => {
    const sealed = await encrypt_envelope(PLANTED, h.passphrase);

    const result = await open_returned_draft(sealed.encrypted, sealed.nonce);

    expect(result.error).toBeUndefined();
    expect(result.data?.content.to_recipients).toEqual(["contact@example.com"]);
  });
});
