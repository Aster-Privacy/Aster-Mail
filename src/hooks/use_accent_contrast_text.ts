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
import { useEffect, useState } from "react";

import { get_contrast_text_for_css_color } from "@/lib/avatar_color";

function read_accent_contrast_text(): "#ffffff" | "#111827" {
  if (typeof window === "undefined") return "#ffffff";

  const accent = getComputedStyle(document.documentElement)
    .getPropertyValue("--accent-color")
    .trim();

  if (!accent) return "#ffffff";

  return get_contrast_text_for_css_color(accent);
}

export function use_accent_contrast_text(): "#ffffff" | "#111827" {
  const [contrast_text, set_contrast_text] = useState(read_accent_contrast_text);

  useEffect(() => {
    const sync = () => {
      set_contrast_text(read_accent_contrast_text());
    };

    sync();

    const observer = new MutationObserver(sync);

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "style"],
    });

    return () => observer.disconnect();
  }, []);

  return contrast_text;
}
