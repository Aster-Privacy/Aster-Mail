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
    include_body: false,
    user_email,
    disk_chunk_ids: [],
    total_indexed: 3,
    complete: true,
    meta: null,
  }),
  build_search_index: async () => {},
  mark_search_index_stale: vi.fn(),
  reset_index_cache: vi.fn(),
  patch_indexed_flags: vi.fn(),
  patch_indexed_membership: vi.fn(),
}));

function make_item(n: number): MailItem {
  return {
    id: `msg-${n}`,
    item_type: "received",
    folder_token: n === 2 ? "archive" : "inbox",
    is_spam: false,
    is_trashed: false,
    is_external: false,
    is_read: true,
    tag_tokens: n === 0 ? ["tag-old"] : [],
    labels: [],
    folders: [],
    created_at: `2026-01-0${n + 1}T00:00:00Z`,
    message_ts: `2026-01-0${n + 1}T00:00:00Z`,
  } as unknown as MailItem;
}

function make_entry(n: number): DecryptedIndexEntry {
  return {
    envelope: {
      subject: `Newsletter ${n}`,
      body_text: "",
      body_html: "",
      from: { name: "News", email: "news@example.com" },
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
    for (let n = 0; n < 3; n++) {
      if (!visit(make_item(n), make_entry(n))) return true;
    }

    return false;
  },
}));

const { use_search } = await import("./use_search_hook");
const { emit_mail_item_updated } = await import("@/hooks/mail_events");

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

function tokens_by_id(): Record<string, string[] | undefined> {
  return Object.fromEntries(
    api!.state.results.map((r) => [r.id, r.tag_tokens]),
  );
}

beforeEach(async () => {
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

describe("use_search label membership", () => {
  it("keeps the labels each result already has", async () => {
    await run_search("newsletter");

    expect(api!.state.results).toHaveLength(3);
    expect(tokens_by_id()).toEqual({
      "msg-0": ["tag-old"],
      "msg-1": [],
      "msg-2": [],
    });
  });

  it("adds and removes a label on several results in place", async () => {
    await run_search("newsletter");

    act(() => {
      api!.apply_membership_patch(["msg-0", "msg-1", "msg-2"], {
        add_tag_tokens: ["tag-new"],
      });
    });

    expect(tokens_by_id()).toEqual({
      "msg-0": ["tag-old", "tag-new"],
      "msg-1": ["tag-new"],
      "msg-2": ["tag-new"],
    });

    act(() => {
      api!.apply_membership_patch(["msg-0", "msg-1", "msg-2"], {
        remove_tag_tokens: ["tag-new"],
      });
    });

    expect(tokens_by_id()).toEqual({
      "msg-0": ["tag-old"],
      "msg-1": [],
      "msg-2": [],
    });
  });

  it("follows label and folder changes made in other views", async () => {
    await run_search("newsletter");

    act(() => {
      emit_mail_item_updated({
        id: "msg-1",
        tags: [{ id: "tag-x", name: "Receipts" }],
        folders: [{ folder_token: "folder-1", name: "Bills" }],
      });
    });

    const row = api!.state.results.find((r) => r.id === "msg-1");

    expect(row?.tag_tokens).toEqual(["tag-x"]);
    expect(row?.folders).toEqual([{ folder_token: "folder-1", name: "Bills" }]);
  });
});
