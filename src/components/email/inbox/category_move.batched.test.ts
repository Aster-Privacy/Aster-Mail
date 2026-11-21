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
import { describe, it, expect, vi, beforeEach } from "vitest";

const hoisted = vi.hoisted(() => ({
  write_category_states: vi.fn(),
  apply_category_pins_locally: vi.fn(),
  restore_category_entry_locally: vi.fn(),
  show_bulk_result_toast: vi.fn(),
  show_toast: vi.fn(),
  events: [] as string[],
}));

vi.mock("@/services/category_index", () => ({
  apply_category_pins_locally: (...a: unknown[]) =>
    hoisted.apply_category_pins_locally(...a),
  batch_index_updates: (run: () => void) => run(),
  fold_to_active_tab: (raw?: string) => raw ?? "primary",
  get_index_entries: () => [],
  group_thread_entries: () => new Map(),
  is_thread_grouping: () => false,
  restore_category_entry_locally: (...a: unknown[]) =>
    hoisted.restore_category_entry_locally(...a),
  thread_category_of: () => null,
  write_category_states: (...a: unknown[]) =>
    hoisted.write_category_states(...a),
}));

vi.mock("@/hooks/bulk_action_result", () => ({
  bulk_action_result: (succeeded: string[], failed: string[]) => ({
    succeeded,
    failed,
  }),
  show_bulk_result_toast: (...a: unknown[]) => {
    hoisted.events.push("toast");
    hoisted.show_bulk_result_toast(...a);
  },
}));

vi.mock("@/components/toast/simple_toast", () => ({
  show_toast: (...a: unknown[]) => hoisted.show_toast(...a),
}));

vi.mock("@/components/email/inbox/category_sender_rule", () => ({
  maybe_offer_sender_rule: vi.fn(),
}));

vi.mock("@/services/learned_category_senders", () => ({
  record_category_move: () => null,
}));

vi.mock("@/data/category_catalog", () => ({
  category_display_name: (category: string) => category,
}));

import {
  move_items_to_category,
  reset_category_move_queue,
} from "@/components/email/inbox/category_move";

const t = ((key: string) => key) as Parameters<
  typeof move_items_to_category
>[2]["t"];

function items(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    id: `m${index}`,
    mail_category: "primary" as const,
    encrypted_metadata: `blob${index}`,
    metadata_nonce: `nonce${index}`,
    metadata_version: 1,
  }));
}

function applied(ids: string[]) {
  return new Map(
    ids.map((id) => [
      id,
      {
        applied: true,
        undecryptable: false,
        previous: { category: "primary", category_pinned: false },
        encrypted_metadata: `new-${id}`,
        metadata_nonce: `nn-${id}`,
        metadata_version: 2,
      },
    ]),
  );
}

describe("move_items_to_category", () => {
  beforeEach(() => {
    reset_category_move_queue();
    hoisted.events.length = 0;
    hoisted.write_category_states.mockReset();
    hoisted.apply_category_pins_locally.mockReset();
    hoisted.restore_category_entry_locally.mockReset();
    hoisted.show_bulk_result_toast.mockReset();
    hoisted.show_toast.mockReset();
  });

  it("moves the rows and confirms before the server write finishes", async () => {
    let finish: (value: unknown) => void = () => {};

    hoisted.write_category_states.mockImplementation(() => {
      hoisted.events.push("write");

      return new Promise((resolve) => {
        finish = resolve;
      });
    });

    const update_email = vi.fn();
    const done = move_items_to_category(items(3), "promotions", {
      t,
      update_email,
    });

    expect(hoisted.apply_category_pins_locally).toHaveBeenCalledTimes(1);
    expect(update_email).toHaveBeenCalledWith("m0", {
      mail_category: "promotions",
    });
    expect(hoisted.show_bulk_result_toast).toHaveBeenCalledTimes(1);
    expect(hoisted.events[0]).toBe("toast");

    await vi.waitFor(() =>
      expect(hoisted.write_category_states).toHaveBeenCalledTimes(1),
    );
    expect(hoisted.write_category_states.mock.calls[0]![0]).toHaveLength(3);

    finish(applied(["m0", "m1", "m2"]));
    await done;

    expect(hoisted.show_toast).not.toHaveBeenCalled();
    expect(hoisted.restore_category_entry_locally).not.toHaveBeenCalled();
  });

  it("sends one write for a large selection", async () => {
    const ids = items(250).map((item) => item.id);

    hoisted.write_category_states.mockResolvedValue(applied(ids));

    await move_items_to_category(items(250), "social", { t });

    expect(hoisted.write_category_states).toHaveBeenCalledTimes(1);
    expect(hoisted.write_category_states.mock.calls[0]![0]).toHaveLength(250);
  });

  it("puts the rows back and reports an error when the write fails", async () => {
    hoisted.write_category_states.mockResolvedValue(new Map());

    const update_email = vi.fn();

    await move_items_to_category(items(2), "updates", { t, update_email });

    expect(hoisted.restore_category_entry_locally).toHaveBeenCalledTimes(2);
    expect(update_email).toHaveBeenLastCalledWith("m1", {
      mail_category: "primary",
    });
    expect(hoisted.show_toast).toHaveBeenCalledWith(
      "common.something_went_wrong",
      "error",
    );
  });

  it("undoes every row with one write", async () => {
    hoisted.write_category_states.mockImplementation(
      async (writes: Array<{ target: { id: string } }>) =>
        applied(writes.map((write) => write.target.id)),
    );

    await move_items_to_category(items(3), "promotions", { t });

    const config = hoisted.show_bulk_result_toast.mock.calls[0]![0] as {
      on_undo: () => Promise<void>;
    };

    await config.on_undo();

    expect(hoisted.write_category_states).toHaveBeenCalledTimes(2);
    expect(hoisted.write_category_states.mock.calls[1]![0]).toHaveLength(3);
    expect(hoisted.restore_category_entry_locally).toHaveBeenCalledTimes(3);
  });
});
