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
import type { UpdateInstallState } from "@/components/updates/use_update_installer";

import { useId, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { XMarkIcon } from "@heroicons/react/24/outline";
import { CheckIcon, ExclamationTriangleIcon } from "@heroicons/react/20/solid";

import { Button } from "@/components/ui/button";
import { use_i18n } from "@/lib/i18n/context";
import { format_bytes } from "@/lib/utils";
import { use_should_reduce_motion } from "@/provider";

export type UpdateCardVariant = "floating" | "inline";

export interface UpdateCardProps {
  version: string;
  notes?: string;
  install: UpdateInstallState;
  variant?: UpdateCardVariant;
  on_install: () => void;
  on_dismiss?: () => void;
}

const RING_SIZE = 44;
const RING_STROKE = 3;
const RING_RADIUS = (RING_SIZE - RING_STROKE) / 2;
const RING_LENGTH = 2 * Math.PI * RING_RADIUS;
const EASE = [0.22, 1, 0.36, 1] as const;
const TITLE_CLASS =
  "truncate text-[14px] font-semibold leading-5 text-txt-primary";

export function format_time_left(
  seconds: number | null,
  t: ReturnType<typeof use_i18n>["t"],
): string | null {
  if (seconds === null || !Number.isFinite(seconds)) return null;
  if (seconds < 5) return t("settings.updates_time_left_moment");
  if (seconds < 60) {
    return t("settings.updates_time_left_seconds", {
      seconds: Math.max(5, Math.round(seconds / 5) * 5),
    });
  }

  return t("settings.updates_time_left_minutes", {
    minutes: Math.ceil(seconds / 60),
  });
}

function ProgressRing({
  percent,
  phase,
  reduce_motion,
}: {
  percent: number | null;
  phase: UpdateInstallState["phase"];
  reduce_motion: boolean;
}) {
  const busy =
    phase === "preparing" || phase === "downloading" || phase === "installing";
  const determinate = phase === "downloading" && percent !== null;
  const offset = RING_LENGTH * (1 - (determinate ? percent : 0) / 100);
  const center = RING_SIZE / 2;

  return (
    <div
      className="relative flex flex-shrink-0 items-center justify-center"
      style={{ width: RING_SIZE, height: RING_SIZE }}
    >
      <svg
        aria-hidden
        className="absolute inset-0 -rotate-90"
        height={RING_SIZE}
        viewBox={`0 0 ${RING_SIZE} ${RING_SIZE}`}
        width={RING_SIZE}
      >
        <circle
          className="stroke-brand/15"
          cx={center}
          cy={center}
          fill="none"
          opacity={busy ? 1 : 0}
          r={RING_RADIUS}
          strokeWidth={RING_STROKE}
          style={{ transition: "opacity 240ms ease" }}
        />
        <circle
          className="stroke-brand"
          cx={center}
          cy={center}
          fill="none"
          opacity={determinate ? 1 : 0}
          r={RING_RADIUS}
          strokeDasharray={RING_LENGTH}
          strokeDashoffset={offset}
          strokeLinecap="round"
          strokeWidth={RING_STROKE}
          style={{
            transition: reduce_motion
              ? "opacity 240ms ease"
              : "stroke-dashoffset 420ms cubic-bezier(0.22, 1, 0.36, 1), opacity 240ms ease",
          }}
        />
      </svg>
      <AnimatePresence>
        {busy && !determinate && (
          <motion.svg
            key="spinner"
            aria-hidden
            animate={{ opacity: 1 }}
            className="absolute inset-0"
            data-testid="update-spinner"
            exit={{ opacity: 0 }}
            height={RING_SIZE}
            initial={{ opacity: 0 }}
            viewBox={`0 0 ${RING_SIZE} ${RING_SIZE}`}
            width={RING_SIZE}
          >
            <motion.circle
              animate={reduce_motion ? undefined : { rotate: 360 }}
              className="stroke-brand"
              cx={center}
              cy={center}
              fill="none"
              r={RING_RADIUS}
              strokeDasharray={`${RING_LENGTH * 0.28} ${RING_LENGTH}`}
              strokeLinecap="round"
              strokeWidth={RING_STROKE}
              style={{ originX: "50%", originY: "50%" }}
              transition={{ duration: 1, ease: "linear", repeat: Infinity }}
            />
          </motion.svg>
        )}
      </AnimatePresence>
      <motion.div
        animate={{ scale: busy ? 0.74 : 1 }}
        className="relative h-10 w-10 overflow-hidden rounded-[11px]"
        initial={false}
        transition={{ duration: reduce_motion ? 0 : 0.35, ease: EASE }}
      >
        <img
          alt=""
          className="h-full w-full select-none"
          draggable={false}
          src="/mail_logo.png"
        />
      </motion.div>
      <AnimatePresence>
        {(phase === "installing" || phase === "failed") && (
          <motion.span
            key={phase}
            animate={{ scale: 1, opacity: 1 }}
            className={`absolute -bottom-0.5 -end-0.5 flex h-[18px] w-[18px] items-center justify-center rounded-full ring-2 ring-[var(--aster-floating-bg,var(--bg-primary))] ${
              phase === "failed"
                ? "bg-[var(--color-danger,#e5484d)]"
                : "bg-brand"
            }`}
            exit={{ scale: 0.4, opacity: 0 }}
            initial={{ scale: 0.4, opacity: 0 }}
            transition={{ type: "spring", stiffness: 520, damping: 26 }}
          >
            {phase === "failed" ? (
              <ExclamationTriangleIcon className="h-2.5 w-2.5 text-white" />
            ) : (
              <CheckIcon className="h-3 w-3 text-white" />
            )}
          </motion.span>
        )}
      </AnimatePresence>
    </div>
  );
}

function ProgressBar({
  percent,
  reduce_motion,
  label,
}: {
  percent: number | null;
  reduce_motion: boolean;
  label: string;
}) {
  return (
    <div
      aria-label={label}
      aria-valuemax={100}
      aria-valuemin={0}
      aria-valuenow={percent ?? undefined}
      className="relative h-1.5 w-full overflow-hidden rounded-full bg-brand/15"
      role="progressbar"
    >
      {percent === null ? (
        <motion.div
          animate={reduce_motion ? undefined : { x: ["-110%", "320%"] }}
          className="absolute inset-y-0 left-0 w-1/3 rounded-full bg-brand"
          transition={{ duration: 1.25, ease: "easeInOut", repeat: Infinity }}
        />
      ) : (
        <div
          className="relative h-full overflow-hidden rounded-full bg-brand"
          data-testid="update-progress-fill"
          style={{
            width: `${percent}%`,
            transition: reduce_motion
              ? undefined
              : "width 420ms cubic-bezier(0.22, 1, 0.36, 1)",
          }}
        >
          {!reduce_motion && (
            <motion.div
              animate={{ x: ["-100%", "260%"] }}
              className="absolute inset-y-0 left-0 w-1/2 bg-gradient-to-r from-transparent via-white/45 to-transparent"
              transition={{
                duration: 1.6,
                ease: "easeInOut",
                repeat: Infinity,
                repeatDelay: 0.4,
              }}
            />
          )}
        </div>
      )}
    </div>
  );
}

export function UpdateCard({
  version,
  notes,
  install,
  variant = "floating",
  on_install,
  on_dismiss,
}: UpdateCardProps) {
  const { t } = use_i18n();
  const reduce_motion = use_should_reduce_motion();
  const [notes_open, set_notes_open] = useState(false);
  const notes_id = useId();
  const { phase, percent, downloaded, total, seconds_left } = install;
  const show_actions = phase === "idle" || phase === "failed";
  const can_dismiss = show_actions && Boolean(on_dismiss);
  const has_notes = Boolean(notes?.trim()) && phase === "idle";

  const title =
    phase === "preparing"
      ? t("settings.updates_card_preparing")
      : phase === "downloading"
        ? t("settings.updates_card_downloading", { version })
        : phase === "installing"
          ? t("settings.updates_card_installing")
          : phase === "failed"
            ? t("settings.updates_card_failed")
            : t("settings.updates_banner_title", { version });

  const time_left = format_time_left(seconds_left, t);
  const size_text =
    total !== null && total > 0
      ? t("settings.updates_card_size", {
          downloaded: format_bytes(downloaded),
          total: format_bytes(total),
        })
      : downloaded > 0
        ? format_bytes(downloaded)
        : null;

  const subtitle =
    phase === "downloading"
      ? [size_text, time_left].filter(Boolean).join(" · ") ||
        t("settings.updates_card_preparing_detail")
      : phase === "preparing"
        ? t("settings.updates_card_preparing_detail")
        : phase === "installing"
          ? t("settings.updates_card_installing_detail")
          : phase === "failed"
            ? t("settings.updates_card_failed_detail")
            : t("settings.updates_card_available_detail");

  const text_transition = { duration: reduce_motion ? 0 : 0.24, ease: EASE };
  const floating = variant === "floating";

  return (
    <motion.div
      aria-live="polite"
      className={`text-txt-primary ${
        floating
          ? "w-[min(380px,calc(100vw-32px))] rounded-[var(--aster-radius-floating,16px)] p-4"
          : "w-full"
      }`}
      data-phase={phase}
      layout={!reduce_motion}
      role={floating ? "status" : undefined}
      style={
        floating
          ? {
              backgroundColor:
                "var(--aster-floating-bg, var(--bg-primary, #111))",
              boxShadow: "var(--aster-floating-shadow)",
            }
          : undefined
      }
      transition={{ layout: { duration: 0.32, ease: EASE } }}
    >
      <motion.div className="flex items-center gap-3" layout="position">
        <ProgressRing
          percent={percent}
          phase={phase}
          reduce_motion={reduce_motion}
        />
        <div className="min-w-0 flex-1">
          {reduce_motion ? (
            <p className={TITLE_CLASS} data-testid="update-title">
              {title}
            </p>
          ) : (
            <AnimatePresence initial={false} mode="wait">
              <motion.p
                key={`title-${phase}`}
                animate={{ opacity: 1, y: 0 }}
                className={TITLE_CLASS}
                data-testid="update-title"
                exit={{ opacity: 0, y: -4 }}
                initial={{ opacity: 0, y: 4 }}
                transition={text_transition}
              >
                {title}
              </motion.p>
            </AnimatePresence>
          )}
          <div className="mt-0.5 flex items-baseline gap-2">
            <p
              className="min-w-0 flex-1 text-[12.5px] leading-[18px] text-txt-muted tabular-nums"
              data-testid="update-detail"
            >
              {subtitle}
            </p>
            {phase === "downloading" && percent !== null && (
              <span
                className="flex-shrink-0 text-[12.5px] font-semibold leading-[18px] text-txt-primary tabular-nums"
                data-testid="update-percent"
              >
                {percent}%
              </span>
            )}
          </div>
        </div>
        {can_dismiss && (
          <button
            aria-label={t("common.dismiss")}
            className="-me-1 flex h-7 w-7 flex-shrink-0 items-center justify-center self-start rounded-lg text-txt-muted transition-colors hover:bg-surf-hover hover:text-txt-primary"
            type="button"
            onClick={on_dismiss}
          >
            <XMarkIcon className="h-4 w-4" />
          </button>
        )}
      </motion.div>

      <AnimatePresence initial={false}>
        {(phase === "preparing" || phase === "downloading") && (
          <motion.div
            key="bar"
            animate={{ opacity: 1, height: "auto" }}
            className="overflow-hidden"
            exit={{ opacity: 0, height: 0 }}
            initial={{ opacity: 0, height: 0 }}
            transition={text_transition}
          >
            <div className="pt-3.5">
              <ProgressBar
                label={title}
                percent={phase === "downloading" ? percent : null}
                reduce_motion={reduce_motion}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence initial={false}>
        {has_notes && notes_open && (
          <motion.div
            key="notes"
            animate={{ opacity: 1, height: "auto" }}
            className="overflow-hidden"
            exit={{ opacity: 0, height: 0 }}
            id={notes_id}
            initial={{ opacity: 0, height: 0 }}
            transition={text_transition}
          >
            <div className="mt-3 max-h-40 overflow-y-auto whitespace-pre-wrap rounded-xl bg-surf-secondary px-3 py-2.5 text-[12.5px] leading-[18px] text-txt-secondary">
              {notes}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence initial={false}>
        {show_actions && (
          <motion.div
            key="actions"
            animate={{ opacity: 1, height: "auto" }}
            className="overflow-hidden"
            exit={{ opacity: 0, height: 0 }}
            initial={{ opacity: 0, height: 0 }}
            transition={text_transition}
          >
            <div className="flex items-center gap-2 pt-3.5">
              {has_notes && (
                <button
                  aria-controls={notes_id}
                  aria-expanded={notes_open}
                  className="rounded-md text-[12.5px] font-medium text-txt-secondary underline-offset-2 transition-colors hover:text-txt-primary hover:underline"
                  type="button"
                  onClick={() => set_notes_open((open) => !open)}
                >
                  {t("settings.updates_whats_new")}
                </button>
              )}
              <div className="ms-auto flex items-center gap-2">
                {can_dismiss && (
                  <Button size="sm" variant="ghost" onClick={on_dismiss}>
                    {t("settings.updates_dismiss")}
                  </Button>
                )}
                <Button size="sm" variant="depth" onClick={on_install}>
                  {phase === "failed"
                    ? t("settings.updates_try_again")
                    : t("settings.updates_install_and_restart")}
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
