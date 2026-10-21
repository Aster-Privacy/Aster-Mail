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
import type { EmailCategory, InboxEmail } from "@/types/email";
import type { CategoryIndexEntry } from "@/services/category_index";

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

interface CategoryWriteResult {
  applied: boolean;
  undecryptable: boolean;
  encrypted_metadata?: string;
  metadata_nonce?: string;
  metadata_version?: number;
  previous?: { category?: EmailCategory; category_pinned: boolean };
}

interface MoveTarget {
  id: string;
  thread_token?: string;
  encrypted_metadata?: string;
  metadata_nonce?: string;
  metadata_version?: number;
}

const applied_result: CategoryWriteResult = {
  applied: true,
  undecryptable: false,
};
const rejected_result: CategoryWriteResult = {
  applied: false,
  undecryptable: false,
};
const undecryptable_result: CategoryWriteResult = {
  applied: false,
  undecryptable: true,
};

const set_message_category =
  vi.fn<
    (
      target: MoveTarget,
      category: EmailCategory,
    ) => Promise<CategoryWriteResult>
  >();
const restore_message_category =
  vi.fn<
    (
      target: MoveTarget,
      previous: { category?: EmailCategory; category_pinned: boolean },
    ) => Promise<CategoryWriteResult>
  >();
const apply_category_pin_locally = vi.fn();
const restore_category_entry_locally = vi.fn();
const get_index_entries = vi.fn<(ids: string[]) => CategoryIndexEntry[]>();
const get_thread_entry_ids = vi.fn<(token: string) => string[]>();
const grouping = { on: false };

vi.mock("@/services/category_index", () => ({
  set_message_category: (target: MoveTarget, category: EmailCategory) =>
    set_message_category(target, category),
  restore_message_category: (
    target: MoveTarget,
    previous: { category?: EmailCategory; category_pinned: boolean },
  ) => restore_message_category(target, previous),
  apply_category_pin_locally: (...args: unknown[]) =>
    apply_category_pin_locally(...args),
  restore_category_entry_locally: (...args: unknown[]) =>
    restore_category_entry_locally(...args),
  get_index_entries: (ids: string[]) => get_index_entries(ids),
  get_thread_entry_ids: (token: string) => get_thread_entry_ids(token),
  get_thread_category: () => undefined,
  is_thread_grouping: () => grouping.on,
  fold_to_active_tab: (raw?: EmailCategory) => raw ?? "primary",
}));

const show_action_toast = vi.fn();
const show_toast = vi.fn();

vi.mock("@/components/toast/action_toast", () => ({
  show_action_toast: (...args: unknown[]) => show_action_toast(...args),
}));

vi.mock("@/components/toast/simple_toast", () => ({
  show_toast: (...args: unknown[]) => show_toast(...args),
}));

const { use_category_drop } =
  await import("@/components/email/inbox/use_category_drop");
const { reset_sender_rule_state } =
  await import("@/components/email/inbox/category_sender_rule");
const { reset_category_move_queue } =
  await import("@/components/email/inbox/category_move");

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLDivElement | null = null;

function email(
  id: string,
  category?: EmailCategory,
  extra: Partial<InboxEmail> = {},
): InboxEmail {
  return {
    ...extra,
    id,
    sender_name: "Sender",
    sender_email: "sender@example.com",
    subject: `subject ${id}`,
    preview: "",
    timestamp: "2026-07-01T00:00:00.000Z",
    is_read: false,
    is_starred: false,
    has_attachment: false,
    mail_category: category,
  } as unknown as InboxEmail;
}

interface Harness {
  drop: (category: EmailCategory, ids: string[]) => Promise<void>;
  updates: Array<{ id: string; category?: EmailCategory }>;
  blobs: Array<{ id: string; encrypted_metadata?: string }>;
  emails: InboxEmail[];
  rerender: (emails: InboxEmail[]) => void;
}

