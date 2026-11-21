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
import type { ToastPositionLayout } from "@/components/toast/toast_position";

import { useSyncExternalStore } from "react";

export interface ActionToastBox {
  height: number;
  edge: string;
  is_top: boolean;
}

const STACK_GAP_PX = 8;

let current_box: ActionToastBox | null = null;
const box_listeners = new Set<() => void>();

export function get_action_toast_box(): ActionToastBox | null {
  return current_box;
}

export function publish_action_toast_box(box: ActionToastBox | null): void {
  if (
    box &&
    current_box &&
    box.height === current_box.height &&
    box.edge === current_box.edge &&
    box.is_top === current_box.is_top
  ) {
    return;
  }
  if (!box && !current_box) return;
  current_box = box;
  box_listeners.forEach((listener) => listener());
}

function subscribe_action_toast_box(listener: () => void): () => void {
  box_listeners.add(listener);

  return () => {
    box_listeners.delete(listener);
  };
}

export function use_action_toast_box(): ActionToastBox | null {
  return useSyncExternalStore(
    subscribe_action_toast_box,
    get_action_toast_box,
    get_action_toast_box,
  );
}

export function stack_clear_of_action_toast<T extends ToastPositionLayout>(
  layout: T,
  box: ActionToastBox | null,
): T {
  if (!box || box.height <= 0) return layout;

  const is_top = "top" in layout.style;

  if (is_top !== box.is_top) return layout;

  const edge = `calc(${box.edge} + ${Math.round(box.height) + STACK_GAP_PX}px)`;

  return {
    ...layout,
    style: is_top ? { top: edge } : { bottom: edge },
  };
}
