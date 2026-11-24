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

const seal_holder = vi.hoisted(() => ({
  refuse: false as boolean | "all",
  refused: 0,
}));

vi.mock("./envelope", async (import_original) => {
  const actual = await import_original<typeof import("./envelope")>();

  return {
    ...actual,
    encrypt_metadata: (...args: Parameters<typeof actual.encrypt_metadata>) =>
      seal_holder.refuse === "all" ||
      (seal_holder.refuse && "is_read" in (args[0] as object))
        ? Promise.resolve(null).then(() => {
            seal_holder.refused += 1;

            return null;
          })
        : actual.encrypt_metadata(...args),
  };
});

vi.mock("./storage_write_key", async (import_original) => ({
  ...(await import_original<typeof import("./storage_write_key")>()),
  get_storage_write_crypto_key: async () => null,
}));

import { array_to_base64 } from "./base64";
import {
  type EncryptedBlob,
  encrypt_envelope_with_identity_key,
  encrypt_metadata,
} from "./envelope";
import {
  clear_legacy_keks_from_memory,
  load_legacy_keks_into_memory,
} from "./legacy_keks";
import {
  read_mail_legacy_migration_state,
  run_mail_legacy_folder_pass,
  run_mail_legacy_migration,
  type MailLegacyMigrationDeps,
} from "./mail_legacy_migration";
import { reset_mail_legacy_retirement } from "./mail_legacy_retirement";

const PUBLIC_RAW = sha256(
  new TextEncoder().encode("undefined" + "astermail-envelope-v1"),
);
const IDENTITY = "identity-key-for-tests";
const OWNER = "user-1";

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

