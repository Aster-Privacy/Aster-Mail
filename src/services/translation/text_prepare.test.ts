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
  expected_segment_count,
  flatten_segments,
  protect_entities,
  regroup_segments,
  restore_entities,
  segment_nodes,
  segment_sentences,
} from "./text_prepare";

function round_trip(text: string): string {
  const { masked, entities } = protect_entities(text);

  return restore_entities(masked, entities).text;
}

describe("protect_entities", () => {
  const fixtures: ReadonlyArray<[string, string]> = [
    ["otp code", "Ihr Bestätigungscode lautet 493028."],
    ["separated otp", "Ihr Code lautet 493 028 bitte."],
    ["hyphen otp", "Verification code: 4930-2856"],
    ["grouped amount", "Gesamtbetrag 12,345.67 fällig."],
    ["long otp", "Verification code: 1029384756"],
    ["tracking number", "Sendungsnummer JD014600006281746337 unterwegs."],
    ["order id", "Bestellung #ABC-12345-XY wurde versandt."],
    ["currency symbol", "Gesamtbetrag: 1.249,90 EUR und $19.99"],
    ["iso date", "Fällig am 2026-07-23T14:30 Uhr."],
    ["numeric date", "Rechnungsdatum 23.07.2026 beachten."],
    ["time", "Termin um 14:30 oder 2:15 PM."],
    ["phone", "Rufen Sie +49 30 123 456 78 an."],
    ["email", "Antworten Sie an support@example.com bitte."],
    ["url", "Details unter https://example.com/a/b?c=1 nachlesen."],
    [
      "base64",
      "Token: QUJDREVGR0hJSktMTU5PUFFSU1RVVldYWVowMTIzNDU2Nzg5 verwenden.",
    ],
    ["arabic-indic digits", "رمز التحقق الخاص بك هو ٤٩٣٠٢٨ فقط."],
    ["devanagari digits", "आपका सत्यापन कोड ४९३०२८ है।"],
    ["eu grouped amount", "Gesamtbetrag 1.249.900 fällig."],
  ];

  for (const [name, text] of fixtures) {
    it(`round trips ${name} byte identically`, () => {
      expect(round_trip(text)).toBe(text);
    });
  }

  it("protects non-ascii digit runs so they cannot be mangled", () => {
    const { masked, entities } = protect_entities("رمز التحقق ٤٩٣٠٢٨ فقط.");

    expect(entities).toEqual(["٤٩٣٠٢٨"]);
    expect(masked).not.toContain("٤٩٣٠٢٨");
  });

  it("leaves ascii-only digit runs to the standard patterns", () => {
    const { entities } = protect_entities("Wert 7 und 42 hier.");

    expect(entities).toHaveLength(0);
  });

  it("does not tokenize ordinary prose", () => {
    const text = "Guten Tag, wir haben Ihre Nachricht erhalten.";
    const { masked, entities } = protect_entities(text);

    expect(entities).toHaveLength(0);
    expect(masked).toBe(text);
  });

  it("survives whitespace injected into tokens by the model", () => {
    const { masked, entities } = protect_entities("Code 493028 eingeben.");
    const mangled = masked.replace("ZQXAQZX", "ZQX A QZX");

    expect(restore_entities(mangled, entities).text).toContain("493028");
  });

  it("survives the model lowercasing a token", () => {
    const { masked, entities } = protect_entities("Code 493028 eingeben.");
    const mangled = masked.toLowerCase();

    expect(restore_entities(mangled, entities).text).toContain("493028");
  });

  it("reports entities the model dropped", () => {
    const { entities } = protect_entities("Code 493028 eingeben.");
    const result = restore_entities("Enter code.", entities);

    expect(result.missing).toBe(1);
  });

  it("reports no missing entities on a clean round trip", () => {
    const { masked, entities } = protect_entities("Code 493028 eingeben.");

    expect(restore_entities(masked, entities).missing).toBe(0);
  });

  it("leaves unknown token indices untouched", () => {
    const result = restore_entities("value ZQXGQZX here", []);

    expect(result.text).toBe("value ZQXGQZX here");
  });

  it("flags an out-of-range token index as missing", () => {
    const result = restore_entities("value ZQXGQZX here", []);

    expect(result.missing).toBeGreaterThan(0);
  });

  it("flags a token the model duplicated as missing", () => {
    const { masked, entities } = protect_entities("Code 493028 eingeben.");
    const duplicated = `${masked} ${masked}`;

    expect(restore_entities(duplicated, entities).missing).toBeGreaterThan(0);
  });

  it("keeps reordered tokens since clause order changes are legitimate", () => {
    const { masked, entities } = protect_entities(
      "Erster Code 493028, zweiter Code 581920.",
    );

    expect(entities.length).toBeGreaterThanOrEqual(2);

    const [first, second] = masked.match(/ZQX[A-Z]+QZX/g) ?? [];

    if (!first || !second) throw new Error("expected two protected tokens");

    let seen = 0;
    const swapped = masked.replace(/ZQX[A-Z]+QZX/g, () =>
      seen++ === 0 ? second : first,
    );

    const result = restore_entities(swapped, entities);

    expect(result.missing).toBe(0);
    expect(result.text).toContain("493028");
    expect(result.text).toContain("581920");
  });

  it("keeps entities that stay in order after translation", () => {
    const { masked, entities } = protect_entities(
      "Erster Code 493028, zweiter Code 581920.",
    );
    const reordered = `Second ${masked}`;

    expect(restore_entities(reordered, entities).missing).toBe(0);
  });

  it("protects every entity in a dense transactional line", () => {
    const text =
      "Bestellung #ABC-12345-XY vom 23.07.2026 über 1.249,90 EUR, Code 493028, Sendung JD014600006281746337.";

    expect(round_trip(text)).toBe(text);
  });
});

describe("segmentation", () => {
  it("returns nothing for blank text", () => {
    expect(segment_sentences("   ", "de")).toEqual([]);
  });

  it("preserves the original text when joined", () => {
    const text = "Erste Nachricht. Zweite Nachricht! Dritte?";
    const parts = segment_sentences(text, "de");

    expect(parts.join("")).toBe(text);
  });

  it("maps segments back onto their nodes deterministically", () => {
    const texts = ["Eins. Zwei.", "Drei."];
    const nodes = segment_nodes(texts, "de");
    const flat = flatten_segments(nodes);

    expect(expected_segment_count(nodes)).toBe(flat.length);
    expect(flat.map((segment) => segment.node_index)).toEqual([0, 0, 1]);

    const regrouped = regroup_segments(
      nodes,
      flat.map((segment) => segment.text),
    );

    expect(regrouped).toEqual(texts);
  });

  it("keeps node count stable when a node yields no segments", () => {
    const nodes = segment_nodes(["Hallo.", "   "], "de");

    expect(regroup_segments(nodes, ["Hello."])).toEqual(["Hello.", ""]);
  });
});
