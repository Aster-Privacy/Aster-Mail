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
import { useMemo, useSyncExternalStore } from "react";

import { accent_icon_matrix } from "@/lib/accent_icon_tint";

export const ACCENT_ICON_FILTER_ID = "aster-accent-icon-tint";

function read_accent_snapshot(): string {
  const style = getComputedStyle(document.documentElement);
  const accent = style.getPropertyValue("--accent-color").trim();
  const on_accent = style.getPropertyValue("--accent-fg").trim();

  return `${accent}|${on_accent}`;
}

function read_server_snapshot(): string {
  return "|";
}

function subscribe_accent(on_change: () => void): () => void {
  const observer = new MutationObserver(on_change);

  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class", "style", "data-theme"],
  });

  const media =
    typeof window.matchMedia === "function"
      ? window.matchMedia("(prefers-color-scheme: dark)")
      : null;

  media?.addEventListener("change", on_change);

  return () => {
    observer.disconnect();
    media?.removeEventListener("change", on_change);
  };
}

export function AccentIconFilter() {
  const snapshot = useSyncExternalStore(
    subscribe_accent,
    read_accent_snapshot,
    read_server_snapshot,
  );
  const values = useMemo(() => {
    const [accent, on_accent] = snapshot.split("|");

    return accent_icon_matrix(accent, on_accent);
  }, [snapshot]);

  return (
    <svg
      aria-hidden="true"
      className="accent_icon_filter_defs"
      focusable="false"
      height="0"
      width="0"
    >
      <filter
        colorInterpolationFilters="sRGB"
        height="1"
        id={ACCENT_ICON_FILTER_ID}
        width="1"
        x="0"
        y="0"
      >
        <feColorMatrix type="matrix" values={values} />
      </filter>
    </svg>
  );
}
