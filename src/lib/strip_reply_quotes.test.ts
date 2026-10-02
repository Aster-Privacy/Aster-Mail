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

import { strip_reply_quotes } from "./strip_reply_quotes";

describe("strip_reply_quotes", () => {
  it("keeps a reply whose own text mentions on and wrote on one line", () => {
    const body =
      "<p>Quick question about what she wrote: can we meet on Friday?</p>";

    expect(strip_reply_quotes(body)).toBe(body);
  });

  it("keeps the whole reply when an html quote follows on the same line", () => {
    const body =
      "<p>I agree on the plan and will send it later today.</p><blockquote><div>On Mon, Sep 1, 2026, Sam &lt;sam@astermail.org&gt; wrote:</div><div>older text</div></blockquote>";

    const result = strip_reply_quotes(body);

    expect(result).toContain(
      "I agree on the plan and will send it later today.",
    );
    expect(result).not.toContain("older text");
  });

  it("strips a plain text attribution and the quoted lines below it", () => {
    const body =
      "Thanks, see you then.\n\nOn Mon, Sep 1, 2026, Sam wrote:\n> older text";

    expect(strip_reply_quotes(body)).toBe("Thanks, see you then.");
  });

  it("keeps the text after an attribution that starts the body", () => {
    const body = "On Mon, Sep 1, 2026, Sam wrote:\nNew text below";

    expect(strip_reply_quotes(body)).toBe("New text below");
  });

  it("keeps a sentence that starts with On but is not an attribution", () => {
    const body = "On Friday she wrote: the draft is ready";

    expect(strip_reply_quotes(body)).toBe(body);
  });

  it("keeps an answer below a quoted question after a greeting", () => {
    const body =
      "Hi Alex,\n\nOn Tue, Alex wrote:\n> When can we meet?\n\nMeet at 10 on Friday.";

    expect(strip_reply_quotes(body)).toBe(
      "Hi Alex,\n\n\nMeet at 10 on Friday.",
    );
  });

  it("keeps new text between multiple attributed quotes", () => {
    const body =
      "Hello,\nOn Tue, Alex wrote:\n> First question\nFirst answer\nOn Wed, Alex wrote:\n> Second question\nSecond answer";

    expect(strip_reply_quotes(body)).toBe(
      "Hello,\nFirst answer\nSecond answer",
    );
  });

  it("keeps literal greater-than lines without a reply attribution", () => {
    const body = "Run this command:\n> npm run build\nThen restart the app.";

    expect(strip_reply_quotes(body)).toBe(body);
  });

  it("handles CRLF and indented quoted lines", () => {
    const body =
      "Hello,\r\nOn Tue, Alex wrote:\r\n  > Old text\r\n\r\nNew answer";

    expect(strip_reply_quotes(body)).toBe("Hello,\n\nNew answer");
  });

  it("keeps a quote-only message readable", () => {
    const body = "On Tue, Alex wrote:\n> Original message";

    expect(strip_reply_quotes(body)).toBe(body);
  });

  it("keeps a top-posted reply and drops the trailing quote", () => {
    const body =
      "Sounds good.\n\nOn Tue, Alex wrote:\n> First line\n>\n> Second line";

    expect(strip_reply_quotes(body)).toBe("Sounds good.");
  });
});
