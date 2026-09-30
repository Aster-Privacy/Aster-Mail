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
  is_official_address,
  is_official_sender,
  trust_source_for_display,
} from "@/lib/utils";

const proven_system = { system_origin: true, is_external: false };
const proven_human = {
  is_external: false,
  sender_verification: "verified" as const,
};

describe("is_official_address", () => {
  it("accepts genuine official addresses on aster domains", () => {
    expect(is_official_address("hello@astermail.org")).toBe(true);
    expect(is_official_address("support@astermail.org")).toBe(true);
    expect(is_official_address("no-reply@astermail.org")).toBe(true);
    expect(is_official_address("noreply@astermail.org")).toBe(true);
    expect(is_official_address("updates@aster.cx")).toBe(true);
  });

  it("is case-insensitive and trims surrounding whitespace", () => {
    expect(is_official_address("HELLO@ASTERMAIL.ORG")).toBe(true);
    expect(is_official_address("  hello@astermail.org  ")).toBe(true);
  });

  it("rejects non-official local parts on aster domains", () => {
    expect(is_official_address("user@astermail.org")).toBe(false);
    expect(is_official_address("billing-team@astermail.org")).toBe(false);
  });

  it("rejects official local parts on non-aster domains", () => {
    expect(is_official_address("hello@evil.com")).toBe(false);
    expect(is_official_address("hello@gmail.com")).toBe(false);
  });

  it("rejects look-alike and subdomain spoofs", () => {
    expect(is_official_address("hello@astermail.org.evil.com")).toBe(false);
    expect(is_official_address("hello@sub.astermail.org")).toBe(false);
    expect(is_official_address("hello@astermail.org.")).toBe(false);
    expect(is_official_address("hello@xn--astermail-evil.org")).toBe(false);
  });

  it("rejects multi-@ injection where the real domain is attacker controlled", () => {
    expect(is_official_address("hello@astermail.org@evil.com")).toBe(false);
    expect(is_official_address("evil@evil.com@astermail.org")).toBe(false);
    expect(is_official_address("hello@@astermail.org")).toBe(false);
  });

  it("rejects malformed, empty, and missing values", () => {
    expect(is_official_address("")).toBe(false);
    expect(is_official_address(null)).toBe(false);
    expect(is_official_address(undefined)).toBe(false);
    expect(is_official_address("helloastermail.org")).toBe(false);
    expect(is_official_address("hello @astermail.org")).toBe(false);
    expect(is_official_address("@astermail.org")).toBe(false);
  });
});

describe("is_official_sender", () => {
  it("denies the badge to a spoofed inbound message claiming an official address", () => {
    expect(
      is_official_sender({
        sender_email: "no-reply@astermail.org",
        is_external: true,
        system_origin: false,
      }),
    ).toBe(false);
  });

  it("denies the badge when the address alone is the only evidence", () => {
    expect(is_official_sender({ sender_email: "hello@astermail.org" })).toBe(
      false,
    );
  });

  it("denies the badge to unverified and invalid signatures", () => {
    for (const sender_verification of [
      "unsigned",
      "invalid",
      "no_keys",
      "unknown",
    ] as const) {
      expect(
        is_official_sender({
          sender_email: "hello@astermail.org",
          is_external: false,
          sender_verification,
        }),
      ).toBe(false);
    }
  });

  it("grants the badge to server-generated system mail", () => {
    expect(
      is_official_sender({
        sender_email: "no-reply@astermail.org",
        ...proven_system,
      }),
    ).toBe(true);
  });

  it("grants the badge to a cryptographically verified official sender", () => {
    expect(
      is_official_sender({
        sender_email: "hello@astermail.org",
        ...proven_human,
      }),
    ).toBe(true);
  });

  it("ignores proof carried by a message from a non-official address", () => {
    expect(
      is_official_sender({
        sender_email: "user@astermail.org",
        ...proven_system,
      }),
    ).toBe(false);
    expect(
      is_official_sender({ sender_email: "hello@evil.com", ...proven_system }),
    ).toBe(false);
  });

  it("never trusts system_origin that arrives on an external message", () => {
    expect(
      is_official_sender({
        sender_email: "no-reply@astermail.org",
        system_origin: true,
        is_external: true,
      }),
    ).toBe(false);
  });
});

describe("trust_source_for_display", () => {
  it("keeps the proof when the displayed address is the authenticated one", () => {
    const source = { sender_email: "hello@astermail.org", ...proven_system };

    expect(
      is_official_sender(
        trust_source_for_display(source, "hello@astermail.org"),
      ),
    ).toBe(true);
    expect(
      is_official_sender(
        trust_source_for_display(source, "  HELLO@astermail.org "),
      ),
    ).toBe(true);
  });

  it("drops the proof when a substituted address is displayed", () => {
    const source = { sender_email: "hello@astermail.org", ...proven_system };

    expect(
      is_official_sender(
        trust_source_for_display(source, "support@astermail.org"),
      ),
    ).toBe(false);
  });
});
