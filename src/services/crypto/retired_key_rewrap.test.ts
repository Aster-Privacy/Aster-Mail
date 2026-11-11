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
  server_vault: null as Record<string, unknown> | null,
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
  on_get: null as null | ((path: string) => void),
  on_lock: null as null | (() => void),
  put_gate: null as Promise<void> | null,
  owner: "account-1" as string | null,
  current_account: "account-1" as string | null,
}));

vi.mock("./memory_key_store", () => ({
  get_vault_from_memory: () => h.vault,
  get_vault_owner_id: () => h.owner,
}));

vi.mock("@/services/account_manager", () => ({
  get_current_account_id: async () => h.current_account,
}));

vi.mock("./key_manager", () => ({
  hash_recovery_email: async (email: string) => `hash:${email}`,
}));

vi.mock("./account_data_writer", () => ({
  account_data_write_key: async () => h.account_key,
}));

vi.mock("./vault_write_lock", () => ({
  with_vault_write_lock_bounded: <T>(fn: () => Promise<T>) => {
    h.on_lock?.();

    return fn();
  },
}));

vi.mock("./vault_cas_write", async () => {
  const actual =
    await vi.importActual<typeof import("./vault_cas_write")>(
      "./vault_cas_write",
    );

  return {
    write_vault_merged: async (request: {
      next: Record<string, unknown>;
      base?: Record<string, unknown> | null;
      drop_legacy_keks?: string[];
    }) => {
      h.vault_writes++;

      if (h.vault_status !== "written") return { status: h.vault_status };

      const server = h.server_vault ?? h.vault ?? {};
      const base = request.base === undefined ? h.vault : request.base;
      const merged: Record<string, unknown> = {
        ...(actual.merge_vault_for_write(
          server as never,
          base as never,
          request.next as never,
        ) as unknown as Record<string, unknown>),
      };
      const removed = new Set(request.drop_legacy_keks ?? []);
      const kept = ((merged.legacy_keks ?? []) as { k: string }[]).filter(
        (entry) => !removed.has(entry.k),
      );

      if (kept.length) {
        merged.legacy_keks = kept;
      } else {
        delete merged.legacy_keks;
      }
      h.vault = merged;
      h.server_vault = null;

      const { load_legacy_keks_into_memory } = await import("./legacy_keks");

      await load_legacy_keks_into_memory(kept as never);

      return { status: "written", vault: merged };
    },
  };
});

function page(rows: Row[], query: URLSearchParams, key: string): FakeResponse {
  const limit = Number(query.get("limit") ?? 100);
  const offset = Number(query.get("offset") ?? 0);

  return {
    data: {
      [key]: rows.slice(offset, offset + limit).map((row) => ({ ...row })),
      total: rows.length,
      has_more: offset + limit < rows.length,
    },
  };
}

function one_row(rows: Row[], path: string): FakeResponse {
  const found = rows.find((row) => path.endsWith(`/${row.id}`));

  return found ? { data: { ...found } } : { error: "missing" };
}

function fake_get(url: string): FakeResponse {
  const [path, search] = url.split("?");
  const query = new URLSearchParams(search ?? "");

  if (h.fail_get.some((prefix) => path.startsWith(prefix))) {
    return { error: "unavailable" };
  }
  if (path === "/mail/v1/tags") return page(h.tags, query, "tags");
  if (path === "/mail/v1/labels") return page(h.labels, query, "labels");
  if (path.startsWith("/mail/v1/tags/")) return one_row(h.tags, path);
  if (path.startsWith("/mail/v1/labels/")) return one_row(h.labels, path);
  if (path === "/mail/v1/scheduled") return page(h.scheduled, query, "items");
  if (path.startsWith("/mail/v1/scheduled/")) {
    const found = h.scheduled.find((row) => path.endsWith(`/${row.id}`));

    return found ? { data: found } : { error: "missing" };
  }
  if (path === "/mail/v1/drafts") {
    return { data: { items: h.drafts, has_more: false } };
  }
  if (path === "/settings/v1/preferences") return { data: h.preferences };
  if (path === "/settings/v1/preferences/dev-mode") {
    return { data: { ...h.dev_mode } };
  }
  if (path === "/settings/v1/preferences/subscriptions") {
    return { data: { ...h.subscriptions } };
  }
  if (path === "/core/v1/onboarding") return { data: { ...h.onboarding } };
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
  if (path === "/core/v1/recovery/email") {
    if (h.recovery.verified === true) return { data: { success: true } };
    h.recovery.encrypted_email = body.encrypted_email;
    h.recovery.email_nonce = body.email_nonce;
    h.recovery.verified = false;

    return { data: { success: true } };
  }

  return { error: "unknown" };
}

vi.mock("@/services/api/client", () => ({
  api_client: {
    get: async (path: string) => {
      h.calls.push({ method: "GET", path });
      h.on_get?.(path);

      return fake_get(path);
    },
    put: async (path: string, body: Row) => {
      h.calls.push({ method: "PUT", path, body });
      if (h.put_gate) await h.put_gate;

      return fake_put(path, body);
    },
  },
}));

import type { AccountDataContext } from "./account_data_key";

import { array_to_base64, base64_to_array } from "./base64";
import {
  decrypt_account_context_with_fallback,
  decrypt_aes_gcm_with_fallback,
  get_legacy_crypto_keys,
  get_retired_context_key,
  load_legacy_keks_into_memory,
} from "./legacy_keks";
import {
  all_retired_kek_values,
  retired_kek_context,
} from "./retired_identity_keks";
import {
  RETIRED_REWRAP_CONFIRM_MS,
  RETIRED_REWRAP_HELD_MS,
  RETIRED_REWRAP_RESCAN_MS,
  RETIRED_REWRAP_RETRY_MS,
  retired_key_rewrap_wait_ms,
  run_retired_key_rewrap,
  schedule_retired_key_rewrap,
} from "./retired_key_rewrap";
import { write_vault_merged } from "./vault_cas_write";

