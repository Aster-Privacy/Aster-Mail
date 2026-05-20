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

import type { DecryptedEnvelope } from "@/types/email";
import { serialize_envelope_to_bytes, type ExportAttachment } from "./rfc5322";
import {
  encode_address,
  encode_unstructured,
  fold_header,
  format_rfc5322_date,
  filename_param,
} from "./headers";
import { random_boundary, body_contains_boundary } from "./boundary";
import { mboxrd_quote } from "./mboxrd_transducer";
import { frame_mbox_message } from "./mbox";
import { sanitize_eml_filename, FilenameAllocator } from "./filename";

const dec = new TextDecoder();

function make_env(overrides: Partial<DecryptedEnvelope> = {}): DecryptedEnvelope {
  return {
    subject: "Hello",
    body_text: "Body line one.\nBody line two.\n",
    body_html: undefined,
    from: { name: "Alice", email: "alice@example.com" },
    to: [{ name: "Bob", email: "bob@example.com" }],
    cc: [],
    bcc: [],
    sent_at: "2026-05-20T14:23:11Z",
    raw_headers: [],
    ...overrides,
  };
}

async function from_async(iter: AsyncIterable<Uint8Array>): Promise<Uint8Array> {
  const parts: Uint8Array[] = [];
  let n = 0;
  for await (const c of iter) {
    parts.push(c);
    n += c.length;
  }
  const out = new Uint8Array(n);
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }
  return out;
}

describe("headers", () => {
  it("formats RFC 5322 date in UTC", () => {
    const s = format_rfc5322_date("2026-05-20T14:23:11Z");
    expect(s).toBe("Wed, 20 May 2026 14:23:11 +0000");
  });

  it("emits ASCII address without quoting", () => {
    expect(encode_address({ name: "Alice", email: "alice@example.com" })).toBe(
      "Alice <alice@example.com>",
    );
  });

  it("quotes ASCII display name with specials", () => {
    expect(encode_address({ name: "Doe, John", email: "j@x.io" })).toBe(
      '"Doe, John" <j@x.io>',
    );
  });

  it("encodes non-ASCII display name as RFC 2047", () => {
    const out = encode_address({ name: "Renée", email: "r@x.io" });
    expect(out).toMatch(/^=\?UTF-8\?B\?[A-Za-z0-9+/=]+\?= <r@x.io>$/);
  });

  it("encodes CJK subject as one or more encoded-words", () => {
    const out = encode_unstructured("こんにちは世界 from Aster");
    expect(out).toMatch(/=\?UTF-8\?B\?/);
  });

  it("leaves plain ASCII unstructured untouched", () => {
    expect(encode_unstructured("Just a regular subject")).toBe(
      "Just a regular subject",
    );
  });

  it("folds long headers", () => {
    const long = Array.from({ length: 20 }, (_, i) => `tok${i}`).join(" ");
    const folded = fold_header("References", long);
    for (const line of folded.split("\r\n")) {
      expect(line.length).toBeLessThanOrEqual(998);
    }
    expect(folded.split("\r\n").length).toBeGreaterThan(1);
  });

  it("generates RFC 2231 filename param for non-ASCII", () => {
    const p = filename_param("Renée résumé.pdf");
    expect(p).toMatch(/^filename\*=UTF-8''/);
  });

  it("keeps plain ASCII filename as quoted-string", () => {
    expect(filename_param("report.pdf")).toBe('filename="report.pdf"');
  });
});

describe("boundary", () => {
  it("produces unique boundaries", () => {
    const a = random_boundary();
    const b = random_boundary();
    expect(a).not.toEqual(b);
    expect(a).toMatch(/^=_aster_/);
  });

  it("detects boundary in body", () => {
    const b = random_boundary();
    expect(body_contains_boundary("hello " + b + " world", b)).toBe(true);
    expect(body_contains_boundary("hello world", b)).toBe(false);
  });
});