async function seal_legacy(
  body: unknown,
): Promise<{ encrypted: string; nonce: string }> {
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const key = await crypto.subtle.importKey(
    "raw",
    new Uint8Array(PUBLIC_RAW),
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

type TestDeps = MailLegacyMigrationDeps & {
  store: Storage;
  rewrap: ReturnType<typeof vi.fn>;
  update_metadata: ReturnType<typeof vi.fn>;
  write_marker: ReturnType<typeof vi.fn>;
};

function make_deps(
  items: MailItem[],
  overrides: Partial<MailLegacyMigrationDeps> = {},
): TestDeps {
  const store = memory_store();
  const vault = { identity_key: IDENTITY } as EncryptedVault;

  return {
    store,
    list: vi.fn().mockResolvedValue({
      data: { items, total: items.length, has_more: false },
    }),
    rewrap: vi.fn().mockResolvedValue({ data: { ok: true } }),
    update_metadata: vi.fn().mockResolvedValue({ data: { ok: true } }),
    batch_attachment_meta: vi.fn().mockResolvedValue({ data: { items: {} } }),
    update_attachment_meta: vi.fn().mockResolvedValue({ data: {} }),
    get_storage_write_crypto_key: async () => null,
    protected_folder_tokens: vi.fn().mockResolvedValue([]),
    get_vault: () => vault,
    get_passphrase_bytes: () => new Uint8Array(32).fill(9),
    get_metadata_key: () => new Uint8Array(32).fill(3),
    write_marker: vi.fn().mockResolvedValue(true),
    stored_keys_ready: vi.fn().mockResolvedValue(true),
    storage: () => store,
    now: () => Date.UTC(2026, 10, 17),
    ...overrides,
  } as TestDeps;
}

describe("finishing the legacy mail pass", () => {
  beforeEach(async () => {
    seal_holder.refuse = false;
    reset_mail_legacy_retirement();
    await load_legacy_keks_into_memory([
      { k: array_to_base64(PUBLIC_RAW), added_at: "2026-01-01T00:00:00Z" },
    ]);
  });

  afterEach(() => {
    seal_holder.refuse = false;
    clear_legacy_keks_from_memory();
    reset_mail_legacy_retirement();
  });

  it("holds the marker when an older device signs in during the final rescan", async () => {
    const current = await encrypt_envelope_with_identity_key(
      { subject: "new" },
      IDENTITY,
    );
    const deps = make_deps([item("a", current)], {
      stored_keys_ready: vi
        .fn()
        .mockResolvedValueOnce(true)
        .mockResolvedValue(false),
    });

    expect(await run_mail_legacy_migration(OWNER, deps)).toBe("deferred");
    expect(deps.write_marker).not.toHaveBeenCalled();
  });

  it("reseals an old dated legacy item that appeared after the main scan", async () => {
    const current = await encrypt_envelope_with_identity_key(
      { subject: "new" },
      IDENTITY,
    );
    const old = {
      ...item("old", await seal_legacy({ subject: "old" })),
      created_at: "2020-01-01T00:00:00.000Z",
      message_ts: "2020-01-01T00:00:00.000Z",
    } as MailItem;
    const list = vi
      .fn()
      .mockResolvedValueOnce({
        data: { items: [item("a", current)], total: 1, has_more: false },
      })
      .mockResolvedValue({
        data: { items: [item("a", current), old], total: 2, has_more: false },
      });
    const deps = make_deps([], { list });

    expect(await run_mail_legacy_migration(OWNER, deps)).toBe("done");
    expect(deps.rewrap).toHaveBeenCalledTimes(1);
    expect(deps.rewrap.mock.calls[0][0]).toBe("old");
    expect(deps.write_marker).toHaveBeenCalledTimes(1);
  });

  it("retries metadata that cannot be resealed instead of finishing", async () => {
    const current = await encrypt_envelope_with_identity_key(
      { subject: "new" },
      IDENTITY,
    );
    const blob = await encrypt_metadata(
      { is_read: true },
      PUBLIC_RAW,
      "mail-item-metadata",
    );
    const deps = make_deps([item("a", current, blob!)]);

    seal_holder.refuse = true;

    expect(await run_mail_legacy_migration(OWNER, deps)).not.toBe("done");
    expect(deps.update_metadata).not.toHaveBeenCalled();

    const state = read_mail_legacy_migration_state(deps.store, OWNER);

    expect(state.unreadable_ids ?? []).toEqual([]);
    expect(Object.keys(state.retry_ids ?? {})).toEqual(["a"]);
  });

  it("moves metadata that never reseals to unreadable after five attempts", async () => {
    const current = await encrypt_envelope_with_identity_key(
      { subject: "new" },
      IDENTITY,
    );
    const blob = await encrypt_metadata(
      { is_read: true },
      PUBLIC_RAW,
      "mail-item-metadata",
    );
    let now = Date.UTC(2026, 10, 17);
    const deps = make_deps([item("a", current, blob!)], { now: () => now });

    seal_holder.refuse = true;
    seal_holder.refused = 0;

    const results: string[] = [];

    for (let pass = 0; pass < 12 && results.at(-1) !== "done"; pass += 1) {
      results.push(await run_mail_legacy_migration(OWNER, deps));
      now += 24 * 60 * 60 * 1000;
    }

    const state = read_mail_legacy_migration_state(deps.store, OWNER);

    expect(results.at(-1)).toBe("done");
    expect(seal_holder.refused).toBe(5);
    expect(deps.update_metadata).not.toHaveBeenCalled();
    expect(state.unreadable_ids).toEqual(["a"]);
    expect(state.retry_ids).toBeUndefined();
    expect(state.skipped_ids).toBeUndefined();
    expect(state.seal_failure_ids).toBeUndefined();
  });

  it("keeps metadata pending while the metadata key cannot seal anything", async () => {
    const current = await encrypt_envelope_with_identity_key(
      { subject: "new" },
      IDENTITY,
    );
    const blob = await encrypt_metadata(
      { is_read: true },
      PUBLIC_RAW,
      "mail-item-metadata",
    );
    let now = Date.UTC(2026, 10, 17);
    const deps = make_deps([item("a", current, blob!)], { now: () => now });

    seal_holder.refuse = "all";

    for (let pass = 0; pass < 12; pass += 1) {
      await run_mail_legacy_migration(OWNER, deps);
      now += 24 * 60 * 60 * 1000;
    }

    const state = read_mail_legacy_migration_state(deps.store, OWNER);

    expect(state.unreadable_ids ?? []).toEqual([]);
    expect(deps.write_marker).not.toHaveBeenCalled();
    expect(deps.update_metadata).not.toHaveBeenCalled();
  });

  it("counts every unreadable item past the tracked id list", async () => {
    const garbage = {
      encrypted: array_to_base64(new Uint8Array(48).fill(1)),
      nonce: array_to_base64(new Uint8Array(12).fill(2)),
    };
    const items = Array.from({ length: 501 }, (_, index) =>
      item(`u${index}`, garbage),
    );
    const deps = make_deps(items);

    expect(await run_mail_legacy_migration(OWNER, deps)).toBe("done");

    const state = read_mail_legacy_migration_state(deps.store, OWNER) as {
      unreadable_ids?: string[];
      unreadable_digests?: string[];
    };

    expect(
      (state.unreadable_ids?.length ?? 0) +
        (state.unreadable_digests?.length ?? 0),
    ).toBe(501);
  });

  it("forgets an unreadable item once it opens", async () => {
    const current = await encrypt_envelope_with_identity_key(
      { subject: "new" },
      IDENTITY,
    );
    const garbage = {
      encrypted: array_to_base64(new Uint8Array(48).fill(1)),
      nonce: array_to_base64(new Uint8Array(12).fill(2)),
    };
    const first = make_deps([item("a", garbage)]);

    expect(await run_mail_legacy_migration(OWNER, first)).toBe("done");
    expect(read_mail_legacy_migration_state(first.store, OWNER).unreadable_ids)
      .toEqual(["a"]);

    reset_mail_legacy_retirement();

    const second = make_deps([item("a", current)], {
      storage: () => first.store,
      write_marker: vi.fn().mockResolvedValue(true),
    });

    await run_mail_legacy_migration(OWNER, second);

    expect(
      read_mail_legacy_migration_state(first.store, OWNER).unreadable_ids ?? [],
    ).toEqual([]);
  });

  it("waits before retrying a protected folder whose pass failed", async () => {
    const legacy = await seal_legacy({ subject: "kept" });
    let now = Date.UTC(2026, 10, 17);
    const deps = make_deps([], {
      rewrap: vi.fn().mockResolvedValue({ error: "server", status: 500 }),
      protected_folder_tokens: vi.fn().mockResolvedValue(["folder-1"]),
      now: () => now,
    });
    const list_page = vi.fn().mockResolvedValue({
      data: { items: [item("locked-1", legacy)], has_more: false },
    });
    const folder_deps = { ...deps, list_page, is_unlocked: () => true };

    expect(
      await run_mail_legacy_folder_pass(OWNER, "folder-1", folder_deps),
    ).toBe("incomplete");

    const calls = list_page.mock.calls.length;

    expect(
      await run_mail_legacy_folder_pass(OWNER, "folder-1", folder_deps),
    ).toBe("deferred");
    expect(list_page.mock.calls.length).toBe(calls);

    now += 24 * 60 * 60 * 1000;

    expect(
      await run_mail_legacy_folder_pass(OWNER, "folder-1", folder_deps),
    ).toBe("incomplete");
    expect(list_page.mock.calls.length).toBeGreaterThan(calls);
  });
});
