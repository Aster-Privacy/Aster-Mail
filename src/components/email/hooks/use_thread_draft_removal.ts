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
import type { DraftWithContent } from "@/services/api/multi_drafts";

import { useEffect, useRef } from "react";

import {
  MAIL_EVENTS,
  type ThreadDraftChangedEventDetail,
} from "@/hooks/mail_events";

export function use_thread_draft_removal(
  thread_token: string | null | undefined,
  set_thread_draft: (draft: DraftWithContent | null) => void,
): void {
  const setter_ref = useRef(set_thread_draft);

  setter_ref.current = set_thread_draft;

  useEffect(() => {
    if (!thread_token) return;

    const handle_change = (event: Event) => {
      const detail = (event as CustomEvent<ThreadDraftChangedEventDetail>)
        .detail;

      if (!detail || detail.draft !== null) return;
      if (detail.thread_token !== thread_token) return;

      setter_ref.current(null);
    };

    window.addEventListener(MAIL_EVENTS.THREAD_DRAFT_CHANGED, handle_change);

    return () => {
      window.removeEventListener(
        MAIL_EVENTS.THREAD_DRAFT_CHANGED,
        handle_change,
      );
    };
  }, [thread_token]);
}
