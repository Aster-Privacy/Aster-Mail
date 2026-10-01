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
import type { CustomDomain } from "@/services/api/domains";

import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";

import {
  build_reply_from_address,
  resolve_received_on_alias,
  collect_recipient_emails,
  is_reply_from_mismatch,
  resolve_own_recipient_address,
} from "./build_reply_from_address";

import { set_catch_all_context } from "@/services/catch_all_sender";

const catch_all_domain = {
  id: "d1",
  domain_name: "example.com",
  status: "active",
  catch_all_enabled: true,
} as CustomDomain;

function delivered_to(...values: string[]) {
  return values.map((value) => ({ name: "Delivered-To", value }));
}

describe("build_reply_from_address with catch-all sending", () => {
  beforeEach(() => {
    vi.stubEnv("VITE_CATCH_ALL_SENDING", "true");
    set_catch_all_context(
      [
        catch_all_domain,
        {
          ...catch_all_domain,
          id: "d2",
          domain_name: "plain.example",
          catch_all_enabled: false,
        },
      ],
      ["me@astermail.org", "support@example.com", "off@example.com"],
    );
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    set_catch_all_context([], []);
  });

  it("keeps the alias the server recorded when Delivered-To differs", () => {
    expect(
      build_reply_from_address(
        {
          sender_email: "store@shop.example",
          received_on_alias: "orders@aster.cx",
          raw_headers: delivered_to("shopping@example.com"),
          to_emails: ["orders@aster.cx"],
        },
        false,
      ),
    ).toBe("orders@aster.cx");
  });

  it("uses Delivered-To for an unregistered address on a catch-all domain", () => {
    expect(
      build_reply_from_address(
        {
          sender_email: "store@shop.example",
          raw_headers: delivered_to("<Shopping@Example.com>"),
          to_emails: ["deals@lists.example"],
        },
        false,
      ),
    ).toBe("shopping@example.com");
  });

  it("ignores Delivered-To on a domain without catch-all", () => {
    expect(
      build_reply_from_address(
        {
          sender_email: "store@shop.example",
          raw_headers: delivered_to("shopping@plain.example"),
        },
        false,
      ),
    ).toBeUndefined();
  });

  it("leaves registered, disabled and dotted registered addresses to the usual rules", () => {
    for (const address of [
      "support@example.com",
      "off@example.com",
      "sup.port@example.com",
    ]) {
      expect(
        build_reply_from_address(
          { sender_email: "a@b.example", raw_headers: delivered_to(address) },
          false,
        ),
      ).toBeUndefined();
    }
    expect(
      build_reply_from_address(
        {
          sender_email: "a@b.example",
          raw_headers: delivered_to("shopping@example.com"),
          cc_emails: ["Support@Example.com"],
        },
        false,
      ),
    ).toBeUndefined();
  });

  it("reads only the topmost Delivered-To, so a lower forged one cannot win", () => {
    expect(
      build_reply_from_address(
        {
          sender_email: "a@b.example",
          raw_headers: delivered_to("shopping@example.com", "ceo@example.com"),
        },
        false,
      ),
    ).toBe("shopping@example.com");
    expect(
      build_reply_from_address(
        {
          sender_email: "a@b.example",
          raw_headers: delivered_to("me@gmail.example", "ceo@example.com"),
        },
        false,
      ),
    ).toBeUndefined();
  });

  it("matches main exactly when the flag is off", () => {
    vi.stubEnv("VITE_CATCH_ALL_SENDING", "false");
    expect(
      build_reply_from_address(
        {
          sender_email: "store@shop.example",
          raw_headers: delivered_to("shopping@example.com"),
        },
        false,
      ),
    ).toBeUndefined();
    expect(
      build_reply_from_address(
        {
          sender_email: "store@shop.example",
          received_on_alias: " orders@aster.cx ",
          raw_headers: delivered_to("shopping@example.com"),
        },
        false,
      ),
    ).toBe("orders@aster.cx");
  });
});

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
