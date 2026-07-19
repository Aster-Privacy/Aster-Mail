//
// Aster Communications Inc.
//
// Copyright (c) 2026 Aster Communications Inc.
//
// This file is part of this project.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
// GNU Affero General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License
// along with this program. If not, see <https://www.gnu.org/licenses/>.
//
import { describe, it, expect } from "vitest";

import {
  build_reply_from_address,
  resolve_received_on_alias,
  collect_recipient_emails,
  is_reply_from_mismatch,
  resolve_own_recipient_address,
} from "./build_reply_from_address";

describe("build_reply_from_address", () => {
  it("returns sender_email for own message (replying continues alias)", () => {
    expect(
      build_reply_from_address({ sender_email: "alias@my.example" }, true),
    ).toBe("alias@my.example");
  });

  it("returns undefined for incoming message with no received-on alias", () => {
    expect(
      build_reply_from_address({ sender_email: "stranger@x.example" }, false),
    ).toBeUndefined();
  });

  it("returns the received-on alias for an incoming message when matched", () => {
    expect(
      build_reply_from_address(
        {
          sender_email: "stranger@x.example",
          received_on_alias: "shopping@my.example",
        },
        false,
      ),
    ).toBe("shopping@my.example");
  });

  it("returns undefined when own message has no sender_email", () => {
    expect(
      build_reply_from_address({ sender_email: "" }, true),
    ).toBeUndefined();
    expect(
      build_reply_from_address({ sender_email: "   " }, true),
    ).toBeUndefined();
  });
});

describe("resolve_own_recipient_address", () => {
  const own = ["me@astermail.org", "shopping@aster.cx"];

  it("finds the owned alias among the recipients", () => {
    expect(
      resolve_own_recipient_address(
        ["stranger@x.example", "Shopping@Aster.CX"],
        own,
      ),
    ).toBe("Shopping@Aster.CX");
  });

  it("returns undefined when no recipient is owned", () => {
    expect(
      resolve_own_recipient_address(
        ["simplelogin.alias.traffic496@simplelogin.com"],
        own,
      ),
    ).toBeUndefined();
  });

  it("handles missing input", () => {
    expect(resolve_own_recipient_address(undefined, own)).toBeUndefined();
    expect(resolve_own_recipient_address([], own)).toBeUndefined();
    expect(
      resolve_own_recipient_address(["me@astermail.org"], []),
    ).toBeUndefined();
  });
});

describe("is_reply_from_mismatch", () => {
  it("flags a reply from a different alias than the one that received it", () => {
    expect(
      is_reply_from_mismatch(
        "testing7363672g@aster.cx",
        "2nd.testing.mail8383@astermail.org",
      ),
    ).toBe(true);
  });

  it("flags a reply from the primary address when received on an alias", () => {
    expect(
      is_reply_from_mismatch("shopping@aster.cx", "me@astermail.org"),
    ).toBe(true);
  });

  it("accepts the received-on alias case-insensitively with whitespace", () => {
    expect(
      is_reply_from_mismatch(
        " Testing7363672g@Aster.CX ",
        "testing7363672g@aster.cx",
      ),
    ).toBe(false);
  });

  it("stays quiet when the received-on alias is unknown", () => {
    expect(is_reply_from_mismatch(undefined, "me@astermail.org")).toBe(false);
    expect(is_reply_from_mismatch("", "me@astermail.org")).toBe(false);
    expect(is_reply_from_mismatch("   ", "me@astermail.org")).toBe(false);
  });

  it("stays quiet when no sender is selected yet", () => {
    expect(is_reply_from_mismatch("shopping@aster.cx", undefined)).toBe(false);
    expect(is_reply_from_mismatch("shopping@aster.cx", "")).toBe(false);
  });
});

describe("resolve_received_on_alias", () => {
  const aliases = [
    { alias_address_hash: "HASH_A", full_address: "shopping@my.example" },
    { alias_address_hash: "HASH_B", full_address: "news@my.example" },
  ];

  it("returns the alias whose hash matches the routing token", () => {
    expect(resolve_received_on_alias("HASH_B", aliases)).toBe(
      "news@my.example",
    );
  });

  it("returns undefined when the routing token is missing", () => {
    expect(resolve_received_on_alias(undefined, aliases)).toBeUndefined();
  });

  it("returns undefined when no alias matches the token", () => {
    expect(resolve_received_on_alias("HASH_X", aliases)).toBeUndefined();
  });
});

describe("collect_recipient_emails", () => {
  it("merges to and cc preserving order", () => {
    expect(
      collect_recipient_emails(["a@x.example", "b@x.example"], ["c@x.example"]),
    ).toEqual(["a@x.example", "b@x.example", "c@x.example"]);
  });

  it("deduplicates case-insensitively", () => {
    expect(
      collect_recipient_emails(
        ["Alias@My.Example", "other@x.example"],
        ["alias@my.example"],
      ),
    ).toEqual(["Alias@My.Example", "other@x.example"]);
  });

  it("ignores empty strings and trims", () => {
    expect(
      collect_recipient_emails(["  a@x.example  ", "", "  "], undefined),
    ).toEqual(["a@x.example"]);
  });

  it("returns empty array when both lists are missing", () => {
    expect(collect_recipient_emails(undefined, undefined)).toEqual([]);
  });
});
