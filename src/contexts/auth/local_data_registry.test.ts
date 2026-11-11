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

function stub_indexed_db(fake: FakeDatabaseFactory): void {
  const target = indexedDB as unknown as Record<string, unknown>;
  const had_own = Object.prototype.hasOwnProperty.call(target, "databases");
  const previous = target.databases;
  const spy = vi
    .spyOn(indexedDB, "deleteDatabase")
    .mockImplementation(fake.deleteDatabase as never);

  target.databases = fake.databases;
  onTestFinished(() => {
    spy.mockRestore();
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

    expect(await erase_indexed_databases()).toEqual([]);
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

    expect(await erase_indexed_databases()).toEqual(["astermail_secure_db"]);
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

    expect(await erase_device_traces()).toBe(false);
    expect(local_keys()).toEqual([]);

    vi.stubGlobal("caches", {
      keys: async () => ["x"],
      delete: async () => true,
    });

    expect(await erase_device_traces()).toBe(true);
  });
});

describe("the duress wipe uses the full erase", () => {
  const purge = readFileSync(resolve(here, "purge_local_data.ts"), "utf8");
  const app_lock = readFileSync(
    resolve(source_root, "components", "mobile", "app_lock.tsx"),
    "utf8",
  );

  it("asks for the full erase from the duress handler", () => {
    const handler = app_lock.slice(
      app_lock.indexOf("const handle_duress_confirm"),
      app_lock.indexOf("const reject_input"),
    );

    expect(handler.match(/purge_all_local_data\(/g)?.length).toBe(2);
    expect(
      handler.match(/purge_all_local_data\(\{ erase_device_traces: true \}\)/g)
        ?.length,
    ).toBe(2);
  });

  it("revokes the device before signing out and erases after", () => {
    const release = purge.indexOf("await release_remote_device_links();");
    const sign_out = purge.indexOf("await logout_user();");
    const pairing = purge.indexOf("await erase_device_pairing();");
    const traces = purge.indexOf("await erase_device_traces()");
    const cookies = purge.indexOf("await api_client.clear_session_cookies();");

    expect(release).toBeGreaterThan(-1);
    expect(release).toBeLessThan(sign_out);
    expect(pairing).toBeGreaterThan(cookies);
    expect(traces).toBeGreaterThan(pairing);
  });
});
