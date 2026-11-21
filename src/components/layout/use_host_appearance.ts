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

export interface HostAppearance {
  theme: "light" | "dark";
  palette: string;
  accent: string;
}

const PALETTE_PREFIX = "theme-";
const HEX_ACCENT = /^#[0-9a-f]{6}$/i;

export function read_host_appearance(root: HTMLElement): HostAppearance {
  const palette_class = Array.from(root.classList).find((name) =>
    name.startsWith(PALETTE_PREFIX),
  );
  const accent = getComputedStyle(root)
    .getPropertyValue("--accent-color")
    .trim()
    .toLowerCase();

  return {
    theme: root.classList.contains("dark") ? "dark" : "light",
    palette: palette_class
      ? palette_class.slice(PALETTE_PREFIX.length)
      : "default",
    accent: HEX_ACCENT.test(accent) ? accent : "",
  };
}

function same_appearance(a: HostAppearance, b: HostAppearance): boolean {
  return a.theme === b.theme && a.palette === b.palette && a.accent === b.accent;
}

export function use_host_appearance(): HostAppearance {
  const [appearance, set_appearance] = useState<HostAppearance>(() =>
    read_host_appearance(document.documentElement),
  );

  useEffect(() => {
    const root = document.documentElement;
    const sync = () => {
      const next = read_host_appearance(root);

      set_appearance((current) =>
        same_appearance(current, next) ? current : next,
      );
    };
    const observer = new MutationObserver(sync);

    observer.observe(root, {
      attributes: true,
      attributeFilter: ["class", "style"],
    });
    sync();

    return () => observer.disconnect();
  }, []);

  return appearance;
}
