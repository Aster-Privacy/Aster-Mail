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
import { useEffect, useRef, useState } from "react";
import { Switch } from "@aster/ui";

import { Spinner } from "@/components/ui/spinner";
import { InfoPopover } from "@/components/ui/info_popover";
import { use_auth } from "@/contexts/auth_context";
import { use_i18n } from "@/lib/i18n/context";
import {
  pause_index_download,
  resume_index_download,
  use_index_download_state,
  use_indexing_progress,
} from "@/hooks/use_search";
import {
  advance_counts,
  progress_percent,
} from "@/hooks/use_search/progress_math";

interface SearchContentBannerProps {
  enabled: boolean;
  on_enable: () => void;
  on_disable: () => void;
}

const ETA_SAMPLE_WINDOW_MS = 60000;
const ETA_MIN_ELAPSED_S = 2;
const INDEXING_ROW_LINGER_MS = 900;

function format_remaining_duration(seconds: number, locale: string): string {
  const unit_text = (value: number, unit: string): string => {
    try {
      return new Intl.NumberFormat(locale, {
        style: "unit",
        unit,
        unitDisplay: "narrow",
      }).format(value);
    } catch {
      return `${value}${unit.charAt(0)}`;
    }
  };

  if (seconds < 60) return unit_text(Math.max(1, seconds), "second");

  if (seconds < 3600) {
    const minutes = Math.floor(seconds / 60);
    const rest = seconds % 60;

    return rest > 0
      ? `${unit_text(minutes, "minute")} ${unit_text(rest, "second")}`
      : unit_text(minutes, "minute");
  }

  const hours = Math.floor(seconds / 3600);
  const minutes = Math.round((seconds % 3600) / 60);

  return minutes > 0
    ? `${unit_text(hours, "hour")} ${unit_text(minutes, "minute")}`
    : unit_text(hours, "hour");
}

function use_download_eta(
  done: number,
  total: number,
  active: boolean,
): number | null {
  const samples_ref = useRef<{ at: number; done: number }[]>([]);
  const [eta_seconds, set_eta_seconds] = useState<number | null>(null);

  useEffect(() => {
    if (!active || total <= 0) {
      samples_ref.current = [];
      set_eta_seconds(null);

      return;
    }

    const now = Date.now();
    const samples = samples_ref.current;

    if (samples.length > 0 && done < samples[samples.length - 1].done) {
      samples.length = 0;
    }

    samples.push({ at: now, done });

    while (samples.length > 1 && now - samples[0].at > ETA_SAMPLE_WINDOW_MS) {
      samples.shift();
    }

    if (samples.length < 2) return;

    const first = samples[0];
    const elapsed_s = (now - first.at) / 1000;
    const downloaded = done - first.done;

    if (elapsed_s < ETA_MIN_ELAPSED_S || downloaded <= 0) return;

    const rate = downloaded / elapsed_s;
    const remaining = Math.max(total - done, 0);

    set_eta_seconds(Math.max(1, Math.round(remaining / rate)));
  }, [done, total, active]);

  return active ? eta_seconds : null;
}

