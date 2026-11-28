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
import type { ComponentType, ReactElement, SVGProps } from "react";

import { describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { EnvelopeIcon } from "@heroicons/react/24/outline";

import {
  MarkReadIcon,
  MarkUnreadIcon,
  ReadToggleIcon,
  read_toggle_icon,
} from "./read_state_icons";
import { NotSpamIcon } from "./spam_action_icons";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

type Icon = ComponentType<SVGProps<SVGSVGElement>>;

function render_svg(node: ReactElement): SVGSVGElement | undefined {
  const host = document.createElement("div");
  const root = createRoot(host);

  act(() => root.render(node));
  const svg = host.querySelector("svg")?.cloneNode(true) as
    | SVGSVGElement
    | undefined;

  act(() => root.unmount());

  return svg;
}

function icon_markup(Icon: Icon): string | undefined {
  return render_svg(<Icon />)?.innerHTML;
}

describe("read state icons", () => {
  it("draws each action with its own glyph", () => {
    const glyphs = [MarkReadIcon, MarkUnreadIcon, NotSpamIcon, EnvelopeIcon];
    const markups = new Set(glyphs.map(icon_markup));

    expect(markups.size).toBe(glyphs.length);
  });

  it("marks the unread glyph with a filled dot in the icon color", () => {
    const dot = render_svg(<MarkUnreadIcon />)?.querySelector("circle");

    expect(dot?.getAttribute("fill")).toBe("currentColor");
  });

  it("shows the result of the toggle for the current state", () => {
    expect(read_toggle_icon(true)).toBe(MarkUnreadIcon);
    expect(read_toggle_icon(false)).toBe(MarkReadIcon);
    expect(read_toggle_icon(undefined)).toBe(MarkReadIcon);
    expect(render_svg(<ReadToggleIcon is_read />)?.innerHTML).toBe(
      icon_markup(MarkUnreadIcon),
    );
  });

  it("matches the outline set's stroke and accepts sizing props", () => {
    const svg = render_svg(<MarkUnreadIcon className="w-4 h-4" />);

    expect(svg?.getAttribute("stroke-width")).toBe("1.5");
    expect(svg?.getAttribute("viewBox")).toBe("0 0 24 24");
    expect(svg?.getAttribute("class")).toBe("w-4 h-4");
    expect(svg?.getAttribute("aria-hidden")).toBe("true");
  });
});
