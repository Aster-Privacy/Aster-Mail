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

import { memo, useEffect, useRef, useState } from "react";
import { PauseIcon, PlayIcon } from "@heroicons/react/20/solid";
import { InformationCircleIcon } from "@heroicons/react/24/outline";

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  ListEmptyActions,
  ListEmptyState,
  type ListEmptyAction,
} from "@/components/common/list_empty_state";
import { use_auth } from "@/contexts/auth_context";
import { use_i18n } from "@/lib/i18n/context";
import {
  pause_index_download,
  resume_index_download,
  use_index_download_state,
  use_indexing_progress,
} from "@/hooks/use_search/progress";
import { progress_percent } from "@/hooks/use_search/progress_math";
import {
  create_eta_estimator,
  eta_phrase,
  type EtaEstimator,
} from "@/hooks/use_search/index_eta";

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
  const estimator_ref = useRef<EtaEstimator | null>(null);
  const [eta_seconds, set_eta_seconds] = useState<number | null>(null);

  useEffect(() => {
    const estimator = (estimator_ref.current ??= create_eta_estimator());

    if (!active || total <= 0) {
      estimator.reset();
      set_eta_seconds(null);

      return;
    }

    set_eta_seconds(estimator.sample(Date.now(), done, total));
  }, [done, total, active]);

  return active ? eta_seconds : null;
}

export function use_eta_text(eta_seconds: number | null): string | null {
  const { t, language } = use_i18n();

  if (eta_seconds === null) return null;

  const phrase = eta_phrase(eta_seconds);

  if (phrase.key === "search_index_eta_under_minute") {
    return t("mail.search_index_eta_under_minute");
  }

  return t(`mail.${phrase.key}`, {
    count: phrase.count,
    value: phrase.count.toLocaleString(language),
  });
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
  const eta_text = use_eta_text(eta_seconds);
  const eta = is_paused ? null : eta_text;
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
        <ProgressLine
          className="mt-1 justify-start ps-6 text-[12px]"
          parts={[count, eta]}
        />
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
  { top: 14, width: 46, glint: "aster_search_glint_a" },
  { top: 36, width: 34, glint: "aster_search_glint_b" },
  { top: 58, width: 40, glint: "aster_search_glint_c" },
];

function LensMark({ ink }: { ink: string }) {
  return (
    <svg
      aria-hidden="true"
      className="h-[30px] w-[30px] overflow-visible"
      viewBox="-11 -11 30 30"
    >
      <circle
        cx="0"
        cy="0"
        fill="var(--bg-primary)"
        r="9"
        stroke={ink}
        strokeWidth="2.5"
      />
      <rect fill={ink} height="6" rx="3" width="12" x="-6" y="-3" />
      <path
        d="M6.6 6.6l6 6"
        stroke={ink}
        strokeLinecap="round"
        strokeWidth="3"
      />
    </svg>
  );
}

function LensRow({
  width,
  color,
  opacity,
}: {
  width: number;
  color: string;
  opacity?: number;
}) {
  return (
    <>
      <span
        className="h-[9px] w-[9px] flex-shrink-0 rounded-full"
        style={{ marginInlineStart: 5.5, background: color, opacity }}
      />
      <span
        className="h-1 flex-shrink-0 rounded-full"
        style={{ marginInlineStart: 6.5, width, background: color, opacity }}
      />
    </>
  );
}

const LensLoop = memo(function LensLoop({ paused }: { paused: boolean }) {
  const moving = !paused;
  const ink = paused ? "var(--text-muted)" : "var(--accent-color)";

  return (
    <div
      aria-hidden="true"
      className="relative h-[72px] w-24"
      data-lens-loop=""
    >
      {LENS_ROWS.map((row) => (
        <div
          key={row.top}
          className="absolute start-0 flex h-[9px] items-center"
          style={{ top: row.top - 4.5 }}
        >
          <LensRow
            color="var(--text-muted)"
            opacity={paused ? 0.2 : 0.3}
            width={row.width}
          />
          {moving && (
            <span
              className={`absolute inset-y-0 start-0 flex items-center ${row.glint}`}
            >
              <LensRow color={ink} width={row.width} />
            </span>
          )}
        </div>
      ))}
      <div
        className={`absolute ${moving ? "aster_search_lens_sweep" : ""}`}
        style={{ insetInlineStart: 50, top: 3 }}
      >
        <LensMark ink={ink} />
      </div>
    </div>
  );
});

