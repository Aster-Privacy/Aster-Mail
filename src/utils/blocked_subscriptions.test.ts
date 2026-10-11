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
import { describe, it, expect } from "vitest";

import {
  EMPTY_BLOCKED_SENDER_INDEX,
  build_blocked_sender_index,
  is_sender_in_blocked_index,
  without_blocked_senders,
} from "./blocked_subscriptions";

function subscription(sender_email: string) {
  return { sender_email, status: "active" };
}

describe("blocked senders in the subscriptions list", () => {
  it("removes a subscription whose address is blocked", () => {
    const index = build_blocked_sender_index([
      { email: "news@shop.example", is_domain: false },
    ]);

    const visible = without_blocked_senders(
      [subscription("news@shop.example"), subscription("hello@other.example")],
      index,
    );

    expect(visible.map((entry) => entry.sender_email)).toEqual([
      "hello@other.example",
    ]);
  });

  it("matches addresses without regard to case or surrounding spaces", () => {
    const index = build_blocked_sender_index([
      { email: "  News@Shop.Example ", is_domain: false },
    ]);

    expect(is_sender_in_blocked_index("NEWS@shop.example", index)).toBe(true);
    expect(is_sender_in_blocked_index(" news@shop.example ", index)).toBe(true);
  });

  it("removes every sender on a blocked domain", () => {
    const index = build_blocked_sender_index([
      { email: "shop.example", is_domain: true },
    ]);

    expect(is_sender_in_blocked_index("news@shop.example", index)).toBe(true);
    expect(is_sender_in_blocked_index("deals@SHOP.example", index)).toBe(true);
    expect(is_sender_in_blocked_index("news@other.example", index)).toBe(false);
  });

  it("treats a blocked entry that starts with an at sign as a domain", () => {
    const index = build_blocked_sender_index([
      { email: "@shop.example", is_domain: false },
    ]);

    expect(is_sender_in_blocked_index("news@shop.example", index)).toBe(true);
  });

  it("does not match a different domain that only ends the same way", () => {
    const index = build_blocked_sender_index([
      { email: "shop.example", is_domain: true },
    ]);

    expect(is_sender_in_blocked_index("news@myshop.example", index)).toBe(
      false,
    );
    expect(is_sender_in_blocked_index("news@mail.shop.example", index)).toBe(
      false,
    );
  });

  it("does not let a blocked address hide other senders on its domain", () => {
    const index = build_blocked_sender_index([
      { email: "news@shop.example", is_domain: false },
    ]);

    expect(is_sender_in_blocked_index("orders@shop.example", index)).toBe(
      false,
    );
  });

  it("ignores blocked entries that could not be read", () => {
    const index = build_blocked_sender_index([
      { email: "", is_domain: false },
      { email: "", is_domain: true },
    ]);

    expect(index.addresses.size).toBe(0);
    expect(index.domains.size).toBe(0);
    expect(is_sender_in_blocked_index("", index)).toBe(false);
    expect(is_sender_in_blocked_index("news@shop.example", index)).toBe(false);
  });

  it("returns the same list when nothing is blocked", () => {
    const list = [subscription("news@shop.example")];

    expect(without_blocked_senders(list, EMPTY_BLOCKED_SENDER_INDEX)).toBe(
      list,
    );
  });
});
