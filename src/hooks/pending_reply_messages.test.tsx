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

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";

import {
  MAIL_EVENTS,
  emit_thread_reply_cancelled,
  emit_thread_reply_optimistic,
  emit_thread_reply_sent,
} from "./mail_events";
import {
  SETTLED_REPLY_MESSAGE_TTL_MS,
  reset_pending_reply_messages,
  use_pending_reply_messages,
} from "./pending_reply_messages";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const START = new Date("2026-10-12T10:00:00.000Z");

function server_message(
  id: string,
  item_type: "received" | "sent",
  timestamp: string,
): DecryptedThreadMessage {
  return {
    id,
    item_type,
    sender_name: "Someone",
    sender_email: "someone@astermail.org",
    subject: "hi",
    body: "<p>hi</p>",
    timestamp,
    is_read: true,
    is_starred: false,
    is_deleted: false,
    is_external: false,
  };
}

const ORIGINAL = server_message("orig", "received", "2026-10-12T09:00:00.000Z");
const OTHER = server_message("other", "received", "2026-10-12T08:00:00.000Z");

let replace_messages: (next: DecryptedThreadMessage[]) => void = () => {};

interface ProbeProps {
  thread_token: string | undefined;
  email_id: string;
  enabled?: boolean;
  reload_drops_pending?: boolean;
  initial: DecryptedThreadMessage[];
}

function ThreadProbe({
  thread_token,
  email_id,
  enabled = true,
  reload_drops_pending,
  initial,
}: ProbeProps) {
  const [thread_messages, set_thread_messages] = useState(initial);

  replace_messages = set_thread_messages;
  use_pending_reply_messages({
    thread_token,
    email_id,
    enabled,
    reload_drops_pending,
    thread_messages,
    set_thread_messages,
  });

  return <output>{thread_messages.map((m) => m.id).join(",")}</output>;
}

let container: HTMLDivElement;
let root: Root;

function mount(props: ProbeProps) {
  act(() => {
    root.render(<ThreadProbe key={`${props.email_id}`} {...props} />);
  });
}

function remount(props: ProbeProps) {
  act(() => {
    root.unmount();
  });
  root = createRoot(container);
  mount(props);
}

function shown(): string {
  return container.querySelector("output")?.textContent ?? "";
}

function optimistic(
  thread_token: string,
  optimistic_id: string,
  original_email_id: string | undefined = "orig",
) {
  act(() => {
    emit_thread_reply_optimistic({
      thread_token,
      original_email_id,
      optimistic_id,
      sender_name: "Me",
      sender_email: "me@astermail.org",
      subject: "Re: hi",
      body: "<p>reply</p>",
      display_body: "reply",
      to_recipients: [],
      cc_recipients: [],
    });
  });
}

function sent(thread_token: string, optimistic_id: string) {
  act(() => {
    emit_thread_reply_sent({ thread_token, optimistic_id });
  });
}