describe("serialize_envelope - plain text", () => {
  it("emits a minimal RFC5322 message with required headers", async () => {
    const env = make_env();
    const out = dec.decode(await serialize_envelope_to_bytes(env, []));
    expect(out).toMatch(/^Message-ID: </m);
    expect(out).toMatch(/^Date: Wed, 20 May 2026 14:23:11 \+0000$/m);
    expect(out).toMatch(/^From: Alice <alice@example.com>$/m);
    expect(out).toMatch(/^To: Bob <bob@example.com>$/m);
    expect(out).toMatch(/^Subject: Hello$/m);
    expect(out).toMatch(/^MIME-Version: 1\.0$/m);
    expect(out).toMatch(/^Content-Type: text\/plain; charset=utf-8$/m);
    expect(out).toMatch(/^Content-Transfer-Encoding: 7bit$/m);
    expect(out).toContain("Body line one.\r\nBody line two.");
  });

  it("normalizes LF to CRLF in body", async () => {
    const env = make_env({ body_text: "a\nb\nc" });
    const out = await serialize_envelope_to_bytes(env, []);
    const s = dec.decode(out);
    const body = s.split("\r\n\r\n").slice(1).join("\r\n\r\n");
    expect(body).toContain("a\r\nb\r\nc");
  });

  it("preserves provided Message-ID from raw_headers", async () => {
    const env = make_env({
      raw_headers: [{ name: "Message-ID", value: "<provided@example.com>" }],
    });
    const s = dec.decode(await serialize_envelope_to_bytes(env, []));
    expect(s).toContain("Message-ID: <provided@example.com>");
  });

  it("synthesizes Message-ID when missing", async () => {
    const env = make_env();
    const s = dec.decode(await serialize_envelope_to_bytes(env, []));
    expect(s).toMatch(/Message-ID: <[A-Za-z0-9_-]+\.[0-9]+@export\.local\.astermail>/);
  });
});

