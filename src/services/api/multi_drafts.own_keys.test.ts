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
import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => ({
  get_mock: vi.fn(),
  post_mock: vi.fn(),
}));

vi.mock("./client", () => ({
  api_client: {
    get: h.get_mock,
    post: h.post_mock,
    put: vi.fn(),
    delete: vi.fn(),
  },
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

vi.mock("@/services/crypto/account_data_writer", () => ({
  account_data_write_key: async () => null,
  retry_after_account_key_load: (call: () => unknown) => call(),
}));

vi.mock("@/services/crypto/memory_key_store", async (import_original) => {
  const actual =
    await import_original<
      typeof import("@/services/crypto/memory_key_store")
    >();

  return {
    ...actual,
    get_passphrase_from_memory: () => null,
    get_passphrase_bytes: () => null,
    wait_for_keys_ready: async () => undefined,
  };
});

import { create_draft, get_draft } from "./multi_drafts";
import {
  clear_account_key_derived_keks,
  clear_legacy_keks_from_memory,
  get_account_key_generation,
  load_account_key_derived_keks_into_memory,
  load_legacy_keks_into_memory,
  set_retired_read_guard,
} from "@/services/crypto/legacy_keks";
import { derive_account_data_key_raw } from "@/services/crypto/account_data_key";
import { encrypt_envelope_v2 } from "@/services/crypto/envelope_v2";
import { server_known_kek_id } from "@/services/crypto/server_known_keys";
import { get_active_translations } from "@/lib/i18n/translations";

const IDENTITY = "current identity key material";
const PREVIOUS = "previous identity key material";
const RETIRED_DRAFT_KEY = "p5wYaTDKBk/9JqOzqdOKL4c0JJF9CiKwLCqNNFvN7gQ=";
const CONTENT = {
  to_recipients: ["friend@example.com"],
  cc_recipients: [],
  bcc_recipients: [],
  subject: "Plans",
  message: "<p>See you then</p>",
};
const PLANTED = { ...CONTENT, subject: "Planted" };
const PLACEHOLDER_IDENTITIES = ["undefined", "null", ""];
const PLACEHOLDER_DRAFT_KEYS = PLACEHOLDER_IDENTITIES.flatMap((placeholder) =>
  ["astermail-draft-v2", "astermail-draft-v1"].map(
    (suffix) => [placeholder, suffix] as const,
  ),
);

function to_base64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}

function from_base64(value: string): Uint8Array {
  return Uint8Array.from(atob(value), (c) => c.charCodeAt(0));
}

async function sha256(text: string): Promise<Uint8Array> {
  return new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)),
  );
}

async function seal_raw(
  raw: Uint8Array,
  content: object = CONTENT,
): Promise<{ encrypted: string; nonce: string }> {
  const key = await crypto.subtle.importKey(
    "raw",
    raw,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt"],
  );
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: nonce },
    key,
    new TextEncoder().encode(JSON.stringify(content)),
  );

  return {
    encrypted: to_base64(new Uint8Array(ciphertext)),
    nonce: to_base64(nonce),
  };
}

function vault(extra: Record<string, unknown> = {}) {
  return { identity_key: IDENTITY, previous_keys: [], ...extra } as never;
}

async function open_draft(
  sealed: { encrypted: string; nonce: string },
  owner = vault(),
) {
  h.get_mock.mockResolvedValueOnce({
    data: {
      id: "d1",
      draft_type: "new",
      encrypted_content: sealed.encrypted,
      content_nonce: sealed.nonce,
      version: 1,
      content_hash: "",
      size_bytes: 0,
      has_attachments: false,
      attachment_count: 0,
      created_at: "",
      updated_at: "",
      expires_at: "",
    },
  });

  return get_draft("d1", owner);
}

function expect_refused(result: { data?: unknown; error?: string }) {
  expect(result.data).toBeNull();
  expect(result.error).toBe(
    get_active_translations().errors.failed_decrypt_draft,
  );
}

async function load_account_key(): Promise<Uint8Array> {
  const account_key = crypto.getRandomValues(new Uint8Array(32));

  await load_account_key_derived_keks_into_memory(
    account_key,
    get_account_key_generation(),
  );

  return account_key;
}

