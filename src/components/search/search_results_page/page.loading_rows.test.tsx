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
import type { ReactNode } from "react";

import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

const hook = vi.hoisted(() => ({
  value: null as Record<string, unknown> | null,
}));

function Pass({ children }: { children?: ReactNode }) {
  return <>{children}</>;
}

vi.mock("react-router-dom", () => ({
  useLocation: () => ({ pathname: "/search" }),
}));

vi.mock("@aster/ui", () => ({
  IslandIconButton: Pass,
  Tooltip: Pass,
}));

vi.mock("./use_search_results_page", () => ({
  use_search_results_page: () => hook.value,
}));

vi.mock("@/components/inbox/inbox_header", () => ({
  InboxHeader: () => null,
}));

vi.mock("@/components/email/inbox_email_list_item", () => ({
  InboxEmailListItem: (props: { className?: string }) => (
    <div className={props.className} data-testid="result-row" />
  ),
  MailRowSkeletonList: () => <div data-testid="loading-rows" />,
}));

vi.mock("@/components/email/email_context_menu", () => ({
  EmailContextMenuContent: () => null,
}));

vi.mock("@/components/ui/context_menu", () => ({
  ContextMenu: Pass,
  ContextMenuTrigger: Pass,
}));

vi.mock("@/components/ui/dropdown_menu", () => ({
  DropdownMenu: Pass,
  DropdownMenuContent: Pass,
  DropdownMenuItem: Pass,
  DropdownMenuSeparator: Pass,
  DropdownMenuTrigger: Pass,
}));

vi.mock("@/components/ui/select", () => ({
  Select: Pass,
  SelectContent: Pass,
  SelectItem: Pass,
  SelectTrigger: Pass,
  SelectValue: Pass,
}));

vi.mock("@/components/search/search_indexing_notice", () => ({
  SearchEmptyState: () => null,
  SearchIndexingRow: () => null,
  SearchIndexingState: () => null,
  use_search_index_status: () => ({ is_active: false }),
}));

vi.mock("@/components/email/split_email_viewer", () => ({
  SplitEmailViewer: () => null,
}));
vi.mock("@/components/email/full_email_viewer", () => ({
  FullEmailViewer: () => null,
}));
vi.mock("@/components/ui/spinner", () => ({ Spinner: () => null }));
vi.mock("@/components/search/search_result_item", () => ({
  HighlightedText: () => null,
}));
vi.mock("@/components/search/search_chip_row", () => ({
  SearchChipRow: () => null,
}));
vi.mock("@/components/search/correction_notice", () => ({
  CorrectionNotice: () => null,
}));
vi.mock("@/components/search/advanced_filter_modal", () => ({
  AdvancedFilterModal: () => null,
}));
vi.mock("@/hooks/use_search", () => ({
  compute_highlight_ranges: () => [],
  apply_highlights: () => [],
}));
vi.mock("@/components/email/inbox/use_open_reply_compose", () => ({
  use_open_reply_compose: () => () => {},
}));
vi.mock("@/contexts/auth_context", () => ({
  use_auth: () => ({ user: { email: "reader@example.org" } }),
}));
vi.mock("@/hooks/use_tags", () => ({
  use_tags: () => ({
    state: {
      tags: [
        { tag_token: "tag-1", name: "Receipts", color: "#f00" },
        { tag_token: "tag-2", name: "Travel", color: "#0f0" },
      ],
    },
  }),
}));
vi.mock("@/hooks/use_folders", () => ({
  use_folders: () => ({
    state: {
      folders: [{ folder_token: "folder-1", name: "Bills", color: "#00f" }],
    },
  }),
}));
vi.mock("@/hooks/use_folders/tree", () => ({
  order_folders_as_tree: (folders: unknown[]) =>
    folders.map((folder) => ({ folder, depth: 0 })),
}));
vi.mock("@/hooks/tag_tree", () => ({
  order_tags_as_tree: (tags: unknown[]) =>
    tags.map((tag) => ({ tag, depth: 0 })),
}));
vi.mock("@/services/api/snooze", () => ({ snooze_email: vi.fn() }));
vi.mock("@/services/api/mail", () => ({
  bulk_add_folder: vi.fn(),
  bulk_remove_folder: vi.fn(),
}));
vi.mock("@/services/api/tags", () => ({
  bulk_add_tag: vi.fn(),
  bulk_remove_tag: vi.fn(),
}));
vi.mock("@/hooks/email_actions/move_out_of_bin", () => ({
  bin_source_of: () => null,
  move_out_of_bin: vi.fn(),
}));
vi.mock("@/hooks/email_action_types", () => ({ emit_mail_changed: vi.fn() }));
vi.mock("@/hooks/use_mail_stats", () => ({ invalidate_mail_stats: vi.fn() }));
vi.mock("@/hooks/mail_events", async (import_original) => ({
  ...(await import_original<typeof import("@/hooks/mail_events")>()),
  emit_mail_items_removed: vi.fn(),
}));
vi.mock("@/components/email/inbox/category_move", () => ({
  can_move_to_category: () => false,
  move_items_to_category: vi.fn(),
}));
vi.mock("@/utils/open_email_window", () => ({
  open_email_in_new_window: () => true,
}));
vi.mock("@/components/toast/simple_toast", () => ({ show_toast: vi.fn() }));
vi.mock("@/utils/search_query", () => ({
  search_view_for_path: () => "all",
  set_search_scope: (query: string) => query,
}));
vi.mock("@/utils/contact_mail_search", () => ({
  build_sender_mail_query: () => "",
}));
vi.mock("@/utils/search_operators", () => ({
  clear_filter_operators: (query: string) => query,
}));

