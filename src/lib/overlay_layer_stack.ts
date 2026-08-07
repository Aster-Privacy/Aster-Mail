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
import { useEffect, useRef } from "react";

const overlay_layer_stack: symbol[] = [];
const blocking_overlay_layers = new Set<symbol>();

export function push_overlay_layer(id: symbol, blocking = true): void {
  const index = overlay_layer_stack.indexOf(id);

  if (index !== -1) overlay_layer_stack.splice(index, 1);
  overlay_layer_stack.push(id);
  if (blocking) blocking_overlay_layers.add(id);
}

export function remove_overlay_layer(id: symbol): void {
  const index = overlay_layer_stack.indexOf(id);

  if (index !== -1) overlay_layer_stack.splice(index, 1);
  blocking_overlay_layers.delete(id);
}

export function is_top_overlay_layer(id: symbol): boolean {
  return overlay_layer_stack[overlay_layer_stack.length - 1] === id;
}

export function has_open_overlay_layer(): boolean {
  return blocking_overlay_layers.size > 0;
}

export function use_overlay_layer(
  is_open: boolean,
  label = "overlay",
  blocking = true,
): symbol {
  const id_ref = useRef<symbol | null>(null);

  if (id_ref.current === null) id_ref.current = Symbol(label);

  useEffect(() => {
    if (!is_open) return;

    const id = id_ref.current!;

    push_overlay_layer(id, blocking);

    return () => remove_overlay_layer(id);
  }, [is_open, blocking]);

  return id_ref.current;
}

export function use_escape_layer(
  is_open: boolean,
  on_close: () => void,
  label = "overlay",
  blocking = true,
): symbol {
  const id = use_overlay_layer(is_open, label, blocking);
  const close_ref = useRef(on_close);

  useEffect(() => {
    close_ref.current = on_close;
  }, [on_close]);

  useEffect(() => {
    if (!is_open) return;

    const handle_escape = (e: KeyboardEvent) => {
      if (e["key"] !== "Escape") return;
      if (!is_top_overlay_layer(id)) return;
      e.preventDefault();
      close_ref.current();
    };

    document.addEventListener("keydown", handle_escape);

    return () => document.removeEventListener("keydown", handle_escape);
  }, [is_open, id]);

  return id;
}
