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

const { fetch_mock } = vi.hoisted(() => ({ fetch_mock: vi.fn() }));

vi.mock("./email_list_helpers", async (original) => ({
  ...(await original<typeof import("./email_list_helpers")>()),
  fetch_mail_from_api: fetch_mock,
}));

vi.mock("@/services/crypto/memory_key_store", async (import_original) => ({
  ...(await import_original<
    typeof import("@/services/crypto/memory_key_store")
  >()),
  has_passphrase_in_memory: () => true,
}));

const { view_cache } = await import("./email_list_cache");
const {
  cancel_view_prefetch,
  is_list_view_ready,
  is_prefetchable_list_view,
  prefetch_view,
  prefetch_views_when_idle,
  set_view_prefetch_context,
} = await import("./view_prefetch");

const context = {
  owner: "user-1",
  user_email: "demo@example.com",
  format_options: { date_format: "MM/DD/YYYY", time_format: "12h" } as never,
  conversation_grouping: true,
  sort_order: "newest_first" as const,
  page_size: 50,
};

const row = (id: string) => ({ id }) as never;

describe("view_prefetch", () => {
  beforeEach(() => {
    view_cache.clear();
    fetch_mock.mockReset();
    set_view_prefetch_context(null);
  });

  it("only gates mail list views", () => {
    expect(is_prefetchable_list_view("sent")).toBe(true);
    expect(is_prefetchable_list_view("folder-abc")).toBe(true);
    expect(is_prefetchable_list_view("tag-abc")).toBe(true);
    expect(is_prefetchable_list_view("drafts")).toBe(false);
    expect(is_prefetchable_list_view("contacts")).toBe(false);
    expect(is_list_view_ready("contacts")).toBe(true);
  });

  it("fills the view cache with a settled first page", async () => {
    set_view_prefetch_context(context);
    fetch_mock.mockResolvedValue({
      emails: [row("a"), row("b")],
      total: 2,
      has_more: false,
      raw_consumed: 2,
    });

    expect(is_list_view_ready("sent")).toBe(false);
    await expect(prefetch_view("sent")).resolves.toBe(true);

    const entry = view_cache.get("sent");

    expect(entry?.state.has_initial_load).toBe(true);
    expect(entry?.state.is_loading).toBe(false);
    expect(entry?.state.emails.map((e) => e.id)).toEqual(["a", "b"]);
    expect(entry?.page_offsets).toEqual([[1, 2]]);
    expect(is_list_view_ready("sent")).toBe(true);
  });

  it("shares one request per view", async () => {
    set_view_prefetch_context(context);
    fetch_mock.mockResolvedValue({
      emails: [],
      total: 0,
      has_more: false,
      raw_consumed: 0,
    });

    await Promise.all([prefetch_view("trash"), prefetch_view("trash")]);
    expect(fetch_mock).toHaveBeenCalledTimes(1);
  });

  it("drops results that finish after the account changes", async () => {
    set_view_prefetch_context(context);
    let finish: (value: unknown) => void = () => {};

    fetch_mock.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );

    const pending = prefetch_view("archive");

    set_view_prefetch_context({ ...context, owner: "user-2" });
    finish({ emails: [row("x")], total: 1, has_more: false, raw_consumed: 1 });

    await expect(pending).resolves.toBe(false);
    expect(view_cache.has("archive")).toBe(false);
  });

  it("does nothing without a signed in context", async () => {
    await expect(prefetch_view("spam")).resolves.toBe(false);
    expect(fetch_mock).not.toHaveBeenCalled();
  });

  it("prefetches queued views one at a time and skips the open view", async () => {
    set_view_prefetch_context(context);
    fetch_mock.mockResolvedValue({
      emails: [],
      total: 0,
      has_more: false,
      raw_consumed: 0,
    });
    const scheduled: (() => void)[] = [];
    const schedule = (callback: () => void) => {
      scheduled.push(callback);

      return () => {};
    };

    prefetch_views_when_idle(["sent", "starred", "archive"], "starred", schedule);
    expect(scheduled).toHaveLength(1);

    scheduled[0]();
    await vi.waitFor(() => expect(scheduled).toHaveLength(2));
    scheduled[1]();
    await vi.waitFor(() => expect(view_cache.has("archive")).toBe(true));

    expect(fetch_mock.mock.calls.map((call) => call[0])).toEqual([
      "sent",
      "archive",
    ]);
    cancel_view_prefetch();
  });
});
