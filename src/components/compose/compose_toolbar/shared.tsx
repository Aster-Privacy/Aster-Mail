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
import type { TranslationKey } from "@/lib/i18n/types";
import type {  FontSizeLabel } from "@/hooks/use_editor";
import type { ComposeToolbarState } from "@/components/compose/compose_shared";

import {
  
  
  useRef,
  useEffect,
  useLayoutEffect,
  useCallback,
} from "react";



export const FORMAT_BAR_STORAGE_KEY = "aster_compose_format_bar_open";

export function use_anchored_layer(
  open: boolean,
  anchor_ref: React.RefObject<HTMLElement | null>,
  reposition: (rect: DOMRect) => void,
  on_dismiss: () => void,
) {
  const reposition_ref = useRef(reposition);
  const dismiss_ref = useRef(on_dismiss);

  useEffect(() => {
    reposition_ref.current = reposition;
    dismiss_ref.current = on_dismiss;
  });

  useLayoutEffect(() => {
    if (!open) return;

    const update = () => {
      const node = anchor_ref.current;

      if (!node) return;

      const rect = node.getBoundingClientRect();
      const off_screen =
        rect.bottom <= 0 ||
        rect.top >= window.innerHeight ||
        rect.right <= 0 ||
        rect.left >= window.innerWidth;

      if (off_screen) {
        dismiss_ref.current();

        return;
      }

      reposition_ref.current(rect);
    };

    update();
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);

    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [open, anchor_ref]);
}

export function read_format_bar_preference(): boolean {
  try {
    return localStorage.getItem(FORMAT_BAR_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export function store_format_bar_preference(open: boolean) {
  try {
    localStorage.setItem(FORMAT_BAR_STORAGE_KEY, open ? "1" : "0");
  } catch {
    return;
  }
}

export const PRESET_COLORS = [
  "#000000",
  "#434343",
  "#666666",
  "#999999",
  "#b7b7b7",
  "#cccccc",
  "#efefef",
  "#ffffff",
  "#980000",
  "#ff0000",
  "#ff9900",
  "#ffff00",
  "#00ff00",
  "#00ffff",
  "#0000ff",
  "#9900ff",
  "#e6b8af",
  "#f4cccc",
  "#fce5cd",
  "#fff2cc",
  "#d9ead3",
  "#d0e0e3",
  "#c9daf8",
  "#d9d2e9",
  "#dd7e6b",
  "#ea9999",
  "#f9cb9c",
  "#ffe599",
  "#b6d7a8",
  "#a2c4c9",
  "#6d9eeb",
  "#8e7cc3",
  "#cc4125",
  "#e06666",
  "#f6b26b",
  "#ffd966",
  "#93c47d",
  "#76a5af",
  "#6fa8dc",
  "#c27ba0",
];

export const FONT_SIZE_OPTIONS: { value: FontSizeLabel; label_key: TranslationKey }[] =
  [
    { value: "small", label_key: "settings.font_size_small" },
    { value: "normal", label_key: "settings.font_size_default" },
    { value: "large", label_key: "settings.font_size_large" },
    { value: "huge", label_key: "settings.font_size_extra_large" },
  ];

export interface ToolbarButtonProps {
  onClick?: () => void;
  children: React.ReactNode;
  disabled?: boolean;
  active?: boolean;
  title?: string;
}

export function ToolbarButton({
  onClick,
  children,
  disabled,
  active,
  title,
}: ToolbarButtonProps) {
  return (
    <button
      className={`press_scale w-9 h-9 flex items-center justify-center flex-shrink-0 rounded-full transition-transform duration-150 disabled:opacity-50 ${active ? "bg-black/10 text-txt-primary dark:bg-white/10 dark:text-white" : "hover:bg-black/5 dark:hover:bg-white/10 text-txt-tertiary hover:text-txt-primary"}`}
      disabled={disabled}
      title={title}
      type="button"
      onClick={onClick}
      onMouseDown={(e) => e.preventDefault()}
    >
      {children}
    </button>
  );
}

export function Divider() {
  return <div className="w-px h-4 mx-1 flex-shrink-0 bg-edge-secondary" />;
}

export function use_frozen_selection(
  editor: ComposeToolbarState["editor"] | undefined,
) {
  const frozen_range_ref = useRef<Range | null>(null);

  const freeze_selection = useCallback(() => {
    const sel = window.getSelection();

    if (sel && sel.rangeCount > 0) {
      frozen_range_ref.current = sel.getRangeAt(0).cloneRange();
    }
  }, []);

  const apply_with_frozen_selection = useCallback(
    (fn: () => void) => {
      if (!editor) return;

      const frozen = frozen_range_ref.current;

      if (frozen) {
        editor.focus();
        const sel = window.getSelection();

        if (sel) {
          sel.removeAllRanges();
          sel.addRange(frozen);
        }
      }
      editor.save_selection();
      fn();
    },
    [editor],
  );

  return { freeze_selection, apply_with_frozen_selection };
}