const { SearchResultsPage } = await import("./page");
const { SEARCH_LOADING_DELAY_MS } = await import("./helpers");

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function row(id: string) {
  return {
    id,
    subject: `Newsletter ${id}`,
    sender_name: "News",
    sender_email: "news@example.com",
    preview: "",
    timestamp: "Jan 1",
    is_read: true,
    is_starred: false,
    is_selected: true,
    item_type: "received",
    tags: [],
    folders: [],
  };
}

function hook_value(
  results: ReturnType<typeof row>[],
  state: Record<string, unknown>,
  is_loading: boolean,
) {
  return {
    t: (key: string) => key,
    preferences: {},
    search_page_size: 25,
    state: { results, is_loading_more: false, ...state },
    dismiss_correction: vi.fn(),
    email_actions: {},
    is_slow: false,
    content_search_enabled: false,
    filters: { sort_by: "relevant" },
    set_filters: vi.fn(),
    advanced_open: false,
    set_advanced_open: vi.fn(),
    selected_ids: new Set(["a", "b"]),
    set_selected_ids: vi.fn(),
    search_page: 0,
    set_search_page: vi.fn(),
    perform_search: vi.fn(),
    apply_flag_patch: vi.fn(),
    search_terms: [],
    filtered_results: results,
    paged_results: results,
    total_search_pages: 1,
    handle_toggle_select: vi.fn(),
    handle_email_click: vi.fn(),
    fetch_as_minimal_emails: vi.fn(),
    handle_select_all_visible: vi.fn(),
    handle_bulk_archive: vi.fn(),
    handle_bulk_delete: vi.fn(),
    handle_bulk_mark_read: vi.fn(),
    handle_bulk_mark_unread: vi.fn(),
    handle_bulk_toggle_star: vi.fn(),
    handle_bulk_spam: vi.fn(),
    handle_bulk_tag_toggle: vi.fn(),
    handle_bulk_folder_toggle: vi.fn(),
    get_tag_status_for_selection: () => "none",
    get_folder_status_for_selection: () => "none",
    handle_select_by_filter: vi.fn(),
    active_filter_count: 0,
    is_loading,
    is_dragging: false,
    pane_width: 400,
    list_panel_ref: { current: null },
    detail_panel_ref: { current: null },
    handle_drag_start: vi.fn(),
    is_fullpage_mode: false,
    selection_all_selected: true,
    selection_some_selected: false,
    search_nav_index: -1,
    search_can_go_prev: false,
    search_can_go_next: false,
    handle_search_navigate_prev: vi.fn(),
    handle_search_navigate_next: vi.fn(),
    handle_search_auto_advance: vi.fn(),
    show_full_email_viewer: false,
  };
}

let root: Root | null = null;
let container: HTMLDivElement | null = null;

function render_page() {
  act(() => {
    root!.render(
      <SearchResultsPage
        on_close={() => {}}
        on_result_click={() => {}}
        query="invoice"
      />,
    );
  });
}

function advance(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

function by_test_id(id: string) {
  return container!.querySelectorAll(`[data-testid='${id}']`);
}

const first_search = { is_searching: true, query: "invoice" };
const refined_search = {
  is_searching: true,
  query: "invoice has:attachment",
  results_query: "invoice",
};

beforeEach(() => {
  vi.useFakeTimers();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
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

describe("search loading rows", () => {
  it("waits before showing loading rows for a first search", () => {
    hook.value = hook_value([], first_search, true);
    render_page();

    expect(by_test_id("loading-rows")).toHaveLength(0);
    advance(SEARCH_LOADING_DELAY_MS - 1);
    expect(by_test_id("loading-rows")).toHaveLength(0);
    advance(1);
    expect(by_test_id("loading-rows")).toHaveLength(1);
  });

  it("never shows loading rows when results arrive in time", () => {
    hook.value = hook_value([], first_search, true);
    render_page();
    advance(SEARCH_LOADING_DELAY_MS / 2);

    hook.value = hook_value(
      [row("a")],
      { is_searching: false, query: "invoice", results_query: "invoice" },
      false,
    );
    render_page();
    advance(SEARCH_LOADING_DELAY_MS);

    expect(by_test_id("loading-rows")).toHaveLength(0);
    expect(by_test_id("result-row")).toHaveLength(1);
  });

  it("keeps stale results visible and dimmed while a refined search runs", () => {
    hook.value = hook_value([row("a"), row("b")], refined_search, true);
    render_page();

    expect(by_test_id("loading-rows")).toHaveLength(0);
    expect(by_test_id("result-row")).toHaveLength(2);
    expect(by_test_id("search-refresh-bar")).toHaveLength(0);

    advance(SEARCH_LOADING_DELAY_MS);

    const rows = Array.from(by_test_id("result-row"));

    expect(by_test_id("loading-rows")).toHaveLength(0);
    expect(by_test_id("search-refresh-bar")).toHaveLength(1);
    expect(rows.every((el) => el.classList.contains("opacity-60"))).toBe(true);
    expect(rows[0].parentElement?.getAttribute("aria-busy")).toBe("true");
  });

  it("clears the dimming once the refined results arrive", () => {
    hook.value = hook_value([row("a")], refined_search, true);
    render_page();
    advance(SEARCH_LOADING_DELAY_MS);

    hook.value = hook_value(
      [row("c")],
      {
        is_searching: false,
        query: refined_search.query,
        results_query: refined_search.query,
      },
      false,
    );
    render_page();

    expect(by_test_id("search-refresh-bar")).toHaveLength(0);
    expect(by_test_id("result-row")[0].classList.contains("opacity-60")).toBe(
      false,
    );
  });
});
