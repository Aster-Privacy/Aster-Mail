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
  apply_skin_tone,
  is_tone_capable,
  normalize_skin_tone,
  skin_tones,
} from "@/config/emoji/skin_tones";

const cp = (...points: number[]) => String.fromCodePoint(...points);

describe("apply_skin_tone", () => {
  it("leaves every emoji unchanged with the default tone", () => {
    expect(apply_skin_tone("👍", "default")).toBe("👍");
    expect(apply_skin_tone("👩‍💻", "default")).toBe("👩‍💻");
  });

  it("tones a single hand emoji", () => {
    expect(apply_skin_tone("👍", "medium")).toBe(cp(0x1f44d, 0x1f3fd));
    expect(apply_skin_tone("👋", "dark")).toBe(cp(0x1f44b, 0x1f3ff));
  });

  it("replaces the variation selector instead of appending after it", () => {
    expect(apply_skin_tone("✌️", "light")).toBe(cp(0x270c, 0x1f3fb));
    expect(apply_skin_tone("☝️", "medium_dark")).toBe(cp(0x261d, 0x1f3fe));
  });

  it("puts the modifier after the person in a profession sequence", () => {
    expect(apply_skin_tone(cp(0x1f469, 0x200d, 0x1f4bb), "medium_light")).toBe(
      cp(0x1f469, 0x1f3fc, 0x200d, 0x1f4bb),
    );
    expect(apply_skin_tone(cp(0x1f9d1, 0x200d, 0x1f692), "dark")).toBe(
      cp(0x1f9d1, 0x1f3ff, 0x200d, 0x1f692),
    );
  });

  it("keeps the gender sign intact on a gendered sequence", () => {
    expect(
      apply_skin_tone(cp(0x1f575, 0xfe0f, 0x200d, 0x2640, 0xfe0f), "medium"),
    ).toBe(cp(0x1f575, 0x1f3fd, 0x200d, 0x2640, 0xfe0f));
    expect(apply_skin_tone(cp(0x1f937, 0x200d, 0x2642, 0xfe0f), "light")).toBe(
      cp(0x1f937, 0x1f3fb, 0x200d, 0x2642, 0xfe0f),
    );
  });

  it("tones both people in a holding hands or couple sequence", () => {
    expect(
      apply_skin_tone(cp(0x1f9d1, 0x200d, 0x1f91d, 0x200d, 0x1f9d1), "dark"),
    ).toBe(cp(0x1f9d1, 0x1f3ff, 0x200d, 0x1f91d, 0x200d, 0x1f9d1, 0x1f3ff));
    expect(
      apply_skin_tone(
        cp(0x1f469, 0x200d, 0x2764, 0xfe0f, 0x200d, 0x1f468),
        "medium",
      ),
    ).toBe(
      cp(0x1f469, 0x1f3fd, 0x200d, 0x2764, 0xfe0f, 0x200d, 0x1f468, 0x1f3fd),
    );
  });

  it("leaves neutral emoji and families unchanged", () => {
    for (const emoji of ["😂", "❤️", "🎉", "🔥", "🏳️‍🌈", "👁️‍🗨️", "🐻‍❄️"]) {
      expect(apply_skin_tone(emoji, "dark")).toBe(emoji);
    }
    const family = cp(0x1f468, 0x200d, 0x1f469, 0x200d, 0x1f467);

    expect(apply_skin_tone(family, "dark")).toBe(family);
    expect(apply_skin_tone("👪", "dark")).toBe("👪");
    expect(apply_skin_tone("🤼", "dark")).toBe("🤼");
  });

  it("never stacks a second modifier on an emoji that already has one", () => {
    const toned = cp(0x1f44d, 0x1f3fb);

    expect(is_tone_capable(toned)).toBe(false);
    expect(apply_skin_tone(toned, "dark")).toBe(toned);
  });

  it("produces a distinct emoji for every tone", () => {
    const results = new Set(
      skin_tones.map((tone) => apply_skin_tone("👍", tone)),
    );

    expect(results.size).toBe(skin_tones.length);
  });
});

describe("is_tone_capable", () => {
  it("accepts people and hands and rejects objects", () => {
    expect(is_tone_capable("👍")).toBe(true);
    expect(is_tone_capable("🤝")).toBe(true);
    expect(is_tone_capable(cp(0x1f469, 0x200d, 0x1f4bb))).toBe(true);
    expect(is_tone_capable("😂")).toBe(false);
    expect(is_tone_capable("")).toBe(false);
  });
});

describe("normalize_skin_tone", () => {
  it("keeps known tones and falls back to default", () => {
    for (const tone of skin_tones) {
      expect(normalize_skin_tone(tone)).toBe(tone);
    }
    expect(normalize_skin_tone("purple")).toBe("default");
    expect(normalize_skin_tone(undefined)).toBe("default");
    expect(normalize_skin_tone(3)).toBe("default");
  });
});
