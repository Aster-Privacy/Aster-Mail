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
import { sha256 } from "@noble/hashes/sha256";

vi.mock("./vault_level2", () => ({
  is_level2_admitted: () => false,
}));

const write_key_holder = vi.hoisted(() => ({
  key: null as CryptoKey | null,
}));

vi.mock("./storage_write_key", async (import_original) => ({
  ...(await import_original<typeof import("./storage_write_key")>()),
  get_storage_write_crypto_key: async () => write_key_holder.key,
}));

import { array_to_base64, base64_to_array } from "./base64";
import {
  type EncryptedBlob,
  decrypt_envelope_with_identity_key,
  decrypt_metadata,
  encrypt_envelope_with_identity_key,
  encrypt_metadata,
} from "./envelope";
import { envelope_sha256_hex } from "./envelope_v2";
import {
  clear_legacy_keks_from_memory,
  load_legacy_keks_into_memory,
} from "./legacy_keks";
import {
  classify_rewrap_response,
  is_mail_legacy_folder_pass_done,
  migrate_attachment_meta,
  migrate_item_metadata,
  get_mail_legacy_migration_progress,
  read_mail_legacy_migration_state,
  requeue_mail_legacy_skipped_items,
  run_mail_legacy_folder_pass,
  run_mail_legacy_migration,
  start_mail_legacy_migration,
  stop_mail_legacy_migration,
  type MailLegacyMigrationDeps,
} from "./mail_legacy_migration";
import {
  is_mail_legacy_retired,
  merge_mail_legacy_retired_marker,
  read_mail_legacy_retired_pin,
  reset_mail_legacy_retirement,
  sync_mail_legacy_retirement,
} from "./mail_legacy_retirement";

const PUBLIC_RAW = sha256(
  new TextEncoder().encode("undefined" + "astermail-envelope-v1"),
);
const IDENTITY = "identity-key-for-tests";
const OWNER = "user-1";
const METADATA_CONTEXT = "mail-item-metadata";

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

async function seal_identity_under(
  raw: Uint8Array,
  body: unknown,
): Promise<{ encrypted: string; nonce: string }> {
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const key = await crypto.subtle.importKey(
    "raw",
    new Uint8Array(raw),
    { name: "AES-GCM" },
    false,
    ["encrypt"],
  );
  const sealed = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: nonce },
    key,
    new TextEncoder().encode(JSON.stringify(body)),
  );

  return {
    encrypted: array_to_base64(new Uint8Array(sealed)),
    nonce: array_to_base64(nonce),
  };
}

function item(
  id: string,
  envelope: { encrypted: string; nonce: string },
  metadata?: EncryptedBlob,
): MailItem {
  return {
    id,
    item_type: "received",
    encrypted_envelope: envelope.encrypted,
    envelope_nonce: envelope.nonce,
    encrypted_metadata: metadata?.encrypted_data,
    metadata_nonce: metadata?.nonce,
    metadata_version: metadata ? 1 : undefined,
  } as MailItem;
}

async function import_aes_key(raw: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    new Uint8Array(raw),
    { name: "AES-GCM" },
    false,
    ["encrypt", "decrypt"],
  );
}

async function open_under(
  key: CryptoKey,
  sealed: { encrypted_meta: string; meta_nonce: string },
): Promise<unknown> {
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: base64_to_array(sealed.meta_nonce) },
    key,
    base64_to_array(sealed.encrypted_meta),
  );

  return parse(plaintext);
}

async function load_ios_legacy_kek(): Promise<Uint8Array> {
  const raw = new Uint8Array(32).fill(6);

  await load_legacy_keks_into_memory([
    { k: array_to_base64(PUBLIC_RAW), added_at: "2026-01-01T00:00:00Z" },
    { k: array_to_base64(raw), added_at: "2026-01-01T00:00:00Z" },
  ]);

  return raw;
}

function attachment_meta(
  id: string,
  mail_item_id: string,
  sealed: { encrypted: string; nonce: string },
) {
  return {
    id,
    mail_item_id,
    encrypted_meta: sealed.encrypted,
    meta_nonce: sealed.nonce,
    size_bytes: 10,
    seq_num: 0,
  };
}

