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

export const ETA_MIN_ELAPSED_MS = 15000;
export const ETA_MIN_SAMPLES = 4;
export const ETA_SAMPLE_GAP_MS = 2000;
export const ETA_PUBLISH_INTERVAL_MS = 10000;
export const ETA_RATE_SMOOTHING = 0.25;

export interface EtaEstimator {
  sample(now: number, done: number, total: number): number | null;
  reset(): void;
}

export function round_eta_seconds(seconds: number): number {
  if (!Number.isFinite(seconds) || seconds <= 0) return 0;
  if (seconds < 60) return 59;

  const minutes = seconds / 60;

  if (minutes < 10) return Math.round(minutes) * 60;
  if (minutes < 60) return Math.round(minutes / 5) * 5 * 60;
  if (minutes < 180) return Math.round(minutes / 30) * 30 * 60;

  return Math.round(minutes / 60) * 3600;
}

export function create_eta_estimator(): EtaEstimator {
  let started_at = 0;
  let last_at = 0;
  let last_done = 0;
  let samples = 0;
  let rate = 0;
  let published: number | null = null;
  let published_at = Number.NEGATIVE_INFINITY;

  const reset = (): void => {
    started_at = 0;
    last_at = 0;
    last_done = 0;
    samples = 0;
    rate = 0;
    published = null;
    published_at = Number.NEGATIVE_INFINITY;
  };

  return {
    reset,
    sample(now, done, total) {
      if (total <= 0 || done >= total) {
        reset();

        return null;
      }

      if (samples === 0 || done < last_done) {
        reset();
        started_at = now;
        last_at = now;
        last_done = done;
        samples = 1;

        return null;
      }

      if (now - last_at >= ETA_SAMPLE_GAP_MS) {
        const instant = (done - last_done) / ((now - last_at) / 1000);

        rate =
          samples === 1
            ? instant
            : rate + ETA_RATE_SMOOTHING * (instant - rate);
        samples++;
        last_at = now;
        last_done = done;
      }

      const ready =
        samples >= ETA_MIN_SAMPLES &&
        now - started_at >= ETA_MIN_ELAPSED_MS &&
        rate > 0;

      if (!ready) return published;
      if (published !== null && now - published_at < ETA_PUBLISH_INTERVAL_MS) {
        return published;
      }

      published = round_eta_seconds((total - done) / rate);
      published_at = now;

      return published;
    },
  };
}

export type EtaPhrase =
  | { key: "search_index_eta_under_minute" }
  | {
      key: "search_index_eta_minutes" | "search_index_eta_hours";
      count: number;
    };

export function eta_phrase(seconds: number): EtaPhrase {
  if (seconds < 60) return { key: "search_index_eta_under_minute" };

  const minutes = Math.round(seconds / 60);

  if (minutes < 90) return { key: "search_index_eta_minutes", count: minutes };

  return {
    key: "search_index_eta_hours",
    count: Math.round((seconds / 3600) * 2) / 2,
  };
}
