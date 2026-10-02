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

import { sanitize_compose_paste } from "./html_sanitizer_compose";

describe("sanitize_compose_paste font and marker rules", () => {
  it("runs the style of a converted font element through the css filter", () => {
    const out = sanitize_compose_paste(
      '<font color="red" style="background:url(https://t.example/p.png);font-weight:bold">x</font>',
    );

    expect(out).not.toContain("<font");
    expect(out).not.toContain("t.example");
    expect(out).toContain("<span");
    expect(out).toContain("x");
  });

  it("keeps the font color on the span", () => {
    const out = sanitize_compose_paste('<font color="#ff0000">x</font>');

    expect(out).toContain("color: #ff0000");
  });

  it("drops the signature marker on an ordinary paste", () => {
    const out = sanitize_compose_paste(
      '<div data-aster-signature="1" data-aster-signature-id="s1">sig</div>',
    );

    expect(out).not.toContain("data-aster-signature");
    expect(out).toContain("sig");
  });

  it("keeps the signature marker when asked", () => {
    const out = sanitize_compose_paste(
      '<div data-aster-signature="1" data-aster-signature-id="s1" data-other="x">sig</div>',
      { keep_signature_marker: true },
    );

    expect(out).toContain('data-aster-signature="1"');
    expect(out).toContain('data-aster-signature-id="s1"');
    expect(out).not.toContain("data-other");
  });
});