interface SearchLensProps {
  percent: number;
  indeterminate: boolean;
  paused: boolean;
}

const SearchLens = memo(function SearchLens({
  percent,
  indeterminate,
  paused,
}: SearchLensProps) {
  const filled = Math.min(Math.max(Math.floor(percent), 0), 100);
  const moving = !paused;
  const ink = paused ? "var(--text-muted)" : "var(--accent-color)";

  return (
    <div
      className="flex flex-shrink-0 flex-col items-center"
      data-dial-percent={indeterminate ? undefined : filled}
      data-lens-state={paused ? "paused" : "searching"}
    >
      <LensLoop paused={paused} />
      <div
        className="relative mt-4 h-[3px] w-24 overflow-hidden rounded-full"
        style={{ background: "var(--border-secondary)" }}
      >
        {indeterminate ? (
          <div
            className={`absolute inset-y-0 start-0 w-[36%] rounded-full ${
              moving ? "aster_search_bar_slide" : ""
            }`}
            style={{ background: ink, opacity: paused ? 0.5 : 1 }}
          />
        ) : (
          <div
            className="aster_search_bar_fill absolute inset-0 rounded-full"
            data-bar-fill={filled}
            style={{
              background: ink,
              opacity: paused ? 0.5 : 1,
              transform: `scaleX(${filled / 100})`,
            }}
          />
        )}
      </div>
    </div>
  );
});

function ProgressLine({
  parts,
  className = "",
  testid,
}: {
  parts: (string | null | undefined)[];
  className?: string;
  testid?: string;
}) {
  const shown = parts.filter((part): part is string => !!part);

  if (shown.length === 0) return null;

  return (
    <p
      className={`flex max-w-full flex-wrap items-baseline justify-center gap-x-1.5 tabular-nums ${className}`}
      data-testid={testid}
      style={{ color: "var(--text-muted)" }}
    >
      {shown.map((part, index) => (
        <span key={index} className="flex min-w-0 items-baseline gap-x-1.5">
          {index > 0 && <span aria-hidden="true">·</span>}
          <span className="break-words">{part}</span>
        </span>
      ))}
    </p>
  );
}

function LensGlyph() {
  return (
    <span
      aria-hidden="true"
      className="aster_search_lens_nudge inline-flex h-4 w-4 flex-shrink-0"
    >
      <svg className="h-4 w-4 overflow-visible" viewBox="0 0 16 16">
        <g>
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
    </span>
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
  const eta_text = use_eta_text(eta_seconds);
  const eta = running ? eta_text : null;
  const parts = [count, eta].filter((part): part is string => !!part);

  return {
    detail:
      running && parts.length === 0
        ? [t("mail.search_index_preparing")]
        : parts,
    hint: running ? t("mail.search_index_live_hint") : "",
    resume: () => resume_index_download(user?.email || "", search_content),
  };
}

export type SearchEmptyAction = ListEmptyAction;

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
      <ProgressLine
        className="mt-0.5 w-full max-w-[420px] text-[13px] leading-5"
        parts={detail}
        testid={`${testid}-detail`}
      />
      {hint && (
        <p
          className="mt-0.5 text-[13px] leading-5"
          data-testid={`${testid}-hint`}
          style={{ color: "var(--text-muted)" }}
        >
          {hint}
        </p>
      )}
      <ListEmptyActions actions={[control, ...actions]} />
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
  icon,
  title,
  body,
  actions = [],
  footer,
  testid = "search-empty-state",
}: SearchEmptyStateProps) {
  return (
    <ListEmptyState
      actions={actions}
      description={body}
      icon={icon}
      testid={testid}
      title={title}
    >
      {footer}
    </ListEmptyState>
  );
}