export function SearchContentBanner({
  enabled,
  on_enable,
  on_disable,
}: SearchContentBannerProps) {
  const { t, language } = use_i18n();
  const { user } = use_auth();
  const progress = use_indexing_progress();
  const download = use_index_download_state();
  const [enabling, set_enabling] = useState(false);

  useEffect(() => {
    if (enabled) set_enabling(false);
  }, [enabled]);

  const is_paused = download.paused;
  const is_downloading = progress.building && !is_paused;
  const indexing_active = is_downloading || is_paused;
  const reported_done = is_paused ? download.done : progress.current;
  const reported_total = is_paused ? download.total : progress.total;
  const session = progress.session ?? 0;
  const [counts, set_counts] = useState({ done: 0, total: 0, session: 0 });

  useEffect(() => {
    if (!indexing_active) {
      set_counts((prev) => {
        const finished =
          prev.session === session &&
          prev.total > 0 &&
          reported_total > 0 &&
          reported_done >= reported_total;

        if (!finished) return prev;

        if (prev.done === reported_total && prev.total === reported_total) {
          return prev;
        }

        return { done: reported_total, total: reported_total, session };
      });

      const timer = setTimeout(
        () => set_counts((prev) => ({ ...prev, done: 0, total: 0 })),
        INDEXING_ROW_LINGER_MS,
      );

      return () => clearTimeout(timer);
    }

    if (reported_done <= 0 && reported_total <= 0) return;

    set_counts((prev) => {
      const reported = { done: reported_done, total: reported_total };

      if (prev.session !== session) {
        return { ...advance_counts({ done: 0, total: 0 }, reported), session };
      }

      const next = advance_counts(prev, reported);

      if (next.done === prev.done && next.total === prev.total) return prev;

      return { ...next, session };
    });
  }, [indexing_active, reported_done, reported_total, session]);

  const has_total = counts.total > 0;
  const total = counts.total;
  const done = has_total ? Math.min(counts.done, total) : counts.done;
  const show_bar = has_total || done > 0;
  const can_pause = is_downloading && show_bar;
  const pct = progress_percent({ done, total }, indexing_active);
  const eta_seconds = use_download_eta(
    done,
    total,
    is_downloading && has_total && done < total,
  );

  const handle_pause = () => {
    pause_index_download();
  };

  const handle_resume = () => {
    resume_index_download(user?.email || "", true);
  };

  const help_button = (
    <InfoPopover
      description={t("mail.search_message_content_help_body")}
      icon_class="w-[15px] h-[15px]"
      title={t("mail.search_message_content_help")}
    />
  );

  if (enabled) {
    const header_text = is_paused
      ? t("mail.download_paused")
      : is_downloading || show_bar
        ? t("mail.indexing_messages")
        : t("mail.searching_message_content");

    return (
      <div className="search_divider_b px-4 pt-3 pb-2.5">
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1.5 min-w-0 flex-1">
            <span className="truncate text-[13px] font-medium text-txt-primary">
              {header_text}
            </span>
            {is_downloading && !show_bar && <Spinner size="xs" />}
            {help_button}
          </span>
          <Switch
            checked
            aria-label={t("mail.search_message_content")}
            size="sm"
            onCheckedChange={on_disable}
          />
        </div>
        {show_bar && (
          <div className="mt-2 h-[38px]">
            <div className="flex h-4 items-center gap-3">
              <div className="search_progress_track h-1 flex-1 rounded-full bg-surf-secondary overflow-hidden">
                {has_total ? (
                  <div
                    className="h-full rounded-full transition-all duration-300"
                    style={{
                      width: `${pct}%`,
                      backgroundColor: "var(--accent-color)",
                      opacity: is_paused ? 0.4 : 1,
                    }}
                  />
                ) : (
                  is_downloading && (
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: "40%",
                        backgroundColor: "var(--accent-color)",
                        animation:
                          "sync_bar_indeterminate 1.5s ease-in-out infinite",
                      }}
                    />
                  )
                )}
              </div>
              {can_pause && (
                <button
                  className="text-[11px] font-medium text-txt-muted hover:text-txt-primary transition-colors flex-shrink-0"
                  type="button"
                  onClick={handle_pause}
                >
                  {t("mail.pause_download_action")}
                </button>
              )}
              {is_paused && (
                <button
                  className="text-[11px] font-medium text-[var(--accent-color)] hover:opacity-80 transition-opacity flex-shrink-0"
                  type="button"
                  onClick={handle_resume}
                >
                  {t("mail.resume_download_action")}
                </button>
              )}
            </div>
            <p className="mt-1.5 h-4 text-[11px] leading-4 text-txt-muted tabular-nums">
              {has_total
                ? t("mail.message_download_status", { done, total })
                : t("mail.message_download_count", { done })}
              {eta_seconds !== null
                ? ` · ${t("mail.estimated_time_remaining", {
                    duration: format_remaining_duration(eta_seconds, language),
                  })}`
                : ""}
            </p>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="search_divider_b px-4 pt-3 pb-2.5">
      <div className="flex items-center gap-2">
        <span className="flex items-center gap-1.5 min-w-0 flex-1">
          <span className="truncate text-[13px] font-medium text-txt-primary">
            {t("mail.search_message_content")}
          </span>
          {help_button}
        </span>
        {enabling && <Spinner size="xs" />}
        <Switch
          aria-label={t("mail.search_message_content")}
          checked={false}
          disabled={enabling}
          size="sm"
          onCheckedChange={() => {
            set_enabling(true);
            on_enable();
          }}
        />
      </div>
    </div>
  );
}
