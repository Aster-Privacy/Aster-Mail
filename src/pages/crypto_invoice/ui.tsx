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
import { useEffect, useRef, type ComponentType, type ReactNode } from "react";
import {
  ArrowLeftIcon,
  CheckIcon,
  ClipboardDocumentIcon,
  ExclamationCircleIcon,
} from "@heroicons/react/24/outline";

import { Spinner } from "@/components/ui/spinner";

export interface StatusStep {
  key: string;
  label: string;
  hint: string;
}

export const TICKET_CARD = "relative rounded-2xl bg-surf-secondary";

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
            className="inline-flex w-fit items-center gap-2 rounded-md text-sm font-medium text-txt-secondary transition-colors hover:text-txt-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-color)]"
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
          className="absolute -start-2 top-0 h-4 w-4 rounded-full"
          style={notch_style}
        />
      </span>
      <span className="absolute -end-px top-0 h-4 w-2 -translate-y-1/2 overflow-hidden">
        <span
          className="absolute -end-2 top-0 h-4 w-4 rounded-full"
          style={notch_style}
        />
      </span>
    </div>
  );
}

export const TicketDivider = ticket_divider;

export interface NoticeProps {
  children: ReactNode;
  icon?: ComponentType<{ className?: string }>;
  role?: "alert" | "note" | "status";
  tone?: "warning" | "neutral";
}

export function notice({
  children,
  icon: Icon = ExclamationCircleIcon,
  role,
  tone = "warning",
}: NoticeProps) {
  const is_warning = tone === "warning";

  return (
    <div
      className={`flex items-start gap-2.5 text-start text-[13px] leading-5 ${
        is_warning ? "font-medium text-amber-500" : "text-txt-secondary"
      }`}
      role={role}
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="min-w-0 flex-1">{children}</div>
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
    tone === "accent" ? { color: "var(--accent-color)" } : undefined;

  return (
    <div
      aria-live="polite"
      className={`${TICKET_CARD} mx-auto w-full max-w-md p-6 text-center sm:p-7`}
      role="status"
    >
      <div
        className={`mx-auto flex h-12 w-12 items-center justify-center ${
          tone_style ? "" : "text-txt-muted"
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
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-txt-muted transition-colors hover:bg-surf-hover hover:text-txt-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-color)]"
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
    <div className="flex min-h-[28px] items-center justify-between gap-3">
      <span className="shrink-0 text-[13px] text-txt-muted">{label}</span>
      <span className="min-w-0 break-all text-end text-[13px] font-medium text-txt-primary">
        {children}
      </span>
    </div>
  );
}

export const DetailRow = detail_row;

export interface StepListProps {
  active_index: number;
  current_hint: string;
  current_label: string;
  is_live: boolean;
  steps: StatusStep[];
  title: string;
}

export function step_list({
  active_index,
  current_hint,
  current_label,
  is_live,
  steps,
  title,
}: StepListProps) {
  return (
    <div>
      <span className="text-xs font-medium text-txt-muted">{title}</span>
      <ol className="mt-3 flex flex-col">
        {steps.map((step, index) => {
          const done = index < active_index;
          const current = index === active_index;
          const is_last = index === steps.length - 1;

          return (
            <li
              key={step.key}
              aria-current={current ? "step" : undefined}
              className={`relative flex items-start gap-3 ${is_last ? "" : "pb-4"}`}
            >
              {!is_last && (
                <span
                  aria-hidden="true"
                  className="absolute start-[9px] top-[22px] bottom-0.5 w-0.5 rounded-full"
                  style={{
                    backgroundColor: done
                      ? "var(--color-success)"
                      : "var(--border-secondary)",
                  }}
                />
              )}
              <span
                aria-hidden="true"
                className="flex h-5 w-5 shrink-0 items-center justify-center"
              >
                {done ? (
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[var(--color-success)]">
                    <CheckIcon className="h-3 w-3 text-white" strokeWidth={3} />
                  </span>
                ) : current && is_live ? (
                  <Spinner className="text-txt-primary" size="md" />
                ) : current ? (
                  <span className="h-5 w-5 rounded-full bg-[var(--accent-color)]" />
                ) : (
                  <span className="h-5 w-5 rounded-full border-2 border-edge-secondary" />
                )}
              </span>
              <span className="flex min-w-0 flex-col">
                <span
                  className={`text-sm leading-5 ${
                    current
                      ? "font-semibold text-txt-primary"
                      : done
                        ? "text-txt-secondary"
                        : "text-txt-muted"
                  }`}
                >
                  {current ? current_label : step.label}
                </span>
                {current && current_hint && (
                  <span className="mt-0.5 text-[13px] leading-5 text-txt-secondary">
                    {current_hint}
                  </span>
                )}
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
          <div className={`${SKELETON_TONE} h-[228px] w-[228px] rounded-2xl`} />
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
