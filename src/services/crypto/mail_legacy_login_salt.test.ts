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
import type { MailItem } from "@/services/api/mail";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./vault_level2", () => ({
  is_level2_admitted: () => false,
}));

vi.mock("./storage_write_key", async (import_original) => ({
  ...(await import_original<typeof import("./storage_write_key")>()),
  get_storage_write_crypto_key: async () => null,
}));

vi.mock("@/services/api/auth", async (import_original) => ({
  ...(await import_original<typeof import("@/services/api/auth")>()),
  get_retired_login_salts: async () => [],
}));

import {
  clear_auth_salt_session_state,
  note_auth_salt_used,
} from "./auth_salt_guard";
import { array_to_base64, base64_to_array } from "./base64";
import {
  decrypt_envelope_with_bytes,
  decrypt_envelope_with_identity_key,
} from "./envelope";
import {
  clear_legacy_keks_from_memory,
  load_legacy_keks_into_memory,
} from "./legacy_keks";
import {
  type MailLegacyMigrationDeps,
  read_mail_legacy_migration_state,
  run_mail_legacy_migration,
} from "./mail_legacy_migration";
import { reset_mail_legacy_retirement } from "./mail_legacy_retirement";
import {
  is_legacy_unverified,
  read_sent_encryption_evidence,
  sent_copy_encryption_scope,
  settle_legacy_unverified,
} from "./sent_encryption_evidence";

const IDENTITY = "identity-key-for-tests";
const OWNER = "user-1";
const V1_NONCE = array_to_base64(new Uint8Array([1]));
const PASSPHRASE = new Uint8Array(32).fill(9);

function memory_store(): Storage {
  const map = new Map<string, string>();

  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
    removeItem: (key: string) => void map.delete(key),
    clear: () => map.clear(),
    key: () => null,
    get length() {
      return map.size;
    },
  };
}

function login_salt(): Uint8Array {
  return Uint8Array.from({ length: 16 }, (_, i) => (0x51 + i * 29) & 0xff);
}

async function login_hash(
  passphrase: Uint8Array,
  salt: Uint8Array,
): Promise<Uint8Array> {
  const material = await crypto.subtle.importKey(
    "raw",
    passphrase,
    "PBKDF2",
    false,
    ["deriveBits"],
  );

  return new Uint8Array(
    await crypto.subtle.deriveBits(
      { name: "PBKDF2", salt, iterations: 310000, hash: "SHA-256" },
      material,
      256,
    ),
  );
}

async function login_salted_item(
  id: string,
  body: object,
): Promise<{ item: MailItem; key: Uint8Array }> {
  return item_from_login_hash(
    id,
    body,
    await login_hash(PASSPHRASE, login_salt()),
  );
}

async function item_from_login_hash(
  id: string,
  body: object,
  key: Uint8Array,
): Promise<{ item: MailItem; key: Uint8Array }> {
  const salt = login_salt();
  const aes = await crypto.subtle.importKey(
    "raw",
    key,
    { name: "AES-GCM" },
    false,
    ["encrypt"],
  );
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const sealed = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      aes,
      new TextEncoder().encode(JSON.stringify(body)),
    ),
  );
  const combined = new Uint8Array(salt.length + iv.length + sealed.length);

  combined.set(salt, 0);
  combined.set(iv, salt.length);
  combined.set(sealed, salt.length + iv.length);
  note_auth_salt_used(salt);

  return {
    item: {
      id,
      item_type: "sent",
      encrypted_envelope: array_to_base64(combined),
      envelope_nonce: V1_NONCE,
    } as MailItem,
    key,
  };
}

async function random_salted_item(
  id: string,
  body: object,
  key: Uint8Array,
): Promise<MailItem> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const aes = await crypto.subtle.importKey(
    "raw",
    key,
    { name: "AES-GCM" },
    false,
    ["encrypt"],
  );
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const sealed = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      aes,
      new TextEncoder().encode(JSON.stringify(body)),
    ),
  );
  const combined = new Uint8Array(salt.length + iv.length + sealed.length);

  combined.set(salt, 0);
  combined.set(iv, salt.length);
  combined.set(sealed, salt.length + iv.length);

  return {
    id,
    item_type: "sent",
    encrypted_envelope: array_to_base64(combined),
    envelope_nonce: V1_NONCE,
  } as MailItem;
}

function vault_holding(raw: Uint8Array): EncryptedVault {
  return {
    identity_key: IDENTITY,
    legacy_keks: [
      { k: array_to_base64(raw), added_at: "2026-01-01T00:00:00Z" },
    ],
  } as EncryptedVault;
}

