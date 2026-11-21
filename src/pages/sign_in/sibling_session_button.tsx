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
import { useState } from "react";
import { Button } from "@aster/ui";

import { use_i18n } from "@/lib/i18n/context";
import { ButtonSpinner } from "@/components/ui/spinner";
import { CALENDAR_WEB_ORIGIN } from "@/lib/session_handoff/session_handoff_protocol";
import {
  has_sibling_session_cookie,
  sibling_app_origin,
  start_sibling_sign_in,
} from "@/contexts/auth/sibling_session_handoff";

type SiblingButtonStatus = "idle" | "waiting" | "blocked" | "failed";

export function SiblingSessionButton() {
  const { t } = use_i18n();
  const [status, set_status] = useState<SiblingButtonStatus>("idle");
  const sibling_origin = sibling_app_origin();

  if (!sibling_origin || !has_sibling_session_cookie()) return null;

  const app =
    sibling_origin === CALENDAR_WEB_ORIGIN
      ? t("calendar.aster_calendar")
      : t("common.aster_mail");
  const status_text: Record<SiblingButtonStatus, string | null> = {
    idle: null,
    waiting: t("auth.sibling_waiting"),
    blocked: t("auth.sibling_popup_blocked"),
    failed: t("auth.sibling_failed", { app }),
  };
  const message = status_text[status];

  const handle_click = () => {
    set_status("waiting");
    void start_sibling_sign_in().then((result) => {
      if (result === "approved") {
        window.location.assign("/");

        return;
      }
      set_status(result);
    });
  };

  return (
    <>
      <Button
        className="w-full mt-3"
        disabled={status === "waiting"}
        size="xl"
        variant="secondary"
        onClick={handle_click}
      >
        {t("auth.continue_with_app", { app })}
        {status === "waiting" && <ButtonSpinner />}
      </Button>
      {message && (
        <p
          aria-live="polite"
          className="mt-2 text-center text-sm text-txt-secondary"
        >
          {message}
        </p>
      )}
    </>
  );
}
