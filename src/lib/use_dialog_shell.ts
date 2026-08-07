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
import type { PointerEvent as ReactPointerEvent } from "react";

import { useCallback, useEffect, useRef } from "react";

import { use_body_scroll_lock } from "@/lib/body_scroll_lock";
import { is_top_overlay_layer, use_escape_layer } from "@/lib/overlay_layer_stack";

const FOCUSABLE_SELECTOR =
  'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])';

export function use_focus_trap<T extends HTMLElement>(
  is_open: boolean,
  layer_id: symbol,
) {
  const dialog_ref = useRef<T>(null);

  useEffect(() => {
    if (!is_open) return;

    const node = dialog_ref.current;

    if (!node) return;

    const opener = document.activeElement as HTMLElement | null;
    const focus_started_inside = node.contains(opener);
    const previously_focused = focus_started_inside ? null : opener;

    if (!focus_started_inside) node.focus();

    const handle_tab = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      if (!is_top_overlay_layer(layer_id)) return;

      const focusables = Array.from(
        node.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
      );
      const active = document.activeElement as HTMLElement | null;

      if (focusables.length === 0) {
        e.preventDefault();
        node.focus();

        return;
      }

      const first = focusables[0];
      const last = focusables[focusables.length - 1];

      if (!node.contains(active)) {
        e.preventDefault();
        (e.shiftKey ? last : first).focus();

        return;
      }

      if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handle_tab, true);

    return () => {
      document.removeEventListener("keydown", handle_tab, true);
      previously_focused?.focus?.();
    };
  }, [is_open, layer_id]);

  return dialog_ref;
}

export function use_backdrop_dismiss(on_dismiss: () => void) {
  return useCallback(
    (e: ReactPointerEvent<HTMLElement>) => {
      if (e.target !== e.currentTarget) return;
      if (e.button !== 0) return;

      on_dismiss();
    },
    [on_dismiss],
  );
}

export function use_dialog_shell<T extends HTMLElement>(
  is_open: boolean,
  on_close: () => void,
  label = "dialog",
) {
  const layer_id = use_escape_layer(is_open, on_close, label);
  const dialog_ref = use_focus_trap<T>(is_open, layer_id);
  const handle_backdrop_pointer_down = use_backdrop_dismiss(on_close);

  use_body_scroll_lock(is_open);

  return { layer_id, dialog_ref, handle_backdrop_pointer_down };
}