function sent_item_with_attachment(
  id: string,
  envelope: { encrypted: string; nonce: string },
): MailItem {
  return {
    ...item(id, envelope),
    item_type: "sent",
    has_attachments: true,
    attachment_count: 1,
  } as MailItem;
}

function parse(plaintext: ArrayBuffer): unknown {
  return JSON.parse(new TextDecoder().decode(plaintext));
}

interface Harness {
  deps: MailLegacyMigrationDeps;
  rewrap: ReturnType<typeof vi.fn>;
  update_metadata: ReturnType<typeof vi.fn>;
  update_attachment_meta: ReturnType<typeof vi.fn>;
  write_marker: ReturnType<typeof vi.fn>;
  store: Storage;
}

function harness(
  items: MailItem[],
  overrides: Partial<MailLegacyMigrationDeps> = {},
  metadata_key: Uint8Array = new Uint8Array(32).fill(3),
): Harness {
  const rewrap = vi.fn().mockResolvedValue({ data: { ok: true } });
  const update_metadata = vi.fn().mockResolvedValue({ data: { ok: true } });
  const update_attachment_meta = vi
    .fn()
    .mockResolvedValue({ data: { status: "ok" } });
  const write_marker = vi.fn().mockResolvedValue(true);
  const store = memory_store();
  const vault = { identity_key: IDENTITY } as EncryptedVault;

  return {
    rewrap,
    update_metadata,
    update_attachment_meta,
    write_marker,
    store,
    deps: {
      list: vi.fn().mockResolvedValue({
        data: { items, total: items.length, has_more: false },
      }),
      rewrap,
      update_metadata,
      batch_attachment_meta: vi.fn().mockResolvedValue({ data: { items: {} } }),
      update_attachment_meta,
      get_storage_write_crypto_key: async () => write_key_holder.key,
      protected_folder_tokens: vi.fn().mockResolvedValue([]),
      get_vault: () => vault,
      get_passphrase_bytes: () => new Uint8Array(32).fill(9),
      get_metadata_key: () => new Uint8Array(metadata_key),
      write_marker,
      stored_keys_ready: vi.fn().mockResolvedValue(true),
      storage: () => store,
      now: () => Date.UTC(2026, 10, 17),
      ...overrides,
    },
  };
}

