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

const captured = vi.hoisted(() => ({
  header: null as Record<string, unknown> | null,
  menu: null as Record<string, unknown> | null,
  row_menu: new Map<string, () => void>(),
}));

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
  InboxHeader: (props: Record<string, unknown>) => {
    captured.header = props;

    return null;
  },
}));

vi.mock("@/components/email/inbox_email_list_item", () => ({
  InboxEmailListItem: (props: {
    email: { id: string };
    onContextMenu: () => void;
  }) => {
    captured.row_menu.set(props.email.id, props.onContextMenu);

    return null;
  },
}));

vi.mock("@/components/email/email_context_menu", () => ({
  EmailContextMenuContent: (props: Record<string, unknown>) => {
    captured.menu = props;

    return null;
  },
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

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const bulk_delete = vi.fn(async () => true);
const delete_emails = vi.fn(async () => {});
const handle_bulk_delete = vi.fn();
const apply_flag_patch = vi.fn();

const trashed_row = {
  id: "t1",
  subject: "Order shipped",
  sender_name: "Shop",
  sender_email: "shop@example.com",
  preview: "",
  timestamp: "Jan 1",
  is_read: true,
  is_starred: false,
  is_selected: false,
  is_trashed: true,
  item_type: "received",
  tags: [],
  folders: [],
};

function hook_value() {
  const results = [trashed_row];

  return {
    t: (key: string) => key,
    preferences: {},
    search_page_size: 25,
    state: { results, is_loading_more: false },
    dismiss_correction: vi.fn(),
    email_actions: { bulk_delete },
    is_slow: false,
    content_search_enabled: false,
    filters: { sort_by: "relevant" },
    set_filters: vi.fn(),
    advanced_open: false,
    set_advanced_open: vi.fn(),
    selected_ids: new Set<string>(),
    set_selected_ids: vi.fn(),
    search_page: 0,
    set_search_page: vi.fn(),
    perform_search: vi.fn(),
    apply_flag_patch,
    search_terms: [],
    filtered_results: results,
    paged_results: results,
    total_search_pages: 1,
    handle_toggle_select: vi.fn(),
    handle_email_click: vi.fn(),
    fetch_as_minimal_emails: vi.fn(async () => ({
      emails: [trashed_row],
      failed: false,
    })),
    handle_select_all_visible: vi.fn(),
    handle_bulk_archive: vi.fn(),
    handle_bulk_delete,
    delete_emails,
    search_delete_dialog: null,
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
    is_loading: false,
    is_dragging: false,
    pane_width: 400,
    list_panel_ref: { current: null },
    detail_panel_ref: { current: null },
    handle_drag_start: vi.fn(),
    is_fullpage_mode: false,
    selection_all_selected: false,
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

beforeEach(async () => {
  captured.header = null;
  captured.menu = null;
  captured.row_menu.clear();
  vi.clearAllMocks();
  hook.value = hook_value();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(
      <SearchResultsPage
        query="order in:trash"
        on_close={() => {}}
        on_result_click={() => {}}
      />,
    );
  });
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  container?.remove();
  root = null;
  container = null;
});

describe("deleting a trashed search result from the context menu", () => {
  it("hands the row to the search delete flow instead of trashing it again", async () => {
    await act(async () => {
      captured.row_menu.get("t1")!();
    });

    await act(async () => {
      (captured.menu!.on_delete as () => void)();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(bulk_delete).not.toHaveBeenCalled();
    expect(apply_flag_patch).not.toHaveBeenCalled();
    expect(delete_emails).toHaveBeenCalledWith([trashed_row]);
  });
});
