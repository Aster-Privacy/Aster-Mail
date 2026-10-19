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

const send_reaction = vi.fn();
const remove_reaction = vi.fn();

vi.mock("@/services/reaction_actions", () => ({
  send_reaction: (...args: unknown[]) => send_reaction(...args),
  remove_reaction: (...args: unknown[]) => remove_reaction(...args),
}));

const { hold_reaction } = await import("@/services/held_reactions");

const message = { id: "msg_1" } as never;

async function flush() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

describe("held reactions", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    send_reaction.mockReset();
    remove_reaction.mockReset();
    send_reaction.mockResolvedValue({
      success: true,
      own_reaction_mail_item_id: "own_1",
    });
    remove_reaction.mockResolvedValue({ success: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("waits for the undo window before sending", async () => {
    const on_result = vi.fn();

    hold_reaction({ message, emoji: "👍", delay_ms: 5000, on_result });
    vi.advanceTimersByTime(4999);
    expect(send_reaction).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    await flush();
    expect(send_reaction).toHaveBeenCalledWith(message, "👍", undefined);
    expect(on_result).toHaveBeenCalledWith(
      expect.objectContaining({ success: true }),
    );
  });

  it("never sends a reaction undone inside the window", async () => {
    const on_result = vi.fn();
    const held = hold_reaction({
      message,
      emoji: "👍",
      delay_ms: 5000,
      on_result,
    });

    await expect(held.undo()).resolves.toBe(true);
    vi.advanceTimersByTime(10_000);
    await flush();

    expect(send_reaction).not.toHaveBeenCalled();
    expect(remove_reaction).not.toHaveBeenCalled();
    expect(on_result).not.toHaveBeenCalled();
  });

  it("sends at once when there is no undo window", async () => {
    hold_reaction({ message, emoji: "👍", delay_ms: 0, on_result: vi.fn() });

    expect(send_reaction).toHaveBeenCalledTimes(1);
  });

  it("removes a reaction that was already sent", async () => {
    const on_result = vi.fn();
    const held = hold_reaction({
      message,
      emoji: "👍",
      delay_ms: 0,
      on_result,
    });

    await flush();
    await expect(held.undo()).resolves.toBe(true);
    expect(remove_reaction).toHaveBeenCalledWith("own_1");
  });

  it("removes a reaction whose send is still in flight", async () => {
    let resolve_send: (value: unknown) => void = () => {};

    send_reaction.mockReturnValue(
      new Promise((resolve) => {
        resolve_send = resolve;
      }),
    );
    const on_result = vi.fn();
    const held = hold_reaction({
      message,
      emoji: "👍",
      delay_ms: 0,
      on_result,
    });
    const undoing = held.undo();

    resolve_send({ success: true, own_reaction_mail_item_id: "own_2" });

    await expect(undoing).resolves.toBe(true);
    expect(remove_reaction).toHaveBeenCalledWith("own_2");
    expect(on_result).not.toHaveBeenCalled();
  });

  it("treats a failed send as nothing to undo", async () => {
    send_reaction.mockResolvedValue({ success: false, error: "nope" });
    const held = hold_reaction({
      message,
      emoji: "👍",
      delay_ms: 0,
      on_result: vi.fn(),
    });

    await expect(held.undo()).resolves.toBe(true);
    expect(remove_reaction).not.toHaveBeenCalled();
  });

  it("reports failure when the sent reaction cannot be removed", async () => {
    remove_reaction.mockResolvedValue({ success: false });
    const held = hold_reaction({
      message,
      emoji: "👍",
      delay_ms: 0,
      on_result: vi.fn(),
    });

    await flush();
    await expect(held.undo()).resolves.toBe(false);
  });

  it("reports failure when the sent reaction has no id to remove", async () => {
    send_reaction.mockResolvedValue({ success: true });
    const held = hold_reaction({
      message,
      emoji: "👍",
      delay_ms: 0,
      on_result: vi.fn(),
    });

    await flush();
    await expect(held.undo()).resolves.toBe(false);
  });

  it("sends held reactions when the page unloads", async () => {
    hold_reaction({ message, emoji: "👍", delay_ms: 5000, on_result: vi.fn() });

    const event = new Event("beforeunload", { cancelable: true });

    window.dispatchEvent(event);

    expect(send_reaction).toHaveBeenCalledTimes(1);
    expect(event.defaultPrevented).toBe(true);
    vi.advanceTimersByTime(10_000);
    expect(send_reaction).toHaveBeenCalledTimes(1);
  });

  it("undoes only once", async () => {
    const held = hold_reaction({
      message,
      emoji: "👍",
      delay_ms: 0,
      on_result: vi.fn(),
    });

    await flush();
    await held.undo();
    await held.undo();
    expect(remove_reaction).toHaveBeenCalledTimes(1);
  });
});
