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
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const get = vi.fn();
let expected_user_id: string | null = "user-a";
let cached_preferences: Record<string, unknown> | null = null;

vi.mock("@/services/api/client", () => ({
  api_client: {
    get: (...args: unknown[]) => get(...args),
    get_expected_user_id: () => expected_user_id,
    post: vi.fn(),
    delete: vi.fn(),
    put: vi.fn(),
  },
}));

vi.mock("@/services/api/preferences", () => ({
  get_cached_preferences: () => cached_preferences,
}));

const {
  list_mail_items,
  clear_prefetched_mail_lists,
  MAIL_LIST_PREFETCH_TTL_MS,
} = await import("@/services/api/mail");
const { build_list_page_params, build_view_list_params } =
  await import("@/hooks/email_list_helpers/views");
const { start_startup_list_prefetch, startup_view_for_path } =
  await import("./startup_list_prefetch");

function first_page_params(view: string) {
  return build_list_page_params(view, build_view_list_params(view), {
    limit: 50,
    offset: 0,
    conversation_grouping: true,
    sort_order: "newest_first",
  });
}

function delayed_list(ms: number, items: unknown[] = [{ id: "m1" }]) {
  return () =>
    new Promise((resolve) =>
      setTimeout(() => resolve({ data: { items, has_more: false } }), ms),
    );
}

beforeEach(() => {
  get.mockReset();
  expected_user_id = "user-a";
  cached_preferences = null;
  clear_prefetched_mail_lists();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("startup list prefetch", () => {
  it("maps routes to list views", () => {
    expect(startup_view_for_path("/")).toBe("inbox");
    expect(startup_view_for_path("/sent")).toBe("sent");
    expect(startup_view_for_path("/folder/a%2Bb")).toBe("folder-a+b");
    expect(startup_view_for_path("/tag/t1")).toBe("tag-t1");
    expect(startup_view_for_path("/folder/a/b")).toBeNull();
    expect(startup_view_for_path("/settings")).toBeNull();
    expect(startup_view_for_path("/drafts")).toBeNull();
  });

  it("leaves the category inbox to its own loader", () => {
    expect(start_startup_list_prefetch("user-a", "/")).toBe(false);
    expect(get).not.toHaveBeenCalled();
  });

  it("starts the list request at once, before keys are ready", async () => {
    vi.useFakeTimers();
    get.mockImplementation(delayed_list(400));

    expect(start_startup_list_prefetch("user-a", "/sent")).toBe(true);
    expect(get).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(300);

    const listed = list_mail_items(first_page_params("sent"));

    await vi.advanceTimersByTimeAsync(100);

    const response = await listed;

    expect(response.data?.items).toHaveLength(1);
    expect(get).toHaveBeenCalledTimes(1);
  });

  it("serves one list fetch per load", async () => {
    get.mockImplementation(delayed_list(5));
    start_startup_list_prefetch("user-a", "/archive");
    start_startup_list_prefetch("user-a", "/archive");

    await list_mail_items(first_page_params("archive"));
    expect(get).toHaveBeenCalledTimes(1);

    await list_mail_items(first_page_params("archive"));
    expect(get).toHaveBeenCalledTimes(2);
  });

  it("never hands one account's prefetch to another", async () => {
    get.mockImplementation(delayed_list(5, [{ id: "a-mail" }]));
    start_startup_list_prefetch("user-a", "/sent");

    expected_user_id = "user-b";
    get.mockImplementation(delayed_list(5, [{ id: "b-mail" }]));

    const response = await list_mail_items(first_page_params("sent"));

    expect(get).toHaveBeenCalledTimes(2);
    expect(response.data?.items).toEqual([{ id: "b-mail" }]);
  });

  it("refetches when the prefetch failed", async () => {
    get.mockResolvedValueOnce({ error: "offline" });
    start_startup_list_prefetch("user-a", "/sent");
    get.mockImplementation(delayed_list(1));

    const response = await list_mail_items(first_page_params("sent"));

    expect(get).toHaveBeenCalledTimes(2);
    expect(response.data?.items).toHaveLength(1);
  });

  it("drops a prefetch that has gone stale", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    get.mockImplementation(delayed_list(0));
    start_startup_list_prefetch("user-a", "/sent");

    vi.setSystemTime(Date.now() + MAIL_LIST_PREFETCH_TTL_MS + 1);

    await list_mail_items(first_page_params("sent"));

    expect(get).toHaveBeenCalledTimes(2);
  });

  it("prefetches the inbox when categories are off", () => {
    cached_preferences = { inbox_categories_enabled: false };
    get.mockImplementation(delayed_list(1));

    expect(start_startup_list_prefetch("user-a", "/")).toBe(true);
    expect(get).toHaveBeenCalledTimes(1);
  });
});
