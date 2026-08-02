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

import { Spinner } from "@/components/ui/spinner";
import { use_auth } from "@/contexts/auth_context";
import { use_i18n } from "@/lib/i18n/context";
import {
  pause_index_download,
  resume_index_download,
  use_index_download_state,
  use_indexing_progress,
} from "@/hooks/use_search";

interface SearchContentBannerProps {
  enabled: boolean;
  on_enable: () => void;
  on_disable: () => void;
}

const ETA_SAMPLE_WINDOW_MS = 60000;
const ETA_MIN_ELAPSED_S = 2;

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
  const [show_help, set_show_help] = useState(false);
  const [enabling, set_enabling] = useState(false);

  useEffect(() => {
    if (enabled) set_enabling(false);
  }, [enabled]);

  const is_paused = download.paused;
  const is_downloading = progress.building && !is_paused;
  const has_progress = is_downloading && progress.total > 0;
  const done = is_paused ? download.done : progress.current;
  const total = is_paused ? download.total : progress.total;
  const pct =
    total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0;
  const eta_seconds = use_download_eta(done, total, has_progress);

  const handle_pause = () => {
    pause_index_download();
  };

  const handle_resume = () => {
    resume_index_download(user?.email || "", true);
  };

  const help_button = (
    <button
      aria-label={t("mail.search_message_content_help")}
      className="text-txt-muted hover:text-fg flex-shrink-0"
      onClick={() => set_show_help((v) => !v)}
      type="button"
    >
      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 17h-2v-2h2v2zm2.07-7.75l-.9.92C13.45 12.9 13 13.5 13 15h-2v-.5c0-1.1.45-2.1 1.17-2.83l1.24-1.26c.37-.36.59-.86.59-1.41 0-1.1-.9-2-2-2s-2 .9-2 2H8c0-2.21 1.79-4 4-4s4 1.79 4 4c0 .88-.36 1.68-.93 2.25z" />
      </svg>
    </button>
  );

  const help_body = show_help && (
    <p className="mt-2 text-[11px] leading-relaxed text-txt-muted">
      {t("mail.search_message_content_help_body")}
    </p>
  );

  if (enabled) {
    const header_text = is_paused
      ? t("mail.download_paused")
      : is_downloading
        ? t("mail.indexing_messages")
        : t("mail.searching_message_content");

    const show_bar = has_progress || (is_paused && download.total > 0);

    return (
      <div className="px-4 py-2 border-b border-edge-secondary text-xs">
        <div className="flex items-center justify-between gap-3">
          <span className="flex items-center gap-1.5 text-txt-muted min-w-0">
            {is_downloading && !has_progress ? (
              <Spinner className="flex-shrink-0" size="xs" />
            ) : (
              <svg
                className="w-3.5 h-3.5 flex-shrink-0"
                fill="currentColor"
                viewBox="0 0 24 24"
              >
                <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm-2 16l-4-4 1.41-1.41L10 14.17l6.59-6.59L18 9l-8 8z" />
              </svg>
            )}
            <span className="truncate">{header_text}</span>
            {help_button}
          </span>
          <div className="flex items-center gap-3 flex-shrink-0 text-txt-muted">
            {has_progress && (
              <button
                className="text-txt-muted hover:text-fg underline-offset-2 hover:underline"
                onClick={handle_pause}
                type="button"
              >
                {t("mail.pause_download_action")}
              </button>
            )}
            {is_paused && (
              <button
                className="font-medium text-[var(--accent-color)] hover:opacity-80"
                onClick={handle_resume}
                type="button"
              >
                {t("mail.resume_download_action")}
              </button>
            )}
            <button
              className="text-txt-muted hover:text-fg underline-offset-2 hover:underline"
              onClick={on_disable}
              type="button"
            >
              {t("common.disable")}
            </button>
          </div>
        </div>
        {show_bar && (
          <div className="mt-2 h-1.5 w-full rounded-full bg-surf-secondary overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-300"
              style={{
                width: `${pct}%`,
                backgroundImage:
                  "linear-gradient(90deg, var(--accent-mix-w70), var(--accent-color))",
                opacity: is_paused ? 0.4 : 1,
              }}
            />
          </div>
        )}
        {(has_progress || (is_paused && download.total > 0)) && (
          <p className="mt-1.5 text-[11px] text-txt-muted tabular-nums">
            {t("mail.message_download_status", { done, total })}
          </p>
        )}
        {has_progress && eta_seconds !== null && (
          <p className="mt-0.5 text-[11px] text-txt-muted">
            {t("mail.estimated_time_remaining", {
              duration: format_remaining_duration(eta_seconds, language),
            })}
          </p>
        )}
        {help_body}
      </div>
    );
  }

  return (
    <div className="px-4 py-3 border-b border-edge-secondary">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-sm font-medium text-fg">
            {t("mail.search_message_content")}
          </span>
          {help_button}
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          <button
            className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded-[14px] border border-edge-primary text-fg hover:bg-surf-hover transition-colors disabled:opacity-70"
            disabled={enabling}
            onClick={() => {
              set_enabling(true);
              on_enable();
            }}
            type="button"
          >
            {enabling && <Spinner size="xs" />}
            {t("common.enable")}
          </button>
        </div>
      </div>
      {help_body}
    </div>
  );
}