describe("run_mail_legacy_migration", () => {
  beforeEach(async () => {
    reset_mail_legacy_retirement();
    await load_legacy_keks_into_memory([
      { k: array_to_base64(PUBLIC_RAW), added_at: "2026-01-01T00:00:00Z" },
    ]);
  });

  afterEach(() => {
    write_key_holder.key = null;
    clear_legacy_keks_from_memory();
    reset_mail_legacy_retirement();
  });

  it("reseals a legacy envelope, skips current ones, and marks the vault", async () => {
    const legacy = await seal_identity_under(PUBLIC_RAW, { subject: "old" });
    const current = await encrypt_envelope_with_identity_key(
      { subject: "new" },
      IDENTITY,
    );
    const h = harness([item("a", legacy), item("b", current)]);

    expect(await run_mail_legacy_migration(OWNER, h.deps)).toBe("done");
    expect(h.rewrap).toHaveBeenCalledTimes(1);

    const [id, request] = h.rewrap.mock.calls[0];

    expect(id).toBe("a");
    expect(request.expected_envelope_sha256).toBe(
      await envelope_sha256_hex(legacy.encrypted),
    );
    expect(
      await decrypt_envelope_with_identity_key(
        IDENTITY,
        base64_to_array(request.encrypted_envelope),
        base64_to_array(request.envelope_nonce),
        parse,
        { allow_legacy_keys: false },
      ),
    ).toEqual({ subject: "old", legacy_unverified: true });
    expect(h.write_marker).toHaveBeenCalledWith({
      v: 1,
      at: "2026-11-17T00:00:00.000Z",
    });
  });

  it("reseals legacy mail metadata under the current key", async () => {
    const metadata_key = new Uint8Array(32).fill(3);
    const blob = await encrypt_metadata(
      { is_read: true },
      PUBLIC_RAW,
      METADATA_CONTEXT,
    );
    const current = await encrypt_envelope_with_identity_key(
      { subject: "new" },
      IDENTITY,
    );
    const h = harness([item("a", current, blob!)], {}, metadata_key);

    expect(await run_mail_legacy_migration(OWNER, h.deps)).toBe("done");
    expect(h.rewrap).not.toHaveBeenCalled();

    const [, write] = h.update_metadata.mock.calls[0];

    expect(
      await decrypt_metadata(
        {
          encrypted_data: write.encrypted_metadata,
          nonce: write.metadata_nonce,
          version: 1,
        },
        metadata_key,
        METADATA_CONTEXT,
        { allow_legacy_keys: false },
      ),
    ).toEqual({ is_read: true });
  });

  it("reseals metadata sealed under an earlier storage key from the vault history", async () => {
    const metadata_key = new Uint8Array(32).fill(3);
    const prior_key = new Uint8Array(32).fill(4);
    const blob = await encrypt_metadata(
      { is_starred: true },
      prior_key,
      METADATA_CONTEXT,
    );
    const current = await encrypt_envelope_with_identity_key(
      { subject: "new" },
      IDENTITY,
    );
    const vault = {
      identity_key: IDENTITY,
      storage_rekey: {
        state: "done",
        prior_keys: [array_to_base64(prior_key)],
      },
    } as EncryptedVault;
    const h = harness(
      [item("a", current, blob!)],
      { get_vault: () => vault },
      metadata_key,
    );

    expect(await run_mail_legacy_migration(OWNER, h.deps)).toBe("done");
    expect(h.update_metadata).toHaveBeenCalledTimes(1);

    const [, write] = h.update_metadata.mock.calls[0];

    expect(
      await decrypt_metadata(
        {
          encrypted_data: write.encrypted_metadata,
          nonce: write.metadata_nonce,
          version: 1,
        },
        metadata_key,
        METADATA_CONTEXT,
        { allow_legacy_keys: false },
      ),
    ).toEqual({ is_starred: true });
  });

  it("reseals older mobile attachment details under the current storage key", async () => {
    const write_key = await import_aes_key(new Uint8Array(32).fill(5));

    write_key_holder.key = write_key;

    const meta = {
      filename: "report.pdf",
      content_type: "application/pdf",
      session_key: "c2Vzc2lvbg==",
    };
    const legacy_meta = await seal_identity_under(
      await load_ios_legacy_kek(),
      meta,
    );
    const current = await encrypt_envelope_with_identity_key(
      { subject: "new" },
      IDENTITY,
    );
    const batch_attachment_meta = vi.fn().mockResolvedValue({
      data: { items: { a: [attachment_meta("att-1", "a", legacy_meta)] } },
    });
    const h = harness([sent_item_with_attachment("a", current)], {
      batch_attachment_meta,
    });

    expect(await run_mail_legacy_migration(OWNER, h.deps)).toBe("done");
    expect(batch_attachment_meta).toHaveBeenCalledWith(["a"]);
    expect(h.update_attachment_meta).toHaveBeenCalledTimes(1);

    const [attachment_id, body] = h.update_attachment_meta.mock.calls[0];

    expect(attachment_id).toBe("att-1");
    expect(base64_to_array(body.meta_nonce)).toHaveLength(12);
    expect(body.meta_nonce).not.toBe(legacy_meta.nonce);
    expect(await open_under(write_key, body)).toEqual({
      ...meta,
      legacy_unverified: true,
    });
    expect(h.write_marker).toHaveBeenCalledTimes(1);
  });

  it("leaves attachment details already under the current storage key alone", async () => {
    const raw = new Uint8Array(32).fill(5);

    write_key_holder.key = await import_aes_key(raw);

    const sealed = await seal_identity_under(raw, {
      filename: "a.txt",
      session_key: "a2V5",
    });

    expect(
      await migrate_attachment_meta(attachment_meta("att-2", "b", sealed), {
        update_attachment_meta: vi.fn(),
        get_storage_write_crypto_key: async () => write_key_holder.key,
      }),
    ).toBe("skipped");
  });

  it("does not mark the vault while the storage key is unavailable for attachment details", async () => {
    const legacy_meta = await seal_identity_under(await load_ios_legacy_kek(), {
      filename: "a.txt",
      session_key: "a2V5",
    });
    const current = await encrypt_envelope_with_identity_key(
      { subject: "new" },
      IDENTITY,
    );
    const h = harness([sent_item_with_attachment("a", current)], {
      batch_attachment_meta: vi.fn().mockResolvedValue({
        data: { items: { a: [attachment_meta("att-3", "a", legacy_meta)] } },
      }),
    });

    expect(await run_mail_legacy_migration(OWNER, h.deps)).toBe("paused");
    expect(h.update_attachment_meta).not.toHaveBeenCalled();
    expect(h.write_marker).not.toHaveBeenCalled();
  });

  it("does not mark the vault when the server lacks the rewrap route", async () => {
    const legacy = await seal_identity_under(PUBLIC_RAW, { subject: "old" });
    const h = harness([item("a", legacy)], {
      rewrap: vi.fn().mockResolvedValue({ error: "not found", status: 404 }),
    });

    expect(await run_mail_legacy_migration(OWNER, h.deps)).toBe("unavailable");
    expect(h.write_marker).not.toHaveBeenCalled();
  });

  it("defers the marker while password protected folders exist", async () => {
    const h = harness([], {
      protected_folder_tokens: vi.fn().mockResolvedValue(["folder-1"]),
    });

    expect(await run_mail_legacy_migration(OWNER, h.deps)).toBe("deferred");
    expect(h.write_marker).not.toHaveBeenCalled();
  });

  it("reseals a protected folder on unlock and then marks the vault", async () => {
    const legacy = await seal_identity_under(PUBLIC_RAW, { subject: "kept" });
    const list_page = vi.fn(
      async (
        _token: string,
        offset: number,
        _limit: number,
        trashed: boolean,
      ) => ({
        data: {
          items: !trashed && offset === 0 ? [item("locked-1", legacy)] : [],
          has_more: false,
        },
      }),
    );
    const h = harness([], {
      protected_folder_tokens: vi.fn().mockResolvedValue(["folder-1"]),
    });

    expect(await run_mail_legacy_migration(OWNER, h.deps)).toBe("deferred");
    expect(h.write_marker).not.toHaveBeenCalled();

    const result = await run_mail_legacy_folder_pass(OWNER, "folder-1", {
      ...h.deps,
      list_page,
      is_unlocked: () => true,
    });

    expect(result).toBe("done");
    expect(h.rewrap).toHaveBeenCalledTimes(1);
    expect(h.rewrap.mock.calls[0][0]).toBe("locked-1");
    expect(list_page).toHaveBeenCalledWith("folder-1", 0, 50, true);
    expect(is_mail_legacy_folder_pass_done(h.store, OWNER, "folder-1")).toBe(
      true,
    );
    expect(h.write_marker).toHaveBeenCalledTimes(1);
  });

  it("waits for every protected folder before marking the vault", async () => {
    const h = harness([], {
      protected_folder_tokens: vi
        .fn()
        .mockResolvedValue(["folder-1", "folder-2"]),
    });
    const folder_deps = {
      ...h.deps,
      list_page: vi.fn().mockResolvedValue({ data: { items: [] } }),
      is_unlocked: () => true,
    };

    expect(
      await run_mail_legacy_folder_pass(OWNER, "folder-1", folder_deps),
    ).toBe("deferred");
    expect(await run_mail_legacy_migration(OWNER, h.deps)).toBe("deferred");
    expect(h.write_marker).not.toHaveBeenCalled();
    expect(
      await run_mail_legacy_folder_pass(OWNER, "folder-2", folder_deps),
    ).toBe("done");
    expect(h.write_marker).toHaveBeenCalledTimes(1);
  });

  it("stops a protected folder pass when the folder locks again", async () => {
    const legacy = await seal_identity_under(PUBLIC_RAW, { subject: "kept" });
    const h = harness([], {
      protected_folder_tokens: vi.fn().mockResolvedValue(["folder-1"]),
    });
    const list_page = vi
      .fn()
      .mockResolvedValue({ data: { items: [item("locked-1", legacy)] } });

    expect(
      await run_mail_legacy_folder_pass(OWNER, "folder-1", {
        ...h.deps,
        list_page,
        is_unlocked: () => false,
      }),
    ).toBe("paused");
    expect(list_page).not.toHaveBeenCalled();
    expect(h.rewrap).not.toHaveBeenCalled();
    expect(is_mail_legacy_folder_pass_done(h.store, OWNER, "folder-1")).toBe(
      false,
    );
  });

  it("does not finish a protected folder whose mail changed underneath", async () => {
    const legacy = await seal_identity_under(PUBLIC_RAW, { subject: "kept" });
    const h = harness([], {
      rewrap: vi.fn().mockResolvedValue({
        error: "conflict",
        status: 409,
        server_code: "ENVELOPE_CHANGED",
      }),
      protected_folder_tokens: vi.fn().mockResolvedValue(["folder-1"]),
    });

    await run_mail_legacy_migration(OWNER, h.deps);

    expect(
      await run_mail_legacy_folder_pass(OWNER, "folder-1", {
        ...h.deps,
        list_page: vi.fn().mockResolvedValue({
          data: { items: [item("locked-1", legacy)], has_more: false },
        }),
        is_unlocked: () => true,
      }),
    ).toBe("incomplete");
    expect(is_mail_legacy_folder_pass_done(h.store, OWNER, "folder-1")).toBe(
      false,
    );
    expect(h.write_marker).not.toHaveBeenCalled();
  });

  it("does not mark the vault when an item changed underneath", async () => {
    const legacy = await seal_identity_under(PUBLIC_RAW, { subject: "old" });
    const h = harness([item("a", legacy)], {
      rewrap: vi.fn().mockResolvedValue({
        error: "changed",
        status: 409,
        server_code: "ENVELOPE_CHANGED",
      }),
    });

    expect(await run_mail_legacy_migration(OWNER, h.deps)).toBe("incomplete");
    expect(h.write_marker).not.toHaveBeenCalled();
  });

  it("leaves a record no key opens untouched", async () => {
    const stranger = await seal_identity_under(
      crypto.getRandomValues(new Uint8Array(32)),
      { subject: "unknown" },
    );
    const h = harness([item("a", stranger)]);

    expect(await run_mail_legacy_migration(OWNER, h.deps)).toBe("done");
    expect(h.rewrap).not.toHaveBeenCalled();
  });

  it("pauses without a marker when the listing fails", async () => {
    const h = harness([], {
      list: vi.fn().mockResolvedValue({ error: "busy", status: 503 }),
    });

    expect(await run_mail_legacy_migration(OWNER, h.deps)).toBe("paused");
    expect(h.write_marker).not.toHaveBeenCalled();
  });

  it("resumes from the saved cursor", async () => {
    const current = await encrypt_envelope_with_identity_key(
      { subject: "new" },
      IDENTITY,
    );
    const list = vi
      .fn()
      .mockResolvedValueOnce({
        data: {
          items: [item("a", current)],
          total: 2,
          has_more: true,
          next_cursor: "page-2",
        },
      })
      .mockResolvedValueOnce({ error: "busy", status: 503 })
      .mockResolvedValueOnce({
        data: { items: [item("b", current)], total: 2, has_more: false },
      })
      .mockResolvedValue({ data: { items: [], total: 0, has_more: false } });
    const h = harness([], { list });

    expect(await run_mail_legacy_migration(OWNER, h.deps)).toBe("paused");
    expect(read_mail_legacy_migration_state(h.store, OWNER).cursor).toBe(
      "page-2",
    );
    expect(await run_mail_legacy_migration(OWNER, h.deps)).toBe("done");
    expect(list.mock.calls[2][0].cursor).toBe("page-2");
    expect(read_mail_legacy_migration_state(h.store, OWNER).cursor).toBe(
      undefined,
    );
  });

  it("keeps the marker off until every signed-in device supports the new format", async () => {
    const legacy = await seal_identity_under(PUBLIC_RAW, { subject: "old" });
    const h = harness([item("a", legacy)], {
      stored_keys_ready: vi.fn().mockResolvedValue(false),
    });

    expect(await run_mail_legacy_migration(OWNER, h.deps)).toBe("deferred");
    expect(h.rewrap).toHaveBeenCalledTimes(1);
    expect(h.write_marker).not.toHaveBeenCalled();
  });

  it("sets a message that keeps failing aside and resumes without rescanning", async () => {
    const stuck = await seal_identity_under(PUBLIC_RAW, { subject: "stuck" });
    const fine = await seal_identity_under(PUBLIC_RAW, { subject: "fine" });
    let stuck_fails = true;
    const rewrap = vi.fn(async (item_id: string) =>
      item_id === "stuck" && stuck_fails
        ? { error: "server", status: 500 }
        : { data: { ok: true } },
    );
    const get_item = vi.fn(async () => ({ data: item("stuck", stuck) }));
    const h = harness([item("stuck", stuck), item("fine", fine)], {
      rewrap,
      get_item,
    });

    expect(await run_mail_legacy_migration(OWNER, h.deps)).toBe("incomplete");
    expect(await run_mail_legacy_migration(OWNER, h.deps)).toBe("incomplete");
    expect(await run_mail_legacy_migration(OWNER, h.deps)).toBe("failed");
    expect(h.deps.list).toHaveBeenCalledTimes(1);
    expect(get_item).toHaveBeenCalledTimes(2);
    expect(rewrap.mock.calls.filter(([id]) => id === "fine")).toHaveLength(1);
    expect(
      read_mail_legacy_migration_state(h.store, OWNER).skipped_ids,
    ).toEqual(["stuck"]);
    expect(h.write_marker).not.toHaveBeenCalled();

    stuck_fails = false;
    requeue_mail_legacy_skipped_items(h.store, OWNER);

    expect(await run_mail_legacy_migration(OWNER, h.deps)).toBe("done");
    expect(h.write_marker).toHaveBeenCalledTimes(1);
  });

  it("reseals legacy mail written by another app while the pass ran", async () => {
    const current = await encrypt_envelope_with_identity_key(
      { subject: "new" },
      IDENTITY,
    );
    const late = await seal_identity_under(PUBLIC_RAW, { subject: "late" });
    const late_item = {
      ...item("late", late),
      created_at: "2026-11-17T00:00:00.000Z",
    } as MailItem;
    const list = vi
      .fn()
      .mockResolvedValueOnce({
        data: { items: [item("a", current)], total: 1, has_more: false },
      })
      .mockResolvedValue({
        data: {
          items: [late_item, item("a", current)],
          total: 2,
          has_more: false,
        },
      });
    const h = harness([], { list });

    expect(await run_mail_legacy_migration(OWNER, h.deps)).toBe("done");
    expect(h.rewrap).toHaveBeenCalledTimes(1);
    expect(h.rewrap.mock.calls[0][0]).toBe("late");
    expect(h.write_marker).toHaveBeenCalledTimes(1);
  });

  it("remembers the messages no key opens", async () => {
    const stranger = await seal_identity_under(
      crypto.getRandomValues(new Uint8Array(32)),
      { subject: "unknown" },
    );
    const h = harness([item("a", stranger)]);

    expect(await run_mail_legacy_migration(OWNER, h.deps)).toBe("done");
    expect(
      read_mail_legacy_migration_state(h.store, OWNER).unreadable_ids,
    ).toEqual(["a"]);
  });

  it("never forces a popup while a message stays busy", async () => {
    const legacy = await seal_identity_under(PUBLIC_RAW, { subject: "busy" });
    const h = harness([item("a", legacy)], { is_draft_busy: () => true });

    vi.useFakeTimers();
    try {
      start_mail_legacy_migration(OWNER, h.deps);
      for (let round = 0; round < 8; round += 1) {
        await vi.advanceTimersByTimeAsync(15 * 60_000);
        expect(get_mail_legacy_migration_progress().forced).toBe(false);
        expect(get_mail_legacy_migration_progress().phase).not.toBe("failed");
      }
      expect(h.write_marker).not.toHaveBeenCalled();
    } finally {
      stop_mail_legacy_migration();
      vi.useRealTimers();
    }
  });

  it("does nothing once the vault is marked", async () => {
    const h = harness([], {
      get_vault: () =>
        ({
          identity_key: IDENTITY,
          mail_legacy_retired: { v: 1, at: "2026-11-01T00:00:00.000Z" },
        }) as EncryptedVault,
    });

    expect(await run_mail_legacy_migration(OWNER, h.deps)).toBe("done");
    expect(h.deps.list).not.toHaveBeenCalled();
  });
});

