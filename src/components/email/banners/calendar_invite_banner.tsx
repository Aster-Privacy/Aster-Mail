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
import type { ParsedInvite } from "@/services/calendar/ics_parser";
import type { CalendarAttendeeResponse } from "@/types/calendar";

import { useMemo, useState } from "react";
import {
  CalendarDaysIcon,
  MapPinIcon,
  CheckCircleIcon,
  XCircleIcon,
  QuestionMarkCircleIcon,
} from "@heroicons/react/24/outline";

import { cn } from "@/lib/utils";
import { use_i18n } from "@/lib/i18n/context";
import { use_auth } from "@/contexts/auth/use_auth_hook";
import { find_invite_in_email } from "@/services/calendar/ics_parser";
import { create_event } from "@/services/api/calendar";
import { show_action_toast } from "@/components/toast/action_toast";

interface CalendarInviteBannerProps {
  body?: string;
  html_content?: string;
  className?: string;
}

const RESPONSE_TARGET_CALENDAR = "personal";

function format_invite_when(invite: ParsedInvite, locale: string): string {
  const starts = new Date(invite.starts_at);
  const ends = new Date(invite.ends_at);

  const date_options: Intl.DateTimeFormatOptions = {
    weekday: "short",
    month: "short",
    day: "numeric",
  };

  if (invite.is_all_day) {
    return starts.toLocaleDateString(locale, date_options);
  }

  const time_options: Intl.DateTimeFormatOptions = {
    hour: "numeric",
    minute: "2-digit",
  };

  const same_day = starts.toDateString() === ends.toDateString();
  const start_date = starts.toLocaleDateString(locale, date_options);
  const start_time = starts.toLocaleTimeString(locale, time_options);
  const end_time = ends.toLocaleTimeString(locale, time_options);

  if (same_day) {
    return `${start_date} · ${start_time} - ${end_time}`;
  }

  const end_date = ends.toLocaleDateString(locale, date_options);
  return `${start_date} ${start_time} - ${end_date} ${end_time}`;
}

export function CalendarInviteBanner({
  body,
  html_content,
  className,
}: CalendarInviteBannerProps) {
  const { t, language } = use_i18n();
  const { vault } = use_auth();

  const invite = useMemo(
    () => find_invite_in_email(body, html_content),
    [body, html_content],
  );

  const [response, set_response] = useState<CalendarAttendeeResponse | null>(
    null,
  );
  const [is_busy, set_is_busy] = useState(false);

  const when_label = useMemo(
    () => (invite ? format_invite_when(invite, language) : ""),
    [invite, language],
  );

  if (!invite || invite.method === "reply" || invite.method === "cancel") {
    return null;
  }

  const handle_respond = async (next: CalendarAttendeeResponse) => {
    if (is_busy || !vault) {
      return;
    }
    set_is_busy(true);
    try {
      if (next !== "declined") {
        await create_event(
          {
            calendar_id: RESPONSE_TARGET_CALENDAR,
            title: invite.summary,
            description: invite.description,
            location: invite.location,
            starts_at: invite.starts_at,
            ends_at: invite.ends_at,
            is_all_day: invite.is_all_day,
            reminder_minutes: invite.is_all_day ? null : 30,
          },
          vault,
        );
      }
      set_response(next);
      show_action_toast({
        message:
          next === "declined"
            ? t("calendar.invite_declined_toast")
            : t("calendar.invite_added_toast"),
        action_type: "not_spam",
        email_ids: [],
        duration_ms: 6000,
      });
    } catch {
      show_action_toast({
        message: t("calendar.invite_save_failed"),
        action_type: "not_spam",
        email_ids: [],
      });
    } finally {
      set_is_busy(false);
    }
  };

  const status_label =
    response === "accepted"
      ? t("calendar.invite_status_going")
      : response === "tentative"
        ? t("calendar.invite_status_maybe")
        : t("calendar.invite_status_declined");

  return (
    <div
      className={cn(
        "rounded-lg border border-edge-primary overflow-hidden bg-surf-secondary",
        className,
      )}
    >
      <div className="flex items-start gap-3 px-4 py-3">
        <div
          className="flex items-center justify-center w-9 h-9 rounded-lg shrink-0"
          style={{
            backgroundColor:
              "color-mix(in srgb, var(--accent-color) 12%, transparent)",
          }}
        >
          <CalendarDaysIcon className="w-5 h-5 text-brand" />
        </div>

        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-txt-primary truncate">
            {invite.summary}
          </div>
          <div className="text-xs text-txt-secondary mt-0.5">{when_label}</div>
          {invite.location && (
            <div className="flex items-center gap-1 mt-1 text-xs text-txt-muted">
              <MapPinIcon className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">{invite.location}</span>
            </div>
          )}
        </div>
      </div>

      <div className="px-4 pb-3">
        {response === null ? (
          <div className="flex items-center gap-2">
            <button
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-[12px] bg-brand text-[var(--accent-fg,#ffffff)] transition-opacity disabled:opacity-60"
              type="button"
              disabled={is_busy}
              onClick={() => handle_respond("accepted")}
            >
              <CheckCircleIcon className="w-4 h-4" />
              {t("calendar.invite_yes")}
            </button>
            <button
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-[12px] border border-edge-primary text-txt-secondary transition-colors hover:bg-black/[0.04] dark:hover:bg-white/[0.04] disabled:opacity-60"
              type="button"
              disabled={is_busy}
              onClick={() => handle_respond("tentative")}
            >
              <QuestionMarkCircleIcon className="w-4 h-4" />
              {t("calendar.invite_maybe")}
            </button>
            <button
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-[12px] border border-edge-primary text-txt-secondary transition-colors hover:bg-black/[0.04] dark:hover:bg-white/[0.04] disabled:opacity-60"
              type="button"
              disabled={is_busy}
              onClick={() => handle_respond("declined")}
            >
              <XCircleIcon className="w-4 h-4" />
              {t("calendar.invite_no")}
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-medium text-txt-primary">
              {status_label}
            </span>
            <button
              className="text-xs text-txt-muted hover:text-txt-secondary transition-colors"
              type="button"
              onClick={() => set_response(null)}
            >
              {t("calendar.invite_change_response")}
            </button>
          </div>
        )}
      </div>

      <div className="px-4 py-2 border-t border-edge-secondary flex items-center gap-1.5">
        <svg
          className="w-3.5 h-3.5 text-txt-muted shrink-0"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          viewBox="0 0 24 24"
        >
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        </svg>
        <span className="text-[10px] text-txt-muted">
          {t("calendar.invite_saved_locally")}
        </span>
      </div>
    </div>
  );
}
