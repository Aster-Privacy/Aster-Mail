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

import type { MailItem } from "@/services/api/mail";

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const USER_ID = "11111111-2222-3333-4444-555555555555";
const MAILBOX_SIZE = 3_122;
const IDLE_MS = 60_000;

const mock_list_mail_items = vi.fn();

vi.mock("@/services/api/mail", () => ({
  list_mail_items: (...args: unknown[]) => mock_list_mail_items(...args),
  rethread_items: async () => ({
    data: { success: true, updated: 0, skipped: 0 },
  }),
}));

vi.mock("@/services/api/client", () => ({
  api_client: { get_cached_user_info: () => ({ user_id: USER_ID }) },
}));

vi.mock("@/components/email/shared/decrypt_envelope", () => ({
  decrypt_mail_envelope: async () => ({ subject: "Hello" }),
}));

vi.mock("@/services/crypto/memory_key_store", () => ({
  get_passphrase_bytes: () => new Uint8Array([1, 2, 3]),
  get_vault_from_memory: () => ({ identity_key: "test-key" }),
}));

vi.mock("@/services/crypto/secure_memory", () => ({
  zero_uint8_array: () => {},
}));

const mailbox: MailItem[] = Array.from({ length: MAILBOX_SIZE }, (_, i) => ({
  id: `m${i}`,
  item_type: "received",
  encrypted_envelope: "",
  envelope_nonce: "",
  folder_token: "inbox",
  is_external: false,
  created_at: "2026-01-01T00:00:00Z",
}));

function serve_mailbox(): void {
  mock_list_mail_items.mockImplementation(
    async (params: { limit?: number; cursor?: string }) => {
      const start = params.cursor ? Number(params.cursor) : 0;
      const limit = params.limit ?? 100;
      const items = mailbox.slice(start, start + limit);
      const next = start + items.length;
      const has_more = next < mailbox.length;

      return {
        data: {
          items,
          has_more,
          next_cursor: has_more ? String(next) : null,
        },
      };
    },
  );
}

function set_visibility(state: "visible" | "hidden"): void {
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    get: () => state,
  });
  document.dispatchEvent(new Event("visibilitychange"));
}

async function load_page() {
  vi.resetModules();

  return import("@/services/import/repair_threads");
}

async function idle(ms: number): Promise<void> {
  await vi.advanceTimersByTimeAsync(ms);
}

describe("idle inbox load background walks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-26T12:00:00Z"));
    vi.spyOn(Math, "random").mockReturnValue(0);
    set_visibility("visible");
    serve_mailbox();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    set_visibility("visible");
  });

  it("paces the one-time relink walk instead of fetching the mailbox at once", async () => {
    const page = await load_page();

    page.schedule_thread_repair(() => {});
    await idle(page.AUTO_FIRST_DELAY_MS + IDLE_MS);

    const pages_in_idle = mock_list_mail_items.mock.calls.length;
    const total_pages = Math.ceil(MAILBOX_SIZE / 100);

    expect(pages_in_idle).toBeGreaterThan(0);
    expect(pages_in_idle).toBeLessThanOrEqual(Math.ceil(IDLE_MS / 3_000) + 1);
    expect(pages_in_idle).toBeLessThan(total_pages);

    await idle(total_pages * 10_000);

    expect(mock_list_mail_items).toHaveBeenCalledTimes(total_pages);
    expect(page.has_completed_auto_repair(USER_ID)).toBe(true);

    page.schedule_thread_repair(() => {});
    await idle(IDLE_MS * 10);

    expect(mock_list_mail_items).toHaveBeenCalledTimes(total_pages);
    page.cancel_thread_repair();
  });

  it("makes no walk requests on a later load once the markers are set", async () => {
    const first = await load_page();

    first.schedule_thread_repair(() => {});
    await idle(IDLE_MS * 100);
    expect(first.has_completed_auto_repair(USER_ID)).toBe(true);
    mock_list_mail_items.mockClear();

    const second = await load_page();

    second.schedule_thread_repair(() => {});
    await idle(IDLE_MS);

    expect(mock_list_mail_items).not.toHaveBeenCalled();
    second.cancel_thread_repair();
  });

  it("pauses the walk while the tab is hidden", async () => {
    const page = await load_page();

    page.schedule_thread_repair(() => {});
    await idle(page.AUTO_FIRST_DELAY_MS + 1);
    set_visibility("hidden");

    const before = mock_list_mail_items.mock.calls.length;

    await idle(IDLE_MS * 5);

    expect(mock_list_mail_items.mock.calls.length).toBeLessThanOrEqual(
      before + 1,
    );

    set_visibility("visible");
    await idle(IDLE_MS * 100);

    expect(page.has_completed_auto_repair(USER_ID)).toBe(true);
    page.cancel_thread_repair();
  });

  it("leaves the walk to the tab that holds the lock", async () => {
    const held = new Set<string>(["aster_walk:thread_relink"]);
    const locks = {
      request: async (
        name: string,
        _options: { ifAvailable: boolean },
        callback: (lock: unknown) => Promise<unknown>,
      ) => callback(held.has(name) ? null : { name }),
    };

    Object.defineProperty(navigator, "locks", {
      configurable: true,
      value: locks,
    });

    try {
      const page = await load_page();

      page.schedule_thread_repair(() => {});
      await idle(IDLE_MS);

      expect(mock_list_mail_items).not.toHaveBeenCalled();
      page.cancel_thread_repair();
    } finally {
      delete (navigator as { locks?: unknown }).locks;
    }
  });
});
