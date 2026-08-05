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
const KEYBOARD_KEYS = new Set([
  "Tab",
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "Home",
  "End",
  "PageUp",
  "PageDown",
]);

let initialized = false;

export function start_input_modality_tracking() {
  if (initialized || typeof document === "undefined") return;
  initialized = true;

  const root = document.documentElement;

  const set_modality = (modality: "keyboard" | "pointer") => {
    if (root.getAttribute("data-input-modality") === modality) return;
    root.setAttribute("data-input-modality", modality);
  };

  set_modality("pointer");

  const handle_key = (e: KeyboardEvent) => {
    if (e.metaKey || e.altKey || e.ctrlKey) return;
    if (!KEYBOARD_KEYS.has(e.key)) return;
    set_modality("keyboard");
  };

  const handle_pointer = () => set_modality("pointer");

  window.addEventListener("keydown", handle_key, true);
  window.addEventListener("mousedown", handle_pointer, true);
  window.addEventListener("pointerdown", handle_pointer, true);
  window.addEventListener("touchstart", handle_pointer, true);
}