function harness(items: MailItem[], vault: EncryptedVault) {
  const rewrap = vi.fn().mockResolvedValue({ data: { ok: true } });
  const write_marker = vi.fn().mockResolvedValue(true);
  const store = memory_store();
  const deps: MailLegacyMigrationDeps = {
    list: vi.fn().mockResolvedValue({
      data: { items, total: items.length, has_more: false },
    }),
    rewrap,
    update_metadata: vi.fn().mockResolvedValue({ data: { ok: true } }),
    batch_attachment_meta: vi.fn().mockResolvedValue({ data: { items: {} } }),
    update_attachment_meta: vi
      .fn()
      .mockResolvedValue({ data: { status: "ok" } }),
    get_storage_write_crypto_key: async () => null,
    protected_folder_tokens: vi.fn().mockResolvedValue([]),
    get_vault: () => vault,
    get_passphrase_bytes: () => new Uint8Array(PASSPHRASE),
    get_metadata_key: () => new Uint8Array(32).fill(3),
    write_marker,
    stored_keys_ready: vi.fn().mockResolvedValue(true),
    storage: () => store,
    now: () => Date.UTC(2026, 10, 17),
  };

  return { deps, rewrap, write_marker, store };
}

function parse(plaintext: ArrayBuffer): unknown {
  return JSON.parse(new TextDecoder().decode(plaintext));
}

