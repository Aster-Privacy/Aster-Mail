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

import { useEffect, useState } from "react";

import { use_auth } from "@/contexts/auth_context";
import { use_i18n } from "@/lib/i18n/context";
import {
  resume_index_download,
  use_index_download_state,
  use_indexing_progress,
} from "@/hooks/use_search/progress";
import { progress_percent } from "@/hooks/use_search/progress_math";

export interface SearchIndexStatus {
  is_active: boolean;
  is_paused: boolean;
  done: number;
  total: number;
  percent: number;
}

export function resolve_index_status(
  index_pending: boolean,
  indexed_count: number,
  progress: { building: boolean; current: number; total: number },
  download: { paused: boolean; done: number; total: number },
  waiting = false,
): SearchIndexStatus {
  const pending = index_pending || waiting;
  const is_paused = pending && download.paused;
  const is_active = pending && (is_paused || progress.building);
  const reported_done = is_paused ? download.done : progress.current;
  const reported_total = is_paused ? download.total : progress.total;
  const done = Math.max(reported_done, indexed_count, 0);
  const total = reported_total > 0 ? Math.max(reported_total, done) : 0;

  return {
    is_active,
    is_paused,
    done,
    total,
    percent: progress_percent({ done, total }, is_active),
  };
}

const WAITING_NOTICE_DELAY_MS = 1200;

function use_settled_waiting(waiting: boolean): boolean {
  const [settled, set_settled] = useState(false);

  useEffect(() => {
    if (!waiting) {
      set_settled(false);

      return;
    }

    const id = setTimeout(() => set_settled(true), WAITING_NOTICE_DELAY_MS);

    return () => clearTimeout(id);
  }, [waiting]);

  return waiting && settled;
}

export function use_search_index_status(
  index_pending: boolean,
  indexed_count: number,
  waiting = false,
): SearchIndexStatus {
  const progress = use_indexing_progress();
  const download = use_index_download_state();
  const settled_waiting = use_settled_waiting(waiting);

  return resolve_index_status(
    index_pending,
    indexed_count,
    progress,
    download,
    settled_waiting,
  );
}

interface SearchIndexingNoticeProps {
  status: SearchIndexStatus;
  query: string;
  search_content: boolean;
}

function progress_text(
  t: ReturnType<typeof use_i18n>["t"],
  status: SearchIndexStatus,
): string {
  return status.total > 0
    ? t("mail.search_index_progress", {
        done: status.done,
        total: status.total,
      })
    : t("mail.search_index_progress_unknown", { done: status.done });
}

export function SearchIndexingNotice({
  status,
  query,
  search_content,
}: SearchIndexingNoticeProps) {
  const { t } = use_i18n();
  const { user } = use_auth();

  return (
    <div
      aria-live="polite"
      className="flex flex-col items-center justify-center px-6 py-14 text-center"
      data-testid="search-indexing-notice"
      role="status"
    >
      <p
        className="mb-2 text-sm font-medium"
        style={{ color: "var(--text-primary)" }}
      >
        {status.is_paused
          ? t("mail.search_index_paused_title")
          : t("mail.search_index_title")}
      </p>
      <p
        className="max-w-[420px] text-xs leading-5"
        style={{ color: "var(--text-secondary)" }}
      >
        {t("mail.search_index_no_matches_yet", { query })}
      </p>
      <div className="mt-4 w-full max-w-[320px]">
        <div
          aria-hidden="true"
          className="h-1 w-full overflow-hidden rounded-full bg-surf-secondary"
        >
          <div
            className="h-full rounded-full transition-all duration-300"
            style={{
              width: `${status.total > 0 ? status.percent : 0}%`,
              backgroundColor: "var(--accent-color)",
              opacity: status.is_paused ? 0.4 : 1,
            }}
          />
        </div>
        <p
          className="mt-2 text-xs tabular-nums"
          style={{ color: "var(--text-muted)" }}
        >
          {progress_text(t, status)}
        </p>
      </div>
      {status.is_paused && (
        <button
          className="mt-4 rounded-[var(--aster-radius-control)] bg-[var(--accent-blue)] px-3 py-1.5 text-xs font-medium text-[var(--accent-fg,#ffffff)] transition-opacity hover:opacity-90"
          data-testid="search-indexing-resume"
          type="button"
          onClick={() =>
            resume_index_download(user?.email || "", search_content)
          }
        >
          {t("mail.search_index_resume")}
        </button>
      )}
      <p
        className="mt-5 max-w-[420px] text-xs leading-5"
        style={{ color: "var(--text-muted)" }}
      >
        {status.is_paused
          ? t("mail.search_index_paused_body")
          : search_content
            ? t("mail.search_index_why_content")
            : t("mail.search_index_why")}
      </p>
    </div>
  );
}

interface SearchIndexingStripProps {
  status: SearchIndexStatus;
  search_content: boolean;
  className?: string;
}

export function SearchIndexingStrip({
  status,
  search_content,
  className,
}: SearchIndexingStripProps) {
  const { t } = use_i18n();
  const { user } = use_auth();

  if (!status.is_active) return null;

  return (
    <div
      aria-live="polite"
      className={`flex flex-wrap items-baseline gap-x-2 gap-y-0.5 px-3.5 py-2 text-xs ${className ?? ""}`}
      data-testid="search-indexing-strip"
      role="status"
    >
      <span style={{ color: "var(--text-secondary)" }}>
        {status.is_paused
          ? t("mail.search_index_partial_paused")
          : t("mail.search_index_partial")}
      </span>
      <span className="tabular-nums" style={{ color: "var(--text-muted)" }}>
        {progress_text(t, status)}
      </span>
      {status.is_paused && (
        <button
          className="rounded px-1 py-0.5 font-medium text-[var(--accent-blue)] transition-colors hover:bg-[var(--accent-blue)]/10"
          type="button"
          onClick={() =>
            resume_index_download(user?.email || "", search_content)
          }
        >
          {t("mail.search_index_resume")}
        </button>
      )}
    </div>
  );
}
