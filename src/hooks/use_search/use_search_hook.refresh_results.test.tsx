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
import type { DecryptedIndexEntry } from "./types";

import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

const index_state = vi.hoisted(() => ({
  complete: false,
  include_body: false,
  visible: 3,
  spam: 0,
}));

vi.mock("@/contexts/auth_context", () => ({
  use_auth: () => ({ user: { email: "reader@example.org" } }),
}));

vi.mock("@/lib/i18n/context", () => ({
  use_i18n: () => ({ t: (key: string) => key, language: "en" }),
}));

vi.mock("@/contexts/preferences_context", () => ({
  use_preferences: () => ({ preferences: {} }),
}));

vi.mock("@/services/search/spelling", () => ({
  MIN_CORRECTED_RESULTS: 1,
  remember_never_correct_term: vi.fn(),
  suggest_query_correction: () => null,
}));

vi.mock("./index_cache", () => ({
  acquire_search_index: async (user_email: string) => ({
    items: [],
    decrypted: new Map(),
    built_at: Date.now(),
    include_body: index_state.include_body,
    user_email,
    disk_chunk_ids: [],
    total_indexed: index_state.visible + index_state.spam,
    complete: index_state.complete,
    meta: null,
  }),
  build_search_index: async () => {},
  mark_search_index_stale: vi.fn(),
  reset_index_cache: vi.fn(),
}));

function make_item(n: number, is_spam: boolean): MailItem {
  return {
    id: `msg-${n}`,
    item_type: "received",
    folder_token: is_spam ? "spam" : "inbox",
    is_spam,
    is_trashed: false,
    is_external: false,
    is_read: true,
    created_at: `2026-01-0${(n % 9) + 1}T00:00:00Z`,
    message_ts: `2026-01-0${(n % 9) + 1}T00:00:00Z`,
  } as MailItem;
}

function make_entry(n: number): DecryptedIndexEntry {
  return {
    envelope: {
      subject: `Invoice ${n}`,
      body_text: "",
      body_html: "",
      from: { name: "Alice", email: "alice@example.com" },
      to: [],
      cc: [],
      bcc: [],
      sent_at: "2026-01-01T00:00:00Z",
    } as unknown as DecryptedIndexEntry["envelope"],
    metadata: null,
    search_body_text: "",
    meta_fp: "",
    has_body: false,
  };
}

vi.mock("./scan", () => ({
  scan_search_index: async (
    _index: unknown,
    visit: (item: MailItem, entry: DecryptedIndexEntry) => boolean,
  ) => {
    const total = index_state.visible + index_state.spam;

    for (let n = 0; n < total; n++) {
      if (!visit(make_item(n, n >= index_state.visible), make_entry(n))) {
        return true;
      }
    }

    return false;
  },
}));

const { use_search } = await import("./use_search_hook");
const { emit_index_refreshed } = await import("./progress");

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

type SearchApi = ReturnType<typeof use_search>;

let api: SearchApi | null = null;
let root: Root | null = null;
let container: HTMLDivElement | null = null;

function Harness() {
  api = use_search();

  return null;
}

async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

async function run_search(query: string) {
  await act(async () => {
    api!.set_query(query);
    void api!.search(query, { fields: ["all"], search_body: false });
  });
  await settle();
}

async function refresh_index() {
  await act(async () => {
    emit_index_refreshed();
  });
  await settle();
}

beforeEach(async () => {
  index_state.complete = false;
  index_state.include_body = false;
  index_state.visible = 3;
  index_state.spam = 0;
  api = null;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(<Harness />);
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

describe("use_search results across index refreshes", () => {
  it("finds every match once the index has settled", async () => {
    await run_search("invoice");

    expect(api!.state.results).toHaveLength(3);
    expect(api!.state.is_searching).toBe(false);
  });

  it("keeps the results it already found while the index is still growing", async () => {
    await run_search("invoice");

    index_state.visible = 1;
    await refresh_index();

    expect(api!.state.results).toHaveLength(3);
    expect(api!.state.total_results).toBe(3);
    expect(api!.state.is_searching).toBe(false);
  });

  it("drops results that are gone once a complete index is refreshed", async () => {
    index_state.complete = true;
    await run_search("invoice");

    index_state.visible = 1;
    await refresh_index();

    expect(api!.state.results).toHaveLength(1);
    expect(api!.state.total_results).toBe(1);
  });

  it("keeps the spam and trash notice while the index is still growing", async () => {
    index_state.spam = 2;
    await run_search("invoice");

    expect(api!.state.results).toHaveLength(3);
    expect(api!.state.hidden_spam_trash).toBe(2);

    index_state.visible = 1;
    index_state.spam = 0;
    await refresh_index();

    expect(api!.state.results).toHaveLength(3);
    expect(api!.state.hidden_spam_trash).toBe(2);
  });

  it("shows the spam and trash notice once the mailbox is scanned", async () => {
    index_state.complete = true;
    index_state.spam = 2;
    await run_search("invoice");

    expect(api!.state.hidden_spam_trash).toBe(2);
  });
});
