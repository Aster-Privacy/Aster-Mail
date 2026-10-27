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
import { useCallback, useRef, useState } from "react";

import {
  download_and_install_update,
  update_progress_percent,
  type UpdateProgress,
} from "@/services/updates/updater";
import { ignore_error } from "@/lib/ignore_error";

export type UpdateInstallPhase =
  "idle" | "preparing" | "downloading" | "installing" | "failed";

export interface UpdateInstallState {
  phase: UpdateInstallPhase;
  percent: number | null;
  downloaded: number;
  total: number | null;
  seconds_left: number | null;
}

const ETA_WARMUP_MS = 1500;
const ETA_SMOOTHING = 0.25;

const IDLE_STATE: UpdateInstallState = {
  phase: "idle",
  percent: null,
  downloaded: 0,
  total: null,
  seconds_left: null,
};

export function estimate_seconds_left(
  downloaded: number,
  total: number | null,
  elapsed_ms: number,
): number | null {
  if (!total || total <= 0 || downloaded <= 0) return null;
  if (elapsed_ms < ETA_WARMUP_MS) return null;
  const rate = downloaded / (elapsed_ms / 1000);

  if (rate <= 0) return null;

  return Math.max(0, (total - downloaded) / rate);
}

export function use_update_installer(
  install: (
    on_progress: (p: UpdateProgress) => void,
  ) => Promise<void> = download_and_install_update,
) {
  const [state, set_state] = useState<UpdateInstallState>(IDLE_STATE);
  const running_ref = useRef(false);
  const started_at_ref = useRef<number | null>(null);
  const smoothed_ref = useRef<number | null>(null);

  const handle_progress = useCallback((p: UpdateProgress) => {
    if (p.phase === "installing") {
      set_state({
        phase: "installing",
        percent: 100,
        downloaded: p.downloaded,
        total: p.total,
        seconds_left: null,
      });

      return;
    }

    if (started_at_ref.current === null) {
      started_at_ref.current = Date.now();
    }

    const raw = estimate_seconds_left(
      p.downloaded,
      p.total,
      Date.now() - started_at_ref.current,
    );
    const previous = smoothed_ref.current;
    const smoothed =
      raw === null
        ? null
        : previous === null
          ? raw
          : previous + (raw - previous) * ETA_SMOOTHING;

    smoothed_ref.current = smoothed;

    set_state({
      phase: "downloading",
      percent: update_progress_percent(p),
      downloaded: p.downloaded,
      total: p.total,
      seconds_left: smoothed,
    });
  }, []);

  const start = useCallback(async () => {
    if (running_ref.current) return;
    running_ref.current = true;
    started_at_ref.current = null;
    smoothed_ref.current = null;
    set_state({ ...IDLE_STATE, phase: "preparing" });
    try {
      await install(handle_progress);
    } catch (caught) {
      ignore_error("components/updates/use_update_installer:start", caught);
      set_state({ ...IDLE_STATE, phase: "failed" });
    } finally {
      running_ref.current = false;
    }
  }, [install, handle_progress]);

  const reset = useCallback(() => {
    if (running_ref.current) return;
    set_state(IDLE_STATE);
  }, []);

  return { state, start, reset };
}
