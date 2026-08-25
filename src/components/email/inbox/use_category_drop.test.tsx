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
    (email: InboxEmail, category: EmailCategory) => Promise<CategoryWriteResult>
  >();
const upsert_entries = vi.fn();
const note_recent_pin = vi.fn();
const clear_recent_pin = vi.fn();
const get_index_entries = vi.fn<(ids: string[]) => CategoryIndexEntry[]>();

vi.mock("@/services/category_index", () => ({
  set_message_category: (email: InboxEmail, category: EmailCategory) =>
    set_message_category(email, category),
  upsert_entries: (...args: unknown[]) => upsert_entries(...args),
  note_recent_pin: (...args: unknown[]) => note_recent_pin(...args),
  clear_recent_pin: (...args: unknown[]) => clear_recent_pin(...args),
  get_index_entries: (ids: string[]) => get_index_entries(ids),
}));

const show_action_toast = vi.fn();
const show_toast = vi.fn();

vi.mock("@/components/toast/action_toast", () => ({
  show_action_toast: (...args: unknown[]) => show_action_toast(...args),
}));

vi.mock("@/components/toast/simple_toast", () => ({
  show_toast: (...args: unknown[]) => show_toast(...args),
}));

const { use_category_drop } = await import(
  "@/components/email/inbox/use_category_drop"
);

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLDivElement | null = null;

function email(id: string, category?: EmailCategory): InboxEmail {
  return {
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
  emails: InboxEmail[];
}

function mount(emails: InboxEmail[]): Harness {
  const harness: Harness = {
    drop: async () => {},
    updates: [],
    emails,
  };

  function Probe(): null {
    harness.drop = use_category_drop({
      emails: harness.emails,
      update_email: (id, updates) => {
        harness.updates.push({ id, category: updates.mail_category });
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

  return harness;
}

async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
  });
}

beforeEach(() => {
  set_message_category.mockReset();
  upsert_entries.mockClear();
  note_recent_pin.mockClear();
  clear_recent_pin.mockClear();
  get_index_entries.mockReset();
  get_index_entries.mockReturnValue([]);
  show_action_toast.mockClear();
  show_toast.mockClear();
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

  it("undo sends the message back to the category it came from", async () => {
    set_message_category.mockResolvedValue(applied_result);

    const harness = mount([email("a", "primary")]);

    await act(async () => {
      await harness.drop("promotions", ["a"]);
    });

    const undo = show_action_toast.mock.calls[0]![0]
      .on_undo as () => Promise<void>;

    harness.updates.length = 0;
    set_message_category.mockClear();

    await act(async () => {
      await undo();
    });

    expect(harness.updates).toEqual([{ id: "a", category: "primary" }]);
    expect(set_message_category.mock.calls[0]![1]).toBe("primary");
  });
});
