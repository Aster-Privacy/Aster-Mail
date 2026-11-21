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
import type { InboxEmail } from "@/types/email";
import type { ReplyData } from "@/components/email/inbox/inbox_types";

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

const preloaded: {
  value: { email: Record<string, unknown> } | null;
} = { value: null };

vi.mock("@/components/email/hooks/preload_cache", () => ({
  get_preloaded_email: () => preloaded.value,
  await_preloaded_email: async () => preloaded.value,
  preload_email_detail: async () => {},
}));

vi.mock("@/components/settings/hooks/use_aliases", () => ({
  get_cached_aliases: () => [],
}));

vi.mock("@/hooks/use_sender_aliases", () => ({
  get_cached_alias_for_routing_token: () => undefined,
  get_cached_ghost_for_routing_token: () => undefined,
}));

vi.mock("@/services/forward_store", () => ({
  set_forward_mail_id: vi.fn(),
}));

vi.mock("@/components/email/delivery_reply_address", () => ({
  remember_forward_from: vi.fn(),
}));

vi.mock("@/assets/mail_logo.webp", () => ({ default: "logo.webp" }));

const { use_open_reply_compose } = await import("./use_open_reply_compose");

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const SENDER = "alice@astermail.org";
const OUTER_REPLY_TO = "other@example.net";

function list_email(): InboxEmail {
  return {
    id: "mail-reply-1",
    item_type: "received",
    sender_name: "Alice",
    sender_email: SENDER,
    subject: "Sealed subject",
    preview: "preview",
    timestamp: "2026-11-18T10:00:00.000Z",
    recipient_addresses: ["bob@astermail.org"],
    reply_to: { email: OUTER_REPLY_TO },
  } as unknown as InboxEmail;
}

let root: Root | null = null;
let container: HTMLDivElement | null = null;

async function open_reply(mode: "reply" | "reply_all"): Promise<ReplyData> {
  const on_reply = vi.fn();
  let open: ((m: "reply" | "reply_all", e: InboxEmail) => void) | null = null;

  function Probe() {
    open = use_open_reply_compose(on_reply, undefined, "bob@astermail.org");

    return null;
  }

  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(<Probe />);
  });
  await act(async () => {
    open!(mode, list_email());
    for (let i = 0; i < 8; i += 1) await Promise.resolve();
  });

  expect(on_reply).toHaveBeenCalledTimes(1);

  return on_reply.mock.calls[0][0] as ReplyData;
}

describe("reply from the message list", () => {
  beforeEach(() => {
    preloaded.value = null;
  });

  afterEach(() => {
    if (root) act(() => root!.unmount());
    container?.remove();
    root = null;
    container = null;
  });

  it("follows the settled headers when they carry no Reply-To", async () => {
    preloaded.value = {
      email: {
        body: "sealed plaintext",
        cc: [],
        raw_headers: [{ name: "From", value: SENDER }],
      },
    };

    for (const mode of ["reply", "reply_all"] as const) {
      const data = await open_reply(mode);

      expect(data.recipient_email).toBe(SENDER);
      act(() => root!.unmount());
      root = null;
    }
  });

  it("uses the Reply-To from the settled headers", async () => {
    preloaded.value = {
      email: {
        body: "plain body",
        cc: [],
        raw_headers: [
          { name: "From", value: SENDER },
          { name: "Reply-To", value: "list@example.org" },
        ],
      },
    };

    const data = await open_reply("reply");

    expect(data.recipient_email).toBe("list@example.org");
  });
});
