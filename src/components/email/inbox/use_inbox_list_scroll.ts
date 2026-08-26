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
import type { InboxFilterType } from "@/types/email";

import { useCallback, useEffect, useLayoutEffect, useRef } from "react";

import { use_split_pane } from "@/components/email/inbox/use_split_pane";

export type InboxListScrollParams = {
  show_full_email_viewer: boolean;
  split_pane: ReturnType<typeof use_split_pane>;
  current_page: number;
  page_size: number;
  is_page_cached: (page: number, size: number) => boolean;
  set_is_paginating: (value: boolean) => void;
  set_current_page: (page: number) => void;
  set_active_filter: (filter: InboxFilterType) => void;
};

export function use_inbox_list_scroll({
  show_full_email_viewer,
  split_pane,
  current_page,
  page_size,
  is_page_cached,
  set_is_paginating,
  set_current_page,
  set_active_filter,
}: InboxListScrollParams) {
  const list_scroll_top_ref = useRef(0);
  const scroll_idle_timer_ref = useRef<number | null>(null);
  const handle_list_scroll = useCallback(
    (e: React.UIEvent<HTMLDivElement>): void => {
      const container = e.currentTarget;

      list_scroll_top_ref.current = container.scrollTop;

      container.classList.add("list_scrolling");

      if (scroll_idle_timer_ref.current !== null) {
        window.clearTimeout(scroll_idle_timer_ref.current);
      }

      scroll_idle_timer_ref.current = window.setTimeout(() => {
        scroll_idle_timer_ref.current = null;
        container.classList.remove("list_scrolling");
      }, 120);
    },
    [],
  );

  useEffect(() => {
    return () => {
      if (scroll_idle_timer_ref.current !== null) {
        window.clearTimeout(scroll_idle_timer_ref.current);
      }
    };
  }, []);

  useLayoutEffect(() => {
    if (show_full_email_viewer) return;
    const container = split_pane.list_scroll_ref.current;

    if (container && list_scroll_top_ref.current > 0) {
      container.scrollTop = list_scroll_top_ref.current;
    }
  }, [show_full_email_viewer, split_pane.list_scroll_ref]);

  const handle_page_change = useCallback(
    (page: number): void => {
      if (page !== current_page && !is_page_cached(page, page_size)) {
        set_is_paginating(true);
      }
      list_scroll_top_ref.current = 0;
      split_pane.list_panel_ref.current?.scrollTo(0, 0);
      split_pane.list_scroll_ref.current?.scrollTo(0, 0);
      set_current_page(page);
    },
    [
      current_page,
      is_page_cached,
      page_size,
      set_is_paginating,
      set_current_page,
      split_pane.list_panel_ref,
      split_pane.list_scroll_ref,
    ],
  );
  const handle_filter_change = useCallback(
    (filter: InboxFilterType): void => {
      set_active_filter(filter);
      set_current_page(0);
    },
    [set_current_page],
  );

  return { handle_list_scroll, handle_page_change, handle_filter_change };
}
