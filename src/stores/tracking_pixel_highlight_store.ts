//
// Aster Communications Inc.
//
// Copyright (c) 2026 Aster Communications Inc.
//
// This file is part of this project.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
// GNU Affero General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License
// along with this program. If not, see <https://www.gnu.org/licenses/>.
//
import { useEffect, useSyncExternalStore } from "react";

let highlight_requests = 0;
const marker_counts = new Map<symbol, number>();
let marker_total = 0;
const listeners = new Set<() => void>();

function notify() {
  for (const l of listeners) l();
}

function subscribe(listener: () => void) {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}

function get_highlighted(): boolean {
  return highlight_requests > 0;
}

function get_marker_total(): number {
  return marker_total;
}

export function request_tracking_pixel_highlight(): () => void {
  let released = false;

  highlight_requests += 1;
  notify();

  return () => {
    if (released) return;
    released = true;
    highlight_requests -= 1;
    notify();
  };
}

export function report_tracking_pixel_markers(
  owner: symbol,
  count: number,
): void {
  if (count > 0) marker_counts.set(owner, count);
  else marker_counts.delete(owner);
  let total = 0;

  for (const value of marker_counts.values()) total += value;
  if (total === marker_total) return;
  marker_total = total;
  notify();
}

export function use_tracking_pixel_highlight_request(active: boolean): void {
  useEffect(() => {
    if (!active) return;

    return request_tracking_pixel_highlight();
  }, [active]);
}

export function use_tracking_pixels_highlighted(): boolean {
  return useSyncExternalStore(subscribe, get_highlighted, get_highlighted);
}

export function use_tracking_pixel_marker_total(): number {
  return useSyncExternalStore(subscribe, get_marker_total, get_marker_total);
}
