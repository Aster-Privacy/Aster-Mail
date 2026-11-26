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
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

vi.mock("@/lib/i18n/context", () => ({
  use_i18n: () => ({
    t: (key: string, vars?: Record<string, string>) =>
      vars?.recipients ? `${key}:${vars.recipients}` : key,
    language: "en",
  }),
}));

vi.mock("@/provider", () => ({ use_should_reduce_motion: () => true }));

const { FailedOpenPendingReplies, OfflineCopyNotice } =
  await import("./failed_open_pending_replies");
const {
  add_pending_reply_message,
  reset_pending_reply_messages,
  set_pending_reply_status,
} = await import("@/hooks/pending_reply_messages");

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLDivElement | null = null;

async function render(node: React.ReactNode) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(node);
  });

  return container;
}

function add_reply(optimistic_id: string, original_email_id: string) {
  add_pending_reply_message({
    optimistic_id,
    thread_token: "thread_1",
    original_email_id,
    sender_name: "Me",
    sender_email: "me@astermail.org",
    subject: "Re: hi",
    body: "<p>my <b>reply</b></p>",
    to_recipients: [{ name: "You", email: "you@astermail.org" }],
  });
}

describe("pending replies on a failed open", () => {
  beforeEach(() => {
    reset_pending_reply_messages();
  });

  afterEach(async () => {
    if (root) await act(async () => root!.unmount());
    container?.remove();
    root = null;
    container = null;
  });

  it("shows the pending reply with its recipients and send status", async () => {
    add_reply("p_reply", "email_1");
    set_pending_reply_status("p_reply", "offline", { retry: () => {} });

    const view = await render(
      <FailedOpenPendingReplies email_id="email_1" thread_token={undefined} />,
    );

    const card = view.querySelector(
      "[data-testid='failed-open-pending-reply']",
    );

    expect(card?.textContent).toContain("my reply");
    expect(card?.textContent).toContain("mail.to_recipients_prefix:You");
    expect(
      view.querySelector("[data-pending-send-phase='offline']"),
    ).not.toBeNull();
  });

  it("appears when a reply is queued after the error shows", async () => {
    const view = await render(
      <FailedOpenPendingReplies email_id="email_1" thread_token={undefined} />,
    );

    expect(
      view.querySelector("[data-testid='failed-open-pending-reply']"),
    ).toBeNull();

    await act(async () => {
      add_reply("p_reply", "email_1");
    });

    expect(
      view.querySelector("[data-testid='failed-open-pending-reply']"),
    ).not.toBeNull();
  });

  it("renders nothing for an email with no pending reply", async () => {
    add_reply("p_reply", "email_9");

    const view = await render(
      <FailedOpenPendingReplies email_id="email_1" thread_token="thread_2" />,
    );

    expect(view.textContent).toBe("");
  });

  it("says the thread is the copy saved on this device", async () => {
    const view = await render(<OfflineCopyNotice />);

    expect(view.querySelector("[role='status']")?.textContent).toContain(
      "mail.offline_saved_copy",
    );
  });
});
