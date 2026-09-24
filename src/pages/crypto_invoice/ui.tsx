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
import { useEffect, useRef, type ReactNode } from "react";
import {
  ArrowLeftIcon,
  CheckIcon,
  ClipboardDocumentIcon,
  ExclamationTriangleIcon,
} from "@heroicons/react/24/outline";

import {
  WARNING_BG,
  WARNING_BORDER,
  WARNING_FG,
  WARNING_TEXT,
} from "./constants";

import { Spinner } from "@/components/ui/spinner";

export interface StatusStep {
  key: string;
  label: string;
  hint: string;
}

export const TICKET_CARD =
  "relative rounded-[16px] border border-edge-secondary bg-surf-secondary";

export interface PageShellProps {
  children: ReactNode;
  on_back: () => void;
  back_label: string;
}

export function page_shell({ children, on_back, back_label }: PageShellProps) {
  return (
    <div
      className="h-screen w-full overflow-y-auto overflow-x-hidden bg-surf-primary text-txt-primary"
      style={{ height: "100dvh" }}
    >
      <div className="mx-auto flex min-h-full w-full max-w-5xl flex-col justify-center gap-6 px-4 py-8 sm:px-6 sm:py-10">
        <header className="flex shrink-0 flex-col gap-5">
          <img
            alt="Aster"
            className="mx-auto h-7 w-auto select-none sm:h-8"
            decoding="async"
            draggable={false}
            src="/text_logo.png"
          />
          <button
            className="inline-flex w-fit items-center gap-2 rounded-[10px] border border-edge-secondary px-3 py-1.5 text-sm font-medium text-txt-secondary transition-colors hover:bg-surf-hover hover:text-txt-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-color)]"
            type="button"
            onClick={on_back}
          >
            <ArrowLeftIcon className="w-4 h-4 rtl:-scale-x-100" />
            {back_label}
          </button>
        </header>

        <main className="flex shrink-0 flex-col">{children}</main>
      </div>
    </div>
  );
}

export const PageShell = page_shell;

export interface TicketDividerProps {
  notch_color?: string;
}

export function ticket_divider({
  notch_color = "var(--bg-primary)",
}: TicketDividerProps) {
  const notch_style = { backgroundColor: notch_color };

  return (
    <div aria-hidden="true" className="relative h-0">
      <div className="mx-5 border-t border-dashed border-edge-secondary" />
      <span className="absolute -start-px top-0 h-4 w-2 -translate-y-1/2 overflow-hidden">
        <span
          className="absolute -start-2 top-0 h-4 w-4 rounded-full border border-edge-secondary"
          style={notch_style}
        />
      </span>
      <span className="absolute -end-px top-0 h-4 w-2 -translate-y-1/2 overflow-hidden">
        <span
          className="absolute -end-2 top-0 h-4 w-4 rounded-full border border-edge-secondary"
          style={notch_style}
        />
      </span>
    </div>
  );
}

export const TicketDivider = ticket_divider;

export interface NoticeProps {
  children: ReactNode;
  role?: "alert" | "note" | "status";
  tone?: "warning" | "neutral";
}

export function notice({ children, role, tone = "warning" }: NoticeProps) {
  const is_warning = tone === "warning";

  return (
    <div
      className={`flex items-start gap-2.5 rounded-[12px] border px-3.5 py-3 text-start ${
        is_warning ? "" : "border-edge-secondary bg-surf-tertiary"
      }`}
      role={role}
      style={
        is_warning
          ? { backgroundColor: WARNING_BG, borderColor: WARNING_BORDER }
          : undefined
      }
    >
      <ExclamationTriangleIcon
        className={`mt-px h-4 w-4 shrink-0 ${is_warning ? "" : "text-txt-muted"}`}
        style={is_warning ? { color: WARNING_TEXT } : undefined}
      />
      <div
        className="min-w-0 flex-1 text-xs leading-relaxed"
        style={{ color: WARNING_FG }}
      >
        {children}
      </div>
    </div>
  );
}

export const Notice = notice;

export interface ResultCardProps {
  children?: ReactNode;
  body: string;
  icon: ReactNode;
  title: string;
  tone: "accent" | "muted";
}

