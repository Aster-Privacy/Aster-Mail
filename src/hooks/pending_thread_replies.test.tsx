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
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import {
  emit_thread_reply_cancelled,
  emit_thread_reply_optimistic,
  emit_thread_reply_sent,
} from "./mail_events";
import {
  SETTLED_REPLY_TTL_MS,
  add_pending_thread_reply,
  remove_pending_thread_reply,
  reset_pending_thread_replies,
  settle_pending_thread_reply,
  use_shown_thread_count,
} from "./pending_thread_replies";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function CountProbe({
  token,
  count,
}: {
  token: string | undefined;
  count: number | undefined;
}) {
  return <output>{use_shown_thread_count(token, count)}</output>;
}

let container: HTMLDivElement;
let root: Root;

function show(token: string | undefined, count: number | undefined) {
  act(() => {
    root.render(<CountProbe count={count} token={token} />);
  });
}

function shown(): number {
  return Number(container.querySelector("output")?.textContent);
}

function optimistic(thread_token: string, optimistic_id: string) {
  emit_thread_reply_optimistic({
    thread_token,
    original_email_id: "orig",
    optimistic_id,
    sender_name: "Me",
    sender_email: "me@astermail.org",
    subject: "Re: hi",
    body: "<p>hi</p>",
    display_body: "hi",
    to_recipients: [],
    cc_recipients: [],
  });
}

describe("shown thread count while a reply is sending", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    reset_pending_thread_replies();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    reset_pending_thread_replies();
    vi.useRealTimers();
  });

  it("counts a reply the moment it is queued", () => {
    show("t1", 1);
    expect(shown()).toBe(1);
    act(() => optimistic("t1", "r1"));
    expect(shown()).toBe(2);
  });

  it("does not count the reply twice once the server includes it", () => {
    show("t1", 2);
    act(() => optimistic("t1", "r1"));
    expect(shown()).toBe(3);

    act(() =>
      emit_thread_reply_sent({ thread_token: "t1", optimistic_id: "r1" }),
    );
    show("t1", 3);
    expect(shown()).toBe(3);

    act(() => {
      vi.advanceTimersByTime(SETTLED_REPLY_TTL_MS + 1);
    });
    expect(shown()).toBe(3);
  });

  it("drops the reply when the send is undone or fails", () => {
    show("t1", 2);
    act(() => optimistic("t1", "r1"));
    expect(shown()).toBe(3);
    act(() =>
      emit_thread_reply_cancelled({ thread_token: "t1", optimistic_id: "r1" }),
    );
    expect(shown()).toBe(2);
  });

  it("leaves other conversations alone", () => {
    show("t2", 4);
    act(() => optimistic("t1", "r1"));
    expect(shown()).toBe(4);
  });

  it("counts several queued replies and ignores a repeated id", () => {
    show("t1", 1);
    act(() => {
      add_pending_thread_reply("t1", "a");
      add_pending_thread_reply("t1", "a");
      add_pending_thread_reply("t1", "b");
    });
    expect(shown()).toBe(3);
    act(() => remove_pending_thread_reply("a"));
    expect(shown()).toBe(2);
  });

  it("falls back to the server count after a sent reply settles", () => {
    show("t1", 1);
    act(() => add_pending_thread_reply("t1", "a"));
    act(() => settle_pending_thread_reply("a"));
    expect(shown()).toBe(2);
    act(() => {
      vi.advanceTimersByTime(SETTLED_REPLY_TTL_MS + 1);
    });
    expect(shown()).toBe(1);
  });

  it("shows the server count for rows without a conversation", () => {
    show(undefined, 5);
    expect(shown()).toBe(5);
  });
});
