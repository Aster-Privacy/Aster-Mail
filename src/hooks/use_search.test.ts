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
import { describe, it, expect, beforeEach, vi } from "vitest";

import {
  matches_query,
  get_search_history,
  add_to_history,
  remove_from_history,
  get_saved_searches,
  save_search_to_storage,
  delete_saved_search_from_storage,
  update_saved_search_usage,
  clear_search_data,
} from "@/hooks/use_search";
import { parse_search_query } from "@/utils/search_operators";
import type { DecryptedEnvelope, MailItemMetadata } from "@/types/email";
import type { MailItem } from "@/services/api/mail";

function make_envelope(overrides: Partial<DecryptedEnvelope> = {}): DecryptedEnvelope {
  return {
    subject: "Project sync notes",
    body_text: "Quarterly revenue increased by twenty percent last month",
    body_html: "",
    from: { name: "Alice", email: "alice@example.com" },
    to: [{ name: "Bob", email: "bob@example.com" }],
    cc: [],
    bcc: [],
    sent_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function make_item(): MailItem {
  return {
    id: "msg-1",
    item_type: "received",
    encrypted_envelope: "",
    envelope_nonce: "",
    folder_token: "inbox",
    is_external: false,
    created_at: "2026-01-01T00:00:00Z",
    message_ts: "2026-01-01T00:00:00Z",
    is_trashed: false,
    is_spam: false,
  } as MailItem;
}

function make_metadata(): MailItemMetadata {
  return {
    is_read: false,
    is_starred: false,
    is_pinned: false,
    is_trashed: false,
    is_archived: false,
    is_spam: false,
    size_bytes: 1024,
    has_attachments: false,
    attachment_count: 0,
    message_ts: "2026-01-01T00:00:00Z",
    item_type: "received",
  };
}

function run(query: string, envelope: DecryptedEnvelope, search_body: boolean): boolean {
  const parsed = parse_search_query(query);
  const terms = parsed.text_query
    .split(/\s+/)
    .filter((t) => t.length >= 2)
    .map((t) => t.toLowerCase());

  return matches_query(
    terms,
    parsed.operators,
    envelope,
    make_metadata(),
    make_item(),
    undefined,
    undefined,
    search_body,
  );
}

describe("matches_query - encrypted content search toggle", () => {
  it("matches subject regardless of search_body flag", () => {
    const env = make_envelope({ subject: "Hello world" });

    expect(run("hello", env, false)).toBe(true);
    expect(run("hello", env, true)).toBe(true);
  });

  it("matches sender name and email regardless of search_body flag", () => {
    const env = make_envelope();

    expect(run("alice", env, false)).toBe(true);
    expect(run("alice", env, true)).toBe(true);
    expect(run("alice@example.com", env, false)).toBe(true);
  });

  it("matches body text ONLY when search_body is true", () => {
    const env = make_envelope({
      subject: "Status update",
      body_text: "Quarterly revenue increased by twenty percent",
    });

    expect(run("quarterly", env, true)).toBe(true);
    expect(run("revenue", env, true)).toBe(true);

    expect(run("quarterly", env, false)).toBe(false);
    expect(run("revenue", env, false)).toBe(false);
  });

  it("ignores empty body_text when search_body is true (real-world: index built without body)", () => {
    const env = make_envelope({ body_text: "" });

    expect(run("revenue", env, true)).toBe(false);
    expect(run("revenue", env, false)).toBe(false);
  });

  it("still matches the from: operator with body disabled", () => {
    const env = make_envelope();

    expect(run("from:alice@example.com", env, false)).toBe(true);
  });

  it("still matches subject when explicit body-only term would not match with body off", () => {
    const env = make_envelope({
      subject: "Quarterly results",
      body_text: "Revenue increased",
    });

    expect(run("quarterly", env, false)).toBe(true);
    expect(run("revenue", env, false)).toBe(false);
  });
});

describe("search history persistence", () => {
  const user = "user-1";

  beforeEach(() => {
    localStorage.clear();
  });

  it("returns empty history for a fresh user", async () => {
    expect(await get_search_history(user)).toEqual([]);
  });

  it("adds entries newest-first and returns them", async () => {
    await add_to_history(user, "first", 3);
    const updated = await add_to_history(user, "second", 5);

    expect(updated.map((e) => e.query)).toEqual(["second", "first"]);
    expect(updated[0].result_count).toBe(5);
  });

  it("dedupes the same query case-insensitively and moves it to the top", async () => {
    await add_to_history(user, "alpha", 1);
    await add_to_history(user, "beta", 1);
    const updated = await add_to_history(user, "ALPHA", 9);

    expect(updated.map((e) => e.query)).toEqual(["ALPHA", "beta"]);
    expect(updated).toHaveLength(2);
  });

  it("ignores blank queries", async () => {
    const updated = await add_to_history(user, "   ", 0);

    expect(updated).toEqual([]);
  });

  it("caps history at 20 entries", async () => {
    for (let i = 0; i < 25; i++) {
      await add_to_history(user, `q-${i}`, 0);
    }

    expect(await get_search_history(user)).toHaveLength(20);
  });

  it("removes a single entry by id", async () => {
    await add_to_history(user, "keep", 0);
    const after_add = await add_to_history(user, "drop", 0);
    const drop_id = after_add.find((e) => e.query === "drop")!.id;
    const updated = await remove_from_history(user, drop_id);

    expect(updated.map((e) => e.query)).toEqual(["keep"]);
  });

  it("keeps history isolated per user", async () => {
    await add_to_history(user, "mine", 0);

    expect(await get_search_history("other-user")).toEqual([]);
  });
});

describe("saved searches persistence", () => {
  const user = "user-1";

  beforeEach(() => {
    localStorage.clear();
  });

  it("saves and retrieves a search", async () => {
    const result = await save_search_to_storage(user, "Unread", "is:unread");

    expect(result.success).toBe(true);
    expect(result.search?.name).toBe("Unread");

    const all = await get_saved_searches(user);

    expect(all).toHaveLength(1);
    expect(all[0].query).toBe("is:unread");
  });

  it("rejects blank name or query", async () => {
    expect((await save_search_to_storage(user, "", "is:unread")).success).toBe(
      false,
    );
    expect((await save_search_to_storage(user, "Name", "  ")).success).toBe(
      false,
    );
  });

  it("deletes a saved search by id", async () => {
    const a = await save_search_to_storage(user, "A", "from:a");
    await save_search_to_storage(user, "B", "from:b");
    const updated = await delete_saved_search_from_storage(
      user,
      a.search!.id,
    );

    expect(updated.map((s) => s.name)).toEqual(["B"]);
  });

  it("orders by last used after updating usage", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    const first = await save_search_to_storage(user, "First", "from:a");

    vi.setSystemTime(new Date("2026-01-01T00:01:00Z"));
    await save_search_to_storage(user, "Second", "from:b");

    vi.setSystemTime(new Date("2026-01-01T00:02:00Z"));
    await update_saved_search_usage(user, first.search!.id);

    const all = await get_saved_searches(user);

    expect(all[0].name).toBe("First");
    vi.useRealTimers();
  });

  it("clears history and saved searches independently", async () => {
    await add_to_history(user, "q", 0);
    await save_search_to_storage(user, "S", "from:a");

    await clear_search_data(user, {
      clear_history: true,
      clear_saved_searches: false,
      clear_cache: false,
    });

    expect(await get_search_history(user)).toEqual([]);
    expect(await get_saved_searches(user)).toHaveLength(1);
  });
});
