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
import { KeyIcon } from "@heroicons/react/24/outline";

import { GuardIconTile } from "@/components/guard/guard_visuals";
import { show_toast } from "@/components/toast/simple_toast";
import { Button } from "@/components/ui/button";
import { use_guard_code } from "@/hooks/use_guard_code";
import { GUARD_CODE_STEP_SECONDS } from "@/lib/crypto/guard_code";
import { use_i18n } from "@/lib/i18n/context";
import { is_tauri } from "@/native/desktop_device_auth";
import { copy_text } from "@/utils/copy_text";

export const GUARD_CLIPBOARD_CLEAR_MS = 30_000;

const RING_RADIUS = 18;
const RING_LENGTH = 2 * Math.PI * RING_RADIUS;

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
        className="rounded-2xl border border-edge-primary bg-surf-primary px-4 py-4 shadow-sm"
        data-testid="guard_code_card"
      >
        <div className="flex items-start gap-3">
          <GuardIconTile>
            <KeyIcon className="h-5 w-5" />
          </GuardIconTile>
          <div className="min-w-0">
            <p className="text-sm font-medium text-txt-primary">
              {t("guard.code_title")}
            </p>
            <p className="mt-0.5 text-sm text-txt-muted">
              {t("guard.code_unavailable")}
            </p>
          </div>
        </div>
      </div>
    );
  }

  const progress = seconds_left / GUARD_CODE_STEP_SECONDS;

  return (
    <div
      className="rounded-2xl border border-edge-primary bg-surf-primary px-4 py-4 shadow-sm"
      data-testid="guard_code_card"
    >
      <div className="flex items-start gap-3">
        <GuardIconTile tone="brand">
          <KeyIcon className="h-5 w-5" />
        </GuardIconTile>
        <div className="min-w-0">
          <p className="text-sm font-medium text-txt-primary">
            {t("guard.code_title")}
          </p>
          <p className="mt-0.5 text-sm text-txt-muted">
            {t("guard.code_description")}
          </p>
        </div>
      </div>
      <div className="mt-4 flex items-center gap-4 rounded-xl bg-surf-secondary px-4 py-3">
        <span
          aria-live="polite"
          className="font-mono text-3xl font-semibold tracking-[0.35em] text-txt-primary"
          data-testid="guard_code_value"
        >
          {code}
        </span>
        <span className="relative inline-flex h-11 w-11 items-center justify-center">
          <svg aria-hidden className="h-11 w-11 -rotate-90" viewBox="0 0 44 44">
            <circle
              className="stroke-edge-primary"
              cx="22"
              cy="22"
              fill="none"
              r={RING_RADIUS}
              strokeWidth="3"
            />
            <circle
              className="stroke-brand transition-[stroke-dashoffset] duration-1000 ease-linear"
              cx="22"
              cy="22"
              fill="none"
              r={RING_RADIUS}
              strokeDasharray={RING_LENGTH}
              strokeDashoffset={RING_LENGTH * (1 - progress)}
              strokeLinecap="round"
              strokeWidth="3"
            />
          </svg>
          <span className="absolute text-xs tabular-nums text-txt-muted">
            {seconds_left}
          </span>
          <span className="sr-only">
            {t("guard.code_seconds_left", { seconds: seconds_left })}
          </span>
        </span>
        <Button className="ml-auto" variant="outline" onClick={() => void copy()}>
          {t("guard.code_copy")}
        </Button>
      </div>
    </div>
  );
}
