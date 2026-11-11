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

type Row = Record<string, unknown>;

interface FakeResponse {
  data?: unknown;
  error?: string;
}

const h = vi.hoisted(() => ({
  vault: null as Record<string, unknown> | null,
  account_key: null as CryptoKey | null,
  vault_status: "written" as string,
  vault_writes: 0,
  calls: [] as { method: string; path: string; body?: unknown }[],
  fail_put: [] as string[],
  fail_get: [] as string[],
  tags: [] as Record<string, unknown>[],
  labels: [] as Record<string, unknown>[],
  drafts: [] as Record<string, unknown>[],
  scheduled: [] as Record<string, unknown>[],
  preferences: {} as Record<string, unknown>,
  dev_mode: {} as Record<string, unknown>,
  subscriptions: {} as Record<string, unknown>,
  onboarding: {} as Record<string, unknown>,
  recovery: {} as Record<string, unknown>,
  on_put: null as null | ((path: string) => void),
}));

vi.mock("./memory_key_store", () => ({
  get_vault_from_memory: () => h.vault,
}));

vi.mock("./account_data_writer", () => ({
  account_data_write_key: async () => h.account_key,
}));

vi.mock("./vault_write_lock", () => ({
  with_vault_write_lock_bounded: <T>(fn: () => Promise<T>) => fn(),
}));

vi.mock("./vault_cas_write", () => ({
  write_vault_merged: async (request: {
    next: Record<string, unknown>;
    drop_legacy_keks?: string[];
  }) => {
    h.vault_writes++;

    if (h.vault_status !== "written") return { status: h.vault_status };

    const removed = new Set(request.drop_legacy_keks ?? []);
    const current = (h.vault?.legacy_keks ?? []) as { k: string }[];
    const kept = current.filter((entry) => !removed.has(entry.k));
    const merged: Record<string, unknown> = { ...request.next };

    if (kept.length) {
      merged.legacy_keks = kept;
    } else {
      delete merged.legacy_keks;
    }
    h.vault = merged;

    const { load_legacy_keks_into_memory } = await import("./legacy_keks");

    await load_legacy_keks_into_memory(kept as never);

    return { status: "written", vault: merged };
  },
}));

function page(rows: Row[], query: URLSearchParams, key: string): FakeResponse {
  const limit = Number(query.get("limit") ?? 100);
  const offset = Number(query.get("offset") ?? 0);

  return {
    data: {
      [key]: rows.slice(offset, offset + limit),
      total: rows.length,
      has_more: offset + limit < rows.length,
    },
  };
}

function fake_get(url: string): FakeResponse {
  const [path, search] = url.split("?");
  const query = new URLSearchParams(search ?? "");

  if (h.fail_get.some((prefix) => path.startsWith(prefix))) {
    return { error: "unavailable" };
  }
  if (path === "/mail/v1/tags") return page(h.tags, query, "tags");
  if (path === "/mail/v1/labels") return page(h.labels, query, "labels");
  if (path === "/mail/v1/scheduled") return page(h.scheduled, query, "items");
  if (path.startsWith("/mail/v1/scheduled/")) {
    const found = h.scheduled.find((row) => path.endsWith(`/${row.id}`));

    return found ? { data: found } : { error: "missing" };
  }
  if (path === "/mail/v1/drafts") {
    return { data: { items: h.drafts, has_more: false } };
  }
  if (path === "/settings/v1/preferences") return { data: h.preferences };
  if (path === "/settings/v1/preferences/dev-mode") return { data: h.dev_mode };
  if (path === "/settings/v1/preferences/subscriptions") {
    return { data: h.subscriptions };
  }
  if (path === "/core/v1/onboarding") return { data: h.onboarding };
  if (path === "/core/v1/recovery/email") return { data: h.recovery };

  return { error: "unknown" };
}

function put_row(rows: Row[], prefix: string, path: string, body: Row) {
  const row = rows.find((item) => path === `${prefix}${item.id}`);

  if (!row) return { error: "missing" };
  Object.assign(row, body);

  return { data: { success: true } };
}