describe("draft open keys", () => {
  beforeEach(() => {
    h.get_mock.mockReset();
    h.post_mock.mockReset();
    clear_legacy_keks_from_memory();
    clear_account_key_derived_keks();
    set_retired_read_guard(null);
  });

  it("opens a draft under the current identity key", async () => {
    const sealed = await seal_raw(
      await sha256(IDENTITY + "astermail-draft-v2"),
    );
    const result = await open_draft(sealed);

    expect(result.data?.content.subject).toBe("Plans");
  });

  it("opens a draft written under a previous identity key", async () => {
    const sealed = await seal_raw(
      await sha256(PREVIOUS + "astermail-draft-v2"),
    );
    const result = await open_draft(
      sealed,
      vault({ previous_keys: [PREVIOUS] }),
    );

    expect(result.data?.content.subject).toBe("Plans");
  });

  it("opens a draft written under the account draft key", async () => {
    const account_key = await load_account_key();
    const sealed = await seal_raw(
      await derive_account_data_key_raw(account_key, "astermail-draft-v2"),
    );
    const result = await open_draft(sealed);

    expect(result.data?.content.subject).toBe("Plans");
  });

  it("opens a stored envelope under the account data key", async () => {
    const raw = crypto.getRandomValues(new Uint8Array(32));
    const sealed = await encrypt_envelope_v2(CONTENT, raw);
    const result = await open_draft(
      sealed,
      vault({ data_kek: to_base64(raw) }),
    );

    expect(result.data?.content.subject).toBe("Plans");
  });

  it("refuses a draft sealed under the retired public draft key", async () => {
    await load_legacy_keks_into_memory([
      { k: RETIRED_DRAFT_KEY, added_at: "2026-01-01T00:00:00Z" },
    ]);
    set_retired_read_guard(() => true);

    const sealed = await seal_raw(from_base64(RETIRED_DRAFT_KEY), PLANTED);

    expect_refused(await open_draft(sealed));
  });

  it("refuses a draft that opens only under a legacy key", async () => {
    const legacy = crypto.getRandomValues(new Uint8Array(32));

    await load_legacy_keks_into_memory([
      { k: to_base64(legacy), added_at: "2026-01-01T00:00:00Z" },
    ]);

    const sealed = await seal_raw(legacy, PLANTED);

    expect_refused(await open_draft(sealed));
  });

  it("refuses a draft sealed under another account data context", async () => {
    const account_key = await load_account_key();
    const sealed = await seal_raw(
      await derive_account_data_key_raw(account_key, "astermail-tags-v1"),
      PLANTED,
    );

    expect_refused(await open_draft(sealed));
  });

  it("refuses a stored envelope under a data key the server knows", async () => {
    const raw = crypto.getRandomValues(new Uint8Array(32));
    const sealed = await encrypt_envelope_v2(PLANTED, raw);
    const result = await open_draft(
      sealed,
      vault({
        data_kek: to_base64(raw),
        server_known_kek_ids: [server_known_kek_id(raw)],
      }),
    );

    expect_refused(result);
  });

  it("opens an identity key envelope draft", async () => {
    const sealed = await seal_raw(
      await sha256(IDENTITY + "astermail-envelope-v1"),
    );
    const result = await open_draft(sealed);

    expect(result.data?.content.subject).toBe("Plans");
  });

  it.each(PLACEHOLDER_DRAFT_KEYS)(
    "refuses a draft keyed to the placeholder identity %j with %s",
    async (placeholder, suffix) => {
      const sealed = await seal_raw(
        await sha256(placeholder + suffix),
        PLANTED,
      );

      expect_refused(
        await open_draft(sealed, vault({ identity_key: placeholder })),
      );
    },
  );

  it.each(PLACEHOLDER_DRAFT_KEYS)(
    "refuses a draft keyed to the placeholder previous identity %j with %s",
    async (placeholder, suffix) => {
      const sealed = await seal_raw(
        await sha256(placeholder + suffix),
        PLANTED,
      );

      expect_refused(
        await open_draft(sealed, vault({ previous_keys: [placeholder] })),
      );
    },
  );

  it.each(PLACEHOLDER_DRAFT_KEYS)(
    "refuses a draft keyed to the placeholder identity %j with %s when the vault lists that key",
    async (placeholder, suffix) => {
      const raw = await sha256(placeholder + suffix);

      await load_legacy_keks_into_memory([
        { k: to_base64(raw), added_at: "2026-01-01T00:00:00Z" },
      ]);
      set_retired_read_guard(() => true);

      const sealed = await seal_raw(raw, PLANTED);

      expect_refused(await open_draft(sealed));
    },
  );

  it.each(PLACEHOLDER_IDENTITIES)(
    "refuses an envelope draft keyed to the placeholder identity %j",
    async (placeholder) => {
      const sealed = await seal_raw(
        await sha256(placeholder + "astermail-envelope-v1"),
        PLANTED,
      );

      expect_refused(
        await open_draft(
          sealed,
          vault({ legacy_identity_keys: [placeholder] }),
        ),
      );
    },
  );

  it.each(PLACEHOLDER_IDENTITIES)(
    "does not save a draft for the placeholder identity %j",
    async (placeholder) => {
      const result = await create_draft(
        CONTENT,
        vault({ identity_key: placeholder }),
      );

      expect(result.data).toBeUndefined();
      expect(result.error).toBe(
        get_active_translations().errors.failed_encrypt_draft,
      );
      expect(h.post_mock).not.toHaveBeenCalled();
    },
  );

  it("refuses plain JSON stored as a draft", async () => {
    const result = await open_draft({
      encrypted: to_base64(new TextEncoder().encode(JSON.stringify(PLANTED))),
      nonce: to_base64(new Uint8Array(12)),
    });

    expect_refused(result);
  });
});
