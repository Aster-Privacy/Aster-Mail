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

import type { ComponentType, ReactNode, SVGProps } from "react";

import { useEffect, useRef, useState } from "react";
import { PauseIcon, PlayIcon } from "@heroicons/react/20/solid";
import { InformationCircleIcon } from "@heroicons/react/24/outline";

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { use_auth } from "@/contexts/auth_context";
import { use_i18n } from "@/lib/i18n/context";
import {
  pause_index_download,
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
  const known = Math.max(reported_done, indexed_count, 0);
  const total = Math.max(reported_total, 0);
  const done = total > 0 ? Math.min(known, total) : known;

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

const ETA_SAMPLE_WINDOW_MS = 60000;
const ETA_MIN_ELAPSED_S = 2;

export function format_remaining_duration(
  seconds: number,
  locale: string,
): string {
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

export function use_download_eta(
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

interface IndexRingProps {
  percent: number;
  indeterminate: boolean;
  paused: boolean;
}

const RING_PATH = "M8 2a6 6 0 1 1 0 12a6 6 0 1 1 0-12";

function IndexRing({ percent, indeterminate, paused }: IndexRingProps) {
  const filled = indeterminate ? 28 : Math.min(Math.max(percent, 0), 100);

  return (
    <svg
      aria-hidden="true"
      className={`h-4 w-4 flex-shrink-0 ${indeterminate ? "animate-spin" : ""}`}
      data-ring-percent={indeterminate ? undefined : Math.floor(filled)}
      viewBox="0 0 16 16"
    >
      <path
        d={RING_PATH}
        fill="none"
        stroke="var(--border-secondary)"
        strokeWidth="2"
      />
      <path
        d={RING_PATH}
        fill="none"
        pathLength={100}
        stroke="var(--accent-color)"
        strokeDasharray="100"
        strokeDashoffset={100 - filled}
        strokeLinecap="round"
        strokeWidth="2"
        style={{
          opacity: paused ? 0.45 : 1,
          transition: "stroke-dashoffset 300ms ease-out",
        }}
      />
    </svg>
  );
}

export interface SearchIndexBadgeProps {
  is_paused: boolean;
  done: number;
  total: number;
  percent: number;
  eta_seconds?: number | null;
  on_pause?: () => void;
  on_resume?: () => void;
  show_percent?: boolean;
  testid?: string;
}

export function SearchIndexBadge({
  is_paused,
  done,
  total,
  percent,
  eta_seconds = null,
  on_pause,
  on_resume,
  show_percent = true,
  testid = "search-index-badge",
}: SearchIndexBadgeProps) {
  const { t, language } = use_i18n();
  const has_total = total > 0;
  const title = is_paused
    ? t("mail.search_index_paused_title")
    : t("mail.search_index_title");
  const rounded = Math.floor(percent);
  const count = has_total
    ? t("mail.search_index_progress", {
        done: done.toLocaleString(language),
        total: total.toLocaleString(language),
      })
    : t("mail.search_index_progress_unknown", {
        done: done.toLocaleString(language),
      });
  const eta =
    eta_seconds !== null && !is_paused
      ? t("mail.estimated_time_remaining", {
          duration: format_remaining_duration(eta_seconds, language),
        })
      : null;
  const action = is_paused ? on_resume : on_pause;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          aria-label={has_total ? `${title}, ${rounded}%` : title}
          className="flex h-8 flex-shrink-0 items-center gap-1.5 rounded-full px-2.5 text-[12px] font-medium tabular-nums transition-opacity hover:opacity-75 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-blue)]"
          data-testid={testid}
          style={{ color: "var(--text-muted)" }}
          type="button"
        >
          {is_paused ? (
            <PauseIcon className="h-3.5 w-3.5 flex-shrink-0" />
          ) : (
            <IndexRing
              indeterminate={!has_total}
              paused={false}
              percent={percent}
            />
          )}
          {show_percent && has_total && <span>{rounded}%</span>}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-[272px] p-3.5"
        collisionPadding={12}
        data-testid={`${testid}-popover`}
        sideOffset={6}
      >
        <div className="flex items-center gap-2">
          <IndexRing
            indeterminate={!has_total && !is_paused}
            paused={is_paused}
            percent={percent}
          />
          <p
            className="min-w-0 flex-1 truncate text-[13px] font-medium"
            style={{ color: "var(--text-primary)" }}
          >
            {title}
          </p>
          {has_total && (
            <span
              className="text-[12px] tabular-nums"
              style={{ color: "var(--text-muted)" }}
            >
              {rounded}%
            </span>
          )}
        </div>
        <p
          className="mt-1 ps-6 text-[12px] tabular-nums"
          style={{ color: "var(--text-muted)" }}
        >
          {eta ? `${count} · ${eta}` : count}
        </p>
        <p
          className="mt-3 text-[12px] leading-[18px]"
          style={{ color: "var(--text-secondary)" }}
        >
          {t("mail.search_index_why")}
        </p>
        {action && (
          <button
            className="mt-3 flex h-7 items-center gap-1.5 rounded-full px-3 text-[12px] font-medium transition-opacity hover:opacity-90"
            data-testid={is_paused ? `${testid}-resume` : `${testid}-pause`}
            style={
              is_paused
                ? {
                    backgroundColor: "var(--accent-blue)",
                    color: "var(--accent-fg, #ffffff)",
                  }
                : {
                    backgroundColor: "var(--aster-hover)",
                    color: "var(--text-secondary)",
                  }
            }
            type="button"
            onClick={action}
          >
            {is_paused ? (
              <PlayIcon className="h-3.5 w-3.5" />
            ) : (
              <PauseIcon className="h-3.5 w-3.5" />
            )}
            {is_paused
              ? t("mail.search_index_resume")
              : t("mail.pause_download_action")}
          </button>
        )}
      </PopoverContent>
    </Popover>
  );
}

const LENS_ROWS = [
  { y: 14, width: 46, delay: "0s" },
  { y: 36, width: 34, delay: "1.2s" },
  { y: 58, width: 40, delay: "2.4s" },
];

interface SearchLensProps {
  percent: number;
  indeterminate: boolean;
  paused: boolean;
}

function SearchLens({ percent, indeterminate, paused }: SearchLensProps) {
  const filled = Math.min(Math.max(percent, 0), 100);
  const moving = !paused;
  const ink = paused ? "var(--text-muted)" : "var(--accent-color)";

  return (
    <div
      className="flex flex-shrink-0 flex-col items-center"
      data-dial-percent={indeterminate ? undefined : Math.floor(filled)}
      data-lens-state={paused ? "paused" : "searching"}
    >
      <svg
        aria-hidden="true"
        className="h-[72px] w-24 overflow-visible"
        height="72"
        viewBox="0 0 96 72"
        width="96"
      >
        {LENS_ROWS.map((row) => (
          <g key={row.y}>
            <circle
              cx="10"
              cy={row.y}
              fill="var(--text-muted)"
              opacity={paused ? 0.2 : 0.3}
              r="4.5"
            />
            <rect
              fill="var(--text-muted)"
              height="4"
              opacity={paused ? 0.2 : 0.3}
              rx="2"
              width={row.width}
              x="21"
              y={row.y - 2}
            />
            {moving && (
              <g
                className="aster_search_lens_glint"
                style={{ animationDelay: row.delay }}
              >
                <circle cx="10" cy={row.y} fill={ink} r="4.5" />
                <rect
                  fill={ink}
                  height="4"
                  rx="2"
                  width={row.width}
                  x="21"
                  y={row.y - 2}
                />
              </g>
            )}
          </g>
        ))}
        <g transform="translate(61 14)">
          <g className={moving ? "aster_search_lens_sweep" : undefined}>
            <circle
              cx="0"
              cy="0"
              fill="var(--bg-primary)"
              r="9"
              stroke={ink}
              strokeWidth="2.5"
            />
            <rect
              fill={ink}
              height="6"
              rx="3"
              width="12"
              x="-6"
              y="-3"
            />
            <path
              d="M6.6 6.6l6 6"
              stroke={ink}
              strokeLinecap="round"
              strokeWidth="3"
            />
          </g>
        </g>
      </svg>
      <div
        className="relative mt-4 h-[3px] w-24 overflow-hidden rounded-full"
        style={{ background: "var(--border-secondary)" }}
      >
        <div
          className={`absolute inset-y-0 start-0 rounded-full ${
            indeterminate && moving ? "aster_search_bar_slide" : ""
          }`}
          style={{
            background: ink,
            opacity: paused ? 0.5 : 1,
            transition: "width 500ms ease-out",
            width: indeterminate ? "36%" : `${filled}%`,
          }}
        />
      </div>
    </div>
  );
}

function LensGlyph() {
  return (
    <svg
      aria-hidden="true"
      className="h-4 w-4 flex-shrink-0 overflow-visible"
      viewBox="0 0 16 16"
    >
      <g className="aster_search_lens_nudge">
        <circle
          cx="7"
          cy="7"
          fill="none"
          r="4.5"
          stroke="currentColor"
          strokeWidth="1.75"
        />
        <path
          d="M10.4 10.4l3 3"
          stroke="currentColor"
          strokeLinecap="round"
          strokeWidth="2"
        />
      </g>
    </svg>
  );
}

function IndexWhyButton({
  testid,
  search_content,
}: {
  testid: string;
  search_content: boolean;
}) {
  const { t } = use_i18n();

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          aria-label={t("mail.search_index_why_label")}
          className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full transition-opacity hover:opacity-70 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-blue)]"
          data-testid={testid}
          style={{ color: "var(--text-muted)" }}
          type="button"
        >
          <InformationCircleIcon aria-hidden="true" className="h-4 w-4" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[300px] p-3"
        collisionPadding={12}
        data-testid={`${testid}-popover`}
        sideOffset={6}
      >
        <p
          className="text-[12px] leading-[18px]"
          style={{ color: "var(--text-secondary)" }}
        >
          {t("mail.search_index_why")}
        </p>
        {search_content && (
          <p
            className="mt-2 text-[12px] leading-[18px]"
            data-testid={`${testid}-popover-content`}
            style={{ color: "var(--text-secondary)" }}
          >
            {t("mail.search_index_why_content")}
          </p>
        )}
      </PopoverContent>
    </Popover>
  );
}