function fake_put(path: string, body: Row): FakeResponse {
  h.on_put?.(path);

  if (h.fail_put.some((prefix) => path.startsWith(prefix))) {
    return { error: "rejected" };
  }
  if (path.startsWith("/mail/v1/tags/")) {
    return put_row(h.tags, "/mail/v1/tags/", path, body);
  }
  if (path.startsWith("/mail/v1/labels/")) {
    return put_row(h.labels, "/mail/v1/labels/", path, body);
  }
  if (path.startsWith("/mail/v1/drafts/")) {
    const draft = h.drafts.find((item) => path.endsWith(`/${item.id}`));

    if (!draft || draft.version !== body.version) return { error: "conflict" };
    draft.encrypted_content = body.encrypted_content;
    draft.content_nonce = body.content_nonce;
    draft.version = (draft.version as number) + 1;

    return { data: { success: true } };
  }
  if (path === "/settings/v1/preferences") {
    if (body.expected_version !== h.preferences.preferences_version) {
      return { error: "conflict" };
    }
    h.preferences.encrypted_preferences = body.encrypted_preferences;
    h.preferences.preferences_nonce = body.preferences_nonce;
    h.preferences.preferences_version =
      (h.preferences.preferences_version as number) + 1;

    return { data: { success: true } };
  }
  if (path === "/settings/v1/preferences/dev-mode") {
    Object.assign(h.dev_mode, body);

    return { data: { success: true } };
  }
  if (path === "/settings/v1/preferences/subscriptions") {
    Object.assign(h.subscriptions, body);

    return { data: { success: true } };
  }
  if (path === "/core/v1/onboarding") {
    Object.assign(h.onboarding, body);

    return { data: { success: true } };
  }

  return { error: "unknown" };
}

vi.mock("@/services/api/client", () => ({
  api_client: {
    get: async (path: string) => {
      h.calls.push({ method: "GET", path });

      return fake_get(path);
    },
    put: async (path: string, body: Row) => {
      h.calls.push({ method: "PUT", path, body });

      return fake_put(path, body);
    },
  },
}));

import type { AccountDataContext } from "./account_data_key";

import { array_to_base64, base64_to_array } from "./base64";
import {
  decrypt_account_context_with_fallback,
  get_legacy_crypto_keys,
  get_retired_context_key,
  load_legacy_keks_into_memory,
} from "./legacy_keks";
import {
  all_retired_kek_values,
  retired_kek_context,
} from "./retired_identity_keks";
import {
  RETIRED_REWRAP_RESCAN_MS,
  run_retired_key_rewrap,
} from "./retired_key_rewrap";

const ACCOUNT = "account-1";
const IDENTITY = "current-identity-key-material";
const ADDED_AT = "2026-09-27T00:00:00.000Z";
const OTHER_KEK = {
  k: array_to_base64(new Uint8Array(32).fill(7)),
  added_at: ADDED_AT,
};
const TAGS: AccountDataContext = "astermail-tags-v1";
const PREFERENCES: AccountDataContext = "astermail-preferences-v1";

async function aes_key(raw: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, false, [
    "encrypt",
    "decrypt",
  ]);
}

async function retired_key(context: AccountDataContext): Promise<CryptoKey> {
  const value = all_retired_kek_values().find(
    (k) => retired_kek_context(k) === context,
  );

  return aes_key(base64_to_array(value as string));
}

async function identity_key(context: AccountDataContext): Promise<CryptoKey> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(IDENTITY + context),
  );

  return aes_key(new Uint8Array(digest));
}

async function seal(
  key: CryptoKey,
  text: string,
): Promise<{ encrypted: string; nonce: string }> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const sealed = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(text),
  );

  return {
    encrypted: array_to_base64(new Uint8Array(sealed)),
    nonce: array_to_base64(iv),
  };
}

async function open(
  key: CryptoKey,
  encrypted: unknown,
  nonce: unknown,
): Promise<string | null> {
  try {
    const opened = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: base64_to_array(nonce as string) },
      key,
      base64_to_array(encrypted as string),
    );

    return new TextDecoder().decode(opened);
  } catch {
    return null;
  }
}

async function read_with_fallback(
  context: AccountDataContext,
  encrypted: unknown,
  nonce: unknown,
): Promise<string> {
  const opened = await decrypt_account_context_with_fallback(
    context,
    await identity_key(context),
    base64_to_array(encrypted as string),
    base64_to_array(nonce as string),
  );

  return new TextDecoder().decode(opened);
}