describe("migrate_item_metadata", () => {
  const metadata_key = new Uint8Array(32).fill(3);
  const prior_key = new Uint8Array(32).fill(4);

  afterEach(() => {
    vi.restoreAllMocks();
  });

  async function prior_item() {
    const blob = await encrypt_metadata(
      { is_starred: true },
      prior_key,
      METADATA_CONTEXT,
    );

    return {
      id: "a",
      encrypted_metadata: blob!.encrypted_data,
      metadata_nonce: blob!.nonce,
      metadata_version: 1,
    };
  }

  it("retries an item when sealing under the current key fails", async () => {
    const target = await prior_item();
    const update_metadata = vi.fn().mockResolvedValue({ data: { ok: true } });

    vi.spyOn(crypto.subtle, "encrypt").mockRejectedValueOnce(
      new Error("transient"),
    );

    expect(
      await migrate_item_metadata(target, metadata_key, { update_metadata }, [
        prior_key,
      ]),
    ).toBe("failed");
    expect(update_metadata).not.toHaveBeenCalled();
  });

  it("retries an item when the resealed copy does not read back", async () => {
    const target = await prior_item();
    const update_metadata = vi.fn().mockResolvedValue({ data: { ok: true } });
    const original = crypto.subtle.encrypt.bind(crypto.subtle);

    vi.spyOn(crypto.subtle, "encrypt").mockImplementationOnce(
      (algorithm, key) =>
        original(
          algorithm,
          key,
          new TextEncoder().encode(JSON.stringify({ is_starred: false })),
        ),
    );

    expect(
      await migrate_item_metadata(target, metadata_key, { update_metadata }, [
        prior_key,
      ]),
    ).toBe("failed");
    expect(update_metadata).not.toHaveBeenCalled();
  });
});

