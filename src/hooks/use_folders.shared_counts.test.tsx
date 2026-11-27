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

const hoisted = vi.hoisted(() => ({
  get_folder_counts: vi.fn(async () => ({
    data: { counts: [] },
    error: null,
  })),
  list_folders: vi.fn(async () => ({
    data: { folders: [], total: 0 },
    error: null,
  })),
}));

vi.mock("@/services/api/folders", () => ({
  list_folders: () => hoisted.list_folders(),
  list_all_folders: () => hoisted.list_folders(),
  create_folder: vi.fn(),
  update_folder: vi.fn(),
  delete_folder: vi.fn(),
  get_folder_counts: () => hoisted.get_folder_counts(),
}));

vi.mock("@/services/api/mail", () => ({
  add_mail_item_folder: vi.fn(),
  remove_mail_item_folder: vi.fn(),
}));

vi.mock("@/services/crypto/memory_key_store", () => ({
  get_vault_from_memory: () => ({ identity_key: "key" }),
  has_passphrase_in_memory: () => true,
  on_keys_ready: (callback: () => void) => {
    callback();

    return () => {};
  },
}));

vi.mock("@/services/crypto/legacy_keks", () => {
  const decrypt_aes_gcm_with_fallback = vi.fn();

  return {
    decrypt_aes_gcm_with_fallback,
    decrypt_account_context_with_fallback: (
      _context: string,
      ...rest: unknown[]
    ) =>
      (decrypt_aes_gcm_with_fallback as (...args: unknown[]) => unknown)(
        ...rest,
      ),
  };
});

vi.mock("@/contexts/auth_context", () => ({
  use_auth_safe: () => ({ user: { id: "u1" } }),
}));

vi.mock("@/lib/i18n/context", () => {
  const stable_t = (k: string) => k;
  const i18n = { t: stable_t };

  return {
    use_i18n: () => i18n,
  };
});

import { use_folders } from "./use_folders";
import { same_folder_counts } from "./use_folders/hook";
import { MAIL_EVENTS } from "./mail_events";

let renders = 0;

function Harness() {
  use_folders();
  renders += 1;

  return null;
}

let root: Root | null = null;
let container: HTMLDivElement | null = null;

describe("use_folders shared count refresh", () => {
  beforeEach(async () => {
    vi.useFakeTimers();
    hoisted.get_folder_counts.mockClear();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root!.render(
        createElement("div", null, [
          createElement(Harness, { key: "a" }),
          createElement(Harness, { key: "b" }),
          createElement(Harness, { key: "c" }),
        ]),
      );
      await vi.advanceTimersByTimeAsync(10);
    });

    hoisted.get_folder_counts.mockClear();
  });

  afterEach(() => {
    act(() => {
      root?.unmount();
    });
    container?.remove();
    root = null;
    container = null;
    vi.useRealTimers();
  });

  it("sends one count request for every mounted instance", async () => {
    await act(async () => {
      window.dispatchEvent(
        new CustomEvent(MAIL_EVENTS.MAIL_ITEM_UPDATED, {
          detail: { id: "m1", is_read: true },
        }),
      );
      await vi.advanceTimersByTimeAsync(600);
    });

    expect(hoisted.get_folder_counts).toHaveBeenCalledTimes(1);
  });

  it("skips a rerender when the counts did not change", async () => {
    await act(async () => {
      window.dispatchEvent(new CustomEvent(MAIL_EVENTS.MAIL_STATS_STALE));
      await vi.advanceTimersByTimeAsync(600);
    });

    renders = 0;

    await act(async () => {
      window.dispatchEvent(new CustomEvent(MAIL_EVENTS.MAIL_STATS_STALE));
      await vi.advanceTimersByTimeAsync(600);
    });

    expect(hoisted.get_folder_counts).toHaveBeenCalledTimes(2);
    expect(renders).toBe(0);
  });
});

describe("same_folder_counts", () => {
  it("compares counts by value", () => {
    expect(same_folder_counts({ a: 1, b: 2 }, { b: 2, a: 1 })).toBe(true);
    expect(same_folder_counts({ a: 1 }, { a: 2 })).toBe(false);
    expect(same_folder_counts({ a: 1 }, { a: 1, b: 0 })).toBe(false);
    expect(same_folder_counts({}, {})).toBe(true);
  });
});
