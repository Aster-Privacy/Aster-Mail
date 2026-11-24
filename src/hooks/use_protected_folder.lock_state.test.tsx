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
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

(
  globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const FOLDER_A = "a1111111-1111-4111-8111-111111111111";
const FOLDER_B = "b2222222-2222-4222-8222-222222222222";
const TOKEN_A = "folder_token_a";
const TOKEN_B = "folder_token_b";

const hoisted = vi.hoisted(() => ({
  expires_at: {} as Record<string, string | undefined>,
  keys: {} as Record<string, Uint8Array>,
  lock_folder_session: vi.fn(async () => ({ data: { success: true } })),
  purge: vi.fn(async () => undefined),
}));

vi.mock("@/lib/i18n/context", () => {
  const i18n = { t: (key: string) => key };

  return { use_i18n: () => i18n };
});

vi.mock("@/hooks/use_folders", () => {
  const folders: Record<string, Record<string, unknown>> = {
    "a1111111-1111-4111-8111-111111111111": {
      id: "a1111111-1111-4111-8111-111111111111",
      folder_token: "folder_token_a",
      is_password_protected: true,
      password_set: true,
    },
    "b2222222-2222-4222-8222-222222222222": {
      id: "b2222222-2222-4222-8222-222222222222",
      folder_token: "folder_token_b",
      is_password_protected: true,
      password_set: true,
    },
  };
  const api = { get_folder_by_id: (id: string) => folders[id] };

  return { use_folders: () => api };
});

vi.mock("@/hooks/mail_events", async (import_original) => ({
  ...(await import_original<typeof import("@/hooks/mail_events")>()),
  emit_folders_changed: vi.fn(),
}));

vi.mock("@/services/api/client", () => ({
  api_client: {
    get: vi.fn(async () => ({ data: { password_salt: "c2FsdA==" } })),
  },
}));

vi.mock("@/services/api/folders", () => ({
  set_folder_password: vi.fn(),
  verify_folder_password: vi.fn(async (folder_id: string) => ({
    data: {
      verified: true,
      encrypted_folder_key: "a2V5",
      folder_key_nonce: "bm9uY2U=",
      folder_key_version: 2,
      unlock_token: `unlock_${folder_id}`,
      unlock_expires_at: hoisted.expires_at[folder_id],
    },
  })),
  change_folder_password: vi.fn(),
  remove_folder_password: vi.fn(),
  lock_folder_session: (...args: unknown[]) =>
    (hoisted.lock_folder_session as (...a: unknown[]) => unknown)(...args),
}));

vi.mock("@/services/folder_unlock_grant", () => ({
  request_folder_unlock_grant: vi.fn(),
}));

vi.mock("@/services/locked_folders", () => ({
  purge_locked_folder_local_caches: () => hoisted.purge(),
}));

vi.mock("@/services/api/stored_key_readiness", () => ({
  get_stored_key_readiness: vi.fn(async () => true),
}));

vi.mock("@/services/crypto/folder_key_pin_vault", () => ({
  current_folder_key_pin_level: () => 2,
  record_folder_key_pin: vi.fn(async () => undefined),
}));

vi.mock("@/services/crypto/folder_kdf_pin", () => ({
  folder_key_belongs_elsewhere: vi.fn(async () => false),
  pin_folder_kdf: vi.fn(),
  remember_folder_pin: vi.fn(async () => true),
}));

vi.mock("@/services/crypto/folder_protection", () => ({
  prepare_set_password: vi.fn(),
  prepare_change_password: vi.fn(),
  derive_password_keys: vi.fn(async () => ({
    auth_key: new Uint8Array(32).fill(1),
    encryption_key: new Uint8Array(32).fill(2),
  })),
  array_to_base64: () => "aGFzaA==",
  base64_to_array: () => new Uint8Array(16),
  folder_pin_level_after_unlock: () => 2,
  folder_pin_level_for_write: () => 2,
  folder_salt_is_current: () => true,
  folder_writes_bound: () => true,
  open_folder_wrap_for_unlock: vi.fn(async (folder_id: string) => {
    const folder_key = new Uint8Array(32).fill(folder_id.charCodeAt(0));

    hoisted.keys[folder_id] = folder_key;

    return { folder_key, rebind: false, format: 2 };
  }),
  salt_rule_for_pin: () => false,
}));

import {
  FOLDER_LOCKED_EVENT,
  count_unlocked_folders,
  get_unlock_token,
  has_unlocked_folders,
  is_folder_unlocked,
  list_unlocked_folder_ids,
  lock_all_folders,
  lock_folder_by_id,
  lock_folder_left_behind,
  use_protected_folder,
  type UseProtectedFolderResult,
} from "@/hooks/use_protected_folder";
import {
  get_folder_unlock_version,
  get_unlocked_folder_tokens,
  has_folder_unlock_records,
  subscribe_folder_unlocks,
} from "@/services/folder_unlock_store";

let container: HTMLDivElement;
let root: Root;
const hooks: Record<string, UseProtectedFolderResult> = {};
let dispatched: string[] = [];

const capture = (event: Event) => {
  dispatched.push(
    (event as CustomEvent<{ folder_id: string }>).detail.folder_id,
  );
};

function Harness({ folder_id }: { folder_id: string }) {
  hooks[folder_id] = use_protected_folder(folder_id);

  return null;
}

async function unlock(folder_id: string): Promise<void> {
  let unlocked = false;

  await act(async () => {
    unlocked = await hooks[folder_id].unlock_folder("password");
  });
  expect(unlocked).toBe(true);
}

beforeEach(() => {
  hoisted.expires_at = {};
  hoisted.keys = {};
  hoisted.lock_folder_session.mockClear();
  hoisted.purge.mockClear();
  dispatched = [];
  window.addEventListener(FOLDER_LOCKED_EVENT, capture);
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root.render(
      createElement(
        "div",
        null,
        createElement(Harness, { folder_id: FOLDER_A }),
        createElement(Harness, { folder_id: FOLDER_B }),
      ),
    );
  });
});

