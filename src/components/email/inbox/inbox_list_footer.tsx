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
import type { Session } from "@/services/api/sessions";

import { useEffect, useState } from "react";
import { ComputerDesktopIcon } from "@heroicons/react/24/outline";

import { use_i18n } from "@/lib/i18n/context";
import { format_bytes, format_decimal } from "@/lib/utils";
import {
  open_settings_target,
  SECURITY_CENTER_TARGETS,
} from "@/lib/settings_links";
import { list_sessions } from "@/services/api/sessions";
import { open_external } from "@/utils/open_link";
import { app_locale } from "@/utils/date_format";

const TERMS_URL = "https://astermail.org/terms";
const PRIVACY_URL = "https://astermail.org/privacy";
const SESSIONS_CACHE_MS = 60_000;
const CRITICAL_STORAGE_PERCENT = 95;
const WARNING_STORAGE_PERCENT = 80;

interface InboxListFooterProps {
  storage_used_bytes: number;
  storage_total_bytes: number;
}

type SessionSummary = { other_last_active: string | null };

let cached_summary: { at: number; value: SessionSummary } | null = null;

export function reset_inbox_footer_cache(): void {
  cached_summary = null;
}

function summarize(sessions: Session[]): SessionSummary {
  const others = sessions
    .filter((session) => !session.is_current && session.last_active)
    .map((session) => session.last_active)
    .sort((a, b) => new Date(b).getTime() - new Date(a).getTime());

  return { other_last_active: others[0] ?? null };
}

export function format_relative_activity(
  iso: string,
  now = Date.now(),
  style: Intl.RelativeTimeFormatStyle = "long",
): string {
  const diff_ms = Math.max(0, now - new Date(iso).getTime());
  const minutes = Math.max(1, Math.floor(diff_ms / 60_000));
  const rtf = new Intl.RelativeTimeFormat(app_locale(), {
    numeric: "auto",
    style,
  });

  if (minutes < 60) return rtf.format(-minutes, "minute");
  const hours = Math.floor(minutes / 60);

  if (hours < 24) return rtf.format(-hours, "hour");
  const days = Math.floor(hours / 24);

  if (days < 30) return rtf.format(-days, "day");

  return rtf.format(-Math.floor(days / 30), "month");
}

function use_session_summary(): SessionSummary | null {
  const fresh =
    cached_summary && Date.now() - cached_summary.at < SESSIONS_CACHE_MS
      ? cached_summary.value
      : null;
  const [summary, set_summary] = useState<SessionSummary | null>(fresh);

  useEffect(() => {
    if (fresh) return;
    let cancelled = false;

    list_sessions()
      .then((response) => {
        if (cancelled || !response.data) return;
        const value = summarize(response.data.sessions);

        cached_summary = { at: Date.now(), value };
        set_summary(value);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [fresh]);

  return summary;
}

const quiet_link =
  "rounded-[4px] text-txt-muted hover:text-txt-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-color)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-primary)] transition-colors";

export function InboxListFooter({
  storage_used_bytes,
  storage_total_bytes,
}: InboxListFooterProps) {
  const { t } = use_i18n();
  const summary = use_session_summary();
  const has_storage = storage_total_bytes > 0;
  const percent = has_storage
    ? Math.min(100, (storage_used_bytes / storage_total_bytes) * 100)
    : 0;
  const bar_color =
    percent >= CRITICAL_STORAGE_PERCENT
      ? "var(--color-danger)"
      : percent >= WARNING_STORAGE_PERCENT
        ? "var(--color-warning)"
        : "var(--accent-color)";
  const percent_text =
    percent > 0 && percent < 1
      ? t("common.storage_under_one_percent")
      : `${format_decimal(percent, 0)}%`;
  const activity_label = summary
    ? summary.other_last_active
      ? t("settings.inbox_footer_other_device_activity", {
          time: format_relative_activity(summary.other_last_active),
        })
      : t("settings.inbox_footer_only_this_device")
    : "";
  const activity_short = summary?.other_last_active
    ? format_relative_activity(summary.other_last_active, Date.now(), "short")
    : null;

  return (
    <footer
      className="@container mt-auto px-4 pt-6 pb-5 text-xs leading-5"
      data-testid="inbox-list-footer"
    >
      <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-x-6 @max-[50rem]:gap-x-4 @max-[26rem]:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="min-w-0 justify-self-start">
          {has_storage && (
            <button
              className={`flex max-w-full items-center gap-3 @max-[50rem]:gap-2 ${quiet_link}`}
              type="button"
              onClick={() => open_settings_target({ section: "storage" })}
            >
              <span
                aria-label={t("common.storage_used")}
                aria-valuemax={100}
                aria-valuemin={0}
                aria-valuenow={Math.round(percent)}
                className="block h-1 w-24 flex-shrink-0 overflow-hidden rounded-full @max-[50rem]:w-12"
                role="progressbar"
                style={{
                  backgroundColor:
                    "color-mix(in srgb, var(--text-muted) 22%, transparent)",
                }}
              >
                <span
                  className="block h-full rounded-full transition-[width] duration-500 ease-out"
                  style={{
                    minWidth: "4px",
                    width: `${percent}%`,
                    backgroundColor: bar_color,
                  }}
                />
              </span>
              <span className="truncate tabular-nums">
                {t("settings.storage_used_of_total", {
                  used: format_bytes(storage_used_bytes),
                  total: format_bytes(storage_total_bytes),
                })}
              </span>
              <span
                className="flex-shrink-0 tabular-nums @max-[50rem]:hidden"
                style={
                  percent >= WARNING_STORAGE_PERCENT
                    ? { color: bar_color }
                    : undefined
                }
              >
                {percent_text}
              </span>
            </button>
          )}
        </div>

        <nav
          aria-label={t("settings.inbox_footer_legal")}
          className="flex items-center justify-center gap-2 text-txt-muted @max-[26rem]:hidden"
        >
          <button
            className={quiet_link}
            type="button"
            onClick={() => open_external(TERMS_URL)}
          >
            {t("settings.inbox_footer_terms")}
          </button>
          <span aria-hidden="true" className="opacity-60">
            ·
          </span>
          <button
            className={quiet_link}
            type="button"
            onClick={() => open_external(PRIVACY_URL)}
          >
            {t("settings.inbox_footer_privacy")}
          </button>
        </nav>

        <div className="min-w-0 justify-self-end">
          {summary && (
            <button
              aria-label={activity_label}
              className={`flex max-w-full items-center gap-2 ${quiet_link}`}
              title={activity_label}
              type="button"
              onClick={() =>
                open_settings_target(SECURITY_CENTER_TARGETS.sessions)
              }
            >
              <ComputerDesktopIcon
                aria-hidden="true"
                className="w-3.5 h-3.5 flex-shrink-0"
              />
              <span
                className={`truncate ${activity_short ? "@max-[50rem]:hidden" : ""}`}
              >
                {activity_label}
              </span>
              {activity_short && (
                <span className="hidden truncate tabular-nums @max-[50rem]:inline">
                  {activity_short}
                </span>
              )}
            </button>
          )}
        </div>
      </div>
    </footer>
  );
}
