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
import { useSyncExternalStore } from "react";

import {
  get_external_account_state,
  is_problem_state,
  type ExternalAccountHealthInput,
  type ExternalAccountHealthRecord,
} from "@/lib/external_account_health";
import { ignore_error } from "@/lib/ignore_error";

const PROBLEM_SINCE_KEY = "aster_external_account_problem_since";
const MAX_TRACKED_ACCOUNTS = 100;

interface PublishableAccount extends ExternalAccountHealthInput {
  id: string;
  email: string;
  protocol: string;
}

let records: ExternalAccountHealthRecord[] = [];
let records_key = "";
let has_published = false;
let generation = 0;
const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) listener();
}

function read_problem_since(): Record<string, number> {
  try {
    const raw = localStorage.getItem(PROBLEM_SINCE_KEY);

    if (!raw) return {};

    const parsed: unknown = JSON.parse(raw);

    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }

    const result: Record<string, number> = {};

    for (const [id, value] of Object.entries(parsed)) {
      if (typeof value === "number" && Number.isFinite(value) && value > 0) {
        result[id] = value;
      }
    }

    return result;
  } catch {
    return {};
  }
}

function write_problem_since(map: Record<string, number>): void {
  try {
    if (Object.keys(map).length === 0) {
      localStorage.removeItem(PROBLEM_SINCE_KEY);
    } else {
      localStorage.setItem(PROBLEM_SINCE_KEY, JSON.stringify(map));
    }
  } catch (caught) {
    ignore_error(
      "stores/external_account_health_store:write_problem_since",
      caught,
    );
  }
}

export function get_external_account_health_generation(): number {
  return generation;
}

function trim_problem_since(
  map: Record<string, number>,
): Record<string, number> {
  const entries = Object.entries(map);

  if (entries.length <= MAX_TRACKED_ACCOUNTS) return map;

  return Object.fromEntries(
    entries.sort((a, b) => b[1] - a[1]).slice(0, MAX_TRACKED_ACCOUNTS),
  );
}

export function publish_external_account_health(
  accounts: PublishableAccount[],
  now: number = Date.now(),
  expected_generation: number = generation,
): void {
  if (expected_generation !== generation) return;

  const previous = read_problem_since();
  const next: Record<string, number> = { ...previous };
  const next_records: ExternalAccountHealthRecord[] = [];

  for (const account of accounts.slice(0, MAX_TRACKED_ACCOUNTS)) {
    const state = get_external_account_state(account);
    let problem_since: number | null = null;

    if (is_problem_state(state)) {
      problem_since = previous[account.id] ?? now;
    } else if (state === "syncing" && previous[account.id] !== undefined) {
      problem_since = previous[account.id];
    }

    if (problem_since !== null) {
      next[account.id] = problem_since;
    } else {
      delete next[account.id];
    }

    next_records.push({
      id: account.id,
      email: account.email,
      protocol: account.protocol,
      is_enabled: account.is_enabled,
      needs_reauth: account.needs_reauth,
      last_sync_at: account.last_sync_at,
      last_sync_status: account.last_sync_status,
      created_at: account.created_at,
      problem_since,
    });
  }

  const trimmed = trim_problem_since(next);

  if (JSON.stringify(trimmed) !== JSON.stringify(previous)) {
    write_problem_since(trimmed);
  }

  const next_key = JSON.stringify(next_records);
  const first_publish = !has_published;

  has_published = true;

  if (next_key === records_key && !first_publish) return;

  records = next_records;
  records_key = next_key;
  notify();
}

export function has_published_external_account_health(): boolean {
  return has_published;
}

export function clear_external_account_health(): void {
  generation += 1;
  records = [];
  records_key = "";
  has_published = false;
  notify();
}

export function forget_external_account_problems(): void {
  clear_external_account_health();

  try {
    localStorage.removeItem(PROBLEM_SINCE_KEY);
  } catch (caught) {
    ignore_error(
      "stores/external_account_health_store:forget_external_account_problems",
      caught,
    );
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}

export function get_external_account_health(): ExternalAccountHealthRecord[] {
  return records;
}

export function use_external_account_health(): ExternalAccountHealthRecord[] {
  return useSyncExternalStore(
    subscribe,
    get_external_account_health,
    get_external_account_health,
  );
}
