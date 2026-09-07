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

import { detect_homoglyph, decode_punycode_domain } from "./homoglyph_detector";

describe("detect_homoglyph", () => {
  it("does not flag legitimate plain-ascii domains", () => {
    expect(detect_homoglyph("google.com").is_suspicious).toBe(false);
    expect(detect_homoglyph("apple.com").is_suspicious).toBe(false);
    expect(detect_homoglyph("paypal.com").is_suspicious).toBe(false);
  });

  it("does not flag legitimate brand subdomains", () => {
    expect(detect_homoglyph("accounts.google.com").is_suspicious).toBe(false);
    expect(detect_homoglyph("support.apple.com").is_suspicious).toBe(false);
    expect(detect_homoglyph("mail.google.com").is_suspicious).toBe(false);
  });

  it("flags a mixed-script first label", () => {
    const result = detect_homoglyph("gοοgle.com");

    expect(result.is_suspicious).toBe(true);
    expect(result.has_mixed_scripts).toBe(true);
  });

  it("flags a mixed-script non-first label", () => {
    const result = detect_homoglyph("login.gοοgle.com");

    expect(result.is_suspicious).toBe(true);
    expect(result.has_mixed_scripts).toBe(true);
  });

  it("flags a mixed-script label in a deep subdomain", () => {
    const result = detect_homoglyph("secure.paypaｌ.example.net");

    expect(result.has_mixed_scripts).toBe(true);
  });

  it("does not flag brand domains on other public suffixes", () => {
    expect(detect_homoglyph("amazon.de").is_suspicious).toBe(false);
    expect(detect_homoglyph("google.co.uk").is_suspicious).toBe(false);
    expect(detect_homoglyph("github.io").is_suspicious).toBe(false);
    expect(detect_homoglyph("paypal.me").is_suspicious).toBe(false);
  });

  it("does not flag a plain-ascii near miss of a brand", () => {
    expect(detect_homoglyph("gogle.com").is_suspicious).toBe(false);
  });

  it("flags a confusable-only label that normalizes to a brand", () => {
    const result = detect_homoglyph("раyраl.com");

    expect(result.is_suspicious).toBe(true);
    expect(result.matched_brand).toBe("paypal");
  });

  it("flags a punycode label that decodes to a confusable brand", () => {
    const result = detect_homoglyph("xn--80ak6aa92e.com");

    expect(result.is_suspicious).toBe(true);
    expect(result.matched_brand).toBe("apple");
    expect(result.original_domain).toBe("xn--80ak6aa92e.com");
  });

  it("flags a mixed-script punycode near miss", () => {
    const result = detect_homoglyph("xn--gogle-rce.com");

    expect(result.is_suspicious).toBe(true);
    expect(result.has_mixed_scripts).toBe(true);
  });

  it("decodes punycode labels and leaves ascii labels alone", () => {
    expect(decode_punycode_domain("xn--80ak6aa92e.com")).toBe("аррӏе.com");
    expect(decode_punycode_domain("xn--mnchen-3ya.de")).toBe("münchen.de");
    expect(decode_punycode_domain("example.com")).toBe("example.com");
  });
});
