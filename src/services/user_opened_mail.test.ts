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

const hoisted = vi.hoisted(() => ({
  view_cache: new Map<string, { state: { emails: unknown[] } }>(),
  emit_mail_item_updated: vi.fn(),
  adjust_stats_unread: vi.fn(),
  mark_conversation_read: vi.fn(),
  update_item_metadata: vi.fn(),
  list_mail_items: vi.fn(),
}));

vi.mock("@/hooks/email_list_cache", () => ({
  view_cache: hoisted.view_cache,
}));

vi.mock("@/hooks/mail_events", () => ({
  emit_mail_item_updated: (...a: unknown[]) =>
    hoisted.emit_mail_item_updated(...a),
}));

vi.mock("@/hooks/use_mail_stats", () => ({
  adjust_stats_unread: (...a: unknown[]) => hoisted.adjust_stats_unread(...a),
}));

vi.mock("@/hooks/unread_read_delta", () => ({
  read_clears_conversation: () => true,
}));

vi.mock("@/hooks/mark_conversation_read", () => ({
  mark_conversation_read: (...a: unknown[]) =>
    hoisted.mark_conversation_read(...a),
}));

vi.mock("@/services/crypto/mail_metadata", () => ({
  update_item_metadata: (...a: unknown[]) => hoisted.update_item_metadata(...a),
}));

vi.mock("@/services/api/mail", () => ({
  list_mail_items: (...a: unknown[]) => hoisted.list_mail_items(...a),
}));

import {
  on_user_opened_mail,
  reset_opened_mail_scope,
  revert_user_opened_mail,
} from "./user_opened_mail";

import {
  apply_flag_intents,
  clear_read_intent,
  get_read_intent,
} from "@/services/read_intent";

const flush = async () => {
  for (let i = 0; i < 5; i++) await Promise.resolve();
};

function unread_row(id: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    item_type: "received",
    is_read: false,
    encrypted_metadata: "enc",
    metadata_nonce: "nonce",
    metadata_version: 1,
    ...extra,
  };
}

