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
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  build_forward_from_candidates,
  remember_forward_from_message,
  resolve_received_reply_from,
} from "@/components/email/delivery_reply_address";
import { resolve_from_sender } from "@/components/compose/resolve_from_sender";
import {
  clear_forward_mail_id,
  get_forward_from_candidates,
} from "@/services/forward_store";

const cached = vi.hoisted(() => ({
  aliases: [] as { alias_address_hash: string; full_address: string }[],
  alias_by_token: {} as Record<string, string>,
  ghost_by_token: {} as Record<string, string>,
}));

vi.mock("@/components/settings/hooks/use_aliases", () => ({
  get_cached_aliases: () => cached.aliases,
}));

vi.mock("@/hooks/use_sender_aliases", () => ({
  get_cached_alias_for_routing_token: (token: string | undefined) =>
    token ? cached.alias_by_token[token] : undefined,
  get_cached_ghost_for_routing_token: (token: string | undefined) =>
    token ? cached.ghost_by_token[token] : undefined,
}));

vi.mock("@/services/catch_all_sender", () => ({
  catch_all_reply_address: () => undefined,
}));

const own_addresses = ["primary@astermail.org", "shop@astermail.org"];

describe("resolve_received_reply_from", () => {
  beforeEach(() => {
    cached.aliases = [];
    cached.alias_by_token = {};
    cached.ghost_by_token = {};
  });

  it("uses the receiving alias when it is absent from the visible recipients", () => {
    cached.aliases = [
      { alias_address_hash: "token-shop", full_address: "shop@astermail.org" },
    ];

    expect(
      resolve_received_reply_from(
        {
          routing_token: "token-shop",
          to_emails: ["list@example.com"],
          cc_emails: [],
        },
        own_addresses,
      ),
    ).toBe("shop@astermail.org");
  });

  it("prefers the receiving alias over the primary address in the recipients", () => {
    cached.alias_by_token = { "token-shop": "shop@astermail.org" };

    expect(
      resolve_received_reply_from(
        {
          routing_token: "token-shop",
          to_emails: ["primary@astermail.org", "shop@astermail.org"],
        },
        own_addresses,
      ),
    ).toBe("shop@astermail.org");
  });

  it("uses the receiving ghost address", () => {
    cached.ghost_by_token = { "token-ghost": "quiet.fox@astermail.org" };

    expect(
      resolve_received_reply_from(
        { routing_token: "token-ghost", to_emails: ["list@example.com"] },
        own_addresses,
      ),
    ).toBe("quiet.fox@astermail.org");
  });

  it("falls back to an own visible recipient when the token is unknown", () => {
    expect(
      resolve_received_reply_from(
        { routing_token: "token-unknown", to_emails: ["shop@astermail.org"] },
        own_addresses,
      ),
    ).toBe("shop@astermail.org");
  });

  it("returns nothing when no own address received the message", () => {
    expect(
      resolve_received_reply_from(
        { to_emails: ["list@example.com"] },
        own_addresses,
      ),
    ).toBeUndefined();
  });
});

describe("build_forward_from_candidates", () => {
  const options = [
    { id: "primary", email: "primary@astermail.org", type: "primary" },
    { id: "alias-shop", email: "shop@astermail.org", type: "alias" },
  ];

  beforeEach(() => {
    cached.aliases = [];
    cached.alias_by_token = {};
    cached.ghost_by_token = {};
    clear_forward_mail_id();
  });

  it("lists the receiving alias first so forward defaults to it", () => {
    cached.alias_by_token = { "token-shop": "shop@astermail.org" };

    const candidates = build_forward_from_candidates({
      is_own_message: false,
      routing_token: "token-shop",
      to_emails: ["primary@astermail.org"],
    });

    expect(candidates[0]).toBe("shop@astermail.org");
    expect(
      resolve_from_sender({
        options,
        thread_addresses: candidates,
        preferred_sender_id: "primary",
      })?.option.id,
    ).toBe("alias-shop");
  });

  it("keeps the sending address for a sent message", () => {
    expect(
      build_forward_from_candidates({
        is_own_message: true,
        sender_email: "shop@astermail.org",
        to_emails: ["friend@example.com"],
      }),
    ).toEqual(["shop@astermail.org"]);
  });

  it("leaves the default sender when no own address received the message", () => {
    const candidates = build_forward_from_candidates({
      is_own_message: false,
      to_emails: ["list@example.com"],
    });

    expect(
      resolve_from_sender({
        options,
        thread_addresses: candidates,
        preferred_sender_id: "primary",
      })?.option.id,
    ).toBe("primary");
  });

  it("stores candidates for the forwarded message only", () => {
    cached.alias_by_token = { "token-shop": "shop@astermail.org" };

    remember_forward_from_message({
      id: "mail-1",
      item_type: "received",
      routing_token: "token-shop",
      to_recipients: [{ email: "list@example.com" }],
    });

    expect(get_forward_from_candidates("mail-1")).toEqual([
      "shop@astermail.org",
      "list@example.com",
    ]);
    expect(get_forward_from_candidates("mail-2")).toEqual([]);

    clear_forward_mail_id();

    expect(get_forward_from_candidates("mail-1")).toEqual([]);
  });
});
