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
import type { DecryptedThreadMessage } from "@/types/thread";

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

const state = vi.hoisted(() => ({
  indexed_unread: false,
  marked: [] as { thread_token?: string | null; acted_id?: string }[],
}));

vi.mock("@/hooks/mark_conversation_read", () => ({
  mark_conversation_read: (options: {
    thread_token?: string | null;
    acted_id?: string;
  }) => {
    state.marked.push(options);
  },
}));

vi.mock("@/services/category_index", () => ({
  thread_has_unread_entries: () => state.indexed_unread,
}));

const { use_conversation_catch_up_read, catch_up_delay_ms } =
  await import("@/hooks/use_conversation_catch_up_read");

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

interface ProbeProps {
  is_read: boolean;
  delay: "immediate" | "1_second" | "3_seconds" | "never";
  grouping?: boolean;
  messages?: DecryptedThreadMessage[];
}

const grouped_ref = { current: ["a", "b"] };

function Probe({ is_read, delay, grouping = true, messages = [] }: ProbeProps) {
  use_conversation_catch_up_read({
    email_id: "a",
    is_read,
    is_loading: false,
    item_id: "a",
    thread_token: "t1",
    thread_message_count: 2,
    thread_messages: messages,
    grouped_count_ref: grouped_ref,
    mark_as_read_delay: delay,
    conversation_grouping: grouping,
  });

  return null;
}

function message(id: string, is_read: boolean): DecryptedThreadMessage {
  return { id, is_read, item_type: "received" } as DecryptedThreadMessage;
}

let root: Root | null = null;
let container: HTMLDivElement | null = null;

function render(props: ProbeProps): void {
  act(() => {
    root!.render(<Probe {...props} />);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  state.indexed_unread = false;
  state.marked = [];
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  container?.remove();
  root = null;
  container = null;
  vi.useRealTimers();
});

describe("catch_up_delay_ms", () => {
  it("maps each delay preference", () => {
    expect(catch_up_delay_ms("immediate")).toBe(0);
    expect(catch_up_delay_ms("1_second")).toBe(1000);
    expect(catch_up_delay_ms("3_seconds")).toBe(3000);
    expect(catch_up_delay_ms("never")).toBeNull();
    expect(catch_up_delay_ms(undefined)).toBe(0);
  });
});

describe("use_conversation_catch_up_read", () => {
  it("marks the conversation read after the delay when a collapsed sibling is unread", () => {
    render({
      is_read: true,
      delay: "3_seconds",
      messages: [message("a", true), message("b", false)],
    });

    act(() => {
      vi.advanceTimersByTime(2999);
    });
    expect(state.marked).toHaveLength(0);
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(state.marked).toEqual([
      expect.objectContaining({ thread_token: "t1", acted_id: "a" }),
    ]);
  });

  it("uses the category index when the thread has not loaded", () => {
    state.indexed_unread = true;
    render({ is_read: true, delay: "immediate" });

    act(() => {
      vi.advanceTimersByTime(0);
    });
    expect(state.marked).toHaveLength(1);
  });

  it("does nothing when every sibling is read", () => {
    render({
      is_read: true,
      delay: "immediate",
      messages: [message("a", true), message("b", true)],
    });

    act(() => {
      vi.runAllTimers();
    });
    expect(state.marked).toHaveLength(0);
  });

  it("leaves the conversation alone when reading is set to never", () => {
    state.indexed_unread = true;
    render({ is_read: true, delay: "never" });

    act(() => {
      vi.runAllTimers();
    });
    expect(state.marked).toHaveLength(0);
  });

  it("leaves the conversation alone when grouping is off", () => {
    state.indexed_unread = true;
    render({ is_read: true, delay: "immediate", grouping: false });

    act(() => {
      vi.runAllTimers();
    });
    expect(state.marked).toHaveLength(0);
  });

  it("waits for the opened message to be read first", () => {
    state.indexed_unread = true;
    render({ is_read: false, delay: "immediate" });

    act(() => {
      vi.runAllTimers();
    });
    expect(state.marked).toHaveLength(0);
  });

  it("marks the conversation read only once per open", () => {
    state.indexed_unread = true;
    render({ is_read: true, delay: "immediate" });
    act(() => {
      vi.runAllTimers();
    });
    render({
      is_read: true,
      delay: "immediate",
      messages: [message("b", false)],
    });
    act(() => {
      vi.runAllTimers();
    });

    expect(state.marked).toHaveLength(1);
  });
});
