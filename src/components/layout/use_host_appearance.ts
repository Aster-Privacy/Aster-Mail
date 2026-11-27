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
  surface?: Record<string, string>;
}

const PALETTE_PREFIX = "theme-";
const HEX_ACCENT = /^#[0-9a-f]{6}$/i;
const HEX_SURFACE = /^#[0-9a-f]{6}([0-9a-f]{2})?$/i;

export const HOST_SURFACE_KEYS: readonly string[] = [
  "--bg-primary",
  "--bg-secondary",
  "--bg-tertiary",
  "--bg-hover",
  "--bg-selected",
  "--bg-card",
  "--border-primary",
  "--border-secondary",
  "--text-primary",
  "--text-secondary",
  "--text-tertiary",
  "--text-muted",
  "--sidebar-bg",
  "--sidebar-hover",
  "--modal-bg",
  "--dropdown-bg",
  "--dropdown-hover",
  "--input-bg",
  "--avatar-bg",
  "--avatar-text",
  "--indicator-bg",
  "--background",
  "--foreground",
  "--card",
  "--card-foreground",
  "--popover",
  "--popover-foreground",
  "--secondary",
  "--secondary-foreground",
  "--muted",
  "--muted-foreground",
  "--accent",
  "--accent-foreground",
];

export function read_host_surface(
  root: HTMLElement,
): Record<string, string> | undefined {
  const surface: Record<string, string> = {};

  for (const key of HOST_SURFACE_KEYS) {
    const value = root.style.getPropertyValue(key).trim().toLowerCase();

    if (HEX_SURFACE.test(value)) surface[key] = value;
  }

  return Object.keys(surface).length > 0 ? surface : undefined;
}

function same_surface(
  a: Record<string, string> | undefined,
  b: Record<string, string> | undefined,
): boolean {
  if (a === b) return true;
  if (!a || !b) return false;

  const keys = Object.keys(a);

  if (keys.length !== Object.keys(b).length) return false;

  return keys.every((key) => a[key] === b[key]);
}

export function read_host_appearance(root: HTMLElement): HostAppearance {
  const palette_class = Array.from(root.classList).find((name) =>
    name.startsWith(PALETTE_PREFIX),
  );
  const accent = getComputedStyle(root)
    .getPropertyValue("--accent-color")
    .trim()
    .toLowerCase();

  const appearance: HostAppearance = {
    theme: root.classList.contains("dark") ? "dark" : "light",
    palette: palette_class
      ? palette_class.slice(PALETTE_PREFIX.length)
      : "default",
    accent: HEX_ACCENT.test(accent) ? accent : "",
  };
  const surface = read_host_surface(root);

  if (surface) appearance.surface = surface;

  return appearance;
}

function same_appearance(a: HostAppearance, b: HostAppearance): boolean {
  return (
    a.theme === b.theme &&
    a.palette === b.palette &&
    a.accent === b.accent &&
    same_surface(a.surface, b.surface)
  );
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
