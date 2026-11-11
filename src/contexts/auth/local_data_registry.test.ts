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
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  onTestFinished,
  vi,
} from "vitest";

import {
  DEVICE_SETTING_LOCAL_KEYS,
  ERROR_REPORT_OPT_OUT_KEY,
  INDEXED_DB_NAMES,
  erase_cache_storage,
  erase_device_traces,
  erase_indexed_databases,
  erase_local_storage_traces,
  erase_session_storage_traces,
} from "./local_data_registry";

const here = dirname(fileURLToPath(import.meta.url));
const source_root = resolve(here, "..", "..");

function source_files(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);

    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === "tests") continue;
      source_files(path, found);
      continue;
    }
    if (!/\.(ts|tsx)$/.test(entry.name)) continue;
    if (/\.test\.(ts|tsx)$/.test(entry.name)) continue;
    found.push(path);
  }

  return found;
}

const sources = source_files(source_root).map((path) => ({
  path,
  text: readFileSync(path, "utf8").replace(/\r\n/g, "\n"),
}));

function written_storage_keys(): string[] {
  const keys = new Set<string>();
  const direct =
    /(?:localStorage|sessionStorage)\.setItem\(\s*["'`]([^"'`$]+)|safe_(?:local|session)_set\(\s*["'`]([^"'`$]+)/g;
  const named =
    /const\s+[A-Z0-9_]*(?:KEY|PREFIX|FLAG|MARKER)[A-Z0-9_]*\s*=\s*["'`]([^"'`$]+)["'`]/g;

  for (const { text } of sources) {
    if (!/localStorage|sessionStorage|safe_local_|safe_session_/.test(text)) {
      continue;
    }
    for (const match of text.matchAll(direct)) {
      keys.add(match[1] ?? match[2]);
    }
    for (const match of text.matchAll(named)) {
      keys.add(match[1]);
    }
  }

  return [...keys];
}

function opened_database_names(): { names: string[]; unresolved: string[] } {
  const names = new Set<string>();
  const unresolved: string[] = [];
  const opened = /indexedDB\.open\(\s*([^,)\s]+)/g;

  for (const { path, text } of sources) {
    if (path.endsWith("local_data_registry.ts")) continue;
    for (const match of text.matchAll(opened)) {
      const argument = match[1];
      const literal = /^["'`]([^"'`]+)["'`]$/.exec(argument);

      if (literal) {
        names.add(literal[1]);
        continue;
      }

      const declared = new RegExp(
        `const\\s+${argument}\\s*=\\s*["'\`]([^"'\`]+)["'\`]`,
      ).exec(text);

      if (declared) {
        names.add(declared[1]);
      } else {
        unresolved.push(`${path}: ${argument}`);
      }
    }
  }

  return { names: [...names], unresolved };
}

function local_keys(): string[] {
  const keys: string[] = [];

  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index);

    if (key !== null) keys.push(key);
  }

  return keys;
}

interface FakeDatabaseFactory {
  databases?: () => Promise<{ name: string; version: number }[]>;
  deleteDatabase: (name: string) => unknown;
}

function open_absent_database(): unknown {
  const request: {
    onupgradeneeded?: (event: { oldVersion: number }) => void;
    onerror?: () => void;
    transaction: { abort: () => void } | null;
  } = { transaction: { abort: () => undefined } };

  queueMicrotask(() => {
    request.onupgradeneeded?.({ oldVersion: 0 });
    request.transaction = null;
    request.onerror?.();
  });

  return request;
}

function stub_indexed_db(fake: FakeDatabaseFactory): void {
  const target = indexedDB as unknown as Record<string, unknown>;
  const had_own = Object.prototype.hasOwnProperty.call(target, "databases");
  const previous = target.databases;
  const spy = vi
    .spyOn(indexedDB, "deleteDatabase")
    .mockImplementation(fake.deleteDatabase as never);
  const opening = vi
    .spyOn(indexedDB, "open")
    .mockImplementation(open_absent_database as never);

  target.databases = fake.databases;
  onTestFinished(() => {
    spy.mockRestore();
    opening.mockRestore();
    if (had_own) target.databases = previous;
    else delete target.databases;
  });
}

