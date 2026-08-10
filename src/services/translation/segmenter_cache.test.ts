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
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { reset_sentence_segmenters, segment_sentences } from "./text_prepare";

interface SegmenterHolder {
  Segmenter?: unknown;
}

describe("sentence segmenter cache", () => {
  const intl = Intl as unknown as SegmenterHolder;
  const original = intl.Segmenter;

  beforeEach(() => {
    reset_sentence_segmenters();
  });

  afterEach(() => {
    intl.Segmenter = original;
    reset_sentence_segmenters();
  });

  it("constructs one segmenter per locale rather than one per call", () => {
    const spy = vi.fn(function (locale?: string) {
      return {
        locale,
        segment: (input: string) =>
          input
            .split(/(?<=[.。])/u)
            .filter(Boolean)
            .map((segment) => ({ segment })),
      };
    });

    intl.Segmenter = spy;

    for (let index = 0; index < 25; index += 1) {
      segment_sentences("これはテストです。二番目の文です。", "ja");
    }

    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0][0]).toBe("ja");

    segment_sentences("Une phrase. Une autre.", "fr");

    expect(spy).toHaveBeenCalledTimes(2);
    expect(spy.mock.calls[1][0]).toBe("fr");
  });

  it("falls back to a locale-less segmenter when a locale is rejected", () => {
    const spy = vi.fn(function (locale?: string) {
      if (locale) throw new RangeError("unsupported locale");

      return {
        segment: (input: string) => [{ segment: input }],
      };
    });

    intl.Segmenter = spy;

    expect(segment_sentences("body text", "ja")).toEqual(["body text"]);
    expect(segment_sentences("body text", "ja")).toEqual(["body text"]);

    expect(spy).toHaveBeenCalledTimes(2);
  });

  it("splits Japanese text on ideographic full stops", () => {
    reset_sentence_segmenters();

    const parts = segment_sentences(
      "お疲れ様です。今後の仕事連絡の効率化を図るため、ご返信ください。",
      "ja",
    );

    expect(parts.length).toBeGreaterThan(1);
    expect(parts.join("")).toBe(
      "お疲れ様です。今後の仕事連絡の効率化を図るため、ご返信ください。",
    );
  });
});
