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
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";

const {
  list_mail_items,
  batched_bulk_add_folder,
  batched_bulk_remove_folder,
  batched_bulk_add_tag,
  batched_bulk_remove_tag,
  show_action_toast,
  show_toast,
} = vi.hoisted(() => ({
  list_mail_items: vi.fn(),
  batched_bulk_add_folder: vi.fn(),
  batched_bulk_remove_folder: vi.fn(),
  batched_bulk_add_tag: vi.fn(),
  batched_bulk_remove_tag: vi.fn(),
  show_action_toast: vi.fn(),
  show_toast: vi.fn(),
}));

vi.mock("@/services/api/mail", () => ({
  list_mail_items,
  batched_bulk_add_folder,
  batched_bulk_remove_folder,
  bulk_action_by_scope: vi.fn(),
}));

vi.mock("@/services/api/tags", () => ({
  batched_bulk_add_tag,
  batched_bulk_remove_tag,
}));

vi.mock("@/components/toast/action_toast", () => ({
  show_action_toast,
  update_progress_toast: vi.fn(),
  hide_action_toast: vi.fn(),
}));

vi.mock("@/components/toast/simple_toast", () => ({ show_toast }));

vi.mock("@/services/category_index", () => ({
  is_index_capped: vi.fn(() => false),
  wait_for_index_ready: vi.fn(),
}));

vi.mock("@/components/email/inbox/category_bulk_actions", () => ({
  run_category_scope_action: vi.fn(),
  supports_category_scope: vi.fn(() => false),
}));

vi.mock("@/services/locked_folders", () => ({
  filter_locked_mail_items: (items: unknown[]) => items,
}));

vi.mock("@/hooks/use_sidebar_aliases", () => ({
  get_alias_hash_by_address: vi.fn(() => null),
}));

import { use_inbox_bulk_actions } from "./use_inbox_bulk_actions";

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const TOTAL = 1_337;

function page_of(offset: number, size: number) {
  const remaining = Math.max(0, TOTAL - offset);
  const count = Math.min(size, remaining);

  return {
    data: {
      items: Array.from({ length: count }, (_, i) => ({
        id: `id-${offset + i}`,
      })),
      has_more: offset + count < TOTAL,
    },
  };
}

function make_params(overrides: Record<string, unknown> = {}) {
  const selection = {
    select_all_mode: true,
    excluded_ids: [] as string[],
    exit_select_all_mode: vi.fn(),
    handle_clear_selection: vi.fn(),
  };

  return {
    selection,
    params: {
      categories: { enabled: false, active_category: "primary" },
      selection,
      toolbar: {
        handle_toolbar_toggle_folder: vi.fn(),
        handle_toolbar_toggle_tag: vi.fn(),
      },
      current_view: "inbox",
      page_size: 50,
      scope_for_view: { item_type: "received" },
      folders_lookup: new Map([["folder-token", { name: "Old" }]]),
      tags_lookup: new Map([["tag-token", { name: "Later" }]]),
      fetch_page: vi.fn(),
      set_current_page: vi.fn(),
      t: (key: string, vars?: Record<string, unknown>) =>
        `${key}:${JSON.stringify(vars ?? {})}`,
      ...overrides,
    },
  };
}

type HookResult = ReturnType<typeof use_inbox_bulk_actions>;

let hook: HookResult;
let container: HTMLDivElement;
let root: Root;

function render_hook(params: unknown): void {
  function Probe() {
    hook = use_inbox_bulk_actions(
      params as Parameters<typeof use_inbox_bulk_actions>[0],
    );

    return null;
  }

  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root.render(createElement(Probe));
  });
}

async function run_pending_select_all(): Promise<void> {
  await act(async () => {
    hook.pending_select_all_action?.();
  });
}

afterEach(() => {
  if (!root) return;
  act(() => root.unmount());
  container.remove();
});

beforeEach(() => {
  vi.clearAllMocks();
  list_mail_items.mockImplementation(({ offset, limit }) =>
    Promise.resolve(page_of(offset, limit)),
  );
  batched_bulk_add_folder.mockResolvedValue({ failed_ids: [] });
  batched_bulk_remove_folder.mockResolvedValue({ failed_ids: [] });
  batched_bulk_add_tag.mockResolvedValue({ failed_ids: [] });
  batched_bulk_remove_tag.mockResolvedValue({ failed_ids: [] });
});

