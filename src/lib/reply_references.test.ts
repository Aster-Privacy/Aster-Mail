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
import { describe, expect, it } from "vitest";

import {
  MAX_REPLY_REFERENCES_LENGTH,
  build_reply_references,
  extract_message_ids,
  resolve_reply_references,
} from "./reply_references";

const h = (name: string, value: string) => ({ name, value });

describe("extract_message_ids", () => {
  it("reads bracketed ids", () => {
    expect(extract_message_ids("<a@x.test>  <b@y.test>")).toEqual([
      "<a@x.test>",
      "<b@y.test>",
    ]);
  });

  it("wraps a bare id", () => {
    expect(extract_message_ids(" a@x.test ")).toEqual(["<a@x.test>"]);
  });

  it("handles folded values", () => {
    expect(extract_message_ids("<a@x.test>\r\n\t<b@y.test>")).toEqual([
      "<a@x.test>",
      "<b@y.test>",
    ]);
  });

  it("ignores junk", () => {
    expect(extract_message_ids(undefined)).toEqual([]);
    expect(extract_message_ids("not an id")).toEqual([]);
  });
});

describe("build_reply_references", () => {
  it("returns undefined without a message id", () => {
    expect(build_reply_references(undefined)).toBeUndefined();
    expect(build_reply_references([h("Subject", "hello")])).toBeUndefined();
  });

  it("uses the message id alone for a first reply", () => {
    expect(build_reply_references([h("Message-ID", "<p@x.test>")])).toBe(
      "<p@x.test>",
    );
  });

  it("matches the header name case-insensitively", () => {
    expect(build_reply_references([h("message-id", "<p@x.test>")])).toBe(
      "<p@x.test>",
    );
  });

  it("appends the parent to the existing references", () => {
    expect(
      build_reply_references([
        h("References", "<r@x.test> <m@x.test>"),
        h("In-Reply-To", "<m@x.test>"),
        h("Message-Id", "<p@x.test>"),
      ]),
    ).toBe("<r@x.test> <m@x.test> <p@x.test>");
  });

  it("falls back to in-reply-to when references are absent", () => {
    expect(
      build_reply_references([
        h("In-Reply-To", "<m@x.test>"),
        h("Message-ID", "<p@x.test>"),
      ]),
    ).toBe("<m@x.test> <p@x.test>");
  });

  it("drops duplicates and keeps the parent last", () => {
    expect(
      build_reply_references([
        h("References", "<r@x.test> <p@x.test> <r@x.test>"),
        h("Message-ID", "<p@x.test>"),
      ]),
    ).toBe("<r@x.test> <p@x.test>");
  });

  it("keeps the root and newest ids within the length cap", () => {
    const refs = Array.from(
      { length: 40 },
      (_, i) => `<ref-${String(i).padStart(2, "0")}@example.test>`,
    );
    const out = build_reply_references([
      h("References", refs.join(" ")),
      h("Message-ID", "<parent@example.test>"),
    ]);

    expect(out).toBeDefined();
    expect(out!.length).toBeLessThanOrEqual(MAX_REPLY_REFERENCES_LENGTH);
    const ids = out!.split(" ");

    expect(ids[0]).toBe("<ref-00@example.test>");
    expect(ids[ids.length - 1]).toBe("<parent@example.test>");
    expect(ids[ids.length - 2]).toBe("<ref-39@example.test>");
  });
});

describe("resolve_reply_references", () => {
  const received = {
    id: "m1",
    raw_headers: [h("Message-ID", "<ext-1@sender.test>")],
  };
  const own_sent = { id: "m2", raw_headers: undefined };
  const later_received = {
    id: "m3",
    raw_headers: [
      h("Message-ID", "<ext-2@sender.test>"),
      h("References", "<ext-1@sender.test> <ours@astermail.org>"),
    ],
  };

  it("uses the target when it has a message id", () => {
    expect(
      resolve_reply_references(later_received, [
        received,
        own_sent,
        later_received,
      ]),
    ).toBe("<ext-1@sender.test> <ours@astermail.org> <ext-2@sender.test>");
  });

  it("falls back to the nearest earlier message for our own sent copy", () => {
    expect(resolve_reply_references(own_sent, [received, own_sent])).toBe(
      "<ext-1@sender.test>",
    );
  });

  it("does not look at messages newer than the target", () => {
    expect(
      resolve_reply_references(own_sent, [own_sent, later_received]),
    ).toBeUndefined();
  });

  it("uses the newest message when the target is not in the thread", () => {
    expect(
      resolve_reply_references({ id: "x" }, [received, later_received]),
    ).toBe("<ext-1@sender.test> <ours@astermail.org> <ext-2@sender.test>");
  });
});