describe("classify_rewrap_response", () => {
  it("separates a missing item from a missing route", () => {
    expect(
      classify_rewrap_response({
        error: "x",
        status: 404,
        server_code: "NOT_FOUND",
      }),
    ).toBe("skipped");
    expect(classify_rewrap_response({ error: "x", status: 404 })).toBe(
      "unavailable",
    );
    expect(classify_rewrap_response({ error: "x", status: 429 })).toBe(
      "paused",
    );
    expect(classify_rewrap_response({ error: "x" })).toBe("paused");
    expect(classify_rewrap_response({ error: "x", status: 400 })).toBe(
      "failed",
    );
    expect(classify_rewrap_response({ data: {} })).toBe("written");
  });
});

describe("mail legacy retirement state", () => {
  afterEach(() => reset_mail_legacy_retirement());

  it("pins retirement on this device once the vault carries the marker", () => {
    const store = memory_store();

    expect(
      sync_mail_legacy_retirement(
        { mail_legacy_retired: { v: 1, at: "2026-11-17T00:00:00.000Z" } },
        OWNER,
        store,
      ),
    ).toBe(true);
    expect(read_mail_legacy_retired_pin(OWNER, store)).toBe(true);
    expect(sync_mail_legacy_retirement({}, OWNER, store)).toBe(true);
    expect(is_mail_legacy_retired()).toBe(true);
    expect(sync_mail_legacy_retirement({}, "user-2", store)).toBe(false);
  });

  it("ignores a malformed marker", () => {
    expect(
      sync_mail_legacy_retirement(
        { mail_legacy_retired: { v: 0, at: "x" } },
        OWNER,
        memory_store(),
      ),
    ).toBe(false);
  });

  it("keeps the newest valid marker when merging", () => {
    expect(
      merge_mail_legacy_retired_marker(
        undefined,
        { v: "1" },
        { v: 1, at: "a" },
        { v: 2, at: "b" },
      ),
    ).toEqual({ v: 2, at: "b" });
  });
});
