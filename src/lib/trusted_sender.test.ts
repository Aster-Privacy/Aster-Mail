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

import { is_astermail_sender, is_system_email } from "@/lib/utils";

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
    expect(is_astermail_sender(null, "hello@astermail.org.evil.com")).toBe(false);
    expect(is_astermail_sender(null, "hello@sub.astermail.org")).toBe(false);
    expect(is_astermail_sender(null, "hello@astermail.org@evil.com")).toBe(false);
    expect(is_astermail_sender(null, "hello@notastermail.org")).toBe(false);
  });
});

describe("is_system_email", () => {
  it("accepts system roles on verified aster domains", () => {
    expect(is_system_email("noreply@astermail.org")).toBe(true);
    expect(is_system_email("no-reply@astermail.org")).toBe(true);
    expect(is_system_email("updates@aster.cx")).toBe(true);
    expect(is_system_email("mailer-daemon@astermail.org")).toBe(true);
    expect(is_system_email("postmaster@aster.cx")).toBe(true);
  });

  it("does not grant system trust to roles on attacker domains", () => {
    expect(is_system_email("mailer-daemon@evil.com")).toBe(false);
    expect(is_system_email("postmaster@attacker.com")).toBe(false);
    expect(is_system_email("noreply@evil.com")).toBe(false);
  });

  it("rejects look-alike, subdomain, and multi-@ spoofs", () => {
    expect(is_system_email("postmaster@astermail.org.evil.com")).toBe(false);
    expect(is_system_email("postmaster@sub.astermail.org")).toBe(false);
    expect(is_system_email("postmaster@astermail.org@evil.com")).toBe(false);
    expect(is_system_email("")).toBe(false);
    expect(is_system_email(null)).toBe(false);
  });
});