describe("select-all folder and tag actions", () => {
  it("applies the folder to every conversation in scope, not just the loaded page", async () => {
    const { params } = make_params();
    render_hook(params);

    act(() => {
      hook.handle_folder_toggle_wrapped("folder-token", false);
    });
    await run_pending_select_all();

    expect(batched_bulk_add_folder).toHaveBeenCalledTimes(1);

    const [ids, token] = batched_bulk_add_folder.mock.calls[0];

    expect(token).toBe("folder-token");
    expect(ids).toHaveLength(TOTAL);
    expect(new Set(ids).size).toBe(TOTAL);
  });

  it("enumerates ids without asking the server for envelopes", async () => {
    const { params } = make_params();
    render_hook(params);

    act(() => {
      hook.handle_folder_toggle_wrapped("folder-token", false);
    });
    await run_pending_select_all();

    for (const [call] of list_mail_items.mock.calls) {
      expect(call.include_envelope).toBe(false);
      expect(call.group_by_thread).toBe(false);
    }
  });

  it("honors ids the user deselected inside select-all mode", async () => {
    const { params, selection } = make_params();

    selection.excluded_ids = ["id-0", "id-7", "id-900"];
    render_hook(params);

    act(() => {
      hook.handle_folder_toggle_wrapped("folder-token", false);
    });
    await run_pending_select_all();

    const [ids] = batched_bulk_add_folder.mock.calls[0];

    expect(ids).toHaveLength(TOTAL - 3);
    expect(ids).not.toContain("id-0");
    expect(ids).not.toContain("id-7");
    expect(ids).not.toContain("id-900");
  });

  it("reports the true affected count in the toast", async () => {
    const { params } = make_params();
    render_hook(params);

    act(() => {
      hook.handle_folder_toggle_wrapped("folder-token", false);
    });
    await run_pending_select_all();

    const message = show_action_toast.mock.calls.at(-1)?.[0]?.message ?? "";

    expect(message).toContain("conversations_moved_to_folder");
    expect(message).toContain(String(TOTAL));
    expect(message).toContain("Old");
  });

  it("applies tags across the whole scope too", async () => {
    const { params } = make_params();
    render_hook(params);

    act(() => {
      hook.handle_tag_toggle_wrapped("tag-token", false);
    });
    await run_pending_select_all();

    const [ids, token] = batched_bulk_add_tag.mock.calls[0];

    expect(token).toBe("tag-token");
    expect(ids).toHaveLength(TOTAL);
  });

  it("removes a folder across the whole scope", async () => {
    const { params } = make_params();
    render_hook(params);

    act(() => {
      hook.handle_folder_toggle_wrapped("folder-token", true);
    });
    await run_pending_select_all();

    expect(batched_bulk_add_folder).not.toHaveBeenCalled();
    expect(batched_bulk_remove_folder.mock.calls[0][0]).toHaveLength(TOTAL);
  });

  it("leaves the loaded-page path alone when select-all is off", () => {
    const { params, selection } = make_params();

    selection.select_all_mode = false;
    render_hook(params);

    act(() => {
      hook.handle_folder_toggle_wrapped("folder-token", false);
    });

    expect(params.toolbar.handle_toolbar_toggle_folder).toHaveBeenCalledWith(
      "folder-token",
      false,
    );
    expect(list_mail_items).not.toHaveBeenCalled();
    expect(batched_bulk_add_folder).not.toHaveBeenCalled();
  });

  it("surfaces a partial failure instead of claiming success", async () => {
    const { params } = make_params();

    batched_bulk_add_folder.mockResolvedValue({ failed_ids: ["id-1", "id-2"] });
    render_hook(params);

    act(() => {
      hook.handle_folder_toggle_wrapped("folder-token", false);
    });
    await run_pending_select_all();

    expect(show_toast).toHaveBeenCalled();
    expect(show_toast.mock.calls.at(-1)?.[1]).toBe("error");
  });
});