async function tag_row(id: string, key: CryptoKey, name: string): Promise<Row> {
  const sealed_name = await seal(key, name);
  const sealed_color = await seal(key, "#fff");

  return {
    id,
    encrypted_name: sealed_name.encrypted,
    name_nonce: sealed_name.nonce,
    encrypted_color: sealed_color.encrypted,
    color_nonce: sealed_color.nonce,
    encrypted_icon: null,
    icon_nonce: null,
  };
}

function held_contexts(): AccountDataContext[] {
  const list = (h.vault?.legacy_keks ?? []) as { k: string }[];

  return list
    .map((entry) => retired_kek_context(entry.k))
    .filter((context): context is AccountDataContext => context !== null)
    .sort();
}

function puts(): string[] {
  return h.calls
    .filter((call) => call.method === "PUT")
    .map((call) => call.path)
    .sort();
}

async function affected_vault(): Promise<void> {
  const legacy_keks = [
    OTHER_KEK,
    ...all_retired_kek_values().map((k) => ({ k, added_at: ADDED_AT })),
  ];

  h.vault = { identity_key: IDENTITY, legacy_keks };
  await load_legacy_keks_into_memory(legacy_keks);
}

beforeEach(async () => {
  localStorage.clear();
  h.vault = null;
  h.account_key = null;
  h.vault_status = "written";
  h.vault_writes = 0;
  h.calls = [];
  h.fail_put = [];
  h.fail_get = [];
  h.tags = [];
  h.labels = [];
  h.drafts = [];
  h.scheduled = [];
  h.preferences = {
    encrypted_preferences: null,
    preferences_nonce: null,
    preferences_version: 1,
  };
  h.dev_mode = { encrypted_dev_mode: null, dev_mode_nonce: null };
  h.subscriptions = {
    encrypted_subscriptions: null,
    subscriptions_nonce: null,
  };
  h.onboarding = {
    encrypted_state: null,
    state_nonce: null,
    is_completed: true,
    is_skipped: false,
  };
  h.recovery = { exists: false };
  h.on_put = null;
  await load_legacy_keks_into_memory(undefined);
});