function use_index_controls(
  status: SearchIndexStatus,
  search_content: boolean,
) {
  const { user } = use_auth();
  const { t, language } = use_i18n();
  const running = status.is_active && !status.is_paused;
  const eta_seconds = use_download_eta(
    status.done,
    status.total,
    running && status.total > 0 && status.done < status.total,
  );
  const count =
    status.total > 0
      ? t("mail.search_index_progress", {
          done: status.done.toLocaleString(language),
          total: status.total.toLocaleString(language),
        })
      : status.done > 0
        ? t("mail.search_index_progress_unknown", {
            done: status.done.toLocaleString(language),
          })
        : "";
  const eta =
    eta_seconds !== null && running
      ? t("mail.estimated_time_remaining", {
          duration: format_remaining_duration(eta_seconds, language),
        })
      : null;
  const progress = [count, eta].filter(Boolean).join(" · ");

  return {
    detail: running && !progress ? t("mail.search_index_preparing") : progress,
    hint: running ? t("mail.search_index_live_hint") : "",
    resume: () => resume_index_download(user?.email || "", search_content),
  };
}

export interface SearchEmptyAction {
  label: string;
  on_click: () => void;
  primary?: boolean;
  testid?: string;
}

function ActionPills({ actions }: { actions: SearchEmptyAction[] }) {
  if (actions.length === 0) return null;

  return (
    <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
      {actions.map((action) => (
        <button
          key={action.label}
          className="flex h-8 items-center rounded-full px-3.5 text-[13px] font-medium transition-opacity hover:opacity-85"
          data-testid={action.testid}
          style={
            action.primary
              ? {
                  backgroundColor: "var(--accent-blue)",
                  color: "var(--accent-fg, #ffffff)",
                }
              : {
                  backgroundColor: "var(--aster-hover)",
                  color: "var(--text-secondary)",
                }
          }
          type="button"
          onClick={action.on_click}
        >
          {action.label}
        </button>
      ))}
    </div>
  );
}

