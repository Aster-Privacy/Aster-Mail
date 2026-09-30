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
import { useEffect } from "react";
import { SimpleToast as SimpleToastView, show_toast } from "@aster/ui";

import { use_should_reduce_motion } from "@/provider";
import { ignore_error } from "@/lib/ignore_error";
import { use_translation } from "@/lib/i18n";
import {
  use_toast_position,
  type ToastPosition,
} from "@/components/toast/toast_position";

export type { ToastPosition };

export {
  show_toast,
  dismiss_toast,
  set_toast_min_duration,
  TOAST_DURATION_DEFAULT_MS,
  TOAST_DURATION_BILLING_MS,
} from "@aster/ui";

const OFFLINE_FAILURE_TOAST_MS = 8000;

interface SimpleToastProps {
  position?: ToastPosition;
}

export function SimpleToast({ position }: SimpleToastProps) {
  const reduce_motion = use_should_reduce_motion();
  const { t } = use_translation();

  useEffect(() => {
    const on_queue_failure = (event: Event) => {
      const detail = (event as CustomEvent<{ action?: { type?: string } }>)
        .detail;
      const message =
        detail?.action?.type === "send_email"
          ? t("common.offline_send_failed")
          : t("common.offline_change_failed");

      show_toast(message, "error", OFFLINE_FAILURE_TOAST_MS, {
        label: t("common.retry"),
        on_click: () => {
          void import("@/native/offline_queue")
            .then((queue) => queue.retry_failed_actions())
            .catch((caught) =>
              ignore_error("components/toast/simple_toast:retry", caught),
            );
        },
      });
    };

    window.addEventListener("offline-queue-failure", on_queue_failure);

    return () => {
      window.removeEventListener("offline-queue-failure", on_queue_failure);
    };
  }, [t]);

  const { layout, y_offset } = use_toast_position(position);

  return (
    <SimpleToastView
      dismiss_label={t("common.dismiss")}
      layout={layout}
      reduce_motion={reduce_motion}
      y_offset={y_offset}
    />
  );
}
