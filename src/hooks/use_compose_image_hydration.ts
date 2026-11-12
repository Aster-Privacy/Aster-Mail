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
import { useEffect, useRef, type RefObject } from "react";

import { attach_compose_image_hydration } from "@/lib/compose_deferred_images";

interface AttachedEditor {
  element: HTMLElement;
  release: () => void;
}

export function use_compose_image_hydration(
  editor_ref: RefObject<HTMLElement | null>,
): void {
  const attached_ref = useRef<AttachedEditor | null>(null);

  useEffect(() => {
    const element = editor_ref.current;

    if ((attached_ref.current?.element ?? null) === element) return;

    attached_ref.current?.release();
    attached_ref.current = element
      ? { element, release: attach_compose_image_hydration(element) }
      : null;
  });

  useEffect(() => {
    return () => {
      attached_ref.current?.release();
      attached_ref.current = null;
    };
  }, []);
}