function mount(emails: InboxEmail[]): Harness {
  const harness: Harness = {
    drop: async () => {},
    updates: [],
    blobs: [],
    emails,
    rerender: () => {},
  };

  function Probe(): null {
    harness.drop = use_category_drop({
      emails: harness.emails,
      update_email: (id, updates) => {
        if ("mail_category" in updates) {
          harness.updates.push({ id, category: updates.mail_category });
        }
        if (updates.encrypted_metadata) {
          harness.blobs.push({
            id,
            encrypted_metadata: updates.encrypted_metadata,
          });
        }
      },
      t: (key) => key,
    });

    return null;
  }

  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root!.render(<Probe />);
  });
  harness.rerender = (next) => {
    harness.emails = next;
    act(() => {
      root!.render(<Probe />);
    });
  };

  return harness;
}

async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
  });
}

beforeEach(() => {
  reset_category_move_queue();
  grouping.on = false;
  set_message_category.mockReset();
  restore_message_category.mockReset();
  apply_category_pin_locally.mockClear();
  restore_category_entry_locally.mockClear();
  get_index_entries.mockReset();
  get_index_entries.mockReturnValue([]);
  get_thread_entry_ids.mockReset();
  get_thread_entry_ids.mockReturnValue([]);
  show_action_toast.mockClear();
  show_toast.mockClear();
  reset_sender_rule_state();
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  container?.remove();
  root = null;
  container = null;
});