afterEach(() => {
  act(() => {
    lock_all_folders();
    root.unmount();
  });
  window.removeEventListener(FOLDER_LOCKED_EVENT, capture);
  container.remove();
  vi.useRealTimers();
});

describe("locking one protected folder", () => {
  it("leaves every other unlocked folder open", async () => {
    await unlock(FOLDER_A);
    await unlock(FOLDER_B);

    expect(count_unlocked_folders()).toBe(2);

    let locked = false;

    act(() => {
      locked = lock_folder_by_id(FOLDER_A);
    });

    expect(locked).toBe(true);
    expect(is_folder_unlocked(FOLDER_A)).toBe(false);
    expect(is_folder_unlocked(FOLDER_B)).toBe(true);
    expect(hooks[FOLDER_A].is_unlocked).toBe(false);
    expect(hooks[FOLDER_B].is_unlocked).toBe(true);
    expect(hooks[FOLDER_A].get_folder_key()).toBeNull();
    expect(hooks[FOLDER_B].get_folder_key()).not.toBeNull();
    expect(get_unlock_token(TOKEN_A)).toBeNull();
    expect(get_unlock_token(TOKEN_B)).toBe(`unlock_${FOLDER_B}`);
    expect([...get_unlocked_folder_tokens()]).toEqual([TOKEN_B]);
    expect(dispatched).toEqual([FOLDER_A]);
    expect(list_unlocked_folder_ids()).toEqual([FOLDER_B]);
  });

  it("wipes the in-memory key and revokes only that folder session", async () => {
    await unlock(FOLDER_A);
    await unlock(FOLDER_B);

    const key_a = hoisted.keys[FOLDER_A];

    act(() => {
      lock_folder_by_id(FOLDER_A);
    });

    expect(key_a.every((byte) => byte === 0)).toBe(true);
    expect(hoisted.keys[FOLDER_B].some((byte) => byte !== 0)).toBe(true);
    expect(hoisted.lock_folder_session).toHaveBeenCalledTimes(1);
    expect(hoisted.lock_folder_session).toHaveBeenCalledWith(FOLDER_A, {
      unlock_token: `unlock_${FOLDER_A}`,
      all_sessions: false,
    });
    expect(hoisted.purge).toHaveBeenCalled();
  });

  it("reports nothing to lock for a folder that is already locked", async () => {
    await unlock(FOLDER_B);

    let locked = true;

    act(() => {
      locked = lock_folder_by_id(FOLDER_A);
    });

    expect(locked).toBe(false);
    expect(dispatched).toEqual([]);
    expect(is_folder_unlocked(FOLDER_B)).toBe(true);
  });

  it("unlocks again after a lock without a reload", async () => {
    await unlock(FOLDER_A);
    act(() => {
      lock_folder_by_id(FOLDER_A);
    });
    await unlock(FOLDER_A);

    expect(is_folder_unlocked(FOLDER_A)).toBe(true);
    expect(hooks[FOLDER_A].is_unlocked).toBe(true);
  });

  it("notifies subscribers on unlock and on lock", async () => {
    const listener = vi.fn();
    const unsubscribe = subscribe_folder_unlocks(listener);
    const before = get_folder_unlock_version();

    await unlock(FOLDER_A);
    const after_unlock = get_folder_unlock_version();

    act(() => {
      lock_folder_by_id(FOLDER_A);
    });
    unsubscribe();

    expect(after_unlock).toBeGreaterThan(before);
    expect(get_folder_unlock_version()).toBeGreaterThan(after_unlock);
    expect(listener).toHaveBeenCalled();
  });
});

