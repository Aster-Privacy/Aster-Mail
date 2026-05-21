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
  ASTER_SUBJECT_BUNDLE_PREFIX,
  build_subject_bundle,
  extract_subject_bundle,
} from "./email_crypto";

function encode_bundle(subject: string, body: string): string {
  return ASTER_SUBJECT_BUNDLE_PREFIX + JSON.stringify({ s: subject, b: body });
}

describe("build_subject_bundle round trip", () => {
  it("recovers subject and body for ascii content", () => {
    const encoded = build_subject_bundle("Re: invoice", "see attached");
    const result = extract_subject_bundle(encoded);
    expect(result.subject).toBe("Re: invoice");
    expect(result.body).toBe("see attached");
  });

  it("recovers subject and body for html content", () => {
    const body = "<p>hi <b>there</b></p>";
    const encoded = build_subject_bundle("hi", body);
    const result = extract_subject_bundle(encoded);
    expect(result.subject).toBe("hi");
    expect(result.body).toBe(body);
  });

  it("recovers content with unicode and newlines", () => {
    const subject = "café ☕";
    const body = "line1\nline2\n\"quoted\"\t🚀";
    const encoded = build_subject_bundle(subject, body);
    const result = extract_subject_bundle(encoded);
    expect(result.subject).toBe(subject);
    expect(result.body).toBe(body);
  });

  it("recovers empty subject", () => {
    const encoded = build_subject_bundle("", "body only");
    const result = extract_subject_bundle(encoded);
    expect(result.subject).toBe("");
    expect(result.body).toBe("body only");
  });

  it("recovers empty body", () => {
    const encoded = build_subject_bundle("subject only", "");
    const result = extract_subject_bundle(encoded);
    expect(result.subject).toBe("subject only");
    expect(result.body).toBe("");
  });

  it("produces output recognized by the extractor prefix check", () => {
    const encoded = build_subject_bundle("anything", "anything");
    expect(encoded.startsWith(ASTER_SUBJECT_BUNDLE_PREFIX)).toBe(true);
  });
});

describe("extract_subject_bundle", () => {
  it("returns subject null when no prefix present", () => {
    const result = extract_subject_bundle("plain body text");
    expect(result.subject).toBeNull();
    expect(result.body).toBe("plain body text");
  });

  it("returns subject null for empty input", () => {
    const result = extract_subject_bundle("");
    expect(result.subject).toBeNull();
    expect(result.body).toBe("");
  });

  it("extracts subject and body from a valid bundle", () => {
    const encoded = encode_bundle("hello world", "<p>body</p>");
    const result = extract_subject_bundle(encoded);
    expect(result.subject).toBe("hello world");
    expect(result.body).toBe("<p>body</p>");
  });

  it("preserves unicode in subject and body", () => {
    const encoded = encode_bundle("café ☕ 你好", "body with 🚀");
    const result = extract_subject_bundle(encoded);
    expect(result.subject).toBe("café ☕ 你好");
    expect(result.body).toBe("body with 🚀");
  });

  it("preserves embedded quotes and newlines", () => {
    const subject = 'a "quoted" subject';
    const body = "line1\nline2\t\"quoted\"";
    const encoded = encode_bundle(subject, body);
    const result = extract_subject_bundle(encoded);
    expect(result.subject).toBe(subject);
    expect(result.body).toBe(body);
  });

  it("falls back when prefix is present but payload is not valid json", () => {
    const malformed = ASTER_SUBJECT_BUNDLE_PREFIX + "not json";
    const result = extract_subject_bundle(malformed);
    expect(result.subject).toBeNull();
    expect(result.body).toBe(malformed);
  });

  it("falls back when payload is json but lacks required fields", () => {
    const wrong_shape = ASTER_SUBJECT_BUNDLE_PREFIX + JSON.stringify({ x: 1 });
    const result = extract_subject_bundle(wrong_shape);
    expect(result.subject).toBeNull();
    expect(result.body).toBe(wrong_shape);
  });

  it("falls back when fields are wrong types", () => {
    const wrong_types =
      ASTER_SUBJECT_BUNDLE_PREFIX + JSON.stringify({ s: 1, b: "ok" });
    const result = extract_subject_bundle(wrong_types);
    expect(result.subject).toBeNull();
    expect(result.body).toBe(wrong_types);
  });

  it("does not match when prefix appears mid-string", () => {
    const mid =
      "leading text " + ASTER_SUBJECT_BUNDLE_PREFIX + JSON.stringify({ s: "x", b: "y" });
    const result = extract_subject_bundle(mid);
    expect(result.subject).toBeNull();
    expect(result.body).toBe(mid);
  });

  it("accepts empty subject string", () => {
    const encoded = encode_bundle("", "body only");
    const result = extract_subject_bundle(encoded);
    expect(result.subject).toBe("");
    expect(result.body).toBe("body only");
  });
});
