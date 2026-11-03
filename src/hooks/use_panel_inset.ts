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
import {
  useLayoutEffect,
  useRef,
  useSyncExternalStore,
  type RefObject,
} from "react";

type InsetListener = () => void;

let inset_owner: symbol | null = null;
let inset_px = 0;
const inset_listeners = new Set<InsetListener>();

function set_inset(px: number): void {
  if (inset_px === px) return;

  inset_px = px;

  for (const listener of Array.from(inset_listeners)) {
    listener();
  }
}

export function get_panel_inset(): number {
  return inset_px;
}

export function subscribe_panel_inset(listener: InsetListener): () => void {
  inset_listeners.add(listener);

  return () => {
    inset_listeners.delete(listener);
  };
}

export function use_quick_panel_inset(): number {
  return useSyncExternalStore(
    subscribe_panel_inset,
    get_panel_inset,
    get_panel_inset,
  );
}

export function use_panel_inset(
  is_open: boolean,
  panel_ref: RefObject<HTMLElement | null>,
) {
  const owner_ref = useRef<symbol | null>(null);

  if (!owner_ref.current) owner_ref.current = Symbol("quick_panel_inset");

  useLayoutEffect(() => {
    const owner = owner_ref.current;
    const panel = panel_ref.current;

    const release = () => {
      if (inset_owner !== null && inset_owner !== owner) return;

      inset_owner = null;
      set_inset(0);
    };

    if (!is_open || !panel) {
      release();

      return;
    }

    inset_owner = owner;

    const sync_inset = () => {
      set_inset(Math.round(panel.getBoundingClientRect().width));
    };

    sync_inset();

    const observer = new ResizeObserver(sync_inset);

    observer.observe(panel);
    window.addEventListener("resize", sync_inset);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", sync_inset);
      release();
    };
  }, [is_open, panel_ref]);
}