export function result_card({
  body,
  children,
  icon,
  title,
  tone,
}: ResultCardProps) {
  const heading_ref = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    heading_ref.current?.focus();
  }, []);

  const tone_style =
    tone === "accent"
      ? {
          backgroundColor:
            "color-mix(in srgb, var(--accent-color) 12%, transparent)",
          color: "var(--accent-color)",
        }
      : undefined;

  return (
    <div
      aria-live="polite"
      className={`${TICKET_CARD} mx-auto w-full max-w-md p-6 text-center sm:p-7`}
      role="status"
    >
      <div
        className={`mx-auto flex h-12 w-12 items-center justify-center rounded-[12px] ${
          tone_style ? "" : "border border-edge-secondary text-txt-muted"
        }`}
        style={tone_style}
      >
        {icon}
      </div>
      <h1
        ref={heading_ref}
        className="mt-4 text-lg font-semibold text-txt-primary outline-none"
        tabIndex={-1}
      >
        {title}
      </h1>
      <p className="mt-1.5 text-[13px] leading-relaxed text-txt-secondary">
        {body}
      </p>
      {children}
    </div>
  );
}

export const ResultCard = result_card;

export interface CopyFieldProps {
  label: string;
  value: string;
  copy_hint: string;
  copy_value?: string;
  value_class?: string;
  on_copy: (value: string) => void;
}

export function copy_field({
  label,
  value,
  copy_hint,
  copy_value,
  value_class = "text-sm",
  on_copy,
}: CopyFieldProps) {
  return (
    <div className="flex items-center gap-3 py-3">
      <div className="min-w-0 flex-1">
        <span className="block text-xs text-txt-muted">{label}</span>
        <span
          className={`mt-1 block select-all break-all font-mono font-medium leading-snug text-txt-primary ${value_class}`}
        >
          {value}
        </span>
      </div>
      <button
        aria-label={copy_hint}
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] border border-edge-secondary text-txt-muted transition-colors hover:bg-surf-hover hover:text-txt-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-color)]"
        type="button"
        onClick={() => on_copy(copy_value ?? value)}
      >
        <ClipboardDocumentIcon className="h-4 w-4" />
      </button>
    </div>
  );
}

export const CopyField = copy_field;

export interface DetailRowProps {
  label: string;
  children: ReactNode;
}

export function detail_row({ children, label }: DetailRowProps) {
  return (
    <div className="flex items-center justify-between gap-3 py-2.5">
      <span className="shrink-0 text-xs text-txt-muted">{label}</span>
      <span className="min-w-0 break-all text-end text-sm font-medium text-txt-primary">
        {children}
      </span>
    </div>
  );
}

export const DetailRow = detail_row;

export interface LiveStatusProps {
  hint: string;
  is_live: boolean;
  label: string;
}

export function live_status({ hint, is_live, label }: LiveStatusProps) {
  return (
    <div className="flex items-start gap-3">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] border border-edge-secondary">
        <Spinner
          className={`h-4 w-4 text-[var(--accent-color)] ${is_live ? "" : "opacity-40"}`}
          size="sm"
        />
      </span>
      <span className="flex min-w-0 flex-col">
        <span className="text-sm font-semibold text-txt-primary">{label}</span>
        <span className="mt-0.5 text-xs leading-relaxed text-txt-secondary">
          {hint}
        </span>
      </span>
    </div>
  );
}

export const LiveStatus = live_status;

export interface StepListProps {
  active_index: number;
  steps: StatusStep[];
  title: string;
}

function step_marker_style(done: boolean, current: boolean) {
  if (done) {
    return { backgroundColor: "var(--color-success)", color: "#ffffff" };
  }
  if (current) {
    return {
      backgroundColor: "var(--accent-color)",
      color: "var(--accent-fg, #ffffff)",
    };
  }

  return {
    border: "1.5px solid var(--border-secondary)",
    color: "var(--text-muted)",
  };
}