interface SearchIndexingStateProps {
  status: SearchIndexStatus;
  search_content: boolean;
  actions?: SearchEmptyAction[];
  testid?: string;
}

export function SearchIndexingState({
  status,
  search_content,
  actions = [],
  testid = "search-indexing-state",
}: SearchIndexingStateProps) {
  const { t } = use_i18n();
  const { detail, hint, resume } = use_index_controls(status, search_content);
  const control: SearchEmptyAction = status.is_paused
    ? {
        label: t("mail.search_index_resume"),
        on_click: resume,
        primary: true,
        testid: `${testid}-resume`,
      }
    : {
        label: t("mail.pause_download_action"),
        on_click: pause_index_download,
        testid: `${testid}-pause`,
      };

  return (
    <div
      className="aster_search_state_in flex min-h-full flex-col items-center justify-center px-6 pb-24 pt-12 text-center"
      data-testid={testid}
    >
      <SearchLens
        indeterminate={status.total === 0}
        paused={status.is_paused}
        percent={status.percent}
      />
      <div className="mt-6 flex items-center gap-1 ps-6">
        <p
          className="text-[15px] font-semibold"
          role="status"
          style={{ color: "var(--text-primary)" }}
        >
          {status.is_paused
            ? t("mail.search_index_paused_title")
            : t("mail.search_searching_title")}
        </p>
        <IndexWhyButton
          search_content={search_content}
          testid={`${testid}-why`}
        />
      </div>
      {detail && (
        <p
          className="mt-0.5 text-[13px] leading-5 tabular-nums"
          style={{ color: "var(--text-muted)" }}
        >
          {detail}
        </p>
      )}
      {hint && (
        <p
          className="mt-0.5 text-[13px] leading-5"
          data-testid={`${testid}-hint`}
          style={{ color: "var(--text-muted)" }}
        >
          {hint}
        </p>
      )}
      <ActionPills actions={[control, ...actions]} />
    </div>
  );
}

