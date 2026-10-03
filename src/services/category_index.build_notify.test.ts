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
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/services/crypto/secure_storage", () => ({
  secure_encrypt: async (s: string) => s,
  secure_decrypt: async (s: string) => s,
}));

vi.mock("@/services/crypto/memory_key_store", () => ({
  has_vault_in_memory: () => true,
  on_vault_cleared: () => {},
}));

vi.mock("@/services/account_manager", () => ({
  get_current_account_id: async () => "acct1",
  accounts_storage_unreadable: () => false,
}));

vi.mock("@/services/api/mail", () => ({
  list_mail_items: vi.fn(),
}));

vi.mock("@/services/crypto/mail_metadata", () => ({
  decrypt_mail_metadata: vi.fn(async () => null),
  update_item_metadata: async () => ({ success: true }),
}));

vi.mock("@/services/mail_categorizer", () => ({
  CLASSIFIER_VERSION: 2,
  classify: () => "primary",
  CATEGORY_TABS: ["primary"],
}));

const subjects = new Map<string, string>();

vi.mock("@/hooks/email_list_helpers", () => ({
  decrypt_envelope: async (_envelope: string, _nonce: string, id: string) => ({
    subject: subjects.get(id) ?? `Subject ${id}`,
    from: { name: `Sender ${id}`, email: `${id}@example.test` },
  }),
}));

import {
  build_index,
  clear_category_index_memory,
  flush_pending_notify,
  get_entry_preview,
  index_arrival,
  subscribe,
} from "@/services/category_index";
import { list_mail_items } from "@/services/api/mail";

const mocked_list = vi.mocked(list_mail_items);
const PAGE = 150;

function make_item(index: number) {
  return {
    id: `m${index}`,
    encrypted_envelope: "envelope",
    envelope_nonce: "nonce",
    item_type: "received",
    message_ts: new Date(Date.UTC(2026, 6, 1) - index * 60000).toISOString(),
    created_at: new Date(Date.UTC(2026, 6, 1)).toISOString(),
    is_read: false,
  };
}

function serve_pages(total: number, page_delay_ms = 0): void {
  const items = Array.from({ length: total }, (_, i) => make_item(i));

  mocked_list.mockImplementation((async (params: {
    cursor?: string;
    ids?: string[];
  }) => {
    if (params.ids) {
      return {
        data: {
          items: items.filter((item) => params.ids!.includes(item.id)),
          has_more: false,
        },
      };
    }
    if (page_delay_ms > 0) {
      await new Promise((resolve) => setTimeout(resolve, page_delay_ms));
    }
    const start = params.cursor ? Number(params.cursor) : 0;
    const next = start + PAGE;

    return {
      data: {
        items: items.slice(start, next),
        has_more: next < total,
        next_cursor: next < total ? String(next) : undefined,
      },
    };
  }) as unknown as typeof list_mail_items);
}

function count_notifies(): { count: () => number; stop: () => void } {
  let count = 0;
  const stop = subscribe(() => {
    count += 1;
  });

  return { count: () => count, stop };
}

describe("category index notifications", () => {
  beforeEach(() => {
    clear_category_index_memory();
    subjects.clear();
    mocked_list.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("notifies a handful of times, not once per message, while building", async () => {
    vi.useFakeTimers();
    serve_pages(600);
    const listener = count_notifies();
    let finished = false;

    void build_index({ force: true }).then(() => {
      finished = true;
    });
    for (let step = 0; step < 1000 && !finished; step += 1) {
      await vi.advanceTimersByTimeAsync(1);
    }

    expect(finished).toBe(true);
    flush_pending_notify();
    listener.stop();

    expect(get_entry_preview("m599")?.subject).toBe("Subject m599");
    expect(listener.count()).toBeLessThanOrEqual(3);
  });

  it("still updates subscribers while a long build is running", async () => {
    vi.useFakeTimers();
    serve_pages(900, 1000);
    const listener = count_notifies();
    let finished = false;

    void build_index({ force: true }).then(() => {
      finished = true;
    });
    await vi.advanceTimersByTimeAsync(500);
    const before_first_page = listener.count();

    await vi.advanceTimersByTimeAsync(5500);

    expect(finished).toBe(false);
    expect(listener.count()).toBeGreaterThan(before_first_page);

    await vi.advanceTimersByTimeAsync(10000);
    listener.stop();

    expect(finished).toBe(true);
  });

  it("publishes a changed preview for a single message without a build delay", async () => {
    serve_pages(1);
    await index_arrival("m0");
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(get_entry_preview("m0")?.subject).toBe("Subject m0");

    subjects.set("m0", "Edited subject");
    const listener = count_notifies();

    await index_arrival("m0");
    await new Promise((resolve) => setTimeout(resolve, 0));
    listener.stop();

    expect(get_entry_preview("m0")?.subject).toBe("Edited subject");
    expect(listener.count()).toBe(1);
  });
});
