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

import { parse_invite_from_ics } from "./ics_parser";

function invite(dtstart: string, dtend: string): string {
  return [
    "BEGIN:VCALENDAR",
    "METHOD:REQUEST",
    "BEGIN:VEVENT",
    "UID:abc",
    "SUMMARY:Standup",
    dtstart,
    dtend,
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
}

describe("parse_invite_from_ics time zones", () => {
  it("resolves a TZID wall time to the correct instant in summer", () => {
    const parsed = parse_invite_from_ics(
      invite(
        "DTSTART;TZID=America/New_York:20260715T100000",
        "DTEND;TZID=America/New_York:20260715T110000",
      ),
    );

    expect(parsed?.starts_at).toBe("2026-07-15T14:00:00.000Z");
    expect(parsed?.ends_at).toBe("2026-07-15T15:00:00.000Z");
  });

  it("resolves a TZID wall time to the correct instant in winter", () => {
    const parsed = parse_invite_from_ics(
      invite(
        "DTSTART;TZID=America/New_York:20260115T100000",
        "DTEND;TZID=America/New_York:20260115T110000",
      ),
    );

    expect(parsed?.starts_at).toBe("2026-01-15T15:00:00.000Z");
  });

  it("handles zones east of UTC", () => {
    const parsed = parse_invite_from_ics(
      invite(
        "DTSTART;TZID=Asia/Tokyo:20260715T090000",
        "DTEND;TZID=Asia/Tokyo:20260715T100000",
      ),
    );

    expect(parsed?.starts_at).toBe("2026-07-15T00:00:00.000Z");
  });

  it("keeps UTC times unchanged", () => {
    const parsed = parse_invite_from_ics(
      invite("DTSTART:20260715T140000Z", "DTEND:20260715T150000Z"),
    );

    expect(parsed?.starts_at).toBe("2026-07-15T14:00:00.000Z");
  });

  it("falls back to local time for an unknown TZID", () => {
    const parsed = parse_invite_from_ics(
      invite(
        "DTSTART;TZID=Mars/Olympus_Mons:20260715T100000",
        "DTEND;TZID=Mars/Olympus_Mons:20260715T110000",
      ),
    );

    expect(parsed?.starts_at).toBe(
      new Date(2026, 6, 15, 10, 0, 0).toISOString(),
    );
  });
});