describe("on_user_opened_mail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.view_cache.clear();
    clear_read_intent(["m1", "m2", "m3"]);
    reset_opened_mail_scope();
  });

  it("shows read in the same call while the seen write hangs", async () => {
    hoisted.update_item_metadata.mockReturnValue(new Promise(() => {}));

    const applied = on_user_opened_mail("m1", {
      delay: "immediate",
      row: unread_row("m1"),
    });

    expect(applied).toBe(true);
    expect(get_read_intent("m1")).toBe(true);
    expect(hoisted.adjust_stats_unread).toHaveBeenCalledWith(-1);
    expect(hoisted.emit_mail_item_updated).toHaveBeenCalledWith({
      id: "m1",
      is_read: true,
    });

    await flush();

    expect(hoisted.emit_mail_item_updated).not.toHaveBeenCalledWith({
      id: "m1",
      is_read: false,
    });
    expect(hoisted.adjust_stats_unread).toHaveBeenCalledTimes(1);
    expect(get_read_intent("m1")).toBe(true);
  });

  it("keeps a stale unread fetch from restoring unread", () => {
    hoisted.update_item_metadata.mockReturnValue(new Promise(() => {}));

    on_user_opened_mail("m1", { delay: "immediate", row: unread_row("m1") });

    const [row] = apply_flag_intents([{ id: "m1", is_read: false }]);

    expect(row.is_read).toBe(true);
  });

  it("does not wait for metadata before showing read", async () => {
    hoisted.list_mail_items.mockReturnValue(new Promise(() => {}));

    const applied = on_user_opened_mail("m2", {
      delay: "immediate",
      row: { id: "m2", item_type: "received", is_read: false },
    });

    expect(applied).toBe(true);
    expect(get_read_intent("m2")).toBe(true);
    expect(hoisted.emit_mail_item_updated).toHaveBeenCalledWith({
      id: "m2",
      is_read: true,
    });
    expect(hoisted.adjust_stats_unread).toHaveBeenCalledWith(-1);

    await flush();

    expect(hoisted.update_item_metadata).not.toHaveBeenCalled();
  });

  it("fetches missing metadata and syncs the read state", async () => {
    hoisted.list_mail_items.mockResolvedValue({
      data: {
        items: [{ id: "m2", encrypted_metadata: "e2", metadata_nonce: "n2" }],
      },
    });
    hoisted.update_item_metadata.mockResolvedValue({
      success: true,
      encrypted: { encrypted_metadata: "e3", metadata_nonce: "n3" },
    });

    on_user_opened_mail("m2", {
      delay: "immediate",
      row: { id: "m2", item_type: "received", is_read: false },
    });
    await flush();

    expect(hoisted.update_item_metadata).toHaveBeenCalledWith(
      "m2",
      {
        encrypted_metadata: "e2",
        metadata_nonce: "n2",
        metadata_version: undefined,
      },
      { is_read: true },
    );
    expect(hoisted.mark_conversation_read).toHaveBeenCalled();
    expect(get_read_intent("m2")).toBe(true);
  });

  it("rolls back read state and count when the write fails", async () => {
    hoisted.update_item_metadata.mockResolvedValue({ success: false });

    on_user_opened_mail("m1", { delay: "immediate", row: unread_row("m1") });
    await flush();

    expect(hoisted.emit_mail_item_updated).toHaveBeenLastCalledWith({
      id: "m1",
      is_read: false,
    });
    expect(hoisted.adjust_stats_unread).toHaveBeenLastCalledWith(1);
    expect(get_read_intent("m1")).toBeUndefined();
  });

  it("uses the cached list row when no row is passed", async () => {
    hoisted.update_item_metadata.mockReturnValue(new Promise(() => {}));
    hoisted.view_cache.set("inbox", {
      state: { emails: [unread_row("m3")] },
    });

    expect(on_user_opened_mail("m3", { delay: "immediate" })).toBe(true);
    await flush();
    expect(hoisted.update_item_metadata).toHaveBeenCalledWith(
      "m3",
      expect.objectContaining({ encrypted_metadata: "enc" }),
      { is_read: true },
    );
  });

  it("does nothing for delayed reads, drafts, read mail, or a second open", () => {
    hoisted.update_item_metadata.mockReturnValue(new Promise(() => {}));

    expect(
      on_user_opened_mail("m1", { delay: "3_seconds", row: unread_row("m1") }),
    ).toBe(false);
    expect(
      on_user_opened_mail("m1", { delay: "never", row: unread_row("m1") }),
    ).toBe(false);
    expect(
      on_user_opened_mail("m1", {
        delay: "immediate",
        row: unread_row("m1", { item_type: "draft" }),
      }),
    ).toBe(false);
    expect(
      on_user_opened_mail("m1", {
        delay: "immediate",
        row: unread_row("m1", { is_read: true }),
      }),
    ).toBe(false);
    expect(on_user_opened_mail("m9", { delay: "immediate" })).toBe(false);
    expect(hoisted.adjust_stats_unread).not.toHaveBeenCalled();

    expect(
      on_user_opened_mail("m1", { delay: "immediate", row: unread_row("m1") }),
    ).toBe(true);
    expect(
      on_user_opened_mail("m1", { delay: "immediate", row: unread_row("m1") }),
    ).toBe(false);
    expect(hoisted.adjust_stats_unread).toHaveBeenCalledTimes(1);
  });
});

function deferred<T>() {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });

  return { promise, resolve };
}

describe("on_user_opened_mail account switch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.view_cache.clear();
    reset_opened_mail_scope();
  });

  it("drops pending intents from the previous account", () => {
    hoisted.update_item_metadata.mockReturnValue(new Promise(() => {}));

    on_user_opened_mail("m1", { delay: "immediate", row: unread_row("m1") });
    reset_opened_mail_scope();

    const [row] = apply_flag_intents([{ id: "m1", is_read: false }]);

    expect(get_read_intent("m1")).toBeUndefined();
    expect(row.is_read).toBe(false);
  });

  it("does not revert into the new account when an old save fails", async () => {
    const save = deferred<{ success: boolean }>();

    hoisted.update_item_metadata.mockReturnValue(save.promise);
    on_user_opened_mail("m1", { delay: "immediate", row: unread_row("m1") });
    await flush();
    reset_opened_mail_scope();
    vi.clearAllMocks();

    save.resolve({ success: false });
    await flush();

    expect(hoisted.emit_mail_item_updated).not.toHaveBeenCalled();
    expect(hoisted.adjust_stats_unread).not.toHaveBeenCalled();
    expect(get_read_intent("m1")).toBeUndefined();
  });

  it("does not emit into the new account when an old save succeeds", async () => {
    const save = deferred<{ success: boolean }>();

    hoisted.update_item_metadata.mockReturnValue(save.promise);
    on_user_opened_mail("m1", { delay: "immediate", row: unread_row("m1") });
    await flush();
    reset_opened_mail_scope();
    vi.clearAllMocks();

    save.resolve({ success: true });
    await flush();

    expect(hoisted.emit_mail_item_updated).not.toHaveBeenCalled();
    expect(hoisted.mark_conversation_read).not.toHaveBeenCalled();
    expect(revert_user_opened_mail("m1")).toBe(false);
  });
});

