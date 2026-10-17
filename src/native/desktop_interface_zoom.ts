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

export const INTERFACE_ZOOM_STEPS = [
  0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2,
] as const;
export const INTERFACE_ZOOM_DEFAULT = 1;
export const INTERFACE_ZOOM_EVENT = "aster:interface-zoom";

type zoom_direction = "in" | "out" | "reset";

let current_zoom = INTERFACE_ZOOM_DEFAULT;
let shortcuts_started = false;
let pending_change: Promise<number> = Promise.resolve(INTERFACE_ZOOM_DEFAULT);

export function is_interface_zoom_supported(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export function normalize_interface_zoom(value: number): number {
  if (!Number.isFinite(value)) return INTERFACE_ZOOM_DEFAULT;
  const min = INTERFACE_ZOOM_STEPS[0];
  const max = INTERFACE_ZOOM_STEPS[INTERFACE_ZOOM_STEPS.length - 1];
  const clamped = Math.min(max, Math.max(min, value));

  return Math.round(clamped * 100) / 100;
}

export function next_interface_zoom(
  value: number,
  direction: zoom_direction,
): number {
  if (direction === "reset") return INTERFACE_ZOOM_DEFAULT;
  const current = normalize_interface_zoom(value);

  if (direction === "in") {
    const larger = INTERFACE_ZOOM_STEPS.find((step) => step > current + 0.001);

    return larger ?? INTERFACE_ZOOM_STEPS[INTERFACE_ZOOM_STEPS.length - 1];
  }
  const smaller = [...INTERFACE_ZOOM_STEPS]
    .reverse()
    .find((step) => step < current - 0.001);

  return smaller ?? INTERFACE_ZOOM_STEPS[0];
}

export function zoom_direction_for_key(
  event: Pick<
    KeyboardEvent,
    "key" | "code" | "ctrlKey" | "metaKey" | "altKey" | "shiftKey"
  >,
  is_mac: boolean,
): zoom_direction | null {
  const modifier = is_mac ? event.metaKey : event.ctrlKey;
  const other_modifier = is_mac ? event.ctrlKey : event.metaKey;

  if (!modifier || other_modifier || event.altKey) return null;
  if (event.key === "=" || event.key === "+" || event.code === "NumpadAdd") {
    return "in";
  }
  if (
    event.key === "-" ||
    event.key === "_" ||
    event.code === "NumpadSubtract"
  ) {
    return "out";
  }
  if (event.shiftKey) return null;
  if (event.key === "0" || event.code === "Numpad0") {
    return "reset";
  }

  return null;
}

function announce(value: number): void {
  current_zoom = value;
  window.dispatchEvent(
    new CustomEvent<number>(INTERFACE_ZOOM_EVENT, { detail: value }),
  );
}

export async function get_interface_zoom(): Promise<number> {
  if (!is_interface_zoom_supported()) return INTERFACE_ZOOM_DEFAULT;
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    const value = normalize_interface_zoom(
      Number(await invoke<number>("get_interface_zoom")),
    );

    current_zoom = value;

    return value;
  } catch {
    return current_zoom;
  }
}

export function set_interface_zoom(value: number): Promise<number> {
  const requested = normalize_interface_zoom(value);

  pending_change = pending_change.then(async () => {
    if (!is_interface_zoom_supported()) return current_zoom;
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const applied = normalize_interface_zoom(
        Number(await invoke<number>("set_interface_zoom", { zoom: requested })),
      );

      announce(applied);

      return applied;
    } catch {
      return current_zoom;
    }
  });

  return pending_change;
}

export function step_interface_zoom(
  direction: zoom_direction,
): Promise<number> {
  return set_interface_zoom(next_interface_zoom(current_zoom, direction));
}

function detect_mac(): boolean {
  const nav = navigator as Navigator & {
    userAgentData?: { platform?: string };
  };
  const platform = (
    nav.userAgentData?.platform ||
    navigator.platform ||
    ""
  ).toLowerCase();

  return platform.includes("mac");
}

export async function start_desktop_interface_zoom(): Promise<void> {
  if (!is_interface_zoom_supported() || shortcuts_started) return;
  shortcuts_started = true;
  const is_mac = detect_mac();

  window.addEventListener(
    "keydown",
    (event) => {
      const direction = zoom_direction_for_key(event, is_mac);

      if (!direction) return;
      event.preventDefault();
      event.stopPropagation();
      void step_interface_zoom(direction);
    },
    { capture: true },
  );
  await get_interface_zoom();
}