describe("lock all protected folders", () => {
  it("locks every unlocked folder at once and wipes each key", async () => {
    await unlock(FOLDER_A);
    await unlock(FOLDER_B);

    const key_a = hoisted.keys[FOLDER_A];
    const key_b = hoisted.keys[FOLDER_B];
    let count = 0;

    act(() => {
      count = lock_all_folders();
    });

    expect(count).toBe(2);
    expect(has_unlocked_folders()).toBe(false);
    expect(has_folder_unlock_records()).toBe(false);
    expect(count_unlocked_folders()).toBe(0);
    expect(key_a.every((byte) => byte === 0)).toBe(true);
    expect(key_b.every((byte) => byte === 0)).toBe(true);
    expect(hooks[FOLDER_A].is_unlocked).toBe(false);
    expect(hooks[FOLDER_B].is_unlocked).toBe(false);
    expect([...dispatched].sort()).toEqual([FOLDER_A, FOLDER_B].sort());
    expect(hoisted.lock_folder_session).toHaveBeenCalledTimes(2);
  });

  it("returns zero when nothing is unlocked", () => {
    let count = -1;

    act(() => {
      count = lock_all_folders();
    });

    expect(count).toBe(0);
    expect(dispatched).toEqual([]);
  });
});

describe("lock on leave", () => {
  it("locks only the folder you navigate away from", async () => {
    await unlock(FOLDER_A);
    await unlock(FOLDER_B);

    let locked = false;

    act(() => {
      locked = lock_folder_left_behind(`folder-${TOKEN_A}`, "inbox");
    });

    expect(locked).toBe(true);
    expect(is_folder_unlocked(FOLDER_A)).toBe(false);
    expect(is_folder_unlocked(FOLDER_B)).toBe(true);
  });

  it("locks the previous folder when you move straight to another folder", async () => {
    await unlock(FOLDER_A);
    await unlock(FOLDER_B);

    act(() => {
      lock_folder_left_behind(`folder-${TOKEN_A}`, `folder-${TOKEN_B}`);
    });

    expect(is_folder_unlocked(FOLDER_A)).toBe(false);
    expect(is_folder_unlocked(FOLDER_B)).toBe(true);
  });

  it("does nothing when the view did not change or was not a folder", async () => {
    await unlock(FOLDER_A);

    let same_view = true;
    let from_inbox = true;

    act(() => {
      same_view = lock_folder_left_behind(
        `folder-${TOKEN_A}`,
        `folder-${TOKEN_A}`,
      );
      from_inbox = lock_folder_left_behind("inbox", `folder-${TOKEN_A}`);
    });

    expect(same_view).toBe(false);
    expect(from_inbox).toBe(false);
    expect(is_folder_unlocked(FOLDER_A)).toBe(true);
  });
});

describe("in-memory only", () => {
  it("never writes an unlock token to browser storage", async () => {
    const set_item = vi.spyOn(Storage.prototype, "setItem");

    await unlock(FOLDER_A);
    act(() => {
      lock_folder_by_id(FOLDER_A);
    });

    const written = set_item.mock.calls.map(
      ([key, value]) => `${key}=${value}`,
    );

    set_item.mockRestore();
    expect(written.some((entry) => entry.includes(`unlock_${FOLDER_A}`))).toBe(
      false,
    );
  });
});

describe("unlock expiry", () => {
  it("locks the folder when the server unlock expires, before the idle timer", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
    hoisted.expires_at[FOLDER_A] = new Date(Date.now() + 60_000).toISOString();

    await unlock(FOLDER_A);
    await unlock(FOLDER_B);

    act(() => {
      vi.advanceTimersByTime(60_001);
    });

    expect(is_folder_unlocked(FOLDER_A)).toBe(false);
    expect(hooks[FOLDER_A].is_unlocked).toBe(false);
    expect(dispatched).toEqual([FOLDER_A]);
    expect(is_folder_unlocked(FOLDER_B)).toBe(true);
  });
});
