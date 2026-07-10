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
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createElement, act } from "react";
import { createRoot, type Root } from "react-dom/client";

const snooze_api = vi.hoisted(() => ({
  snooze_email: vi.fn(
    async (): Promise<{ data?: unknown; error?: string }> => ({ data: {} }),
  ),
  bulk_snooze_emails: vi.fn(
    async (): Promise<{
      data?: { snoozed_count: number; failed_count: number };
      error?: string;
    }> => ({ data: { snoozed_count: 2, failed_count: 0 } }),
  ),
  unsnooze_email: vi.fn(
    async (): Promise<{ error?: string }> => ({}),
  ),
  unsnooze_by_mail_item: vi.fn(
    async (): Promise<{ error?: string }> => ({}),
  ),
  list_snoozed_emails: vi.fn(
    async (): Promise<{ data?: unknown[]; error?: string }> => ({ data: [] }),
  ),
}));

const index_mock = vi.hoisted(() => ({
  remove_ids: vi.fn(),
  reindex_ids: vi.fn(),
}));

vi.mock("@/services/api/snooze", () => snooze_api);

vi.mock("@/hooks/mail_events", () => ({
  emit_snoozed_changed: vi.fn(),
}));

vi.mock("@/lib/i18n/context", () => ({
  use_i18n: () => ({ t: (key: string) => key }),
}));

vi.mock("@/services/category_index", () => index_mock);

import { use_snooze } from "@/hooks/use_snooze";

type HookResult = ReturnType<typeof use_snooze>;

let hook: HookResult;

function Probe() {
  hook = use_snooze();

  return null;
}

let container: HTMLDivElement;
let root: Root;

describe("use_snooze category index sync", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => {
      root.render(createElement(Probe));
    });
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("removes the snoozed id from the category index on single snooze", async () => {
    await act(async () => {
      await hook.snooze("m1", new Date(Date.now() + 3600_000));
    });

    expect(index_mock.remove_ids).toHaveBeenCalledWith(["m1"]);
  });

  it("removes all snoozed ids from the category index on bulk snooze", async () => {
    await act(async () => {
      await hook.bulk_snooze(["m1", "m2"], new Date(Date.now() + 3600_000));
    });

    expect(index_mock.remove_ids).toHaveBeenCalledWith(["m1", "m2"]);
  });

  it("does not touch the index when the snooze call fails", async () => {
    snooze_api.snooze_email.mockResolvedValueOnce({ error: "boom" });

    await act(async () => {
      await expect(
        hook.snooze("m1", new Date(Date.now() + 3600_000)),
      ).rejects.toThrow();
    });

    expect(index_mock.remove_ids).not.toHaveBeenCalled();
  });

  it("reindexes the id after a successful unsnooze by mail item", async () => {
    await act(async () => {
      await hook.unsnooze_mail("m3");
    });

    expect(index_mock.reindex_ids).toHaveBeenCalledWith(["m3"]);
  });

  it("does not reindex when the unsnooze call fails", async () => {
    snooze_api.unsnooze_by_mail_item.mockResolvedValueOnce({ error: "boom" });

    await act(async () => {
      await expect(hook.unsnooze_mail("m3")).rejects.toThrow();
    });

    expect(index_mock.reindex_ids).not.toHaveBeenCalled();
  });
});
