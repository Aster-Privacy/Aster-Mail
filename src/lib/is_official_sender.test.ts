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

import { is_official_sender } from "@/lib/utils";

describe("is_official_sender", () => {
  it("accepts genuine official addresses on aster domains", () => {
    expect(is_official_sender("hello@astermail.org")).toBe(true);
    expect(is_official_sender("support@astermail.org")).toBe(true);
    expect(is_official_sender("no-reply@astermail.org")).toBe(true);
    expect(is_official_sender("noreply@astermail.org")).toBe(true);
    expect(is_official_sender("updates@aster.cx")).toBe(true);
  });

  it("is case-insensitive and trims surrounding whitespace", () => {
    expect(is_official_sender("HELLO@ASTERMAIL.ORG")).toBe(true);
    expect(is_official_sender("  hello@astermail.org  ")).toBe(true);
  });

  it("rejects non-official local parts on aster domains", () => {
    expect(is_official_sender("user@astermail.org")).toBe(false);
    expect(is_official_sender("billing-team@astermail.org")).toBe(false);
  });

  it("rejects official local parts on non-aster domains", () => {
    expect(is_official_sender("hello@evil.com")).toBe(false);
    expect(is_official_sender("hello@gmail.com")).toBe(false);
  });

  it("rejects look-alike and subdomain spoofs", () => {
    expect(is_official_sender("hello@astermail.org.evil.com")).toBe(false);
    expect(is_official_sender("hello@sub.astermail.org")).toBe(false);
    expect(is_official_sender("hello@astermail.org.")).toBe(false);
    expect(is_official_sender("hello@xn--astermail-evil.org")).toBe(false);
  });

  it("rejects multi-@ injection where the real domain is attacker controlled", () => {
    expect(is_official_sender("hello@astermail.org@evil.com")).toBe(false);
    expect(is_official_sender("evil@evil.com@astermail.org")).toBe(false);
    expect(is_official_sender("hello@@astermail.org")).toBe(false);
  });

  it("rejects malformed, empty, and missing values", () => {
    expect(is_official_sender("")).toBe(false);
    expect(is_official_sender(null)).toBe(false);
    expect(is_official_sender(undefined)).toBe(false);
    expect(is_official_sender("helloastermail.org")).toBe(false);
    expect(is_official_sender("hello @astermail.org")).toBe(false);
    expect(is_official_sender("@astermail.org")).toBe(false);
  });
});
