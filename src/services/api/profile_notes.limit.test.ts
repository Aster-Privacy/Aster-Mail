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

import { note_exceeds_limit } from "./profile_notes";

const SERVER_ENCRYPTED_NOTE_LIMIT = 65536;

function encoded_length(note: string): number {
  const payload = JSON.stringify({
    content: note,
    _encrypted_at: new Date().toISOString(),
  });

  return 4 * Math.ceil((new TextEncoder().encode(payload).length + 16) / 3);
}

describe("note_exceeds_limit", () => {
  it("accepts a note that the server will accept", () => {
    const note = "a".repeat(48000);

    expect(encoded_length(note)).toBeLessThanOrEqual(
      SERVER_ENCRYPTED_NOTE_LIMIT,
    );
    expect(note_exceeds_limit(note)).toBe(false);
  });

  it("rejects a multibyte note the server would reject", () => {
    const note = "漢".repeat(20000);

    expect(encoded_length(note)).toBeGreaterThan(SERVER_ENCRYPTED_NOTE_LIMIT);
    expect(note_exceeds_limit(note)).toBe(true);
  });

  it("rejects an ascii note that fits the character cap but not the byte cap", () => {
    const note = "a".repeat(50000);

    expect(note.length).toBeLessThanOrEqual(50000);
    expect(encoded_length(note)).toBeGreaterThan(SERVER_ENCRYPTED_NOTE_LIMIT);
    expect(note_exceeds_limit(note)).toBe(true);
  });

  it("counts escaped characters against the budget", () => {
    const note = '"'.repeat(24800);

    expect(note_exceeds_limit(note)).toBe(true);
    expect(note_exceeds_limit('"'.repeat(20000))).toBe(false);
  });
});
