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
import type { MouseEvent, ReactNode } from "react";

import { is_desktop } from "@/native/invoke_bridge";

const MIDDLE_BUTTON = 1;

interface NewTabHandlers {
  onAuxClick?: (e: MouseEvent) => void;
  onClickCapture?: (e: MouseEvent) => void;
  onMouseDown?: (e: MouseEvent) => void;
}

export function open_path_in_new_tab(path: string): void {
  window.open(
    new URL(path, window.location.origin).toString(),
    "_blank",
    "noopener",
  );
}

export function new_tab_handlers(path: string | null): NewTabHandlers {
  if (!path || is_desktop()) return {};

  return {
    onMouseDown: (e) => {
      if (e.button === MIDDLE_BUTTON) e.preventDefault();
    },
    onAuxClick: (e) => {
      if (e.button !== MIDDLE_BUTTON) return;
      e.preventDefault();
      e.stopPropagation();
      open_path_in_new_tab(path);
    },
    onClickCapture: (e) => {
      if (e.button !== 0 || !(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      e.stopPropagation();
      open_path_in_new_tab(path);
    },
  };
}

export function NewTabTarget({
  path,
  children,
}: {
  path: string;
  children: ReactNode;
}) {
  return (
    <div className="contents" {...new_tab_handlers(path)}>
      {children}
    </div>
  );
}
