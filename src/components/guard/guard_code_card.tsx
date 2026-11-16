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
import type { GuardDevice } from "@/services/guard/guard_device";

import { useEffect, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { DocumentDuplicateIcon } from "@heroicons/react/24/outline";

import { show_toast } from "@/components/toast/simple_toast";
import { Button } from "@/components/ui/button";
import { use_guard_code } from "@/hooks/use_guard_code";
import { GUARD_CODE_STEP_SECONDS } from "@/lib/crypto/guard_code";
import { use_i18n } from "@/lib/i18n/context";
import { cn } from "@/lib/utils";
import { is_tauri } from "@/native/desktop_device_auth";
import { use_should_reduce_motion } from "@/provider";
import { copy_text } from "@/utils/copy_text";

export const GUARD_CLIPBOARD_CLEAR_MS = 30_000;

const GUARD_CODE_WARN_SECONDS = 5;

export async function clear_copied_code(code: string): Promise<void> {
  try {
    const current = await navigator.clipboard.readText();

    if (current === code) await navigator.clipboard.writeText("");
  } catch {
    return;
  }
}

interface GuardCodeCardProps {
  device: GuardDevice | null;
}

function GuardCodeChars({ code }: { code: string }) {
  const reduce_motion = use_should_reduce_motion();

  return (
    <div
      aria-live="polite"
      className="flex items-center justify-center gap-1.5 sm:gap-2"
      data-testid="guard_code_value"
    >
      {code.split("").map((char, index) => (
        <span
          key={index}
          className="relative flex h-14 w-11 items-center justify-center overflow-hidden rounded-xl bg-surf-secondary font-mono text-[28px] font-semibold text-txt-primary sm:h-16 sm:w-12 sm:text-[32px]"
        >
          <AnimatePresence initial={false} mode="popLayout">
            <motion.span
              key={`${index}_${char}`}
              animate={{ y: 0, opacity: 1, filter: "blur(0px)" }}
              exit={
                reduce_motion
                  ? { opacity: 0 }
                  : { y: -18, opacity: 0, filter: "blur(4px)" }
              }
              initial={
                reduce_motion
                  ? { opacity: 0 }
                  : { y: 18, opacity: 0, filter: "blur(4px)" }
              }
              transition={{
                duration: reduce_motion ? 0.12 : 0.32,
                delay: reduce_motion ? 0 : index * 0.035,
                ease: [0.22, 1, 0.36, 1],
              }}
            >
              {char}
            </motion.span>
          </AnimatePresence>
        </span>
      ))}
    </div>
  );
}

export function GuardCodeCard({ device }: GuardCodeCardProps) {
  const { t } = use_i18n();
  const { code, seconds_left, ready } = use_guard_code(device);
  const clear_timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (clear_timer.current) clearTimeout(clear_timer.current);
    },
    [],
  );

  const copy = async () => {
    if (!code) return;
    const copied_code = code;

    if (!(await copy_text(copied_code))) return;
    show_toast(t("guard.code_copied"), "success");
    if (!is_tauri()) return;
    if (clear_timer.current) clearTimeout(clear_timer.current);
    clear_timer.current = setTimeout(() => {
      clear_timer.current = null;
      void clear_copied_code(copied_code);
    }, GUARD_CLIPBOARD_CLEAR_MS);
  };

  if (!ready) return null;

  if (!code) {
    return (
      <div
        className="flex flex-col items-center text-center"
        data-testid="guard_code_card"
      >
        <p className="text-sm font-medium text-txt-primary">
          {t("guard.code_title")}
        </p>
        <p className="mt-1 max-w-sm text-sm text-txt-muted">
          {t("guard.code_unavailable")}
        </p>
      </div>
    );
  }

  const progress = seconds_left / GUARD_CODE_STEP_SECONDS;
  const warn = seconds_left <= GUARD_CODE_WARN_SECONDS;

  return (
    <div
      className="flex flex-col items-center text-center"
      data-testid="guard_code_card"
    >
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-txt-muted">
        {t("guard.code_title")}
      </p>
      <div className="mt-3">
        <GuardCodeChars code={code} />
        <div
          aria-hidden
          className="mt-3 h-1 w-full overflow-hidden rounded-full bg-edge-primary"
        >
          <div
            className={cn(
              "h-full rounded-full transition-[width,background-color] duration-1000 ease-linear",
              warn ? "bg-amber-500" : "bg-brand",
            )}
            data-testid="guard_code_progress"
            style={{ width: `${Math.max(0, Math.min(1, progress)) * 100}%` }}
          />
        </div>
      </div>
      <p
        className={cn(
          "mt-2 text-xs tabular-nums transition-colors",
          warn ? "text-amber-600 dark:text-amber-400" : "text-txt-muted",
        )}
      >
        {t("guard.code_seconds_left", { seconds: seconds_left })}
      </p>
      <Button
        className="mt-4 gap-1.5"
        size="sm"
        variant="outline"
        onClick={() => void copy()}
      >
        <DocumentDuplicateIcon aria-hidden className="h-4 w-4" />
        {t("guard.code_copy")}
      </Button>
      <p className="mt-4 max-w-sm text-sm text-txt-muted">
        {t("guard.code_description")}
      </p>
    </div>
  );
}
