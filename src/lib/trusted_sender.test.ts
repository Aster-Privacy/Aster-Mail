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
  is_astermail_sender,
  is_system_address,
  is_system_email,
} from "@/lib/utils";

const proven_system = { system_origin: true, is_external: false };

describe("is_astermail_sender", () => {
  it("accepts senders on verified aster domains", () => {
    expect(is_astermail_sender("Aster Mail", "hello@astermail.org")).toBe(true);
    expect(is_astermail_sender("Support", "support@aster.cx")).toBe(true);
  });

  it("does not trust an attacker-controlled display name", () => {
    expect(is_astermail_sender("Aster Mail", "attacker@evil.com")).toBe(false);
    expect(is_astermail_sender("Aster Mail", null)).toBe(false);
    expect(is_astermail_sender("Aster Mail", undefined)).toBe(false);
  });

  it("rejects look-alike, subdomain, and multi-@ spoofs", () => {
    expect(is_astermail_sender(null, "hello@astermail.org.evil.com")).toBe(
      false,
    );
    expect(is_astermail_sender(null, "hello@sub.astermail.org")).toBe(false);
    expect(is_astermail_sender(null, "hello@astermail.org@evil.com")).toBe(
      false,
    );
    expect(is_astermail_sender(null, "hello@notastermail.org")).toBe(false);
  });
});

describe("is_system_address", () => {
  it("accepts system roles on verified aster domains", () => {
    expect(is_system_address("noreply@astermail.org")).toBe(true);
    expect(is_system_address("no-reply@astermail.org")).toBe(true);
    expect(is_system_address("updates@aster.cx")).toBe(true);
    expect(is_system_address("mailer-daemon@astermail.org")).toBe(true);
    expect(is_system_address("postmaster@aster.cx")).toBe(true);
  });

  it("does not match system roles on attacker domains", () => {
    expect(is_system_address("mailer-daemon@evil.com")).toBe(false);
    expect(is_system_address("postmaster@attacker.com")).toBe(false);
    expect(is_system_address("noreply@evil.com")).toBe(false);
  });

  it("rejects look-alike, subdomain, and multi-@ spoofs", () => {
    expect(is_system_address("postmaster@astermail.org.evil.com")).toBe(false);
    expect(is_system_address("postmaster@sub.astermail.org")).toBe(false);
    expect(is_system_address("postmaster@astermail.org@evil.com")).toBe(false);
    expect(is_system_address("")).toBe(false);
    expect(is_system_address(null)).toBe(false);
  });
});

describe("is_system_email", () => {
  it("denies the system pill to inbound mail forging a system address", () => {
    expect(
      is_system_email({
        sender_email: "no-reply@astermail.org",
        is_external: true,
        system_origin: false,
      }),
    ).toBe(false);
    expect(
      is_system_email({
        sender_email: "mailer-daemon@astermail.org",
        is_external: true,
      }),
    ).toBe(false);
  });

  it("denies the system pill to internal mail a user composed", () => {
    expect(
      is_system_email({
        sender_email: "no-reply@astermail.org",
        is_external: false,
        system_origin: false,
      }),
    ).toBe(false);
  });

  it("denies the system pill when a signature is the only proof offered", () => {
    expect(
      is_system_email({
        sender_email: "no-reply@astermail.org",
        is_external: false,
        sender_verification: "verified",
      }),
    ).toBe(false);
  });

  it("grants the system pill only to server-generated mail", () => {
    expect(
      is_system_email({
        sender_email: "no-reply@astermail.org",
        ...proven_system,
      }),
    ).toBe(true);
    expect(
      is_system_email({ sender_email: "updates@aster.cx", ...proven_system }),
    ).toBe(true);
  });

  it("ignores server origin on an address that is not a system role", () => {
    expect(
      is_system_email({ sender_email: "user@astermail.org", ...proven_system }),
    ).toBe(false);
    expect(
      is_system_email({ sender_email: "noreply@evil.com", ...proven_system }),
    ).toBe(false);
  });

  it("reads the address from a nested sender object", () => {
    expect(
      is_system_email({
        sender: { email: "no-reply@astermail.org" },
        ...proven_system,
      }),
    ).toBe(true);
  });

  it("rejects an empty trust source", () => {
    expect(is_system_email({})).toBe(false);
  });
});
