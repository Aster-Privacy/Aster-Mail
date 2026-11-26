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
  extract_vcalendar,
  find_calendar_text,
  find_meeting_link,
} from "@/services/calendar/invite_detect";

const OLD_VCALENDAR = /BEGIN:VCALENDAR[\s\S]*?END:VCALENDAR/i;

function old_extract(value: string): string | null {
  return value.match(OLD_VCALENDAR)?.[0] ?? null;
}

function seeded_random(seed: number): () => number {
  let state = seed >>> 0;

  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;

    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);

    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe("invite_detect linear scans", () => {
  it("extracts the same calendar block as the previous pattern", () => {
    const parts = ["BEGIN:VCALENDAR", "begin:vcalendar", "END:VCALENDAR", "end:VCalendar", "x", "\n", "BEGIN:VCAL", "END:", "VCALENDAR"];
    const random = seeded_random(11);

    for (let n = 0; n < 5000; n += 1) {
      const count = Math.floor(random() * 7);
      let value = "";

      for (let i = 0; i < count; i += 1) {
        value += parts[Math.floor(random() * parts.length)];
      }
      expect(extract_vcalendar(value)).toBe(old_extract(value));
    }
  });

  it("finds calendar text in html bodies", () => {
    const html =
      "<div>BEGIN:VCALENDAR</div><p>A &amp; B</p><b>END:VCALENDAR</b> <tail";

    expect(find_calendar_text(undefined, html)).toBe(
      "BEGIN:VCALENDAR\nA & B\nEND:VCALENDAR",
    );
    expect(find_calendar_text("pre BEGIN:VCALENDAR x END:VCALENDAR post", undefined)).toBe(
      "BEGIN:VCALENDAR x END:VCALENDAR",
    );
  });

  it("strips trailing punctuation from meeting links", () => {
    expect(
      find_meeting_link({ description: "Join https://meet.example.com/abc?!." }),
    ).toBe("https://meet.example.com/abc");
  });

  it("stays linear on hostile input", () => {
    const begins = "BEGIN:VCALENDAR".repeat(100_000);
    const open_tags = "<".repeat(500_000);
    const started = performance.now();

    find_calendar_text(begins, undefined);
    find_calendar_text(undefined, `BEGIN:VCALENDAR${open_tags}`);
    find_meeting_link({ description: `https://a.example/${".".repeat(19_000)}x` });

    expect(performance.now() - started).toBeLessThan(1000);
  });
});
