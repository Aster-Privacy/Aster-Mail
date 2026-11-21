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
import type { GuardHeldInfo } from "@/services/api/client/helpers";

import { useEffect, useState } from "react";

import {
  GUARD_PANIC_OPEN_EVENT,
  GuardPanicDialog,
} from "@/components/guard/guard_panic_dialog";
import { use_guard_device } from "@/components/guard/guard_switches_panel";
import { format_guard_short_time } from "@/components/guard/guard_waiting_screen";
import { show_toast } from "@/components/toast/simple_toast";
import { use_i18n } from "@/lib/i18n/context";
import { SETTINGS_ANCHORS, open_settings_target } from "@/lib/settings_links";
import { GUARD_HELD_EVENT } from "@/services/api/client/helpers";

export const GUARD_HELD_TOAST_MS = 8000;

export function open_guard_settings(): void {
  open_settings_target({ section: "security", anchor: SETTINGS_ANCHORS.guard });
}

export function GuardHeldToast() {
  const { t } = use_i18n();

  useEffect(() => {
    const on_held = (event: Event) => {
      const info = (event as CustomEvent<GuardHeldInfo>).detail;

      if (!info?.id) return;
      show_toast(
        t("guard.held_toast", {
          time: format_guard_short_time(info.apply_after),
        }),
        "info",
        GUARD_HELD_TOAST_MS,
        { label: t("guard.held_view"), on_click: open_guard_settings },
      );
    };

    window.addEventListener(GUARD_HELD_EVENT, on_held);

    return () => window.removeEventListener(GUARD_HELD_EVENT, on_held);
  }, [t]);

  return null;
}

export function GuardPanicHost({ user_id }: { user_id: string | null }) {
  const [is_open, set_is_open] = useState(false);
  const { device } = use_guard_device(user_id, is_open);

  useEffect(() => {
    const on_open = () => set_is_open(true);

    window.addEventListener(GUARD_PANIC_OPEN_EVENT, on_open);

    return () => window.removeEventListener(GUARD_PANIC_OPEN_EVENT, on_open);
  }, []);

  if (!user_id) return null;

  return (
    <GuardPanicDialog
      device={device}
      is_open={is_open}
      user_id={user_id}
      on_close={() => set_is_open(false)}
    />
  );
}