describe("run_retired_key_rewrap", () => {
  it("leaves an account without retired keys untouched", async () => {
    const legacy_keks = [OTHER_KEK];

    h.vault = { identity_key: IDENTITY, legacy_keks };
    h.tags = [await tag_row("t1", await identity_key(TAGS), "a")];

    const before = { ...h.tags[0] };

    expect(await run_retired_key_rewrap(ACCOUNT)).toBeNull();
    expect(h.calls).toEqual([]);
    expect(h.vault_writes).toBe(0);
    expect(h.vault.legacy_keks).toBe(legacy_keks);
    expect(h.tags[0]).toEqual(before);
  });

  it("does nothing while the vault has no identity key", async () => {
    await affected_vault();
    h.vault = { legacy_keks: h.vault?.legacy_keks };

    expect(await run_retired_key_rewrap(ACCOUNT)).toBeNull();
    expect(h.calls).toEqual([]);
  });

  it("moves an item to the current key and keeps it readable", async () => {
    const old_key = await retired_key(TAGS);
    const new_key = await identity_key(TAGS);

    await affected_vault();
    h.tags = [
      await tag_row("t1", old_key, "Travel"),
      await tag_row("t2", new_key, "Work"),
    ];

    const before = { ...h.tags[0] };
    const untouched = { ...h.tags[1] };
    const summary = await run_retired_key_rewrap(ACCOUNT);
    const [moved] = h.tags;

    expect(summary?.rewrapped).toBe(1);
    expect(summary?.held).toBe(0);
    expect(puts()).toEqual(["/mail/v1/tags/t1"]);
    expect(moved.encrypted_name).not.toBe(before.encrypted_name);
    expect(await open(new_key, moved.encrypted_name, moved.name_nonce)).toBe(
      "Travel",
    );
    expect(await open(new_key, moved.encrypted_color, moved.color_nonce)).toBe(
      "#fff",
    );
    expect(
      await open(old_key, moved.encrypted_name, moved.name_nonce),
    ).toBeNull();
    expect(
      await read_with_fallback(TAGS, moved.encrypted_name, moved.name_nonce),
    ).toBe("Travel");
    expect(h.tags[1]).toEqual(untouched);
  });

  it("stops trying the retired keys once nothing is left under them", async () => {
    await affected_vault();
    h.tags = [await tag_row("t1", await retired_key(TAGS), "Travel")];

    const before = { ...h.tags[0] };

    expect(get_retired_context_key(TAGS)).not.toBeNull();
    expect(
      await read_with_fallback(TAGS, before.encrypted_name, before.name_nonce),
    ).toBe("Travel");

    const summary = await run_retired_key_rewrap(ACCOUNT);

    expect(summary?.pending).toEqual([]);
    expect(summary?.dropped).toHaveLength(11);
    expect(held_contexts()).toEqual([]);
    expect(h.vault?.legacy_keks).toEqual([OTHER_KEK]);
    expect(get_retired_context_key(TAGS)).toBeNull();
    expect(get_legacy_crypto_keys()).toHaveLength(1);
    await expect(
      read_with_fallback(TAGS, before.encrypted_name, before.name_nonce),
    ).rejects.toBeTruthy();

    h.calls = [];
    expect(await run_retired_key_rewrap(ACCOUNT)).toBeNull();
    expect(h.calls).toEqual([]);
  });

  it("never opens another data type with a retired key", async () => {
    await affected_vault();

    const sealed = await seal(await retired_key(TAGS), "x");

    await expect(
      read_with_fallback(PREFERENCES, sealed.encrypted, sealed.nonce),
    ).rejects.toBeTruthy();
  });

  it("keeps the original and the key when a write fails", async () => {
    const old_key = await retired_key(TAGS);

    await affected_vault();
    h.tags = [await tag_row("t1", old_key, "Travel")];
    h.fail_put = ["/mail/v1/tags/"];

    const before = { ...h.tags[0] };
    const summary = await run_retired_key_rewrap(ACCOUNT);

    expect(summary?.rewrapped).toBe(0);
    expect(summary?.held).toBe(1);
    expect(summary?.pending).toEqual([TAGS]);
    expect(h.tags[0]).toEqual(before);
    expect(held_contexts()).toEqual([TAGS]);
    expect(get_retired_context_key(TAGS)).not.toBeNull();
    expect(
      await read_with_fallback(TAGS, before.encrypted_name, before.name_nonce),
    ).toBe("Travel");
  });

  it("resumes an interrupted run where it stopped", async () => {
    const old_key = await retired_key(TAGS);
    const new_key = await identity_key(TAGS);
    let clock = 1_000_000_000;

    await affected_vault();
    h.tags = [
      await tag_row("t1", old_key, "One"),
      await tag_row("t2", old_key, "Two"),
      await tag_row("t3", old_key, "Three"),
    ];
    h.on_put = (path) => {
      if (path.endsWith("/t2")) throw new Error("connection lost");
    };
    h.fail_put = ["/mail/v1/tags/t3"];

    const first = await run_retired_key_rewrap(ACCOUNT, () => clock);

    expect(first?.rewrapped).toBe(1);
    expect(first?.pending).toEqual([TAGS]);
    expect(held_contexts()).toEqual([TAGS]);
    expect(
      await open(old_key, h.tags[1].encrypted_name, h.tags[1].name_nonce),
    ).toBe("Two");

    h.on_put = null;
    h.fail_put = [];
    h.calls = [];

    expect(await run_retired_key_rewrap(ACCOUNT, () => clock)).toBeNull();
    expect(h.calls).toEqual([]);

    clock += RETIRED_REWRAP_RESCAN_MS + 1;

    const second = await run_retired_key_rewrap(ACCOUNT, () => clock);

    expect(puts()).toEqual(["/mail/v1/tags/t2", "/mail/v1/tags/t3"]);
    expect(second?.rewrapped).toBe(2);
    expect(second?.pending).toEqual([]);
    expect(held_contexts()).toEqual([]);

    const names: string[] = [];

    for (const row of h.tags) {
      names.push(
        (await open(new_key, row.encrypted_name, row.name_nonce)) ?? "",
      );
    }

    expect(names).toEqual(["One", "Two", "Three"]);
  });

  it("keeps a key whose data could not be listed", async () => {
    await affected_vault();
    h.fail_get = ["/mail/v1/labels"];

    const summary = await run_retired_key_rewrap(ACCOUNT);

    expect(summary?.pending).toEqual(["astermail-labels-v1"]);
    expect(held_contexts()).toEqual(["astermail-labels-v1"]);
  });

  it("keeps every key when the vault write does not land", async () => {
    await affected_vault();
    h.vault_status = "conflict";

    const summary = await run_retired_key_rewrap(ACCOUNT);

    expect(summary?.dropped).toEqual([]);
    expect(summary?.pending).toHaveLength(11);
    expect(held_contexts()).toHaveLength(11);
  });

  it("writes settings under the account key and guards the version", async () => {
    const sealed = await seal(await retired_key(PREFERENCES), "dark");

    h.account_key = await aes_key(new Uint8Array(32).fill(9));
    await affected_vault();
    h.preferences = {
      encrypted_preferences: sealed.encrypted,
      preferences_nonce: sealed.nonce,
      preferences_version: 4,
    };

    const summary = await run_retired_key_rewrap(ACCOUNT);
    const write = h.calls.find((call) => call.method === "PUT");

    expect((write?.body as Row).expected_version).toBe(4);
    expect(summary?.rewrapped).toBe(1);
    expect(
      await open(
        h.account_key,
        h.preferences.encrypted_preferences,
        h.preferences.preferences_nonce,
      ),
    ).toBe("dark");
    expect(held_contexts()).toEqual([]);
  });

  it("yields to a newer copy saved by another device", async () => {
    const sealed = await seal(await retired_key(PREFERENCES), "dark");
    const newer = await seal(await identity_key(PREFERENCES), "light");

    await affected_vault();
    h.preferences = {
      encrypted_preferences: sealed.encrypted,
      preferences_nonce: sealed.nonce,
      preferences_version: 4,
    };
    h.on_put = (path) => {
      if (path !== "/settings/v1/preferences") return;
      h.preferences = {
        encrypted_preferences: newer.encrypted,
        preferences_nonce: newer.nonce,
        preferences_version: 5,
      };
    };

    const summary = await run_retired_key_rewrap(ACCOUNT);

    expect(summary?.pending).toEqual([PREFERENCES]);
    expect(h.preferences.encrypted_preferences).toBe(newer.encrypted);
    expect(held_contexts()).toEqual([PREFERENCES]);
  });

  it("rewrites a draft against the version it read", async () => {
    const context: AccountDataContext = "astermail-draft-v2";
    const sealed = await seal(await retired_key(context), "draft body");

    await affected_vault();
    h.drafts = [
      {
        id: "d1",
        encrypted_content: sealed.encrypted,
        content_nonce: sealed.nonce,
        version: 3,
        has_attachments: true,
        attachment_count: 2,
      },
    ];

    await run_retired_key_rewrap(ACCOUNT);

    const write = h.calls.find((call) => call.method === "PUT");
    const body = write?.body as Row;

    expect(body.version).toBe(3);
    expect(body.has_attachments).toBe(true);
    expect(body.attachment_count).toBe(2);
    expect(
      await open(
        await identity_key(context),
        h.drafts[0].encrypted_content,
        h.drafts[0].content_nonce,
      ),
    ).toBe("draft body");
    expect(held_contexts()).toEqual([]);
  });

  it("only reports data it has no way to write back", async () => {
    const scheduled = await seal(
      await retired_key("astermail-scheduled-v1"),
      "queued",
    );
    const recovery = await seal(
      await retired_key("astermail-recovery-email-v1"),
      "user@example.org",
    );

    await affected_vault();
    h.scheduled = [
      {
        id: "s1",
        encrypted_envelope: scheduled.encrypted,
        envelope_nonce: scheduled.nonce,
      },
    ];
    h.recovery = {
      exists: true,
      encrypted_email: recovery.encrypted,
      email_nonce: recovery.nonce,
    };

    const summary = await run_retired_key_rewrap(ACCOUNT);
    const kept = ["astermail-recovery-email-v1", "astermail-scheduled-v1"];

    expect(puts()).toEqual([]);
    expect(summary?.held).toBe(2);
    expect([...(summary?.pending ?? [])].sort()).toEqual(kept);
    expect(held_contexts()).toEqual(kept);
    expect(h.scheduled[0].encrypted_envelope).toBe(scheduled.encrypted);
    expect(h.recovery.encrypted_email).toBe(recovery.encrypted);
  });
});
