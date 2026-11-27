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
import { useEffect, useRef, useState } from "react";

export const GALLERY_THUMB_ROOT_MARGIN = "200px 0px";
export const GALLERY_THUMB_ROOT_SELECTOR = ".profile_picture_grid";

interface GalleryThumbProps {
  src: string;
  className?: string;
}

function can_observe(): boolean {
  return typeof IntersectionObserver !== "undefined";
}

export function GalleryThumb({ src, className }: GalleryThumbProps) {
  const ref = useRef<HTMLImageElement>(null);
  const [near_view, set_near_view] = useState(() => !can_observe());

  useEffect(() => {
    if (near_view) return;

    const element = ref.current;

    if (!element) return;

    const root = element.closest(GALLERY_THUMB_ROOT_SELECTOR);
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          set_near_view(true);
          observer.disconnect();
        }
      },
      { root, rootMargin: GALLERY_THUMB_ROOT_MARGIN },
    );

    observer.observe(element);

    return () => observer.disconnect();
  }, [near_view]);

  return (
    <img
      ref={ref}
      alt=""
      className={className}
      data-thumb-src={src}
      decoding="async"
      draggable={false}
      loading="lazy"
      referrerPolicy="no-referrer"
      src={near_view ? src : undefined}
    />
  );
}
