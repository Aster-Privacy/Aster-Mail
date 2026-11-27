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
  use_i18n: () => ({ t: (key: string) => key, language: "en" }),
}));

vi.mock("@/provider", () => ({ use_should_reduce_motion: () => true }));

const { PendingSendStatus } = await import("./pending_send_status");
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

async function render_status(message_id: string) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(<PendingSendStatus message_id={message_id} />);
  });

  return container;
}

function add_reply(optimistic_id: string) {
  add_pending_reply_message({
    optimistic_id,
    thread_token: "thread_1",
    original_email_id: "email_1",
    sender_name: "Me",
    sender_email: "me@astermail.org",
    subject: "Re: hi",
    body: "<p>reply</p>",
    to_recipients: [{ name: "You", email: "you@astermail.org" }],
  });
}

function class_list(element: Element | null | undefined): string[] {
  return (element?.getAttribute("class") ?? "").split(/\s+/);
}

describe("PendingSendStatus alignment", () => {
  beforeEach(() => {
    reset_pending_reply_messages();
  });

  afterEach(async () => {
    if (root) await act(async () => root!.unmount());
    container?.remove();
    root = null;
    container = null;
  });

  it.each(["sending", "offline", "failed"] as const)(
    "centers the %s icon in a box as tall as the label line",
    async (phase) => {
      add_reply("p_reply");
      if (phase !== "sending") set_pending_reply_status("p_reply", phase);

      const view = await render_status("p_reply");
      const icon_box = view.querySelector("[data-testid='pending-send-icon']");
      const icon = icon_box?.querySelector("svg");
      const label = icon_box?.nextElementSibling;

      expect(
        view.querySelector(`[data-pending-send-phase='${phase}']`),
      ).not.toBeNull();
      expect(class_list(icon_box)).toEqual(
        expect.arrayContaining([
          "flex",
          "h-4",
          "w-4",
          "items-center",
          "justify-center",
        ]),
      );
      expect(class_list(icon)).toEqual(
        expect.arrayContaining(["block", "h-3.5", "w-3.5"]),
      );
      expect(class_list(label)).toContain("leading-4");
    },
  );

  it("renders nothing without a pending reply", async () => {
    const view = await render_status("missing");

    expect(view.querySelector("[role='status']")).toBeNull();
  });
});
