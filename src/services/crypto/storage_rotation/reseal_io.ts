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
import type { ApiResponse } from "@/services/api/client";
import type { ResealKeys } from "./reseal_keys";

import { ignore_error } from "@/lib/ignore_error";

export const MAX_REQUEST_ATTEMPTS = 5;
export const BASE_BACKOFF_MS = 1000;
export const MAX_BACKOFF_MS = 30_000;
export const BATCH_PAUSE_MS = 150;

export interface ResealApi {
  get<T>(path: string): Promise<ApiResponse<T>>;
  post<T>(path: string, body: unknown): Promise<ApiResponse<T>>;
  put<T>(path: string, body: unknown): Promise<ApiResponse<T>>;
}

export interface HashMove {
  from_hash: string;
  to_hash: string;
  cursor?: string | null;
}

export interface StepProgress {
  done?: boolean;
  cursor?: string | number | null;
}

export interface ResealProgress {
  key_id: string;
  steps: Record<string, StepProgress>;
  hash_moves: HashMove[];
}

export interface ProgressStore {
  load(): ResealProgress | null;
  save(progress: ResealProgress): void;
  clear(): void;
}

export interface StepCounts {
  resealed: number;
  current: number;
  unreadable: number;
  conflicts: number;
  rejected: number;
  deleted: number;
}

export interface ResealStepContext {
  keys: ResealKeys;
  api: ResealApi;
  progress: ResealProgress;
  persist(): void;
  sleep(ms: number): Promise<void>;
  is_cancelled(): boolean;
  still_current?: () => Promise<boolean>;
  counts: StepCounts;
}

export type StepResult = "done" | "interrupted";

export interface ResealStep {
  name: string;
  run(ctx: ResealStepContext): Promise<StepResult>;
}

export class ResealInterrupted extends Error {
  constructor(reason: string) {
    super(`storage reseal interrupted: ${reason}`);
    this.name = "ResealInterrupted";
  }
}

export function empty_counts(): StepCounts {
  return {
    resealed: 0,
    current: 0,
    unreadable: 0,
    conflicts: 0,
    rejected: 0,
    deleted: 0,
  };
}

export function default_sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function is_transient(response: ApiResponse<unknown>): boolean {
  if (!response.error) return false;
  if (response.status === undefined) return true;

  return response.status === 429 || response.status >= 500;
}

function backoff_delay(response: ApiResponse<unknown>, attempt: number): number {
  if (response.retry_after_secs && response.retry_after_secs > 0) {
    return Math.min(response.retry_after_secs * 1000, MAX_BACKOFF_MS * 4);
  }

  return Math.min(BASE_BACKOFF_MS * 2 ** attempt, MAX_BACKOFF_MS);
}

export async function request_with_backoff<T>(
  ctx: Pick<ResealStepContext, "sleep" | "is_cancelled">,
  send: () => Promise<ApiResponse<T>>,
): Promise<ApiResponse<T>> {
  let response = await send();

  for (let attempt = 1; attempt < MAX_REQUEST_ATTEMPTS; attempt++) {
    if (!is_transient(response)) return response;
    if (ctx.is_cancelled()) return response;
    await ctx.sleep(backoff_delay(response, attempt - 1));
    response = await send();
  }

  return response;
}

export function require_ok<T>(response: ApiResponse<T>, what: string): T {
  if (response.error || response.data === undefined) {
    throw new ResealInterrupted(`${what}:${response.status ?? "network"}`);
  }

  return response.data;
}

export function is_conflict_response(response: ApiResponse<unknown>): boolean {
  return response.status === 409 || response.code === "CONFLICT";
}

export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];

  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }

  return out;
}

export function step_progress(
  ctx: ResealStepContext,
  name: string,
): StepProgress {
  let entry = ctx.progress.steps[name];

  if (!entry) {
    entry = {};
    ctx.progress.steps[name] = entry;
  }

  return entry;
}

export function local_progress_store(user_id: string): ProgressStore {
  const storage_key = `astermail_storage_reseal_${user_id}`;

  return {
    load(): ResealProgress | null {
      try {
        const raw = localStorage.getItem(storage_key);

        if (!raw) return null;

        const parsed = JSON.parse(raw) as Partial<ResealProgress>;

        if (typeof parsed.key_id !== "string") return null;

        return {
          key_id: parsed.key_id,
          steps:
            parsed.steps && typeof parsed.steps === "object"
              ? parsed.steps
              : {},
          hash_moves: Array.isArray(parsed.hash_moves)
            ? parsed.hash_moves
            : [],
        };
      } catch (caught) {
        ignore_error("services/crypto/storage_rotation:progress_load", caught);

        return null;
      }
    },
    save(progress: ResealProgress): void {
      try {
        localStorage.setItem(storage_key, JSON.stringify(progress));
      } catch (caught) {
        ignore_error("services/crypto/storage_rotation:progress_save", caught);
      }
    },
    clear(): void {
      try {
        localStorage.removeItem(storage_key);
      } catch (caught) {
        ignore_error("services/crypto/storage_rotation:progress_clear", caught);
      }
    },
  };
}

export function memory_progress_store(
  initial: ResealProgress | null = null,
): ProgressStore & { snapshot(): ResealProgress | null } {
  let stored: string | null = initial ? JSON.stringify(initial) : null;

  return {
    load: () => (stored ? (JSON.parse(stored) as ResealProgress) : null),
    save: (progress) => {
      stored = JSON.stringify(progress);
    },
    clear: () => {
      stored = null;
    },
    snapshot: () => (stored ? (JSON.parse(stored) as ResealProgress) : null),
  };
}
