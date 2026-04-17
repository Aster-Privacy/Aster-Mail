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
import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { ChevronLeftIcon, ChevronRightIcon } from "@heroicons/react/24/outline";

import { Input } from "@/components/ui/input";

interface BottomPaginationProps {
  current_page: number;
  total_pages: number;
  on_page_change: (page: number) => void;
}

export function BottomPagination({
  current_page,
  total_pages,
  on_page_change,
}: BottomPaginationProps) {
  const [editing_idx, set_editing_idx] = useState<number | null>(null);
  const [input_value, set_input_value] = useState("");
  const input_ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing_idx !== null && input_ref.current) {
      input_ref.current.focus();
    }
  }, [editing_idx]);

  const handle_submit = useCallback(() => {
    const page_num = parseInt(input_value, 10);

    if (!isNaN(page_num) && page_num >= 1 && page_num <= total_pages) {
      on_page_change(page_num - 1);
    }
    set_editing_idx(null);
    set_input_value("");
  }, [input_value, total_pages, on_page_change]);

  const page_items = useMemo((): (number | "ellipsis")[] => {
    if (total_pages <= 5) {
      return Array.from({ length: total_pages }, (_, i) => i);
    }
    const items: (number | "ellipsis")[] = [];
    const start = Math.max(0, current_page - 1);
    const end = Math.min(total_pages - 1, current_page + 1);

    if (start > 0) {
      items.push(0);
      if (start > 1) items.push("ellipsis");
    }
    for (let i = start; i <= end; i++) {
      items.push(i);
    }
    if (end < total_pages - 1) {
      if (end < total_pages - 2) items.push("ellipsis");
      items.push(total_pages - 1);
    }

    return items;
  }, [current_page, total_pages]);

  if (total_pages <= 1) return null;

  return (
    <div className="flex items-center justify-center gap-1 py-3 border-t border-edge-primary">
      <button
        className="flex items-center justify-center w-8 h-8 rounded-md text-txt-muted hover:text-txt-primary hover:bg-black/[0.04] dark:hover:bg-white/[0.06] disabled:opacity-30 disabled:cursor-default transition-colors"
        disabled={current_page === 0}
        onClick={() => on_page_change(current_page - 1)}
      >
        <ChevronLeftIcon className="w-4 h-4" />
      </button>
      {page_items.map((item, idx) =>
        item === "ellipsis" ? (
          editing_idx === idx ? (
            <Input
              key={`e-${idx}`}
              ref={input_ref}
              className="w-12 bg-transparent border-none text-center"
              size="sm"
              value={input_value}
              onBlur={handle_submit}
              onChange={(e) =>
                set_input_value(e.target.value.replace(/\D/g, ""))
              }
              onKeyDown={(e) => {
                if (e.key === "Enter") handle_submit();
                if (e.key === "Escape") {
                  set_editing_idx(null);
                  set_input_value("");
                }
              }}
            />
          ) : (
            <button
              key={`e-${idx}`}
              className="flex items-center justify-center w-8 h-8 rounded-md text-sm text-txt-muted hover:text-txt-primary hover:bg-black/[0.04] dark:hover:bg-white/[0.06] transition-colors"
              onClick={() => set_editing_idx(idx)}
            >
              ...
            </button>
          )
        ) : (
          <button
            key={item}
            className={`flex items-center justify-center min-w-[32px] h-8 px-1 rounded-md text-sm font-medium transition-colors ${item === current_page ? "bg-[rgba(128,128,128,0.1)] text-txt-primary" : "text-txt-muted hover:text-txt-primary hover:bg-black/[0.04] dark:hover:bg-white/[0.06]"}`}
            onClick={() => {
              if (item !== current_page) on_page_change(item);
            }}
          >
            {item + 1}
          </button>
        ),
      )}
      <button
        className="flex items-center justify-center w-8 h-8 rounded-md text-txt-muted hover:text-txt-primary hover:bg-black/[0.04] dark:hover:bg-white/[0.06] disabled:opacity-30 disabled:cursor-default transition-colors"
        disabled={current_page >= total_pages - 1}
        onClick={() => on_page_change(current_page + 1)}
      >
        <ChevronRightIcon className="w-4 h-4" />
      </button>
    </div>
  );
}
