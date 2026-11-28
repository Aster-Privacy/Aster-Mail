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
import type { EncryptedVault } from "@/services/crypto/key_manager_core";
import type { BatchResult, FormatMigrator, MigratorContext } from "./migrator";

import { list_migrators } from "./migrator";
import { record_has_format } from "./record";
import {
  FORMAT_MIGRATION_SESSION_BUDGET,
  format_migration_enabled,
  remaining_report_enabled,
  type FormatClassId,
} from "./switches";

export type ClassOutcome =
  "retired" | "marked" | "budget" | "locked" | "incomplete" | "deferred";

export type RemainingCounts = Partial<Record<FormatClassId, number>>;

export interface RunSummary {
  outcomes: Partial<Record<FormatClassId, ClassOutcome>>;
  remaining: RemainingCounts;
  spent: number;
}

export interface CursorStore {
  load: (user_id: string, id: FormatClassId) => string | null;
  save: (user_id: string, id: FormatClassId, cursor: string | null) => void;
}

export interface RunnerDeps {
  get_vault: () => EncryptedVault | null;
  is_active: (user_id: string) => boolean;
  write_marker: (
    user_id: string,
    id: FormatClassId,
    version: number,
  ) => Promise<boolean>;
  report?: (user_id: string, remaining: RemainingCounts) => Promise<void>;
  sleep: (ms: number) => Promise<void>;
  cursor_store?: CursorStore;
}

export interface RunOptions {
  budget?: number;
  batch_size?: number;
  migrators?: FormatMigrator[];
}

export const RETRY_DELAYS_MS = [2_000, 8_000, 30_000];
export const DEFAULT_BATCH_SIZE = 50;

const session_state = new Map<
  string,
  Map<FormatClassId, Record<string, unknown>>
>();

function class_state(
  user_id: string,
  id: FormatClassId,
): Record<string, unknown> {
  let by_class = session_state.get(user_id);

  if (!by_class) {
    by_class = new Map();
    session_state.set(user_id, by_class);
  }

  let state = by_class.get(id);

  if (!state) {
    state = {};
    by_class.set(id, state);
  }

  return state;
}

export function reset_runner_state(): void {
  session_state.clear();
}

class LockedError extends Error {}

async function with_retries<T>(
  deps: RunnerDeps,
  ctx: MigratorContext,
  work: () => Promise<T>,
): Promise<T | "deferred"> {
  for (let attempt = 0; ; attempt++) {
    if (!ctx.is_active()) throw new LockedError();

    try {
      return await work();
    } catch (caught) {
      if (caught instanceof LockedError) throw caught;
      if (attempt >= RETRY_DELAYS_MS.length) return "deferred";
      await deps.sleep(RETRY_DELAYS_MS[attempt]);
    }
  }
}

async function run_class(
  migrator: FormatMigrator,
  user_id: string,
  deps: RunnerDeps,
  budget: { left: number },
  batch_size: number,
  remaining: RemainingCounts,
): Promise<ClassOutcome> {
  const vault = deps.get_vault();

  if (!vault || !deps.is_active(user_id)) return "locked";
  if (record_has_format(vault, migrator.id)) {
    remaining[migrator.id] = 0;

    return "retired";
  }

  const ctx: MigratorContext = {
    user_id,
    vault,
    state: class_state(user_id, migrator.id),
    is_active: () => deps.is_active(user_id),
  };
  const store = deps.cursor_store;
  const save_cursor = () => {
    const cursor = ctx.state.cursor;

    store?.save(
      user_id,
      migrator.id,
      typeof cursor === "string" ? cursor : null,
    );
  };

  if (ctx.state.cursor === undefined) {
    const saved = store?.load(user_id, migrator.id);

    if (saved) ctx.state.cursor = saved;
  }

  try {
    const present = await with_retries(deps, ctx, () => migrator.detect(ctx));

    if (present === "deferred") return "deferred";

    let failed = 0;

    while (present) {
      if (budget.left <= 0) return "budget";

      const limit = Math.min(batch_size, budget.left);
      const batch: BatchResult | "deferred" = await with_retries(
        deps,
        ctx,
        () => migrator.rewrap_batch(ctx, limit),
      );

      if (batch === "deferred") return "deferred";

      budget.left -= Math.max(1, batch.examined);
      failed += batch.failed;
      if (batch.done) {
        delete ctx.state.cursor;
        save_cursor();
        break;
      }
      save_cursor();
    }

    const counted = await with_retries(deps, ctx, () => migrator.count(ctx));

    if (counted === "deferred") return "deferred";
    if (counted !== null) remaining[migrator.id] = counted;
    if (failed > 0 || counted !== 0) return "incomplete";

    const verified = await with_retries(deps, ctx, () => migrator.verify(ctx));

    if (verified !== true)
      return verified === "deferred" ? "deferred" : "incomplete";
    if (!ctx.is_active()) return "locked";

    const written = await deps
      .write_marker(user_id, migrator.id, migrator.version)
      .catch(() => false);

    if (!written) return "deferred";
    delete ctx.state.cursor;
    save_cursor();

    return "marked";
  } catch (caught) {
    if (caught instanceof LockedError) return "locked";

    return "deferred";
  }
}

export async function run_format_migrations(
  user_id: string,
  deps: RunnerDeps,
  options: RunOptions = {},
): Promise<RunSummary> {
  const summary: RunSummary = { outcomes: {}, remaining: {}, spent: 0 };

  if (!format_migration_enabled()) return summary;

  const start = options.budget ?? FORMAT_MIGRATION_SESSION_BUDGET;
  const budget = { left: start };
  const batch_size = options.batch_size ?? DEFAULT_BATCH_SIZE;

  for (const migrator of options.migrators ?? list_migrators()) {
    const outcome = await run_class(
      migrator,
      user_id,
      deps,
      budget,
      batch_size,
      summary.remaining,
    );

    summary.outcomes[migrator.id] = outcome;
    if (outcome === "locked") break;
  }

  summary.spent = start - budget.left;

  if (
    deps.report &&
    remaining_report_enabled() &&
    deps.is_active(user_id) &&
    Object.keys(summary.remaining).length > 0
  ) {
    await deps.report(user_id, summary.remaining).catch(() => undefined);
  }

  return summary;
}