describe("erasing every local trace", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.unstubAllGlobals();
  });

  it("finds the storage keys the app writes", () => {
    const keys = written_storage_keys();

    expect(keys.length).toBeGreaterThan(60);
    expect(keys).toContain("aster:login_v2_accounts");
    expect(keys).toContain("aster:login_salt_records");
    expect(keys).toContain("aster:login_known_accounts");
    expect(keys).toContain("aster_multi_account_device_id");
  });

  it("removes every key the app writes, in both stores", () => {
    const keys = written_storage_keys();

    for (const key of keys) {
      localStorage.setItem(key, "value");
      localStorage.setItem(`${key}account-1`, "value");
      sessionStorage.setItem(key, "value");
      sessionStorage.setItem(`${key}account-1`, "value");
    }

    expect(erase_session_storage_traces()).toEqual([]);
    expect(erase_local_storage_traces()).toEqual([]);

    expect(sessionStorage.length).toBe(0);
    expect(
      local_keys().filter((key) => !DEVICE_SETTING_LOCAL_KEYS.includes(key)),
    ).toEqual([]);
  });

  it("removes the sign-in records that name an account", () => {
    localStorage.setItem(
      "aster:login_v2_accounts",
      JSON.stringify(["h:abc", "u:user-1"]),
    );
    localStorage.setItem(
      "aster:login_salt_records",
      JSON.stringify([{ key: "h:abc", salt: "c2FsdA" }]),
    );
    localStorage.setItem(
      "aster:login_known_accounts",
      JSON.stringify(["h:abc"]),
    );

    erase_local_storage_traces();

    expect(local_keys()).toEqual([]);
  });

  it("removes a key nobody registered", () => {
    localStorage.setItem("something_new_for_user-1", "value");
    sessionStorage.setItem("something_new_for_user-1", "value");

    erase_session_storage_traces();
    erase_local_storage_traces();

    expect(localStorage.getItem("something_new_for_user-1")).toBeNull();
    expect(sessionStorage.getItem("something_new_for_user-1")).toBeNull();
  });

  it("keeps device settings that name no account", () => {
    for (const key of DEVICE_SETTING_LOCAL_KEYS) {
      localStorage.setItem(key, "value");
    }

    erase_local_storage_traces();

    expect(local_keys().sort()).toEqual([...DEVICE_SETTING_LOCAL_KEYS].sort());
  });

  it("removes the connection route settings", () => {
    const route_keys = [
      "aster_connection_method",
      "aster_cdn_relay_url",
      "aster_onion_api_url",
      "aster_onion_mail_url",
    ];

    for (const key of route_keys) localStorage.setItem(key, "value");
    localStorage.setItem("astermail_theme", "dark");
    localStorage.setItem("astermail_language", "en");

    expect(erase_local_storage_traces()).toEqual([]);

    for (const key of route_keys) {
      expect(DEVICE_SETTING_LOCAL_KEYS).not.toContain(key);
      expect(localStorage.getItem(key)).toBeNull();
    }
    expect(localStorage.getItem("astermail_theme")).toBe("dark");
    expect(localStorage.getItem("astermail_language")).toBe("en");
  });

  it("keeps device settings free of account scoped keys", () => {
    for (const key of DEVICE_SETTING_LOCAL_KEYS) {
      expect(key).not.toMatch(/login|account|user|sender|device_id|family/);
    }
  });

  it("keeps an error report opt-out and drops an opt-in", () => {
    localStorage.setItem(ERROR_REPORT_OPT_OUT_KEY, "off");
    erase_local_storage_traces();
    expect(localStorage.getItem(ERROR_REPORT_OPT_OUT_KEY)).toBe("off");

    localStorage.setItem(ERROR_REPORT_OPT_OUT_KEY, "on");
    erase_local_storage_traces();
    expect(localStorage.getItem(ERROR_REPORT_OPT_OUT_KEY)).toBeNull();
  });

  it("registers every database the app opens", () => {
    const { names, unresolved } = opened_database_names();

    expect(unresolved).toEqual([]);
    expect(names.length).toBeGreaterThan(8);
    expect(names.filter((name) => !INDEXED_DB_NAMES.includes(name))).toEqual(
      [],
    );
  });

  it("releases every database connection when a deletion asks", () => {
    const opening = sources.filter(({ text }) =>
      text.includes("indexedDB.open("),
    );
    const unreleased = opening
      .filter(
        ({ text }) =>
          !text.includes("release_on_version_change(") &&
          !text.includes("onversionchange"),
      )
      .map(({ path }) => path);

    expect(opening.length).toBeGreaterThan(8);
    expect(unreleased).toEqual([]);
  });

  it("marks the page as erased so late writers stop", async () => {
    vi.resetModules();

    const latch = await import("@/lib/device_erase_latch");
    const registry = await import("./local_data_registry");

    stub_indexed_db({
      deleteDatabase: () => {
        const request: { onsuccess?: () => void } = {};

        queueMicrotask(() => request.onsuccess?.());

        return request;
      },
    });

    expect(latch.device_traces_erased()).toBe(false);

    await registry.erase_device_traces();

    expect(latch.device_traces_erased()).toBe(true);
  });

  it("deletes registered databases and any others the browser lists", async () => {
    const deleted: string[] = [];

    stub_indexed_db({
      databases: async () => [{ name: "left_by_an_older_build", version: 1 }],
      deleteDatabase: (name: string) => {
        const request: { onsuccess?: () => void } = {};

        deleted.push(name);
        queueMicrotask(() => request.onsuccess?.());

        return request;
      },
    });

    expect(await erase_indexed_databases()).toEqual({ failed: [], blocked: [] });
    expect(deleted.sort()).toEqual(
      [...INDEXED_DB_NAMES, "left_by_an_older_build"].sort(),
    );
  });

  it("deletes registered databases when the browser cannot list them", async () => {
    const deleted: string[] = [];

    stub_indexed_db({
      deleteDatabase: (name: string) => {
        const request: { onsuccess?: () => void } = {};

        deleted.push(name);
        queueMicrotask(() => request.onsuccess?.());

        return request;
      },
    });

    await erase_indexed_databases();

    expect(deleted.sort()).toEqual([...INDEXED_DB_NAMES].sort());
  });

  it("reports a database that could not be deleted", async () => {
    stub_indexed_db({
      deleteDatabase: (name: string) => {
        const request: { onsuccess?: () => void; onerror?: () => void } = {};

        queueMicrotask(() =>
          name === "astermail_secure_db"
            ? request.onerror?.()
            : request.onsuccess?.(),
        );

        return request;
      },
    });

    expect(await erase_indexed_databases()).toEqual({
      failed: ["astermail_secure_db"],
      blocked: [],
    });
  });

  it("reports a database whose deletion stays blocked", async () => {
    vi.useFakeTimers();
    onTestFinished(() => {
      vi.useRealTimers();
    });
    vi.resetModules();

    const registry = await import("./local_data_registry");

    stub_indexed_db({
      deleteDatabase: (name: string) => {
        const request: { onsuccess?: () => void; onblocked?: () => void } = {};

        void Promise.resolve().then(() =>
          name === "astermail_secure_db"
            ? request.onblocked?.()
            : request.onsuccess?.(),
        );

        return request;
      },
    });

    const pending = registry.erase_indexed_databases();
    let settled = false;

    void pending.then(() => {
      settled = true;
    });

    await vi.advanceTimersByTimeAsync(2000);
    expect(settled).toBe(false);

    await vi.advanceTimersByTimeAsync(1500);

    expect(await pending).toEqual({
      failed: [],
      blocked: ["astermail_secure_db"],
    });
  });

  it("reports a deletion that hangs without a blocked event as failed", async () => {
    vi.useFakeTimers();
    onTestFinished(() => {
      vi.useRealTimers();
    });
    vi.resetModules();

    const registry = await import("./local_data_registry");

    stub_indexed_db({
      deleteDatabase: (name: string) => {
        const request: { onsuccess?: () => void } = {};

        void Promise.resolve().then(() =>
          name === "astermail_secure_db" ? undefined : request.onsuccess?.(),
        );

        return request;
      },
    });

    const pending = registry.erase_indexed_databases();

    await vi.advanceTimersByTimeAsync(3500);

    expect(await pending).toEqual({
      failed: ["astermail_secure_db"],
      blocked: [],
    });
  });

  it("counts a blocked deletion that then completes", async () => {
    vi.useFakeTimers();
    onTestFinished(() => {
      vi.useRealTimers();
    });
    stub_indexed_db({
      deleteDatabase: () => {
        const request: { onsuccess?: () => void; onblocked?: () => void } = {};

        void Promise.resolve().then(() => {
          request.onblocked?.();
          setTimeout(() => request.onsuccess?.(), 1500);
        });

        return request;
      },
    });

    const pending = erase_indexed_databases();

    await vi.advanceTimersByTimeAsync(2000);

    expect(await pending).toEqual({ failed: [], blocked: [] });
  });

  it("deletes every cache", async () => {
    const names = ["aster_push_strings", "aster-translation-models-v1", "x"];
    const deleted: string[] = [];

    vi.stubGlobal("caches", {
      keys: async () => names,
      delete: async (name: string) => {
        deleted.push(name);

        return true;
      },
    });

    expect(await erase_cache_storage()).toEqual([]);
    expect(deleted).toEqual(names);
  });

  it("reports success only when nothing is left", async () => {
    stub_indexed_db({
      deleteDatabase: () => {
        const request: { onsuccess?: () => void } = {};

        queueMicrotask(() => request.onsuccess?.());

        return request;
      },
    });
    vi.stubGlobal("caches", {
      keys: async () => ["x"],
      delete: async () => false,
    });
    localStorage.setItem("aster:login_known_accounts", "[]");

    const first = await erase_device_traces();

    expect(first.complete).toBe(false);
    expect(first.failed_caches).toEqual(["x"]);
    expect(local_keys()).toEqual([]);

    vi.stubGlobal("caches", {
      keys: async () => ["x"],
      delete: async () => true,
    });

    expect((await erase_device_traces()).complete).toBe(true);
  });

  it("repeats only the parts that failed when retried", async () => {
    const deleted: string[] = [];
    let cache_sweeps = 0;

    stub_indexed_db({
      deleteDatabase: (name: string) => {
        const request: { onsuccess?: () => void } = {};

        deleted.push(name);
        queueMicrotask(() => request.onsuccess?.());

        return request;
      },
    });
    vi.stubGlobal("caches", {
      keys: async () => {
        cache_sweeps += 1;

        return [];
      },
      delete: async () => true,
    });

    const retried = await erase_device_traces({
      complete: false,
      failed_databases: ["astermail_secure_db"],
      blocked_databases: ["aster_app_lock"],
      failed_caches: [],
      failed_session: [],
      failed_local: [],
    });

    expect(retried.complete).toBe(true);
    expect(deleted.sort()).toEqual(["aster_app_lock", "astermail_secure_db"]);
    expect(cache_sweeps).toBe(0);
  });

  it("erases storage before the first database answers", async () => {
    let storage_at_first_open: string[] | null = null;

    stub_indexed_db({
      deleteDatabase: () => {
        const request: { onsuccess?: () => void } = {};

        queueMicrotask(() => request.onsuccess?.());

        return request;
      },
    });
    vi.mocked(indexedDB.open).mockImplementation(((): unknown => {
      storage_at_first_open ??= local_keys();

      return open_absent_database();
    }) as never);
    localStorage.setItem("aster:login_known_accounts", "[]");

    await erase_device_traces();

    expect(storage_at_first_open).toEqual([]);
  });
});

describe("the duress wipe uses the full erase", () => {
  const app_lock = readFileSync(
    resolve(source_root, "components", "mobile", "app_lock.tsx"),
    "utf8",
  );

  it("asks for the full erase from the duress handler", () => {
    const handler = app_lock.slice(
      app_lock.indexOf("const handle_duress_confirm"),
      app_lock.indexOf("const reject_input"),
    );

    expect(handler.match(/erase_device_with_retry\(\)/g)?.length).toBe(1);
    expect(handler).not.toContain("purge_all_local_data(");
  });
});
