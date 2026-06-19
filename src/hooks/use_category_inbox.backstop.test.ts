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

const mocks = vi.hoisted(() => ({
  is_build_in_progress: vi.fn(() => true),
  is_build_stalled: vi.fn(() => false),
}));

vi.mock("@/hooks/email_list_helpers", () => ({
  fetch_mail_by_ids: vi.fn(async () => []),
  group_emails_by_thread: (x: unknown) => x,
  DEFAULT_PAGE_SIZE: 50,
}));

vi.mock("@/hooks/use_email_list_actions", () => ({
  use_email_list_actions: () => ({
    toggle_star: vi.fn(),
    toggle_pin: vi.fn(),
    mark_read: vi.fn(),
    delete_email: vi.fn(),
    archive_email: vi.fn(),
    unarchive_email: vi.fn(),
    mark_spam: vi.fn(),
  }),
}));

vi.mock("@/hooks/use_email_list_bulk", () => ({
  use_email_list_bulk: () => ({
    bulk_delete: vi.fn(),
    bulk_archive: vi.fn(),
    bulk_unarchive: vi.fn(),
  }),
}));

vi.mock("@/hooks/mail_events", () => ({
  MAIL_EVENTS: { MAIL_ITEM_UPDATED: "MAIL_ITEM_UPDATED" },
}));

vi.mock("@/components/email/hooks/preload_cache", () => ({
  mark_preload_stale: vi.fn(),
}));

vi.mock("@/services/crypto/memory_key_store", () => ({
  has_passphrase_in_memory: () => true,
  on_keys_ready: () => () => {},
}));

vi.mock("@/contexts/auth_context", () => ({
  use_auth: () => ({ has_keys: true, user: { email: "a@b.c" } }),
}));

vi.mock("@/contexts/preferences_context", () => ({
  use_preferences: () => ({
    preferences: {
      date_format: "iso",
      time_format: "24h",
      conversation_grouping: true,
    },
  }),
}));

vi.mock("@/services/category_index", () => ({
  init_category_index: vi.fn(async () => {}),
  get_page_ids: () => [],
  get_category_total: () => 0,
  is_fully_built: () => false,
  is_build_in_progress: mocks.is_build_in_progress,
  is_build_stalled: mocks.is_build_stalled,
  subscribe: () => () => {},
  get_version: () => 0,
  remove_ids: vi.fn(),
}));

import { use_category_inbox } from "@/hooks/use_category_inbox";

interface SeenState {
  is_loading: boolean;
  has_initial_load: boolean;
}

function render_hook(): { states: SeenState[]; root: Root } {
  const states: SeenState[] = [];

  function Harness() {
    const r = use_category_inbox("primary", 0, true);

    states.push({
      is_loading: r.state.is_loading,
      has_initial_load: r.state.has_initial_load,
    });

    return null;
  }

  const container = document.createElement("div");
  let root!: Root;

  act(() => {
    root = createRoot(container);
    root.render(createElement(Harness));
  });

  return { states, root };
}

describe("use_category_inbox loading backstop", () => {
  beforeEach(() => {
    (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    vi.useFakeTimers();
    mocks.is_build_in_progress.mockReturnValue(true);
    mocks.is_build_stalled.mockReturnValue(false);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("hard 30s backstop clears the skeleton even while a build claims to be in progress", () => {
    const { states, root } = render_hook();

    expect(states.at(-1)!.is_loading).toBe(true);

    // Soft 10s backstop must NOT clear while a healthy build is still running.
    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    expect(states.at(-1)!.is_loading).toBe(true);

    // Hard 30s backstop clears regardless - no infinite skeleton.
    act(() => {
      vi.advanceTimersByTime(20_000);
    });
    expect(states.at(-1)!.is_loading).toBe(false);
    expect(states.at(-1)!.has_initial_load).toBe(true);

    act(() => root.unmount());
  });

  it("soft 10s backstop clears once the build is reported stalled", () => {
    mocks.is_build_stalled.mockReturnValue(true);

    const { states, root } = render_hook();

    expect(states.at(-1)!.is_loading).toBe(true);

    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    expect(states.at(-1)!.is_loading).toBe(false);

    act(() => root.unmount());
  });
});