describe("serialize_envelope - multipart", () => {
  it("emits multipart/alternative for text + html", async () => {
    const env = make_env({
      body_text: "plain",
      body_html: "<p>html</p>",
    });
    const s = dec.decode(await serialize_envelope_to_bytes(env, []));
    expect(s).toMatch(/Content-Type: multipart\/alternative; boundary="=_aster_/);
    expect(s).toContain("Content-Type: text/plain; charset=utf-8");
    expect(s).toContain("Content-Type: text/html; charset=utf-8");
  });

  it("wraps in multipart/mixed when attachments present", async () => {
    const att: ExportAttachment = {
      filename: "report.pdf",
      mime_type: "application/pdf",
      open: () => new Uint8Array([0x25, 0x50, 0x44, 0x46]),
    };
    const env = make_env({ body_html: "<p>see attached</p>" });
    const s = dec.decode(await serialize_envelope_to_bytes(env, [att]));
    expect(s).toMatch(/Content-Type: multipart\/mixed; boundary=/);
    expect(s).toContain("Content-Type: application/pdf");
    expect(s).toContain("Content-Disposition: attachment");
    expect(s).toContain('filename="report.pdf"');
    expect(s).toContain("Content-Transfer-Encoding: base64");
    expect(s).toMatch(/JVBERg==\r\n/);
  });

  it("uses related nesting for inline cid images", async () => {
    const png: ExportAttachment = {
      filename: "logo.png",
      mime_type: "image/png",
      is_inline: true,
      content_id: "logo123",
      open: () => new Uint8Array([1, 2, 3, 4, 5, 6]),
    };
    const env = make_env({
      body_text: "see image",
      body_html: '<img src="cid:logo123">',
    });
    const s = dec.decode(await serialize_envelope_to_bytes(env, [png]));
    expect(s).toMatch(/Content-Type: multipart\/related/);
    expect(s).toContain("Content-ID: <logo123>");
    expect(s).toContain("Content-Disposition: inline");
  });

  it("uses quoted-printable when body contains non-ASCII", async () => {
    const env = make_env({ body_text: "café résumé — em dash" });
    const s = dec.decode(await serialize_envelope_to_bytes(env, []));
    expect(s).toContain("Content-Transfer-Encoding: quoted-printable");
    expect(s).toMatch(/=[0-9A-F]{2}/);
  });
});

describe("serialize_envelope - verbatim header preservation", () => {
  it("preserves Received chain and DKIM verbatim", async () => {
    const env = make_env({
      raw_headers: [
        { name: "Received", value: "from a.example by b.example" },
        { name: "Received", value: "from c.example by d.example" },
        { name: "DKIM-Signature", value: "v=1; a=rsa-sha256; d=example.com" },
        { name: "References", value: "<a@x> <b@x>" },
      ],
    });
    const s = dec.decode(await serialize_envelope_to_bytes(env, []));
    const lines = s.split("\r\n");
    const recv = lines.filter((l) => l.startsWith("Received:"));
    expect(recv.length).toBe(2);
    expect(recv[0]).toContain("from a.example");
    expect(recv[1]).toContain("from c.example");
    expect(s).toContain("DKIM-Signature: v=1");
    expect(s).toContain("References: <a@x> <b@x>");
  });

  it("strips body-owned headers from raw passthrough", async () => {
    const env = make_env({
      raw_headers: [
        { name: "Content-Type", value: "text/strange" },
        { name: "Content-Transfer-Encoding", value: "bogus" },
      ],
    });
    const s = dec.decode(await serialize_envelope_to_bytes(env, []));
    expect(s).not.toContain("text/strange");
    expect(s).not.toContain("bogus");
    expect(s).toContain("Content-Type: text/plain; charset=utf-8");
  });
});

describe("mboxrd quoting", () => {
  it("prefixes bare 'From ' at line start with >", async () => {
    async function* src() {
      yield new TextEncoder().encode("Hi\nFrom the team,\nregards\n");
    }
    const bytes = await from_async(mboxrd_quote(src()));
    const s = new TextDecoder().decode(bytes);
    expect(s).toContain("\n>From the team,\n");
  });

  it("escalates existing >From quoting", async () => {
    async function* src() {
      yield new TextEncoder().encode(">From a\n>>From b\n");
    }
    const bytes = await from_async(mboxrd_quote(src()));
    const s = new TextDecoder().decode(bytes);
    expect(s).toContain(">>From a\n");
    expect(s).toContain(">>>From b\n");
  });

  it("does not quote 'From' embedded mid-line", async () => {
    async function* src() {
      yield new TextEncoder().encode("hello From world\n");
    }
    const bytes = await from_async(mboxrd_quote(src()));
    expect(new TextDecoder().decode(bytes)).toBe("hello From world\n");
  });
});

describe("frame_mbox_message", () => {
  it("emits From separator + body + trailing blank", async () => {
    const env = make_env({ sent_at: "2026-01-03T15:04:05Z" });
    const bytes = await from_async(frame_mbox_message(env, []));
    const s = new TextDecoder().decode(bytes);
    expect(s).toMatch(/^From alice@example\.com Sat Jan  3 15:04:05 2026\n/);
    expect(s.endsWith("\n")).toBe(true);
  });

  it("two messages produce exactly one blank between", async () => {
    const env1 = make_env({ subject: "First", sent_at: "2026-01-01T00:00:00Z" });
    const env2 = make_env({ subject: "Second", sent_at: "2026-01-02T00:00:00Z" });
    const b1 = await from_async(frame_mbox_message(env1, []));
    const b2 = await from_async(frame_mbox_message(env2, []));
    const combined = new TextDecoder().decode(b1) + new TextDecoder().decode(b2);
    expect((combined.match(/^From [^\n]+$/gm) ?? []).length).toBe(2);
  });
});

describe("filename sanitizer", () => {
  it("produces stable per-message names", async () => {
    const a = await sanitize_eml_filename({
      sent_at: "2026-05-20T14:23:11Z",
      message_id: "<abc@x>",
      subject: "Hello there",
    });
    expect(a).toMatch(/^20260520-142311_[0-9a-f]{10}_Hello-there\.eml$/);
  });

  it("strips path and Windows reserved characters", async () => {
    const a = await sanitize_eml_filename({
      sent_at: "2026-01-01T00:00:00Z",
      subject: 'path/with\\bad:chars*?"<>|',
    });
    expect(a).not.toMatch(/[\\\/:*?"<>|]/);
  });

  it("falls back when subject empty", async () => {
    const a = await sanitize_eml_filename({
      sent_at: "2026-01-01T00:00:00Z",
      subject: "",
    });
    expect(a).toContain("no-subject");
  });

  it("allocator avoids collisions", async () => {
    const alloc = new FilenameAllocator();
    const input = {
      sent_at: "2026-01-01T00:00:00Z",
      message_id: "<same@x>",
      subject: "Same",
    };
    const a = await alloc.allocate(input);
    const b = await alloc.allocate(input);
    const c = await alloc.allocate(input);
    expect(a).not.toEqual(b);
    expect(b).not.toEqual(c);
    expect(b).toMatch(/_2\.eml$/);
    expect(c).toMatch(/_3\.eml$/);
  });
});
