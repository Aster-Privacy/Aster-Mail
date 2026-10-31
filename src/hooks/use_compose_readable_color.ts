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
import type { RefObject } from "react";

import { useEffect } from "react";

import { use_preferences_optional } from "@/contexts/preferences_context/provider";
import { normalize_compose_font_color } from "@/lib/compose_defaults";
import {
  build_compose_readable_css,
  compose_display_text_color,
  resolve_effective_background,
  resolve_text_color,
} from "@/lib/compose_readable_color";

export function use_compose_readable_color(
  editor_ref: RefObject<HTMLElement | null>,
): void {
  const preferences = use_preferences_optional()?.preferences;
  const stored = normalize_compose_font_color(preferences?.compose_font_color);

  useEffect(() => {
    if (!stored || typeof document === "undefined") return;

    const style_element = document.createElement("style");

    document.head.appendChild(style_element);

    const update = () => {
      const editor = editor_ref.current;
      const fallback = editor ?? document.body;
      const background = resolve_effective_background(fallback);
      const readable = resolve_text_color(fallback);

      if (!readable) return;

      const display = compose_display_text_color(stored, background, readable);
      const css = build_compose_readable_css(stored, display);

      if (style_element.textContent !== css) style_element.textContent = css;
    };

    update();

    const observer = new MutationObserver(update);

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "data-theme", "style"],
    });
    observer.observe(document.body, {
      attributes: true,
      attributeFilter: ["class", "data-theme", "style"],
    });
    document.addEventListener("focusin", update);

    const media =
      typeof window.matchMedia === "function"
        ? window.matchMedia("(prefers-color-scheme: dark)")
        : null;

    media?.addEventListener?.("change", update);

    return () => {
      observer.disconnect();
      document.removeEventListener("focusin", update);
      media?.removeEventListener?.("change", update);
      style_element.remove();
    };
  }, [editor_ref, stored]);
}
