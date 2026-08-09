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
import {  useEffect, useRef,  type ReactNode } from "react";
import {
  ArrowLeftIcon,
  CheckIcon,
  ClipboardDocumentIcon,
} from "@heroicons/react/24/outline";

import { Spinner } from "@/components/ui/spinner";


export interface StatusStep {
  key: string;
  label: string;
  hint: string;
}

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
            className="inline-flex w-fit items-center gap-2 rounded-full bg-surf-secondary px-3.5 py-2 text-sm font-medium text-txt-secondary transition-colors hover:bg-surf-hover hover:text-txt-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-color)]"
            type="button"
            onClick={on_back}
          >
            <ArrowLeftIcon className="w-4 h-4" />
            {back_label}
          </button>
        </header>

        <main className="flex shrink-0 flex-col">{children}</main>
      </div>
    </div>
  );
}

export const PageShell = page_shell;

export interface ResultCardProps {
  children?: ReactNode;
  body: string;
  icon: ReactNode;
  title: string;
  tone: "accent" | "muted";
}

export function result_card({ body, children, icon, title, tone }: ResultCardProps) {
  const heading_ref = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    heading_ref.current?.focus();
  }, []);

  const tone_style =
    tone === "accent"
      ? {
          backgroundColor: "var(--accent-color)",
          color: "var(--accent-fg, #ffffff)",
        }
      : undefined;

  return (
    <div
      aria-live="polite"
      className="mx-auto w-full max-w-md rounded-3xl border border-edge-secondary bg-surf-secondary p-8 text-center"
      role="status"
    >
      <div
        className={`mx-auto flex h-14 w-14 items-center justify-center rounded-2xl ${
          tone_style ? "" : "bg-surf-tertiary text-txt-muted"
        }`}
        style={tone_style}
      >
        {icon}
      </div>
      <h1
        ref={heading_ref}
        className="mt-5 text-xl font-semibold text-txt-primary outline-none"
        tabIndex={-1}
      >
        {title}
      </h1>
      <p className="mt-2 text-sm leading-relaxed text-txt-secondary">{body}</p>
      {children}
    </div>
  );
}

export const ResultCard = result_card;

export interface CopyFieldProps {
  label: string;
  value: string;
  copy_value?: string;
  value_class?: string;
  is_copied?: boolean;
  on_copy: (value: string) => void;
}

export function copy_field({
  label,
  value,
  copy_value,
  value_class = "text-sm",
  is_copied = false,
  on_copy,
}: CopyFieldProps) {
  return (
    <button
      className="group w-full rounded-2xl border border-edge-secondary bg-surf-tertiary px-4 py-3 text-left transition-colors hover:border-edge-primary hover:bg-surf-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-color)]"
      type="button"
      onClick={() => on_copy(copy_value ?? value)}
    >
      <span className="flex items-center justify-between gap-3">
        <span className="text-[11px] font-medium uppercase tracking-wide text-txt-muted">
          {label}
        </span>
        {is_copied ? (
          <CheckIcon className="w-4 h-4 shrink-0 text-aster-success" />
        ) : (
          <ClipboardDocumentIcon className="w-4 h-4 shrink-0 text-txt-muted transition-colors group-hover:text-txt-primary" />
        )}
      </span>
      <span
        className={`mt-1.5 block break-all font-mono font-semibold leading-snug text-txt-primary ${value_class}`}
      >
        {value}
      </span>
    </button>
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
      <span className="shrink-0 text-xs font-medium text-txt-muted">{label}</span>
      <span className="min-w-0 break-all text-right text-sm font-medium text-txt-primary">
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
    <div className="flex flex-col items-center gap-3 text-center">
      <Spinner
        className={`h-10 w-10 text-[var(--accent-color)] ${is_live ? "" : "opacity-40"}`}
        size="lg"
      />
      <span className="text-sm font-semibold text-txt-primary">{label}</span>
      <p className="max-w-xs text-xs leading-relaxed text-txt-secondary">{hint}</p>
    </div>
  );
}

export const LiveStatus = live_status;

export interface StepListProps {
  active_index: number;
  steps: StatusStep[];
  title: string;
}

export function step_list({ active_index, steps, title }: StepListProps) {
  return (
    <div className="rounded-2xl bg-surf-tertiary p-4">
      <span className="text-[11px] font-medium uppercase tracking-wide text-txt-muted">
        {title}
      </span>
      <ol className="mt-3 flex flex-col">
        {steps.map((step, index) => {
          const done = index < active_index;
          const current = index === active_index;
          const reached = done || current;
          const is_last = index === steps.length - 1;

          return (
            <li
              key={step.key}
              className={`relative flex items-start gap-3 ${is_last ? "" : "pb-5"}`}
            >
              {!is_last && (
                <span
                  aria-hidden="true"
                  className="absolute left-0 flex w-[18px] justify-center"
                  style={{ top: 9, bottom: -9 }}
                >
                  <span
                    className="h-full w-[2px]"
                    style={{
                      backgroundColor: done
                        ? "var(--accent-color)"
                        : "var(--border-secondary)",
                    }}
                  />
                </span>
              )}
              <span className="relative z-10 flex h-[18px] w-[18px] shrink-0 items-center justify-center">
                {reached ? (
                  <span
                    className="flex h-[18px] w-[18px] items-center justify-center rounded-full"
                    style={{
                      backgroundColor: "var(--accent-color)",
                      color: "var(--accent-fg, #ffffff)",
                      boxShadow: current
                        ? "0 0 0 4px color-mix(in srgb, var(--accent-color) 20%, transparent)"
                        : undefined,
                    }}
                  >
                    {done ? (
                      <CheckIcon className="h-3 w-3" strokeWidth={3} />
                    ) : (
                      <span
                        className="h-[6px] w-[6px] rounded-full"
                        style={{ backgroundColor: "var(--accent-fg, #ffffff)" }}
                      />
                    )}
                  </span>
                ) : (
                  <span
                    className="h-[10px] w-[10px] rounded-full border-2 bg-surf-tertiary"
                    style={{ borderColor: "var(--border-secondary)" }}
                  />
                )}
              </span>
              <span className="flex min-w-0 flex-col pb-0.5">
                <span
                  className="text-xs leading-tight"
                  style={{
                    color: reached ? "var(--text-primary)" : "var(--text-muted)",
                    fontWeight: current ? 600 : 500,
                  }}
                >
                  {step.label}
                </span>
                <span className="mt-0.5 text-[11px] leading-relaxed text-txt-muted">
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
      className="mt-2 flex h-2 w-full overflow-hidden rounded-full bg-surf-tertiary"
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