import {
  begin_draft_write,
  end_draft_write,
  register_open_draft_check,
  reset_draft_activity,
} from "@/services/draft_activity";

const ACCOUNT = "account-1";
const OTHER_ACCOUNT = "account-2";
const START = 1_000_000_000;
const RECOVERY: AccountDataContext = "astermail-recovery-email-v1";
const RECOVERY_PATH = "/core/v1/recovery/email";
const KEPT: AccountDataContext[] = [
  "astermail-calendar-v2",
  "astermail-draft-v1",
];
const LABELS: AccountDataContext = "astermail-labels-v1";
const SHORT_DRAFTS: AccountDataContext = "astermail-draft-v1";
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

function change_on_read(path: string, nth: number, change: () => void): void {
  let reads = 0;

  h.on_get = (url) => {
    if (url.split("?")[0] !== path) return;

    reads++;

    if (reads === nth) change();
  };
}

interface SettingCase {
  context: AccountDataContext;
  path: string;
  encrypted: string;
  nonce: string;
  store: () => Row;
}

const SETTINGS: SettingCase[] = [
  {
    context: "astermail-devmode-v1",
    path: "/settings/v1/preferences/dev-mode",
    encrypted: "encrypted_dev_mode",
    nonce: "dev_mode_nonce",
    store: () => h.dev_mode,
  },
  {
    context: "astermail-subscriptions-v1",
    path: "/settings/v1/preferences/subscriptions",
    encrypted: "encrypted_subscriptions",
    nonce: "subscriptions_nonce",
    store: () => h.subscriptions,
  },
  {
    context: "astermail-onboarding-v1",
    path: "/core/v1/onboarding",
    encrypted: "encrypted_state",
    nonce: "state_nonce",
    store: () => h.onboarding,
  },
];

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
  h.server_vault = null;
  reset_draft_activity();
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
  h.on_get = null;
  h.on_lock = null;
  h.put_gate = null;
  h.owner = ACCOUNT;
  h.current_account = ACCOUNT;
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

    const first = await run_retired_key_rewrap(ACCOUNT, () => START);

    expect(first?.pending).toEqual([]);
    expect(first?.dropped).toEqual([]);
    expect(first?.confirming).toHaveLength(9);
    expect(held_contexts()).toHaveLength(11);

    const later = START + RETIRED_REWRAP_CONFIRM_MS + 1;
    const summary = await run_retired_key_rewrap(ACCOUNT, () => later);

    expect(summary?.pending).toEqual([]);
    expect(summary?.dropped).toHaveLength(9);
    expect(held_contexts()).toEqual(KEPT);
    expect(get_retired_context_key(TAGS)).toBeNull();
    expect(get_legacy_crypto_keys()).toHaveLength(1);
    await expect(
      read_with_fallback(TAGS, before.encrypted_name, before.name_nonce),
    ).rejects.toBeTruthy();

    h.calls = [];
    expect(await run_retired_key_rewrap(ACCOUNT, () => later)).toBeNull();
    expect(
      await run_retired_key_rewrap(
        ACCOUNT,
        () => later + RETIRED_REWRAP_CONFIRM_MS,
      ),
    ).toBeNull();
    expect(h.calls).toEqual([]);
  });

  it("keeps a key it has no way to check for remaining data", async () => {
    await affected_vault();

    const first = await run_retired_key_rewrap(ACCOUNT, () => START);

    expect([...(first?.kept ?? [])].sort()).toEqual(KEPT);

    const summary = await run_retired_key_rewrap(
      ACCOUNT,
      () => START + RETIRED_REWRAP_CONFIRM_MS + 1,
    );

    expect([...(summary?.kept ?? [])].sort()).toEqual(KEPT);
    expect(summary?.dropped).not.toContain(KEPT[0]);
    expect(summary?.dropped).not.toContain(SHORT_DRAFTS);
    expect(held_contexts()).toEqual(KEPT);
    for (const context of KEPT) {
      expect(get_retired_context_key(context)).not.toBeNull();
    }
  });

  it("drops a key only after a later scan confirms nothing is left", async () => {
    const old_key = await retired_key(TAGS);
    const new_key = await identity_key(TAGS);
    let clock = START;

    await affected_vault();

    const first = await run_retired_key_rewrap(ACCOUNT, () => clock);

    expect(first?.dropped).toEqual([]);
    expect(first?.confirming).toContain(TAGS);
    expect(h.vault_writes).toBe(0);
    expect(held_contexts()).toHaveLength(11);

    clock += RETIRED_REWRAP_RESCAN_MS + 1;

    const second = await run_retired_key_rewrap(ACCOUNT, () => clock);

    expect(second?.dropped).toEqual([]);
    expect(held_contexts()).toHaveLength(11);

    h.tags = [await tag_row("late", old_key, "Late")];
    clock = START + RETIRED_REWRAP_CONFIRM_MS + 1;

    const third = await run_retired_key_rewrap(ACCOUNT, () => clock);

    expect(third?.rewrapped).toBe(1);
    expect(third?.dropped).not.toContain(TAGS);
    expect(third?.confirming).toEqual([TAGS]);
    expect(held_contexts()).toEqual([...KEPT, TAGS].sort());
    expect(
      await open(new_key, h.tags[0].encrypted_name, h.tags[0].name_nonce),
    ).toBe("Late");

    clock += RETIRED_REWRAP_CONFIRM_MS - 1;
    expect(
      (await run_retired_key_rewrap(ACCOUNT, () => clock))?.dropped,
    ).toEqual([]);
    expect(held_contexts()).toContain(TAGS);

    clock += RETIRED_REWRAP_RESCAN_MS;
    expect(
      (await run_retired_key_rewrap(ACCOUNT, () => clock))?.dropped,
    ).toEqual([TAGS]);
    expect(held_contexts()).toEqual(KEPT);
  });

  it("scans again at once when a dropped key comes back", async () => {
    const old_key = await retired_key(TAGS);
    const new_key = await identity_key(TAGS);
    const later = START + RETIRED_REWRAP_CONFIRM_MS + 1;

    await affected_vault();
    await run_retired_key_rewrap(ACCOUNT, () => START);
    await run_retired_key_rewrap(ACCOUNT, () => later);
    expect(held_contexts()).toEqual(KEPT);

    const returned = all_retired_kek_values().find(
      (k) => retired_kek_context(k) === TAGS,
    ) as string;
    const legacy_keks = [
      ...((h.vault?.legacy_keks ?? []) as { k: string; added_at: string }[]),
      { k: returned, added_at: ADDED_AT },
    ];

    h.vault = { ...h.vault, legacy_keks };
    await load_legacy_keks_into_memory(legacy_keks);
    h.tags = [await tag_row("again", old_key, "Again")];
    h.calls = [];

    const summary = await run_retired_key_rewrap(ACCOUNT, () => later + 1);

    expect(summary?.rewrapped).toBe(1);
    expect(summary?.dropped).toEqual([]);
    expect(summary?.confirming).toEqual([TAGS]);
    expect(held_contexts()).toContain(TAGS);
    expect(
      await open(new_key, h.tags[0].encrypted_name, h.tags[0].name_nonce),
    ).toBe("Again");
  });

  it("does not run for an account that is not the active one", async () => {
    await affected_vault();
    h.tags = [await tag_row("t1", await retired_key(TAGS), "Travel")];

    const before = { ...h.tags[0] };

    expect(await run_retired_key_rewrap(OTHER_ACCOUNT, () => START)).toBeNull();

    h.current_account = OTHER_ACCOUNT;
    expect(await run_retired_key_rewrap(ACCOUNT, () => START)).toBeNull();

    h.current_account = ACCOUNT;
    h.owner = OTHER_ACCOUNT;
    expect(await run_retired_key_rewrap(ACCOUNT, () => START)).toBeNull();

    expect(h.calls).toEqual([]);
    expect(h.vault_writes).toBe(0);
    expect(h.tags[0]).toEqual(before);
    expect(held_contexts()).toHaveLength(11);
  });

  it("stops writing when the account changes during a run", async () => {
    const old_key = await retired_key(TAGS);

    await affected_vault();
    h.tags = [
      await tag_row("t1", old_key, "One"),
      await tag_row("t2", old_key, "Two"),
    ];

    const untouched = { ...h.tags[1] };

    h.on_put = () => {
      h.current_account = OTHER_ACCOUNT;
    };

    expect(await run_retired_key_rewrap(ACCOUNT, () => START)).toBeNull();
    expect(puts()).toEqual(["/mail/v1/tags/t1"]);
    expect(h.tags[1]).toEqual(untouched);
    expect(h.vault_writes).toBe(0);
    expect(held_contexts()).toHaveLength(11);
  });

  it("keeps every key when the account changes before the vault write", async () => {
    await affected_vault();
    await run_retired_key_rewrap(ACCOUNT, () => START);

    h.on_lock = () => {
      h.current_account = OTHER_ACCOUNT;
    };

    const summary = await run_retired_key_rewrap(
      ACCOUNT,
      () => START + RETIRED_REWRAP_CONFIRM_MS + 1,
    );

    expect(summary?.dropped).toEqual([]);
    expect(h.vault_writes).toBe(0);
    expect(held_contexts()).toHaveLength(11);
  });

  it("runs a second account while the first is still in flight", async () => {
    const lock_names: string[] = [];

    vi.stubGlobal("navigator", {
      locks: {
        request: async (
          name: string,
          _options: unknown,
          callback: (lock: unknown) => unknown,
        ) => {
          lock_names.push(name);

          return callback({});
        },
      },
    });

    try {
      let release: () => void = () => undefined;

      await affected_vault();
      h.tags = [await tag_row("t1", await retired_key(TAGS), "One")];
      h.put_gate = new Promise<void>((resolve) => {
        release = resolve;
      });

      const first = run_retired_key_rewrap(ACCOUNT, () => START);

      await vi.waitFor(() => expect(puts()).toHaveLength(1));

      h.put_gate = null;
      h.owner = OTHER_ACCOUNT;
      h.current_account = OTHER_ACCOUNT;
      h.tags = [];
      await affected_vault();

      const second = await run_retired_key_rewrap(OTHER_ACCOUNT, () => START);

      expect(second).not.toBeNull();
      expect(second?.pending).toEqual([]);

      release();
      expect(await first).toBeNull();
      expect(h.vault_writes).toBe(0);
      expect(new Set(lock_names).size).toBe(2);
      expect(lock_names.every((name) => name.endsWith(ACCOUNT))).toBe(false);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("retries pending work sooner and backs off between attempts", async () => {
    let clock = START;

    await affected_vault();
    h.tags = [await tag_row("t1", await retired_key(TAGS), "Travel")];
    h.fail_put = ["/mail/v1/tags/"];

    expect(
      (await run_retired_key_rewrap(ACCOUNT, () => clock))?.pending,
    ).toEqual([TAGS]);
    expect(retired_key_rewrap_wait_ms(ACCOUNT, () => clock)).toBe(
      RETIRED_REWRAP_RETRY_MS,
    );

    clock += RETIRED_REWRAP_RETRY_MS - 1;
    h.calls = [];
    expect(await run_retired_key_rewrap(ACCOUNT, () => clock)).toBeNull();
    expect(h.calls).toEqual([]);

    clock += 1;
    expect(
      (await run_retired_key_rewrap(ACCOUNT, () => clock))?.pending,
    ).toEqual([TAGS]);
    expect(retired_key_rewrap_wait_ms(ACCOUNT, () => clock)).toBe(
      RETIRED_REWRAP_RETRY_MS * 2,
    );

    clock += RETIRED_REWRAP_RETRY_MS + 1;
    expect(await run_retired_key_rewrap(ACCOUNT, () => clock)).toBeNull();

    clock += RETIRED_REWRAP_RETRY_MS;
    h.fail_put = [];

    const settled = await run_retired_key_rewrap(ACCOUNT, () => clock);

    expect(settled?.rewrapped).toBe(1);
    expect(settled?.pending).toEqual([]);
    expect(retired_key_rewrap_wait_ms(ACCOUNT, () => clock)).toBe(
      START + RETIRED_REWRAP_RESCAN_MS - clock,
    );

    for (let attempt = 0; attempt < 12; attempt++) {
      h.fail_get = ["/mail/v1/tags"];
      clock += RETIRED_REWRAP_RESCAN_MS + 1;
      await run_retired_key_rewrap(ACCOUNT, () => clock);
    }
    expect(retired_key_rewrap_wait_ms(ACCOUNT, () => clock)).toBe(
      RETIRED_REWRAP_RESCAN_MS,
    );
  });

  it("schedules the next attempt without a page load", async () => {
    const timers: { callback: () => void; wait_ms: number }[] = [];
    const cleared: unknown[] = [];
    let clock = START;

    await affected_vault();
    h.tags = [await tag_row("t1", await retired_key(TAGS), "Travel")];
    h.fail_put = ["/mail/v1/tags/"];

    const cancel = schedule_retired_key_rewrap(ACCOUNT, {
      now: () => clock,
      set_timer: (callback, wait_ms) => {
        timers.push({ callback, wait_ms });

        return timers.length;
      },
      clear_timer: (handle) => cleared.push(handle),
    });

    await vi.waitFor(() => expect(timers).toHaveLength(1));
    expect(timers[0].wait_ms).toBe(RETIRED_REWRAP_RETRY_MS);
    expect(
      await open(
        await retired_key(TAGS),
        h.tags[0].encrypted_name,
        h.tags[0].name_nonce,
      ),
    ).toBe("Travel");

    h.fail_put = [];
    clock += timers[0].wait_ms;
    timers[0].callback();

    await vi.waitFor(() => expect(timers).toHaveLength(2));
    expect(timers[1].wait_ms).toBe(
      RETIRED_REWRAP_RESCAN_MS - RETIRED_REWRAP_RETRY_MS,
    );
    expect(
      await open(
        await identity_key(TAGS),
        h.tags[0].encrypted_name,
        h.tags[0].name_nonce,
      ),
    ).toBe("Travel");

    cancel();
    expect(cleared).toEqual([2]);
  });

  it("never rewrites a recovery address in the background", async () => {
    const old_key = await retired_key(RECOVERY);
    const sealed = await seal(old_key, "user@example.org");

    await affected_vault();
    h.recovery = {
      exists: true,
      encrypted_email: sealed.encrypted,
      email_nonce: sealed.nonce,
      verified: false,
      step_up_required: false,
    };

    const first = await run_retired_key_rewrap(ACCOUNT, () => START);

    expect(puts()).toEqual([]);
    expect(first?.rewrapped).toBe(0);
    expect(first?.pending).toEqual([RECOVERY]);

    const summary = await run_retired_key_rewrap(
      ACCOUNT,
      () => START + RETIRED_REWRAP_CONFIRM_MS + 1,
    );

    expect(puts()).toEqual([]);
    expect(summary?.pending).toEqual([RECOVERY]);
    expect(summary?.dropped).not.toContain(RECOVERY);
    expect(held_contexts()).toEqual([...KEPT, RECOVERY].sort());
    expect(get_legacy_crypto_keys()).toHaveLength(1);
    expect(h.recovery.verified).toBe(false);
    expect(h.recovery.encrypted_email).toBe(sealed.encrypted);
    expect(
      await open(old_key, h.recovery.encrypted_email, h.recovery.email_nonce),
    ).toBe("user@example.org");
  });

  it("keeps the key for a confirmed recovery address it cannot move", async () => {
    const old_key = await retired_key(RECOVERY);
    const sealed = await seal(old_key, "user@example.org");

    await affected_vault();
    h.recovery = {
      exists: true,
      encrypted_email: sealed.encrypted,
      email_nonce: sealed.nonce,
      verified: true,
      step_up_required: true,
    };

    const first = await run_retired_key_rewrap(ACCOUNT, () => START);

    expect(puts()).toEqual([]);
    expect(first?.pending).toEqual([RECOVERY]);

    const summary = await run_retired_key_rewrap(
      ACCOUNT,
      () => START + RETIRED_REWRAP_CONFIRM_MS + 1,
    );

    expect(puts()).toEqual([]);
    expect(summary?.pending).toEqual([RECOVERY]);
    expect(held_contexts()).toEqual([...KEPT, RECOVERY].sort());
    expect(get_legacy_crypto_keys()).toHaveLength(1);
    expect(
      await open(old_key, h.recovery.encrypted_email, h.recovery.email_nonce),
    ).toBe("user@example.org");
  });

  it("opens a recovery address under its retired key only as a recovery address", async () => {
    const sealed = await seal(await retired_key(RECOVERY), "user@example.org");

    await affected_vault();

    expect(
      await read_with_fallback(RECOVERY, sealed.encrypted, sealed.nonce),
    ).toBe("user@example.org");
    await expect(
      decrypt_aes_gcm_with_fallback(
        await identity_key(RECOVERY),
        base64_to_array(sealed.encrypted),
        base64_to_array(sealed.nonce),
      ),
    ).rejects.toBeTruthy();
    await expect(
      read_with_fallback(TAGS, sealed.encrypted, sealed.nonce),
    ).rejects.toBeTruthy();
  });

  it("checks a held recovery address once a day and does nothing else", async () => {
    const sealed = await seal(await retired_key(RECOVERY), "user@example.org");
    let clock = START;

    await affected_vault();
    h.recovery = {
      exists: true,
      encrypted_email: sealed.encrypted,
      email_nonce: sealed.nonce,
    };

    await run_retired_key_rewrap(ACCOUNT, () => clock);
    clock += RETIRED_REWRAP_CONFIRM_MS + 1;
    await run_retired_key_rewrap(ACCOUNT, () => clock);
    expect(held_contexts()).toEqual([...KEPT, RECOVERY].sort());
    expect(retired_key_rewrap_wait_ms(ACCOUNT, () => clock)).toBe(
      RETIRED_REWRAP_HELD_MS,
    );

    h.calls = [];
    clock += RETIRED_REWRAP_HELD_MS - 1;
    expect(await run_retired_key_rewrap(ACCOUNT, () => clock)).toBeNull();
    expect(h.calls).toEqual([]);

    clock += 1;

    const daily = await run_retired_key_rewrap(ACCOUNT, () => clock);

    expect(daily?.pending).toEqual([RECOVERY]);
    expect(h.calls).toEqual([{ method: "GET", path: RECOVERY_PATH }]);
    expect(h.vault_writes).toBe(1);
    expect(retired_key_rewrap_wait_ms(ACCOUNT, () => clock)).toBe(
      RETIRED_REWRAP_HELD_MS,
    );
  });

  it("checks a recovery address it is not allowed to read once a day", async () => {
    let clock = START;

    await affected_vault();
    h.recovery = { exists: true, step_up_required: true };

    const first = await run_retired_key_rewrap(ACCOUNT, () => clock);

    expect(first?.pending).toEqual([RECOVERY]);

    h.calls = [];
    clock += RETIRED_REWRAP_RESCAN_MS + 1;
    await run_retired_key_rewrap(ACCOUNT, () => clock);
    expect(h.calls.filter((call) => call.path === RECOVERY_PATH)).toEqual([]);

    clock = START + RETIRED_REWRAP_HELD_MS;
    await run_retired_key_rewrap(ACCOUNT, () => clock);
    expect(
      h.calls.filter((call) => call.path === RECOVERY_PATH),
    ).toHaveLength(1);
    expect(held_contexts()).toContain(RECOVERY);
  });

  it("retries one data type without scanning the others again", async () => {
    let clock = START;

    await affected_vault();
    h.tags = [await tag_row("t1", await retired_key(TAGS), "Travel")];
    h.fail_put = ["/mail/v1/tags/"];
    h.fail_get = ["/mail/v1/labels"];

    const first = await run_retired_key_rewrap(ACCOUNT, () => clock);

    expect([...(first?.pending ?? [])].sort()).toEqual([LABELS, TAGS].sort());

    h.fail_get = [];
    h.calls = [];
    clock += RETIRED_REWRAP_RETRY_MS;

    const second = await run_retired_key_rewrap(ACCOUNT, () => clock);

    expect([...(second?.pending ?? [])]).toEqual([TAGS]);
    expect(second?.confirming).toEqual([LABELS]);
    expect(
      h.calls.every(
        (call) =>
          call.path.startsWith("/mail/v1/tags") ||
          call.path.startsWith("/mail/v1/labels"),
      ),
    ).toBe(true);

    h.calls = [];
    clock += RETIRED_REWRAP_RETRY_MS;
    expect(await run_retired_key_rewrap(ACCOUNT, () => clock)).toBeNull();
    expect(h.calls).toEqual([]);

    clock += RETIRED_REWRAP_RETRY_MS;

    const third = await run_retired_key_rewrap(ACCOUNT, () => clock);

    expect(third?.pending).toEqual([TAGS]);
    expect(third?.confirming).toEqual([]);
    expect(h.calls.every((call) => call.path.startsWith("/mail/v1/tags"))).toBe(
      true,
    );
  });

  it("does not let a stale writer bring a dropped key back", async () => {
    await affected_vault();

    const stale = { ...h.vault };
    const later = START + RETIRED_REWRAP_CONFIRM_MS + 1;

    await run_retired_key_rewrap(ACCOUNT, () => START);
    await run_retired_key_rewrap(ACCOUNT, () => later);
    expect(held_contexts()).toEqual(KEPT);

    await write_vault_merged({
      next: { ...stale, recovery_codes: ["a"] } as never,
      base: stale as never,
    });

    expect(h.vault?.recovery_codes).toEqual(["a"]);
    expect(held_contexts()).toEqual(KEPT);
    expect(get_retired_context_key(TAGS)).toBeNull();

    h.calls = [];
    expect(await run_retired_key_rewrap(ACCOUNT, () => later + 1)).toBeNull();
    expect(h.calls).toEqual([]);
  });

  it("scans and confirms again when an older app restores a dropped key", async () => {
    await affected_vault();

    const stale = { ...h.vault };
    const later = START + RETIRED_REWRAP_CONFIRM_MS + 1;

    await run_retired_key_rewrap(ACCOUNT, () => START);
    await run_retired_key_rewrap(ACCOUNT, () => later);
    expect(held_contexts()).toEqual(KEPT);

    await write_vault_merged({ next: stale as never, base: null });
    expect(held_contexts()).toHaveLength(11);

    h.tags = [await tag_row("t1", await retired_key(TAGS), "Travel")];

    const again = await run_retired_key_rewrap(ACCOUNT, () => later + 1);

    expect(again?.rewrapped).toBe(1);
    expect(again?.dropped).toEqual([]);
    expect(again?.confirming).toHaveLength(9);
    expect(held_contexts()).toHaveLength(11);

    const settled = await run_retired_key_rewrap(
      ACCOUNT,
      () => later + 1 + RETIRED_REWRAP_CONFIRM_MS,
    );

    expect(settled?.dropped).toHaveLength(9);
    expect(held_contexts()).toEqual(KEPT);
  });

  it("keeps a recovery blob that is not an address where it is", async () => {
    const sealed = await seal(await retired_key(RECOVERY), "not an address");

    await affected_vault();
    h.recovery = {
      exists: true,
      encrypted_email: sealed.encrypted,
      email_nonce: sealed.nonce,
      verified: false,
      step_up_required: false,
    };

    const summary = await run_retired_key_rewrap(ACCOUNT, () => START);

    expect(puts()).toEqual([]);
    expect(summary?.pending).toEqual([RECOVERY]);
    expect(h.recovery.encrypted_email).toBe(sealed.encrypted);
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
    expect(held_contexts()).toContain(TAGS);
    expect(get_retired_context_key(TAGS)).not.toBeNull();
    expect(
      await read_with_fallback(TAGS, before.encrypted_name, before.name_nonce),
    ).toBe("Travel");
  });

  it("resumes an interrupted run where it stopped", async () => {
    const old_key = await retired_key(TAGS);
    const new_key = await identity_key(TAGS);
    let clock = START;

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
    expect(held_contexts()).toContain(TAGS);
    expect(
      await open(old_key, h.tags[1].encrypted_name, h.tags[1].name_nonce),
    ).toBe("Two");

    h.on_put = null;
    h.fail_put = [];
    h.calls = [];

    expect(await run_retired_key_rewrap(ACCOUNT, () => clock)).toBeNull();
    expect(h.calls).toEqual([]);

    clock += RETIRED_REWRAP_RETRY_MS;

    const second = await run_retired_key_rewrap(ACCOUNT, () => clock);

    expect(puts()).toEqual(["/mail/v1/tags/t2", "/mail/v1/tags/t3"]);
    expect(second?.rewrapped).toBe(2);
    expect(second?.pending).toEqual([]);
    expect(second?.dropped).toEqual([]);

    clock += RETIRED_REWRAP_CONFIRM_MS + 1;
    await run_retired_key_rewrap(ACCOUNT, () => clock);
    expect(held_contexts()).toEqual(KEPT);

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

    const summary = await run_retired_key_rewrap(ACCOUNT, () => START);

    expect(summary?.pending).toEqual(["astermail-labels-v1"]);

    await run_retired_key_rewrap(
      ACCOUNT,
      () => START + RETIRED_REWRAP_CONFIRM_MS + 1,
    );

    expect(held_contexts()).toEqual([...KEPT, "astermail-labels-v1"]);
  });

  it("keeps every key when the vault write does not land", async () => {
    await affected_vault();
    h.vault_status = "conflict";
    await run_retired_key_rewrap(ACCOUNT, () => START);

    const summary = await run_retired_key_rewrap(
      ACCOUNT,
      () => START + RETIRED_REWRAP_CONFIRM_MS + 1,
    );

    expect(h.vault_writes).toBe(1);
    expect(summary?.dropped).toEqual([]);
    expect(summary?.pending).toHaveLength(9);
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
    expect(summary?.confirming).toContain(PREFERENCES);
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
    expect(held_contexts()).toContain(PREFERENCES);
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

    const summary = await run_retired_key_rewrap(ACCOUNT);
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
    expect(summary?.confirming).toContain(context);
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
    expect(held_contexts()).toEqual(expect.arrayContaining(kept));
    expect(h.scheduled[0].encrypted_envelope).toBe(scheduled.encrypted);
    expect(h.recovery.encrypted_email).toBe(recovery.encrypted);
  });

  it("keeps the key of the short draft format and makes no request", async () => {
    const short_key = all_retired_kek_values().find(
      (k) => retired_kek_context(k) === SHORT_DRAFTS,
    ) as string;
    const legacy_keks = [{ k: short_key, added_at: ADDED_AT }];
    const sealed = await seal(await retired_key(SHORT_DRAFTS), "slot");

    h.vault = { identity_key: IDENTITY, legacy_keks };
    await load_legacy_keks_into_memory(legacy_keks);
    h.drafts = [
      {
        id: "d1",
        encrypted_content: sealed.encrypted,
        content_nonce: sealed.nonce,
        version: 1,
      },
    ];

    const first = await run_retired_key_rewrap(ACCOUNT, () => START);

    expect(first).toBeNull();

    const second = await run_retired_key_rewrap(
      ACCOUNT,
      () => START + RETIRED_REWRAP_CONFIRM_MS + 1,
    );

    expect(second).toBeNull();
    expect(h.calls).toEqual([]);
    expect(h.drafts[0].encrypted_content).toBe(sealed.encrypted);
    expect(held_contexts()).toEqual([SHORT_DRAFTS]);
  });

  it("leaves a draft alone while it is being saved or is open here", async () => {
    const context: AccountDataContext = "astermail-draft-v2";
    const sealed = await seal(await retired_key(context), "draft body");
    let clock = START;

    await affected_vault();
    h.drafts = [
      {
        id: "d1",
        encrypted_content: sealed.encrypted,
        content_nonce: sealed.nonce,
        version: 3,
      },
    ];
    begin_draft_write("d1", Date.now());

    const first = await run_retired_key_rewrap(ACCOUNT, () => clock);

    expect(puts()).toEqual([]);
    expect(first?.pending).toEqual([context]);
    expect(h.drafts[0].version).toBe(3);
    expect(h.drafts[0].encrypted_content).toBe(sealed.encrypted);

    end_draft_write("d1", Date.now());
    reset_draft_activity();

    const close = register_open_draft_check((id) => id === "d1");

    clock += RETIRED_REWRAP_RETRY_MS;

    const second = await run_retired_key_rewrap(ACCOUNT, () => clock);

    expect(puts()).toEqual([]);
    expect(second?.pending).toEqual([context]);
    expect(h.drafts[0].version).toBe(3);

    close();
    clock += RETIRED_REWRAP_RESCAN_MS;

    const third = await run_retired_key_rewrap(ACCOUNT, () => clock);

    expect(puts()).toEqual(["/mail/v1/drafts/d1"]);
    expect(third?.rewrapped).toBe(1);
    expect(h.drafts[0].version).toBe(4);
    expect(
      await open(
        await identity_key(context),
        h.drafts[0].encrypted_content,
        h.drafts[0].content_nonce,
      ),
    ).toBe("draft body");
  });

  for (const setting of SETTINGS) {
    it(`skips ${setting.context} when it changed after it was read`, async () => {
      const stale = await seal(await retired_key(setting.context), "old");
      const newer = await seal(await identity_key(setting.context), "new");

      await affected_vault();
      Object.assign(setting.store(), {
        [setting.encrypted]: stale.encrypted,
        [setting.nonce]: stale.nonce,
      });
      change_on_read(setting.path, 2, () => {
        Object.assign(setting.store(), {
          [setting.encrypted]: newer.encrypted,
          [setting.nonce]: newer.nonce,
        });
      });

      const summary = await run_retired_key_rewrap(ACCOUNT, () => START);

      expect(puts()).toEqual([]);
      expect(summary?.rewrapped).toBe(0);
      expect(summary?.pending).toEqual([setting.context]);
      expect(setting.store()[setting.encrypted]).toBe(newer.encrypted);
      expect(held_contexts()).toContain(setting.context);

      h.on_get = null;

      const retry = await run_retired_key_rewrap(
        ACCOUNT,
        () => START + RETIRED_REWRAP_RETRY_MS,
      );

      expect(retry?.pending).toEqual([]);
      expect(puts()).toEqual([]);
      expect(setting.store()[setting.encrypted]).toBe(newer.encrypted);
    });

    it(`reads ${setting.context} again right before writing it`, async () => {
      const stale = await seal(await retired_key(setting.context), "old");

      await affected_vault();
      Object.assign(setting.store(), {
        [setting.encrypted]: stale.encrypted,
        [setting.nonce]: stale.nonce,
      });

      const summary = await run_retired_key_rewrap(ACCOUNT, () => START);
      const order = h.calls
        .filter((call) => call.path === setting.path)
        .map((call) => call.method);
      const stored = setting.store();

      expect(order.slice(0, 3)).toEqual(["GET", "GET", "PUT"]);
      expect(summary?.rewrapped).toBe(1);
      expect(summary?.pending).toEqual([]);
      expect(
        await open(
          await identity_key(setting.context),
          stored[setting.encrypted],
          stored[setting.nonce],
        ),
      ).toBe("old");
    });
  }

  it("writes onboarding with the completion it read last", async () => {
    const context: AccountDataContext = "astermail-onboarding-v1";
    const stale = await seal(await retired_key(context), "step-2");

    await affected_vault();
    h.onboarding = {
      encrypted_state: stale.encrypted,
      state_nonce: stale.nonce,
      is_completed: false,
      is_skipped: false,
    };
    change_on_read("/core/v1/onboarding", 2, () => {
      h.onboarding.is_completed = true;
      h.onboarding.is_skipped = true;
    });

    const summary = await run_retired_key_rewrap(ACCOUNT, () => START);
    const write = h.calls.find((call) => call.method === "PUT");

    expect(summary?.rewrapped).toBe(1);
    expect(summary?.pending).toEqual([]);
    expect((write?.body as Row).is_completed).toBe(true);
    expect((write?.body as Row).is_skipped).toBe(true);
    expect(h.onboarding.is_completed).toBe(true);
    expect(h.onboarding.is_skipped).toBe(true);
    expect(
      await open(
        await identity_key(context),
        h.onboarding.encrypted_state,
        h.onboarding.state_nonce,
      ),
    ).toBe("step-2");
  });

  it("skips a tag another device changed after it was listed", async () => {
    const old_key = await retired_key(TAGS);
    const new_key = await identity_key(TAGS);
    const renamed = await tag_row("t1", new_key, "Renamed");

    await affected_vault();
    h.tags = [
      await tag_row("t1", old_key, "Travel"),
      await tag_row("t2", old_key, "Work"),
    ];
    change_on_read("/mail/v1/tags/t1", 1, () => {
      Object.assign(h.tags[0], renamed);
    });

    const summary = await run_retired_key_rewrap(ACCOUNT, () => START);

    expect(puts()).toEqual(["/mail/v1/tags/t2"]);
    expect(summary?.rewrapped).toBe(1);
    expect(summary?.held).toBe(1);
    expect(summary?.pending).toEqual([TAGS]);
    expect(
      await open(new_key, h.tags[0].encrypted_name, h.tags[0].name_nonce),
    ).toBe("Renamed");
    expect(
      await open(new_key, h.tags[1].encrypted_name, h.tags[1].name_nonce),
    ).toBe("Work");
    expect(held_contexts()).toContain(TAGS);
  });

  it("reads a label again right before writing it", async () => {
    const old_key = await retired_key(LABELS);

    await affected_vault();
    h.labels = [await tag_row("l1", old_key, "Receipts")];

    const summary = await run_retired_key_rewrap(ACCOUNT, () => START);
    const order = h.calls
      .filter((call) => call.path.startsWith("/mail/v1/labels/"))
      .map((call) => `${call.method} ${call.path}`);

    expect(order).toEqual(["GET /mail/v1/labels/l1", "PUT /mail/v1/labels/l1"]);
    expect(summary?.rewrapped).toBe(1);
    expect(
      await open(
        await identity_key(LABELS),
        h.labels[0].encrypted_name,
        h.labels[0].name_nonce,
      ),
    ).toBe("Receipts");
  });

  it("skips a label another device changed after it was listed", async () => {
    const old_key = await retired_key(LABELS);
    const recolored = await seal(await identity_key(LABELS), "#000");

    await affected_vault();
    h.labels = [await tag_row("l1", old_key, "Receipts")];
    change_on_read("/mail/v1/labels/l1", 1, () => {
      h.labels[0].encrypted_color = recolored.encrypted;
      h.labels[0].color_nonce = recolored.nonce;
    });

    const summary = await run_retired_key_rewrap(ACCOUNT, () => START);

    expect(puts()).toEqual([]);
    expect(summary?.pending).toEqual([LABELS]);
    expect(h.labels[0].encrypted_color).toBe(recolored.encrypted);
    expect(
      await open(old_key, h.labels[0].encrypted_name, h.labels[0].name_nonce),
    ).toBe("Receipts");
  });

  it("never writes a built-in label and checks it once a day", async () => {
    const old_key = await retired_key(LABELS);
    let clock = START;

    await affected_vault();
    h.labels = [
      { ...(await tag_row("inbox", old_key, "Inbox")), is_system: true },
      { ...(await tag_row("l1", old_key, "Receipts")), is_system: false },
    ];

    const built_in = { ...h.labels[0] };
    const first = await run_retired_key_rewrap(ACCOUNT, () => clock);

    expect(
      h.calls.filter((call) => call.path === "/mail/v1/labels/inbox"),
    ).toEqual([]);
    expect(puts()).toEqual(["/mail/v1/labels/l1"]);
    expect(first?.rewrapped).toBe(1);
    expect(first?.pending).toEqual([LABELS]);
    expect(h.labels[0]).toEqual(built_in);
    expect(
      await read_with_fallback(
        LABELS,
        built_in.encrypted_name,
        built_in.name_nonce,
      ),
    ).toBe("Inbox");

    h.calls = [];
    clock += RETIRED_REWRAP_RESCAN_MS + 1;
    await run_retired_key_rewrap(ACCOUNT, () => clock);
    expect(
      h.calls.filter((call) => call.path.startsWith("/mail/v1/labels")),
    ).toEqual([]);

    clock = START + RETIRED_REWRAP_HELD_MS + RETIRED_REWRAP_CONFIRM_MS;

    const later = await run_retired_key_rewrap(ACCOUNT, () => clock);

    expect(later?.pending).toEqual([LABELS]);
    expect(puts()).toEqual([]);
    expect(held_contexts()).toContain(LABELS);
  });

  it("holds a label it cannot read again before writing", async () => {
    await affected_vault();
    h.labels = [await tag_row("l1", await retired_key(LABELS), "Receipts")];
    h.fail_get = ["/mail/v1/labels/"];

    const before = { ...h.labels[0] };
    const summary = await run_retired_key_rewrap(ACCOUNT, () => START);

    expect(puts()).toEqual([]);
    expect(summary?.held).toBe(1);
    expect(summary?.pending).toEqual([LABELS]);
    expect(h.labels[0]).toEqual(before);
    expect(held_contexts()).toContain(LABELS);
  });

  it("opens no other data type through the shared key pool", async () => {
    await affected_vault();

    expect(get_legacy_crypto_keys()).toHaveLength(1);

    for (const value of all_retired_kek_values()) {
      const context = retired_kek_context(value) as AccountDataContext;
      const sealed = await seal(await aes_key(base64_to_array(value)), "x");

      await expect(
        decrypt_aes_gcm_with_fallback(
          await identity_key(context),
          base64_to_array(sealed.encrypted),
          base64_to_array(sealed.nonce),
        ),
      ).rejects.toBeTruthy();
    }

    const own = await seal(await identity_key(TAGS), "Travel");

    expect(
      await open(await retired_key(RECOVERY), own.encrypted, own.nonce),
    ).toBeNull();
  });
});