describe("revert_user_opened_mail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.view_cache.clear();
    reset_opened_mail_scope();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("restores unread and the count when the message never opens", () => {
    hoisted.update_item_metadata.mockReturnValue(new Promise(() => {}));

    on_user_opened_mail("m1", { delay: "immediate", row: unread_row("m1") });

    expect(revert_user_opened_mail("m1")).toBe(true);
    expect(hoisted.emit_mail_item_updated).toHaveBeenLastCalledWith({
      id: "m1",
      is_read: false,
    });
    expect(hoisted.adjust_stats_unread).toHaveBeenLastCalledWith(1);
    expect(get_read_intent("m1")).toBeUndefined();
    expect(revert_user_opened_mail("m1")).toBe(false);
  });

  it("writes unread back when the read save lands after the revert", async () => {
    const save = deferred<{ success: boolean }>();

    hoisted.update_item_metadata.mockReturnValueOnce(save.promise);
    hoisted.update_item_metadata.mockResolvedValue({ success: true });
    on_user_opened_mail("m1", { delay: "immediate", row: unread_row("m1") });
    await flush();
    revert_user_opened_mail("m1");
    hoisted.emit_mail_item_updated.mockClear();

    save.resolve({ success: true });
    await flush();

    expect(hoisted.update_item_metadata).toHaveBeenLastCalledWith(
      "m1",
      expect.objectContaining({ encrypted_metadata: "enc" }),
      { is_read: false },
      { force: true },
    );
    expect(hoisted.emit_mail_item_updated).not.toHaveBeenCalled();
    expect(hoisted.mark_conversation_read).not.toHaveBeenCalled();
  });

  it("writes unread back when the read save already landed", async () => {
    hoisted.update_item_metadata.mockResolvedValue({
      success: true,
      encrypted: { encrypted_metadata: "e3", metadata_nonce: "n3" },
    });
    on_user_opened_mail("m1", { delay: "immediate", row: unread_row("m1") });
    await flush();

    expect(revert_user_opened_mail("m1")).toBe(true);
    expect(hoisted.update_item_metadata).toHaveBeenLastCalledWith(
      "m1",
      { encrypted_metadata: "e3", metadata_nonce: "n3" },
      { is_read: false },
      { force: true },
    );
    expect(hoisted.adjust_stats_unread).toHaveBeenLastCalledWith(1);
  });

  it("counts once when a failed save follows the revert", async () => {
    const save = deferred<{ success: boolean }>();

    hoisted.update_item_metadata.mockReturnValue(save.promise);
    on_user_opened_mail("m1", { delay: "immediate", row: unread_row("m1") });
    await flush();
    revert_user_opened_mail("m1");

    save.resolve({ success: false });
    await flush();

    expect(hoisted.adjust_stats_unread.mock.calls).toEqual([[-1], [1]]);
  });

  it("leaves mail alone that this path did not open or opened long ago", () => {
    hoisted.update_item_metadata.mockReturnValue(new Promise(() => {}));

    expect(revert_user_opened_mail("m9")).toBe(false);

    const now = Date.now();

    on_user_opened_mail("m1", { delay: "immediate", row: unread_row("m1") });
    vi.spyOn(Date, "now").mockReturnValue(now + 31_000);

    expect(revert_user_opened_mail("m1")).toBe(false);
    expect(hoisted.emit_mail_item_updated).not.toHaveBeenCalledWith({
      id: "m1",
      is_read: false,
    });
    expect(hoisted.adjust_stats_unread).toHaveBeenCalledTimes(1);
  });
});