describe("use_category_drop", () => {
  it("does nothing when the message is already in the target category", async () => {
    const harness = mount([email("a", "promotions")]);

    await act(async () => {
      await harness.drop("promotions", ["a"]);
    });

    expect(set_message_category).not.toHaveBeenCalled();
    expect(harness.updates).toEqual([]);
    expect(show_action_toast).not.toHaveBeenCalled();
    expect(show_toast).not.toHaveBeenCalled();
  });

  it("moves the row before the request resolves and reports success once", async () => {
    let resolve_move: (value: CategoryWriteResult) => void = () => {};

    set_message_category.mockImplementation(
      () =>
        new Promise<CategoryWriteResult>((resolve) => {
          resolve_move = resolve;
        }),
    );

    const harness = mount([email("a", "primary")]);
    let pending: Promise<void> = Promise.resolve();

    act(() => {
      pending = harness.drop("promotions", ["a"]);
    });

    expect(harness.updates).toEqual([{ id: "a", category: "promotions" }]);

    await flush();

    expect(show_action_toast).not.toHaveBeenCalled();

    await act(async () => {
      resolve_move(applied_result);
      await pending;
    });

    expect(show_action_toast).toHaveBeenCalledTimes(1);
    expect(show_action_toast.mock.calls[0]![0]).toMatchObject({
      message: "mail.moved_to_category",
      email_ids: ["a"],
    });
    expect(show_toast).not.toHaveBeenCalled();
  });

  it("rolls the row back and shows an error when the move fails", async () => {
    set_message_category.mockResolvedValue(rejected_result);

    const harness = mount([email("a", "primary")]);

    await act(async () => {
      await harness.drop("promotions", ["a"]);
    });

    expect(harness.updates).toEqual([
      { id: "a", category: "promotions" },
      { id: "a", category: "primary" },
    ]);
    expect(show_toast).toHaveBeenCalledWith(
      "common.something_went_wrong",
      "error",
    );
    expect(show_action_toast).not.toHaveBeenCalled();
  });

  it("rolls back and names the undecryptable condition instead of reporting success", async () => {
    set_message_category.mockResolvedValue(undecryptable_result);

    const harness = mount([email("a", "primary")]);

    await act(async () => {
      await harness.drop("promotions", ["a"]);
    });

    expect(harness.updates).toEqual([
      { id: "a", category: "promotions" },
      { id: "a", category: "primary" },
    ]);
    expect(show_toast).toHaveBeenCalledWith(
      "errors.metadata_undecryptable_change",
      "error",
    );
    expect(show_action_toast).not.toHaveBeenCalled();
  });

  it("offers a sender rule only after the same sender repeats", async () => {
    set_message_category.mockResolvedValue(applied_result);

    const harness = mount([email("a", "primary"), email("b", "primary")]);

    await act(async () => {
      await harness.drop("promotions", ["a"]);
    });
    expect(show_toast).not.toHaveBeenCalled();

    await act(async () => {
      await harness.drop("promotions", ["b"]);
    });
    expect(show_toast).toHaveBeenCalledTimes(1);
    expect(show_toast.mock.calls[0]![0]).toBe("mail.sender_rule_offer");
  });

  it("rolls back only the failures and warns on a partial move", async () => {
    set_message_category.mockImplementation(async (item) =>
      item.id === "b" ? rejected_result : applied_result,
    );

    const harness = mount([email("a", "primary"), email("b", "primary")]);

    await act(async () => {
      await harness.drop("promotions", ["a", "b"]);
    });

    expect(harness.updates).toEqual([
      { id: "a", category: "promotions" },
      { id: "b", category: "promotions" },
      { id: "b", category: "primary" },
    ]);
    expect(show_action_toast).toHaveBeenCalledTimes(1);
    expect(show_action_toast.mock.calls[0]![0]).toMatchObject({
      message: "common.bulk_action_partially_applied",
      email_ids: ["a"],
    });
    expect(show_toast).not.toHaveBeenCalled();
  });

  it("keeps both changes when a second drop lands while the first is in flight", async () => {
    const gates: Array<() => void> = [];

    set_message_category.mockImplementation(
      () =>
        new Promise<CategoryWriteResult>((resolve) => {
          gates.push(() => resolve(applied_result));
        }),
    );

    const harness = mount([email("a", "primary"), email("b", "primary")]);
    let first: Promise<void> = Promise.resolve();
    let second: Promise<void> = Promise.resolve();

    act(() => {
      first = harness.drop("promotions", ["a"]);
      second = harness.drop("social", ["b"]);
    });

    expect(harness.updates).toEqual([
      { id: "a", category: "promotions" },
      { id: "b", category: "social" },
    ]);

    await flush();

    expect(set_message_category).toHaveBeenCalledTimes(1);

    await act(async () => {
      gates[0]!();
      await first;
    });

    await flush();

    expect(set_message_category).toHaveBeenCalledTimes(2);

    await act(async () => {
      gates[1]!();
      await second;
    });

    expect(set_message_category.mock.calls.map((call) => call[1])).toEqual([
      "promotions",
      "social",
    ]);
    expect(show_action_toast).toHaveBeenCalledTimes(2);
  });

  it("undo restores the exact category state the message had before", async () => {
    set_message_category.mockResolvedValue({
      ...applied_result,
      encrypted_metadata: "blob-2",
      metadata_nonce: "nonce-2",
      metadata_version: 2,
      previous: { category: "promotions", category_pinned: false },
    });
    restore_message_category.mockResolvedValue({
      ...applied_result,
      encrypted_metadata: "blob-3",
      metadata_nonce: "nonce-3",
      metadata_version: 3,
    });

    const harness = mount([
      email("a", "promotions", {
        encrypted_metadata: "blob-1",
        metadata_nonce: "nonce-1",
        metadata_version: 1,
      } as Partial<InboxEmail>),
    ]);

    await act(async () => {
      await harness.drop("primary", ["a"]);
    });

    const undo = show_action_toast.mock.calls[0]![0]
      .on_undo as () => Promise<void>;

    harness.updates.length = 0;

    await act(async () => {
      await undo();
    });

    expect(set_message_category).toHaveBeenCalledTimes(1);
    expect(restore_message_category).toHaveBeenCalledTimes(1);
    const [target, previous] = restore_message_category.mock.calls[0]!;

    expect(target.encrypted_metadata).toBe("blob-2");
    expect(previous).toEqual({
      category: "promotions",
      category_pinned: false,
    });
    expect(restore_category_entry_locally).toHaveBeenCalled();
    expect(restore_category_entry_locally.mock.calls[0]![0]).toBe("a");
    expect(harness.updates[0]).toEqual({ id: "a", category: "promotions" });
    expect(harness.blobs.at(-1)).toEqual({
      id: "a",
      encrypted_metadata: "blob-3",
    });
  });

  it("undo that fails puts the message back in the moved category", async () => {
    set_message_category.mockResolvedValue({
      ...applied_result,
      previous: { category_pinned: false },
    });
    restore_message_category.mockResolvedValue(rejected_result);

    const harness = mount([email("a", "promotions")]);

    await act(async () => {
      await harness.drop("primary", ["a"]);
    });

    const undo = show_action_toast.mock.calls[0]![0]
      .on_undo as () => Promise<void>;

    harness.updates.length = 0;
    apply_category_pin_locally.mockClear();

    await act(async () => {
      await undo();
    });

    expect(harness.updates).toEqual([
      { id: "a", category: "promotions" },
      { id: "a", category: "primary" },
    ]);
    expect(apply_category_pin_locally).toHaveBeenCalledTimes(1);
    expect(show_toast).toHaveBeenCalledWith(
      "common.something_went_wrong",
      "error",
    );
  });

  it("moves every loaded message of a grouped thread", async () => {
    grouping.on = true;
    get_thread_entry_ids.mockReturnValue(["a", "b", "c"]);
    get_index_entries.mockImplementation((ids) =>
      ids
        .filter((id) => id !== "a")
        .map(
          (id) =>
            ({
              id,
              thread_token: "t1",
              category: id === "c" ? "primary" : "promotions",
              category_pinned: id === "c",
              is_read: true,
              message_ts: "2026-07-01T00:00:00.000Z",
            }) as unknown as CategoryIndexEntry,
        ),
    );
    set_message_category.mockResolvedValue(applied_result);

    const harness = mount([
      email("a", "promotions", { thread_token: "t1" } as Partial<InboxEmail>),
    ]);

    await act(async () => {
      await harness.drop("primary", ["a"]);
    });

    expect(set_message_category.mock.calls.map((call) => call[0].id)).toEqual([
      "a",
      "b",
    ]);
    expect(show_action_toast).toHaveBeenCalledTimes(1);
  });

  it("restores the whole thread locally when the head message fails", async () => {
    grouping.on = true;
    get_thread_entry_ids.mockReturnValue(["a", "b"]);
    get_index_entries.mockImplementation((ids) =>
      ids
        .filter((id) => id === "b")
        .map(
          (id) =>
            ({
              id,
              thread_token: "t1",
              category: "promotions",
              is_read: true,
              message_ts: "2026-07-01T00:00:00.000Z",
            }) as unknown as CategoryIndexEntry,
        ),
    );
    set_message_category.mockResolvedValue(rejected_result);

    const harness = mount([
      email("a", "promotions", { thread_token: "t1" } as Partial<InboxEmail>),
    ]);

    await act(async () => {
      await harness.drop("primary", ["a"]);
    });

    expect(set_message_category).toHaveBeenCalledTimes(1);
    expect(
      restore_category_entry_locally.mock.calls.map((call) => call[0]),
    ).toEqual(["a", "b"]);
  });

  it("writes on top of its own newer blob when the row still holds the old one", async () => {
    set_message_category.mockResolvedValueOnce({
      ...applied_result,
      encrypted_metadata: "blob-2",
      metadata_nonce: "nonce-2",
      metadata_version: 2,
    });
    set_message_category.mockResolvedValueOnce(applied_result);

    const stale = {
      encrypted_metadata: "blob-1",
      metadata_nonce: "nonce-1",
      metadata_version: 1,
    } as Partial<InboxEmail>;
    const harness = mount([email("a", "promotions", stale)]);

    await act(async () => {
      await harness.drop("primary", ["a"]);
    });

    expect(harness.blobs).toEqual([{ id: "a", encrypted_metadata: "blob-2" }]);
    harness.rerender([email("a", "primary", stale)]);
    harness.updates.length = 0;

    await act(async () => {
      await harness.drop("social", ["a"]);
    });

    expect(set_message_category.mock.calls[1]![0]).toMatchObject({
      encrypted_metadata: "blob-2",
      metadata_nonce: "nonce-2",
      metadata_version: 2,
    });
  });
});
