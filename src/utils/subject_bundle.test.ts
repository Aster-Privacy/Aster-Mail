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
  ASTER_SUBJECT_BUNDLE_MARKER,
  ASTER_SUBJECT_BUNDLE_PREFIX,
  build_subject_bundle,
  extract_subject_bundle,
  unwrap_bundle_html,
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
    const body = 'line1\nline2\n"quoted"\t🚀';
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

  it("does not nest when the body is already a bundle", () => {
    const already = build_subject_bundle("first", "<p>body</p>");
    const rewrapped = build_subject_bundle("first", already);

    expect(rewrapped).toBe(already);
    const result = extract_subject_bundle(rewrapped);

    expect(result.subject).toBe("first");
    expect(result.body).toBe("<p>body</p>");
  });

  it("keeps the inner subject when rewrapping without one", () => {
    const already = build_subject_bundle("kept subject", "<p>body</p>");
    const result = extract_subject_bundle(build_subject_bundle("", already));

    expect(result.subject).toBe("kept subject");
    expect(result.body).toBe("<p>body</p>");
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
    const body = 'line1\nline2\t"quoted"';
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

  it("recovers the body when the subject field is the wrong type", () => {
    const wrong_types =
      ASTER_SUBJECT_BUNDLE_PREFIX + JSON.stringify({ s: 1, b: "ok" });
    const result = extract_subject_bundle(wrong_types);

    expect(result.subject).toBe("");
    expect(result.body).toBe("ok");
  });

  it("does not match when prefix appears mid-string", () => {
    const mid =
      "leading text " +
      ASTER_SUBJECT_BUNDLE_PREFIX +
      JSON.stringify({ s: "x", b: "y" });
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
  it("decodes a bundle framed by control characters", () => {
    const framed =
      "\x01" +
      ASTER_SUBJECT_BUNDLE_PREFIX +
      JSON.stringify({ s: "Re: ", b: "<p>Thanks!</p>" });
    const result = extract_subject_bundle(framed);

    expect(result.subject).toBe("Re: ");
    expect(result.body).toBe("<p>Thanks!</p>");
  });

  it("decodes a bundle framed by a byte order mark", () => {
    const framed = "﻿" + encode_bundle("Hi", "there");
    const result = extract_subject_bundle(framed);

    expect(result.subject).toBe("Hi");
    expect(result.body).toBe("there");
  });

  it("recovers a payload with raw newlines inside string values", () => {
    const broken =
      ASTER_SUBJECT_BUNDLE_PREFIX + '{"s":"Re: ","b":"line one\nline two"}';
    const result = extract_subject_bundle(broken);

    expect(result.subject).toBe("Re: ");
    expect(result.body).toBe("line one\nline two");
  });

  it("recovers a truncated payload", () => {
    const truncated =
      ASTER_SUBJECT_BUNDLE_PREFIX + '{"s":"Re: ","b":"<p>Thanks!</p>';
    const result = extract_subject_bundle(truncated);

    expect(result.subject).toBe("Re: ");
    expect(result.body).toBe("<p>Thanks!</p>");
  });

  it("recovers a payload whose keys are ordered body first", () => {
    const reordered =
      ASTER_SUBJECT_BUNDLE_PREFIX + '{"b":"body text","s":"Subject"}';
    const result = extract_subject_bundle(reordered);

    expect(result.subject).toBe("Subject");
    expect(result.body).toBe("body text");
  });

  it("unwraps a double wrapped bundle and keeps the inner subject", () => {
    const inner = encode_bundle("AsterMail not allowed", "<div>Hi there</div>");
    const outer = encode_bundle("", inner);
    const result = extract_subject_bundle(outer);

    expect(result.subject).toBe("AsterMail not allowed");
    expect(result.body).toBe("<div>Hi there</div>");
    expect(result.body).not.toContain(ASTER_SUBJECT_BUNDLE_PREFIX);
  });

  it("unwraps deeply nested bundles", () => {
    let encoded = encode_bundle("deep subject", "final body");

    for (let depth = 0; depth < 4; depth += 1) {
      encoded = encode_bundle("", encoded);
    }
    const result = extract_subject_bundle(encoded);

    expect(result.subject).toBe("deep subject");
    expect(result.body).toBe("final body");
  });

  it("adopts the body when the payload carries no subject key", () => {
    const body_only = ASTER_SUBJECT_BUNDLE_PREFIX + '{"b":"only body"}';
    const result = extract_subject_bundle(body_only);

    expect(result.subject).toBe("");
    expect(result.body).toBe("only body");
  });

  it("recovers the body when the subject value is not a string", () => {
    const non_string =
      ASTER_SUBJECT_BUNDLE_PREFIX + '{"s":null,"b":"real body"}';
    const result = extract_subject_bundle(non_string);

    expect(result.body).toBe("real body");
    expect(result.body).not.toContain(ASTER_SUBJECT_BUNDLE_PREFIX);
  });

  it("never leaks the raw bundle marker for a recoverable payload", () => {
    const messy =
      "\x01" + ASTER_SUBJECT_BUNDLE_PREFIX + '\x01{"s":"Re: ","b":"hello"}';
    const result = extract_subject_bundle(messy);

    expect(result.body).not.toContain(ASTER_SUBJECT_BUNDLE_PREFIX);
    expect(result.body).toBe("hello");
  });
});

describe("mobile client bundle compatibility", () => {
  function encode_mobile_bundle(subject: string, body: string): string {
    return (
      ASTER_SUBJECT_BUNDLE_MARKER + JSON.stringify({ s: subject, b: body })
    );
  }

  it("decodes an undelimited bundle sent by a mobile client", () => {
    const result = extract_subject_bundle(
      encode_mobile_bundle("Quarterly report", "<div>please review</div>"),
    );

    expect(result.subject).toBe("Quarterly report");
    expect(result.body).toBe("<div>please review</div>");
    expect(result.body).not.toContain(ASTER_SUBJECT_BUNDLE_MARKER);
  });

  it("decodes an undelimited bundle nested inside a delimited one", () => {
    const inner = encode_mobile_bundle("inner subject", "inner body");
    const outer =
      ASTER_SUBJECT_BUNDLE_PREFIX + JSON.stringify({ s: "", b: inner });
    const result = extract_subject_bundle(outer);

    expect(result.subject).toBe("inner subject");
    expect(result.body).toBe("inner body");
  });

  it("decodes a delimited bundle nested inside an undelimited one", () => {
    const inner =
      ASTER_SUBJECT_BUNDLE_PREFIX +
      JSON.stringify({ s: "inner subject", b: "inner body" });
    const outer = encode_mobile_bundle("", inner);
    const result = extract_subject_bundle(outer);

    expect(result.subject).toBe("inner subject");
    expect(result.body).toBe("inner body");
  });

  it("decodes an undelimited bundle framed by control characters", () => {
    const result = extract_subject_bundle(
      "\u0000\ufeff" + encode_mobile_bundle("Hi", "there"),
    );

    expect(result.subject).toBe("Hi");
    expect(result.body).toBe("there");
  });

  it("recovers a truncated undelimited payload", () => {
    const truncated =
      ASTER_SUBJECT_BUNDLE_MARKER + '{"s":"Re: ","b":"<p>Thanks!</p>';
    const result = extract_subject_bundle(truncated);

    expect(result.subject).toBe("Re: ");
    expect(result.body).toBe("<p>Thanks!</p>");
  });

  it("rewraps an undelimited bundle into the delimited form without nesting", () => {
    const rewrapped = build_subject_bundle(
      "",
      encode_mobile_bundle("original subject", "original body"),
    );

    expect(rewrapped.startsWith(ASTER_SUBJECT_BUNDLE_PREFIX)).toBe(true);
    const result = extract_subject_bundle(rewrapped);

    expect(result.subject).toBe("original subject");
    expect(result.body).toBe("original body");
  });

  it("unwraps an undelimited bundle carried in html", () => {
    const result = unwrap_bundle_html(
      encode_mobile_bundle("html subject", "<p>html body</p>"),
    );

    expect(result.subject).toBe("html subject");
    expect(result.html).toBe("<p>html body</p>");
  });

  it("leaves plain text without a marker untouched", () => {
    const result = extract_subject_bundle("just a normal message");

    expect(result.subject).toBeNull();
    expect(result.body).toBe("just a normal message");
  });
});
