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
  find_calendar_text,
  find_meeting_link,
  has_calendar_text,
  invite_attachment_hints,
  link_host,
  MAX_INVITE_SOURCE_CHARS,
} from "./invite_detect";

const calendar = [
  "BEGIN:VCALENDAR",
  "METHOD:REQUEST",
  "BEGIN:VEVENT",
  "UID:detect-1",
  "SUMMARY:Review & plan",
  "END:VEVENT",
  "END:VCALENDAR",
].join("\r\n");

describe("has_calendar_text", () => {
  it("finds a calendar block in any case", () => {
    expect(has_calendar_text(calendar)).toBe(true);
    expect(has_calendar_text("begin:vcalendar")).toBe(true);
  });

  it("ignores empty, plain and oversized text", () => {
    expect(has_calendar_text(undefined)).toBe(false);
    expect(has_calendar_text("Lunch on Friday?")).toBe(false);
    expect(
      has_calendar_text(
        `BEGIN:VCALENDAR${"x".repeat(MAX_INVITE_SOURCE_CHARS)}`,
      ),
    ).toBe(false);
  });
});

describe("find_calendar_text", () => {
  it("cuts the calendar block out of a plain body", () => {
    expect(find_calendar_text(`Hi\n\n${calendar}\n\nThanks`, undefined)).toBe(
      calendar,
    );
  });

  it("reads a calendar block from html without keeping tags", () => {
    const html = `<div>Hi</div><pre>${calendar
      .split("\r\n")
      .join("<br>")
      .replace("&", "&amp;")}</pre>`;
    const text = find_calendar_text("Hi", html) ?? "";

    expect(text.startsWith("BEGIN:VCALENDAR")).toBe(true);
    expect(text.endsWith("END:VCALENDAR")).toBe(true);
    expect(text).toContain("SUMMARY:Review & plan");
    expect(text).not.toContain("<");
  });

  it("returns null when there is no complete block", () => {
    expect(find_calendar_text("BEGIN:VCALENDAR only", undefined)).toBeNull();
    expect(find_calendar_text(undefined, undefined)).toBeNull();
  });
});

describe("find_meeting_link", () => {
  it("prefers a safe conference address", () => {
    expect(
      find_meeting_link({
        conference_url: "https://meet.example.com/a",
        location: "https://other.example.com/b",
      }),
    ).toBe("https://meet.example.com/a");
  });

  it("finds the first web address in the location, then the description", () => {
    expect(
      find_meeting_link({
        location: "Room 4 or https://meet.example.com/room.",
      }),
    ).toBe("https://meet.example.com/room");
    expect(
      find_meeting_link({
        location: "Room 4",
        description: "Dial in at http://call.example.org/123, thanks",
      }),
    ).toBe("http://call.example.org/123");
  });

  it("never returns a non-web address", () => {
    expect(
      find_meeting_link({
        conference_url: "javascript:alert(1)",
        location: "javascript:alert(1)",
        description: "data:text/html,<b>x</b> ftp://files.example.com",
      }),
    ).toBeNull();
  });
});

describe("link_host", () => {
  it("shows the host of a link", () => {
    expect(link_host("https://meet.example.com/abc?pwd=1")).toBe(
      "meet.example.com",
    );
  });
});

describe("invite_attachment_hints", () => {
  it("maps the attachments of the open message", () => {
    expect(
      invite_attachment_hints(
        [
          { id: "a", attachments: [{ filename: "a.pdf", content_type: "x" }] },
          {
            id: "b",
            attachments: [
              { filename: "invite.ics", content_type: "text/calendar" },
            ],
          },
        ],
        "b",
      ),
    ).toEqual([{ name: "invite.ics", mime_type: "text/calendar" }]);
    expect(invite_attachment_hints([], undefined)).toEqual([]);
  });
});