export function step_list({ active_index, steps, title }: StepListProps) {
  return (
    <div>
      <span className="text-xs text-txt-muted">{title}</span>
      <ol className="mt-3 flex flex-col">
        {steps.map((step, index) => {
          const done = index < active_index;
          const current = index === active_index;
          const reached = done || current;
          const is_last = index === steps.length - 1;

          return (
            <li
              key={step.key}
              className={`relative flex items-start gap-3 ${is_last ? "" : "pb-4"}`}
            >
              {!is_last && (
                <span
                  aria-hidden="true"
                  className="absolute start-0 flex w-[26px] justify-center"
                  style={{ top: 30, bottom: 4 }}
                >
                  <span
                    className="h-full w-[2px] rounded-full"
                    style={{
                      backgroundColor: done
                        ? "var(--color-success)"
                        : "var(--border-secondary)",
                    }}
                  />
                </span>
              )}
              <span
                className="relative z-10 flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full text-[11px] font-semibold tabular-nums"
                style={step_marker_style(done, current)}
              >
                {done ? (
                  <CheckIcon className="h-3.5 w-3.5" strokeWidth={2.5} />
                ) : (
                  index + 1
                )}
              </span>
              <span className="flex min-w-0 flex-col pt-[3px]">
                <span
                  className="text-[13px] leading-tight"
                  style={{
                    color: reached
                      ? "var(--text-primary)"
                      : "var(--text-muted)",
                    fontWeight: current ? 600 : 500,
                  }}
                >
                  {step.label}
                </span>
                <span className="mt-0.5 text-xs leading-relaxed text-txt-muted">
                  {step.hint}
                </span>
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

export const StepList = step_list;

export interface MeterProps {
  fraction: number;
  label: string;
  value_max: number;
  value_now: number;
}

export function meter({ fraction, label, value_max, value_now }: MeterProps) {
  const percent = Math.max(0, Math.min(100, Math.round(fraction * 100)));

  return (
    <div
      aria-label={label}
      aria-valuemax={value_max}
      aria-valuemin={0}
      aria-valuenow={value_now}
      className="mt-2 flex h-1.5 w-full overflow-hidden rounded-full bg-surf-tertiary"
      role="progressbar"
    >
      <div
        className="h-full rounded-full transition-[width] duration-500 ease-linear"
        style={{
          backgroundColor: "var(--accent-color)",
          width: `${percent}%`,
        }}
      />
    </div>
  );
}

export const Meter = meter;

const SKELETON_TONE = "animate-pulse bg-black/[0.04] dark:bg-white/[0.06]";

function skeleton_bar({ className }: { className: string }) {
  return <div className={`${SKELETON_TONE} rounded-md ${className}`} />;
}

const SkeletonBar = skeleton_bar;

export function invoice_skeleton() {
  return (
    <div
      aria-busy="true"
      className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[1.05fr_1fr]"
    >
      <section className={`${TICKET_CARD} p-5 sm:p-6`}>
        <div className="flex items-center gap-3">
          <div className={`${SKELETON_TONE} h-10 w-10 shrink-0 rounded-full`} />
          <div className="min-w-0 flex-1 space-y-2">
            <SkeletonBar className="h-5 w-40 max-w-full" />
            <SkeletonBar className="h-3 w-24 max-w-full" />
          </div>
        </div>

        <div className="mt-4 space-y-2">
          <SkeletonBar className="h-3.5 w-full" />
          <SkeletonBar className="h-3.5 w-4/5" />
        </div>

        <div className="mt-5 flex flex-col items-center gap-4">
          <div
            className={`${SKELETON_TONE} h-[228px] w-[228px] rounded-[16px]`}
          />
          <div className="w-full space-y-3">
            <SkeletonBar className="h-12 w-full" />
            <SkeletonBar className="h-12 w-full" />
          </div>
        </div>
      </section>

      <section className={`${TICKET_CARD} p-5 sm:p-6`}>
        <SkeletonBar className="h-3 w-20" />
        <SkeletonBar className="mt-3 h-7 w-32 max-w-full" />
        <SkeletonBar className="mt-3 h-3 w-48 max-w-full" />
        <div className="mt-6 space-y-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="flex items-start gap-3">
              <div
                className={`${SKELETON_TONE} h-[26px] w-[26px] shrink-0 rounded-full`}
              />
              <div className="flex-1 space-y-2">
                <SkeletonBar className="h-3.5 w-1/3" />
                <SkeletonBar className="h-3 w-4/5" />
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

export const InvoiceSkeleton = invoice_skeleton;
