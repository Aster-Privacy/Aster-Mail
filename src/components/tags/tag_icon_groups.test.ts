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

import {
  TAG_ICONS,
  TAG_ICON_GROUPS,
  tag_icon_map,
} from "@/components/ui/email_tag";
import { en } from "@/lib/i18n/translations/en";

describe("tag icon groups", () => {
  it("covers every icon exactly once", () => {
    const grouped = TAG_ICON_GROUPS.flatMap((group) => group.icons);

    expect(new Set(grouped).size).toBe(grouped.length);
    expect([...grouped].sort()).toEqual([...TAG_ICONS].sort());
  });

  it("renders a component for every icon", () => {
    for (const icon_name of TAG_ICONS) {
      expect(tag_icon_map[icon_name]).toBeTruthy();
    }
  });

  it("has a translated heading for every group", () => {
    for (const group of TAG_ICON_GROUPS) {
      const key = group.label_key.replace("common.", "");

      expect(en.common[key as keyof typeof en.common]).toBeTruthy();
    }
  });
});