interface SearchIndexingRowProps {
  status: SearchIndexStatus;
  search_content: boolean;
  className?: string;
  testid?: string;
}

export function SearchIndexingRow({
  status,
  search_content,
  className = "",
  testid = "search-indexing-row",
}: SearchIndexingRowProps) {
  const { t } = use_i18n();
  const { resume } = use_index_controls(status, search_content);
  const has_total = status.total > 0;

  return (
    <div
      className={`flex h-10 items-center justify-center gap-2 px-4 text-[12px] tabular-nums ${className}`}
      data-testid={testid}
      style={{ color: "var(--text-muted)" }}
    >
      {status.is_paused ? (
        <PauseIcon aria-hidden="true" className="h-3.5 w-3.5 flex-shrink-0" />
      ) : (
        <LensGlyph />
      )}
      <span role="status">
        {status.is_paused
          ? t("mail.search_index_paused_title")
          : t("mail.search_searching_more")}
        {has_total ? ` · ${Math.floor(status.percent)}%` : ""}
      </span>
      <IndexWhyButton
        search_content={search_content}
        testid={`${testid}-why`}
      />
      {status.is_paused && (
        <button
          className="font-medium transition-opacity hover:opacity-80"
          data-testid={`${testid}-resume`}
          style={{ color: "var(--accent-blue)" }}
          type="button"
          onClick={resume}
        >
          {t("mail.search_index_resume")}
        </button>
      )}
    </div>
  );
}

interface SearchEmptyStateProps {
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  title: string;
  body?: ReactNode;
  actions?: SearchEmptyAction[];
  footer?: ReactNode;
  testid?: string;
}

export function SearchEmptyState({
  icon: Icon,
  title,
  body,
  actions = [],
  footer,
  testid = "search-empty-state",
}: SearchEmptyStateProps) {
  return (
    <div
      aria-live="polite"
      className="flex min-h-full flex-col items-center justify-center px-6 pb-24 pt-12 text-center"
      data-testid={testid}
      role="status"
    >
      <Icon
        aria-hidden="true"
        className="mb-3 h-7 w-7"
        style={{ color: "var(--text-muted)" }}
      />
      <p
        className="max-w-[360px] break-words text-[15px] font-semibold"
        style={{ color: "var(--text-primary)" }}
      >
        {title}
      </p>
      {body && (
        <p
          className="mt-1 max-w-[340px] text-[13px] leading-5"
          style={{ color: "var(--text-muted)" }}
        >
          {body}
        </p>
      )}
      <ActionPills actions={actions} />
      {footer}
    </div>
  );
}
