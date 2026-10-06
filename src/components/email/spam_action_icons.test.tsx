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
import type { ComponentType, SVGProps } from "react";

import { describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import * as outline from "@heroicons/react/24/outline";
import * as solid from "@heroicons/react/24/solid";

import { NotSpamIcon, ReportSpamIcon } from "./spam_action_icons";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

type Icon = ComponentType<SVGProps<SVGSVGElement>>;

function icon_markup(Icon: Icon): string | undefined {
  const host = document.createElement("div");
  const root = createRoot(host);

  act(() => root.render(<Icon />));
  const markup = host.querySelector("svg")?.innerHTML;

  act(() => root.unmount());

  return markup;
}

function shield_icons(set: Record<string, unknown>): Icon[] {
  return Object.entries(set)
    .filter(([name]) => name.startsWith("Shield"))
    .map(([, icon]) => icon as Icon);
}

describe("spam action icons", () => {
  it("gives report spam and not spam different icons", () => {
    expect(NotSpamIcon).not.toBe(ReportSpamIcon);
    expect(icon_markup(NotSpamIcon)).not.toBe(icon_markup(ReportSpamIcon));
  });

  it("keeps not spam off the tracking protection shield", () => {
    const shields = [...shield_icons(outline), ...shield_icons(solid)];

    expect(shields).toContain(solid.ShieldCheckIcon);
    expect(shields).toContain(outline.ShieldCheckIcon);
    for (const shield of shields) {
      expect(NotSpamIcon).not.toBe(shield);
      expect(icon_markup(NotSpamIcon)).not.toBe(icon_markup(shield));
    }
  });

  it("keeps report spam off the shield icons used for security", () => {
    for (const shield of [...shield_icons(outline), ...shield_icons(solid)]) {
      expect(ReportSpamIcon).not.toBe(shield);
    }
  });
});
