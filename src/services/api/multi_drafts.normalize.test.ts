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

import { normalize_draft_content } from "./multi_drafts";

describe("normalize_draft_content", () => {
  it("reads a draft written by the web client", () => {
    const content = normalize_draft_content({
      to_recipients: ["ada@astermail.org"],
      cc_recipients: [],
      bcc_recipients: [],
      subject: "Hello",
      message: "<p>Hi</p>",
      from_email: "alias@astermail.org",
    });

    expect(content.to_recipients).toEqual(["ada@astermail.org"]);
    expect(content.message).toBe("<p>Hi</p>");
    expect(content.from_email).toBe("alias@astermail.org");
  });

  it("reads a draft written by the mobile clients", () => {
    const content = normalize_draft_content({
      subject: "Hello",
      body_text: "",
      body_html: "<p>Hi</p>",
      from: { name: "Ada", email: "alias@astermail.org" },
      to: [{ name: "", email: "ada@astermail.org" }],
      cc: [{ name: "", email: "grace@astermail.org" }],
      sent_at: "2026-08-23T00:00:00Z",
    });

    expect(content.to_recipients).toEqual(["ada@astermail.org"]);
    expect(content.cc_recipients).toEqual(["grace@astermail.org"]);
    expect(content.message).toBe("<p>Hi</p>");
    expect(content.from_email).toBe("alias@astermail.org");
  });

  it("reads a draft whose recipients are plain strings", () => {
    const content = normalize_draft_content({
      subject: "",
      to: ["ada@astermail.org", ""],
      body_text: "plain",
    });

    expect(content.to_recipients).toEqual(["ada@astermail.org"]);
    expect(content.message).toBe("plain");
    expect(content.from_email).toBeUndefined();
  });

  it("returns empty fields for content it cannot read", () => {
    const content = normalize_draft_content(null);

    expect(content.to_recipients).toEqual([]);
    expect(content.subject).toBe("");
    expect(content.message).toBe("");
  });
});
