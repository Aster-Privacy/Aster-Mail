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
import { useEffect, useRef, useState, type RefObject } from "react";

import { TrackingPixelDot } from "@/components/email/tracking_pixel_dot";
import {
  report_tracking_pixel_markers,
  use_tracking_pixels_highlighted,
} from "@/stores/tracking_pixel_highlight_store";

export const TRACKING_PIXEL_MARKER_SIZE_PX = 16;

const TRACKING_PIXEL_SELECTOR =
  "img[data-blocked='true'][data-tracking-pixel='true']";

const CLIPPING_OVERFLOW = /hidden|clip|auto|scroll/;

export interface TrackingPixelMarker {
  key: string;
  top: number;
  left: number;
}

interface MarkerBounds {
  offset_left: number;
  offset_top: number;
  width: number;
  height: number;
}

function clipped_away(el: Element, view: Window, body: HTMLElement): boolean {
  for (
    let node = el.parentElement;
    node && node !== body;
    node = node.parentElement
  ) {
    const style = view.getComputedStyle(node);

    if (
      !CLIPPING_OVERFLOW.test(
        `${style.overflow} ${style.overflowX} ${style.overflowY}`,
      )
    )
      continue;
    const rect = node.getBoundingClientRect();

    if (rect.width < 1 || rect.height < 1) return true;
  }

  return false;
}

function is_shown(img: HTMLImageElement, view: Window): boolean {
  if (img.getClientRects().length === 0) return false;
  if (
    typeof img.checkVisibility === "function" &&
    !img.checkVisibility({ opacityProperty: true, visibilityProperty: true })
  )
    return false;

  return !clipped_away(img, view, img.ownerDocument.body);
}

function clamp(value: number, max: number): number {
  return Math.round(Math.min(Math.max(value, 0), Math.max(max, 0)));
}

export function locate_tracking_pixel_markers(
  doc: Document,
  bounds: MarkerBounds,
): TrackingPixelMarker[] {
  const view = doc.defaultView;

  if (!view || !doc.body) return [];
  const half = TRACKING_PIXEL_MARKER_SIZE_PX / 2;
  const markers = new Map<string, TrackingPixelMarker>();

  for (const img of Array.from(
    doc.querySelectorAll<HTMLImageElement>(TRACKING_PIXEL_SELECTOR),
  )) {
    if (!is_shown(img, view)) continue;
    const rect = img.getBoundingClientRect();
    const left = clamp(
      bounds.offset_left + rect.left,
      bounds.width - TRACKING_PIXEL_MARKER_SIZE_PX,
    );
    const top = clamp(
      bounds.offset_top + rect.top + rect.height / 2 - half,
      bounds.height - TRACKING_PIXEL_MARKER_SIZE_PX,
    );
    const key = `${Math.round(left / half)}:${Math.round(top / half)}`;

    if (!markers.has(key)) markers.set(key, { key, top, left });
  }

  return Array.from(markers.values());
}

function same_markers(
  a: TrackingPixelMarker[],
  b: TrackingPixelMarker[],
): boolean {
  return (
    a.length === b.length &&
    a.every(
      (marker, index) =>
        marker.top === b[index].top && marker.left === b[index].left,
    )
  );
}

export function watch_tracking_pixel_markers(
  iframe: HTMLIFrameElement,
  on_change: (markers: TrackingPixelMarker[]) => void,
): () => void {
  const doc = iframe.contentDocument;
  const container = iframe.parentElement;

  if (!doc?.body || !container) {
    on_change([]);

    return () => {};
  }
  let current: TrackingPixelMarker[] = [];
  let frame = 0;
  const measure = () => {
    frame = 0;
    const next =
      doc === iframe.contentDocument
        ? locate_tracking_pixel_markers(doc, {
            offset_left: iframe.offsetLeft,
            offset_top: iframe.offsetTop,
            width: container.clientWidth,
            height: container.clientHeight,
          })
        : [];

    if (same_markers(current, next)) return;
    current = next;
    on_change(next);
  };
  const schedule = () => {
    if (!frame) frame = requestAnimationFrame(measure);
  };
  const resize_observer =
    typeof ResizeObserver !== "undefined" ? new ResizeObserver(schedule) : null;
  const mutation_observer = new MutationObserver(schedule);

  resize_observer?.observe(iframe);
  resize_observer?.observe(doc.body);
  mutation_observer.observe(doc.body, {
    attributes: true,
    attributeFilter: ["data-blocked", "open", "style", "class", "hidden"],
    childList: true,
    subtree: true,
  });
  doc.addEventListener("toggle", schedule, true);
  window.addEventListener("resize", schedule);
  measure();

  return () => {
    if (frame) cancelAnimationFrame(frame);
    resize_observer?.disconnect();
    mutation_observer.disconnect();
    doc.removeEventListener("toggle", schedule, true);
    window.removeEventListener("resize", schedule);
  };
}

interface TrackingPixelMarkersProps {
  iframe_ref: RefObject<HTMLIFrameElement | null>;
  label: string;
}

export function TrackingPixelMarkers({
  iframe_ref,
  label,
}: TrackingPixelMarkersProps) {
  const owner_ref = useRef(Symbol("tracking_pixel_markers"));
  const highlighted = use_tracking_pixels_highlighted();
  const [markers, set_markers] = useState<TrackingPixelMarker[]>([]);

  useEffect(() => {
    const iframe = iframe_ref.current;

    if (!highlighted || !iframe) return;
    let stop = watch_tracking_pixel_markers(iframe, set_markers);
    const restart = () => {
      stop();
      stop = watch_tracking_pixel_markers(iframe, set_markers);
    };

    iframe.addEventListener("load", restart);

    return () => {
      iframe.removeEventListener("load", restart);
      stop();
      set_markers([]);
    };
  }, [highlighted, iframe_ref]);

  useEffect(() => {
    const owner = owner_ref.current;

    report_tracking_pixel_markers(owner, markers.length);

    return () => report_tracking_pixel_markers(owner, 0);
  }, [markers.length]);

  if (!highlighted || markers.length === 0) return null;

  return (
    <div
      className="pointer-events-none absolute inset-0 print:hidden"
      data-testid="tracking-pixel-markers"
    >
      {markers.map((marker) => (
        <span
          key={marker.key}
          aria-label={label}
          className="absolute flex items-center justify-center"
          data-tracking-pixel-marker=""
          role="img"
          style={{
            top: marker.top,
            left: marker.left,
            width: TRACKING_PIXEL_MARKER_SIZE_PX,
            height: TRACKING_PIXEL_MARKER_SIZE_PX,
          }}
        >
          <TrackingPixelDot />
        </span>
      ))}
    </div>
  );
}
