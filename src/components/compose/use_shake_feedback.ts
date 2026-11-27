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
import { useCallback, useEffect, useRef } from "react";

import { create_shake_tracker } from "@/lib/shake_detector";
import { request_feedback_category } from "@/lib/feedback_preset";
import { show_action_toast } from "@/components/toast/action_toast";
import { use_i18n } from "@/lib/i18n/context";

export const SHAKE_FEEDBACK_DISMISSED_KEY = "aster_shake_feedback_dismissed";

const SHAKE_FEEDBACK_TOAST_MS = 10000;

let shown_this_session = false;

export function reset_shake_feedback_session() {
  shown_this_session = false;
}

function is_dismissed(): boolean {
  try {
    return localStorage.getItem(SHAKE_FEEDBACK_DISMISSED_KEY) === "1";
  } catch {
    return false;
  }
}

function store_dismissed() {
  try {
    localStorage.setItem(SHAKE_FEEDBACK_DISMISSED_KEY, "1");
  } catch {
    return;
  }
}

export function use_shake_feedback() {
  const { t } = use_i18n();
  const stop_ref = useRef<(() => void) | null>(null);

  useEffect(
    () => () => {
      stop_ref.current?.();
    },
    [],
  );

  return useCallback(
    (event: React.MouseEvent) => {
      if (event.button !== 0 || shown_this_session || is_dismissed()) return;

      stop_ref.current?.();

      const tracker = create_shake_tracker();

      tracker.push({ x: event.clientX, t: event.timeStamp });

      const handle_move = (move: MouseEvent) => {
        if (!tracker.push({ x: move.clientX, t: move.timeStamp })) return;

        stop();
        if (shown_this_session || is_dismissed()) return;
        shown_this_session = true;
        show_action_toast({
          action_type: "feedback",
          email_ids: [],
          message: t("mail.shake_feedback_prompt"),
          duration_ms: SHAKE_FEEDBACK_TOAST_MS,
          hide_dismiss: true,
          sound: "none",
          actions: [
            {
              label: t("mail.shake_feedback_send"),
              on_press: () => {
                request_feedback_category("bug");
                window.dispatchEvent(
                  new CustomEvent("navigate-settings", { detail: "feedback" }),
                );
              },
            },
            {
              label: t("mail.shake_feedback_dismiss"),
              on_press: store_dismissed,
            },
          ],
        });
      };

      const stop = () => {
        window.removeEventListener("mousemove", handle_move);
        window.removeEventListener("mouseup", stop);
        window.removeEventListener("blur", stop);
        if (stop_ref.current === stop) stop_ref.current = null;
      };

      window.addEventListener("mousemove", handle_move);
      window.addEventListener("mouseup", stop);
      window.addEventListener("blur", stop);
      stop_ref.current = stop;
    },
    [t],
  );
}