describe("pending reply stays in the thread", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(START);
    reset_pending_reply_messages();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    reset_pending_reply_messages();
    vi.useRealTimers();
  });

  it("shows the reply as soon as it is queued", () => {
    mount({ thread_token: "t1", email_id: "orig", initial: [ORIGINAL] });
    optimistic("t1", "opt-1");

    expect(shown()).toBe("orig,opt-1");
  });

  it("shows the reply again when the thread is reopened", () => {
    mount({ thread_token: "t1", email_id: "orig", initial: [ORIGINAL] });
    optimistic("t1", "opt-1");

    remount({ thread_token: "t2", email_id: "other", initial: [OTHER] });
    expect(shown()).toBe("other");

    remount({ thread_token: "t1", email_id: "orig", initial: [ORIGINAL] });
    expect(shown()).toBe("orig,opt-1");
  });

  it("shows the reply again after the thread reloads from the server", () => {
    mount({ thread_token: "t1", email_id: "orig", initial: [ORIGINAL] });
    optimistic("t1", "opt-1");

    act(() => replace_messages([ORIGINAL]));
    expect(shown()).toBe("orig,opt-1");

    act(() => replace_messages([]));
    expect(shown()).toBe("");

    act(() => replace_messages([ORIGINAL]));
    expect(shown()).toBe("orig,opt-1");
  });

  it("matches a first reply by the opened message when no thread exists yet", () => {
    mount({ thread_token: undefined, email_id: "orig", initial: [ORIGINAL] });
    optimistic("new-thread", "opt-1");

    expect(shown()).toBe("orig,opt-1");
  });

  it("keeps the reply out of another conversation", () => {
    mount({ thread_token: "t2", email_id: "other", initial: [OTHER] });
    optimistic("t1", "opt-1");

    expect(shown()).toBe("other");
  });

  it("keeps the reply out of a list that still shows another message", () => {
    mount({ thread_token: undefined, email_id: "orig", initial: [OTHER] });
    optimistic("t1", "opt-1");

    expect(shown()).toBe("other");
  });

  it("never adds the same reply twice", () => {
    mount({ thread_token: "t1", email_id: "orig", initial: [ORIGINAL] });
    optimistic("t1", "opt-1");
    optimistic("t1", "opt-1");
    act(() => replace_messages([ORIGINAL]));

    expect(shown()).toBe("orig,opt-1");
  });

  it("shows nothing when conversations are not grouped", () => {
    mount({
      thread_token: "t1",
      email_id: "orig",
      enabled: false,
      initial: [ORIGINAL],
    });
    optimistic("t1", "opt-1");

    expect(shown()).toBe("orig");
  });

  it("removes the reply when the send is canceled", () => {
    mount({ thread_token: "t1", email_id: "orig", initial: [ORIGINAL] });
    optimistic("t1", "opt-1");

    act(() => {
      emit_thread_reply_cancelled({
        optimistic_id: "opt-1",
        thread_token: "t1",
      });
    });
    expect(shown()).toBe("orig");

    remount({ thread_token: "t1", email_id: "orig", initial: [ORIGINAL] });
    expect(shown()).toBe("orig");
  });

  it("removes the reply when the send is undone", () => {
    mount({ thread_token: undefined, email_id: "orig", initial: [ORIGINAL] });
    optimistic("t1", "opt-1");
    expect(shown()).toBe("orig,opt-1");

    act(() => {
      window.dispatchEvent(
        new CustomEvent(MAIL_EVENTS.UNDO_SEND, {
          detail: { pending: { optimistic_id: "opt-1", thread_token: "t1" } },
        }),
      );
    });

    expect(shown()).toBe("orig");
  });

  it("does not duplicate the reply once the sent copy has loaded", () => {
    mount({ thread_token: "t1", email_id: "orig", initial: [ORIGINAL] });
    optimistic("t1", "opt-1");
    sent("t1", "opt-1");

    const sent_copy = server_message("srv-1", "sent", START.toISOString());

    remount({
      thread_token: "t1",
      email_id: "orig",
      initial: [ORIGINAL, sent_copy],
    });

    expect(shown()).toBe("orig,srv-1");
  });

  it("keeps showing the reply until the sent copy arrives", () => {
    mount({ thread_token: "t1", email_id: "orig", initial: [ORIGINAL] });
    optimistic("t1", "opt-1");
    sent("t1", "opt-1");

    remount({ thread_token: "t1", email_id: "orig", initial: [ORIGINAL] });
    expect(shown()).toBe("orig,opt-1");

    act(() => {
      vi.advanceTimersByTime(SETTLED_REPLY_MESSAGE_TTL_MS + 1);
    });
    expect(shown()).toBe("orig");
  });

  it("restores a sent reply on a viewer that reloads the whole list", () => {
    mount({
      thread_token: "t1",
      email_id: "orig",
      reload_drops_pending: true,
      initial: [ORIGINAL],
    });
    optimistic("t1", "opt-1");
    sent("t1", "opt-1");

    act(() => replace_messages([ORIGINAL]));
    expect(shown()).toBe("orig,opt-1");

    act(() =>
      replace_messages([
        ORIGINAL,
        server_message("srv-1", "sent", START.toISOString()),
      ]),
    );
    expect(shown()).toBe("orig,srv-1");
  });

  it("leaves a sent reply alone after the viewer reconciled it away", () => {
    mount({ thread_token: "t1", email_id: "orig", initial: [ORIGINAL] });
    optimistic("t1", "opt-1");
    sent("t1", "opt-1");

    act(() =>
      replace_messages([
        ORIGINAL,
        server_message("srv-1", "sent", "2026-10-12T09:30:00.000Z"),
      ]),
    );

    expect(shown()).toBe("orig,srv-1");
  });
});
