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
import type { DecryptedEnvelope } from "@/types/email";

import { beforeEach, describe, expect, it } from "vitest";

import {
  add_vocabulary_entry,
  add_vocabulary_text,
  is_vocabulary_term,
  reset_vocabulary,
  single_deletions,
  tokenize_for_vocabulary,
  VOCABULARY_CAP,
  VOCABULARY_PRUNE_TRIGGER,
  vocabulary_candidates,
  vocabulary_count,
  vocabulary_has_term,
  vocabulary_size,
} from "./vocabulary";

function letter_suffix(index: number): string {
  let suffix = "";
  let value = index;

  do {
    suffix = String.fromCharCode(97 + (value % 26)) + suffix;
    value = Math.floor(value / 26);
  } while (value > 0);

  return suffix;
}

function envelope(subject: string, sender_name: string): DecryptedEnvelope {
  return {
    subject,
    from: { name: sender_name, email: "someone@example.com" },
  } as unknown as DecryptedEnvelope;
}

describe("vocabulary terms", () => {
  beforeEach(() => {
    reset_vocabulary();
  });

  it("accepts only latin words of usable length", () => {
    expect(is_vocabulary_term("invoice")).toBe(true);
    expect(is_vocabulary_term("o'brien")).toBe(true);
    expect(is_vocabulary_term("the")).toBe(false);
    expect(is_vocabulary_term("領収書")).toBe(false);
    expect(is_vocabulary_term("2026")).toBe(false);
    expect(is_vocabulary_term("a".repeat(25))).toBe(false);
  });

  it("lowercases and drops unusable tokens", () => {
    expect(
      tokenize_for_vocabulary("Quarterly Invoice #2026, payment due!"),
    ).toEqual(["quarterly", "invoice", "payment"]);
    expect(tokenize_for_vocabulary("")).toEqual([]);
  });

  it("weights subject and sender above body", () => {
    add_vocabulary_entry(
      envelope("Invoice attached", "Priya Nandakumar"),
      "invoice details follow",
    );

    expect(vocabulary_count("invoice")).toBe(4);
    expect(vocabulary_count("attached")).toBe(3);
    expect(vocabulary_count("nandakumar")).toBe(3);
    expect(vocabulary_count("details")).toBe(1);
  });

  it("reads only the leading slice of a body", () => {
    add_vocabulary_entry(null, `${"padding ".repeat(80)}sentinelword`);

    expect(vocabulary_has_term("sentinelword")).toBe(false);
  });

  it("tolerates a missing envelope", () => {
    add_vocabulary_entry(null, "standalone body text");

    expect(vocabulary_count("standalone")).toBe(1);
  });

  it("builds every single deletion of a term", () => {
    expect(single_deletions("cart")).toEqual(["art", "crt", "cat", "car"]);
  });

  it("finds candidates one edit away", () => {
    add_vocabulary_text("receive shipment", 1);

    expect(vocabulary_candidates("recieve")).toContain("receive");
    expect(vocabulary_candidates("shipmnt")).toContain("shipment");
    expect(vocabulary_candidates("wholly")).toEqual([]);
  });

  it("rebuilds candidates after new text arrives", () => {
    add_vocabulary_text("receive", 1);
    expect(vocabulary_candidates("recieve")).toContain("receive");

    add_vocabulary_text("relieve", 1);
    expect(vocabulary_candidates("releive")).toContain("relieve");
  });

  it("prunes to the cap once the trigger is passed", () => {
    for (let i = 0; i <= VOCABULARY_PRUNE_TRIGGER; i++) {
      add_vocabulary_text(`term${letter_suffix(i)}`, i < 200 ? 50 : 1);
    }

    expect(vocabulary_size()).toBe(VOCABULARY_CAP);

    for (let i = 0; i < 200; i++) {
      expect(vocabulary_has_term(`term${letter_suffix(i)}`)).toBe(true);
    }
  });

  it("clears everything on reset", () => {
    add_vocabulary_text("receive", 1);
    reset_vocabulary();

    expect(vocabulary_size()).toBe(0);
    expect(vocabulary_candidates("recieve")).toEqual([]);
  });
});