describe("login-salted mail in the legacy pass", () => {
  beforeEach(() => {
    reset_mail_legacy_retirement();
    clear_auth_salt_session_state();
  });

  afterEach(() => {
    reset_mail_legacy_retirement();
    clear_auth_salt_session_state();
    clear_legacy_keks_from_memory();
  });

  it("reseals a login-salted envelope whose key the vault holds", async () => {
    const { item, key } = await login_salted_item("m1", { subject: "kept" });
    const vault = {
      identity_key: IDENTITY,
      legacy_keks: [
        { k: array_to_base64(key), added_at: "2026-01-01T00:00:00Z" },
      ],
    } as EncryptedVault;
    const h = harness([item], vault);

    expect(await run_mail_legacy_migration(OWNER, h.deps)).toBe("done");
    expect(h.rewrap).toHaveBeenCalledTimes(1);

    const [id, request] = h.rewrap.mock.calls[0];

    expect(id).toBe("m1");
    expect(request.envelope_nonce).not.toBe(V1_NONCE);
    expect(
      base64_to_array(request.encrypted_envelope).slice(0, 16),
    ).not.toEqual(login_salt());
    expect(
      await decrypt_envelope_with_identity_key(
        IDENTITY,
        base64_to_array(request.encrypted_envelope),
        base64_to_array(request.envelope_nonce),
        parse,
        { allow_legacy_keys: false },
      ),
    ).toEqual({ subject: "kept", legacy_unverified: true });
    expect(
      read_mail_legacy_migration_state(h.store, OWNER).unreadable_ids ?? [],
    ).toEqual([]);
    expect(h.write_marker).toHaveBeenCalledTimes(1);
  });

  it("reseals an envelope forged from the login hash alone as unverified", async () => {
    const server_known_hash = await login_hash(PASSPHRASE, login_salt());
    const evidence = { outside: 1, outside_pgp: 1, internal_readable: 0 };
    const { item } = await item_from_login_hash(
      "m1",
      { subject: "forged", sent_encryption: evidence },
      new Uint8Array(server_known_hash),
    );
    const vault = {
      identity_key: IDENTITY,
      legacy_keks: [
        {
          k: array_to_base64(server_known_hash),
          added_at: "2026-01-01T00:00:00Z",
        },
      ],
    } as EncryptedVault;
    const h = harness([item], vault);

    expect(await run_mail_legacy_migration(OWNER, h.deps)).toBe("done");
    expect(h.rewrap).toHaveBeenCalledTimes(1);

    const [, request] = h.rewrap.mock.calls[0];
    const resealed = (await decrypt_envelope_with_identity_key(
      IDENTITY,
      base64_to_array(request.encrypted_envelope),
      base64_to_array(request.envelope_nonce),
      parse,
      { allow_legacy_keys: false },
    )) as Record<string, unknown>;

    expect(resealed.legacy_unverified).toBe(true);
    expect(is_legacy_unverified(resealed)).toBe(true);

    const settled = settle_legacy_unverified(resealed);

    expect(read_sent_encryption_evidence(settled)).toBeNull();
    expect(sent_copy_encryption_scope(settled)).toBeUndefined();
    expect(settled).toEqual({ subject: "forged", legacy_unverified: true });
  });

  it("reseals a random-salt envelope opened only by the login-hash fallback as unverified", async () => {
    const server_known_hash = await login_hash(PASSPHRASE, login_salt());
    const evidence = { outside: 1, outside_pgp: 1, internal_readable: 0 };
    const item = await random_salted_item(
      "m1",
      { subject: "forged", sent_encryption: evidence },
      server_known_hash,
    );
    const vault = vault_holding(server_known_hash);

    note_auth_salt_used(login_salt());
    await load_legacy_keks_into_memory(vault.legacy_keks);

    const h = harness([item], vault);

    expect(await run_mail_legacy_migration(OWNER, h.deps)).toBe("done");
    expect(h.rewrap).toHaveBeenCalledTimes(1);

    const [, request] = h.rewrap.mock.calls[0];
    const resealed = (await decrypt_envelope_with_identity_key(
      IDENTITY,
      base64_to_array(request.encrypted_envelope),
      base64_to_array(request.envelope_nonce),
      parse,
      { allow_legacy_keys: false },
    )) as Record<string, unknown>;

    expect(resealed.legacy_unverified).toBe(true);
    expect(is_legacy_unverified(resealed)).toBe(true);

    const settled = settle_legacy_unverified(resealed);

    expect(read_sent_encryption_evidence(settled)).toBeNull();
    expect(sent_copy_encryption_scope(settled)).toBeUndefined();
    expect(settled).toEqual({ subject: "forged", legacy_unverified: true });
  });

  it("marks a random-salt envelope read through the login-hash fallback", async () => {
    const server_known_hash = await login_hash(PASSPHRASE, login_salt());
    const item = await random_salted_item(
      "m1",
      { subject: "forged" },
      server_known_hash,
    );

    note_auth_salt_used(login_salt());
    await load_legacy_keks_into_memory(
      vault_holding(server_known_hash).legacy_keks,
    );

    const opened = await decrypt_envelope_with_bytes<Record<string, unknown>>(
      item.encrypted_envelope!,
      new Uint8Array(PASSPHRASE),
      { allow_legacy_keys: true },
    );

    expect(opened).toEqual({ subject: "forged", legacy_unverified: true });
  });

  it("keeps a random-salt envelope under a key the server cannot derive trusted", async () => {
    const private_key = new Uint8Array(32).fill(4);
    const evidence = { outside: 1, outside_pgp: 1, internal_readable: 0 };
    const item = await random_salted_item(
      "m1",
      { subject: "trusted", sent_encryption: evidence },
      private_key,
    );
    const vault = vault_holding(private_key);

    note_auth_salt_used(login_salt());
    await load_legacy_keks_into_memory(vault.legacy_keks);

    const h = harness([item], vault);

    expect(await run_mail_legacy_migration(OWNER, h.deps)).toBe("done");
    expect(h.rewrap).toHaveBeenCalledTimes(1);

    const [, request] = h.rewrap.mock.calls[0];
    const resealed = (await decrypt_envelope_with_identity_key(
      IDENTITY,
      base64_to_array(request.encrypted_envelope),
      base64_to_array(request.envelope_nonce),
      parse,
      { allow_legacy_keys: false },
    )) as Record<string, unknown>;

    expect(is_legacy_unverified(resealed)).toBe(false);
    expect(read_sent_encryption_evidence(resealed)).not.toBeNull();
    expect(resealed.subject).toBe("trusted");
  });

  it("refuses a login-salted envelope whose key the vault does not hold and still finishes", async () => {
    const { item } = await login_salted_item("m1", { subject: "forged" });
    const vault = {
      identity_key: IDENTITY,
      legacy_keks: [
        {
          k: array_to_base64(new Uint8Array(32).fill(4)),
          added_at: "2026-01-01T00:00:00Z",
        },
      ],
    } as EncryptedVault;
    const h = harness([item], vault);

    expect(await run_mail_legacy_migration(OWNER, h.deps)).toBe("done");
    expect(h.rewrap).not.toHaveBeenCalled();
    expect(
      read_mail_legacy_migration_state(h.store, OWNER).unreadable_ids,
    ).toEqual(["m1"]);
    expect(h.write_marker).toHaveBeenCalledTimes(1);
  });
});
