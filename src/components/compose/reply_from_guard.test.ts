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
import type { SenderOption } from "@/hooks/use_sender_aliases";

import { describe, expect, it } from "vitest";

import { reply_from_guard_state } from "@/components/compose/reply_from_guard";

const primary: SenderOption = {
  id: "primary",
  email: "me@astermail.org",
  type: "primary",
  is_enabled: true,
};
const alias: SenderOption = {
  id: "a1",
  email: "shop@astermail.org",
  type: "alias",
  is_enabled: true,
};

describe("reply_from_guard_state", () => {
  it("asks before a reply leaves from another address than it arrived on", () => {
    const state = reply_from_guard_state({
      draft_type: "reply",
      thread_addresses: ["Shop@AsterMail.org"],
      sender_options: [primary, alias],
      selected_email: primary.email,
      sender_chosen: false,
    });

    expect(state.needs_confirm).toBe(true);
    expect(state.received_option?.id).toBe("a1");
  });

  it("stays quiet when From matches the received address", () => {
    const state = reply_from_guard_state({
      draft_type: "reply",
      thread_addresses: ["shop@astermail.org"],
      sender_options: [primary, alias],
      selected_email: "shop@astermail.org",
      sender_chosen: false,
    });

    expect(state.needs_confirm).toBe(false);
  });

  it("asks when the received address is unknown and several senders exist", () => {
    const state = reply_from_guard_state({
      draft_type: "reply",
      thread_addresses: ["someone@example.com"],
      sender_options: [primary, alias],
      selected_email: primary.email,
      sender_chosen: false,
    });

    expect(state.needs_confirm).toBe(true);
  });

  it("does not ask when the user picked From themselves", () => {
    const state = reply_from_guard_state({
      draft_type: "reply",
      thread_addresses: ["shop@astermail.org"],
      sender_options: [primary, alias],
      selected_email: primary.email,
      sender_chosen: true,
    });

    expect(state.needs_confirm).toBe(false);
  });

  it("ignores new mail and forwards", () => {
    for (const draft_type of [undefined, "new", "forward"]) {
      expect(
        reply_from_guard_state({
          draft_type,
          thread_addresses: ["shop@astermail.org"],
          sender_options: [primary, alias],
          selected_email: primary.email,
          sender_chosen: false,
        }).needs_confirm,
      ).toBe(false);
    }
  });
});
