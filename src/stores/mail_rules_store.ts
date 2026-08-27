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
  list_rules,
  create_rule as api_create_rule,
  update_rule as api_update_rule,
  delete_rule as api_delete_rule,
  reorder_rules as api_reorder_rules,
  run_on_existing as api_run_on_existing,
  get_rule_run as api_get_rule_run,
  cancel_rule_run as api_cancel_rule_run,
  list_rule_runs as api_list_rule_runs,
  type Rule,
  type RuleRun,
  type CreateRuleRequest,
  type UpdateRuleRequest,
} from "@/services/api/mail_rules";

interface MailRulesState {
  rules: Rule[];
  loading: boolean;
  error: string | null;
  runs: Record<string, RuleRun>;
}

const RUN_POLL_MIN_MS = 2000;
const RUN_POLL_MAX_MS = 10000;
const RUN_POLL_BACKOFF_FACTOR = 1.5;
const RUN_POLL_MAX_FAILURES = 5;

type Listener = () => void;

let state: MailRulesState = {
  rules: [],
  loading: false,
  error: null,
  runs: {},
};

const run_timers = new Map<string, ReturnType<typeof setTimeout>>();
const run_poll_delays = new Map<string, number>();
const run_poll_failures = new Map<string, number>();

function is_run_active(run: RuleRun | null | undefined): boolean {
  return run?.status === "pending" || run?.status === "running";
}

function store_run(rule_id: string, run: RuleRun | null): void {
  if (!run) {
    if (state.runs[rule_id] === undefined) {
      return;
    }

    const next = { ...state.runs };

    delete next[rule_id];
    set_state({ runs: next });

    return;
  }

  set_state({ runs: { ...state.runs, [rule_id]: run } });
}

function stop_run_poll(rule_id: string): void {
  const timer = run_timers.get(rule_id);

  if (timer !== undefined) {
    clearTimeout(timer);
    run_timers.delete(rule_id);
  }

  run_poll_delays.delete(rule_id);
  run_poll_failures.delete(rule_id);
}

function next_poll_delay(rule_id: string): number {
  const current = run_poll_delays.get(rule_id) ?? RUN_POLL_MIN_MS;
  const next = Math.min(
    Math.round(current * RUN_POLL_BACKOFF_FACTOR),
    RUN_POLL_MAX_MS,
  );

  run_poll_delays.set(rule_id, next);

  return current;
}

function schedule_run_poll(rule_id: string): void {
  const timer = run_timers.get(rule_id);

  if (timer !== undefined) {
    clearTimeout(timer);
  }

  run_timers.set(
    rule_id,
    setTimeout(() => {
      run_timers.delete(rule_id);
      void refresh_run(rule_id);
    }, next_poll_delay(rule_id)),
  );
}

const listeners = new Set<Listener>();

function set_state(next: Partial<MailRulesState>): void {
  state = { ...state, ...next };
  listeners.forEach((l) => l());
}

function subscribe(listener: Listener): () => void {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}

function get_state(): MailRulesState {
  return state;
}

export async function load_rules(): Promise<void> {
  set_state({ loading: true, error: null });
  const response = await list_rules();

  if (response.data) {
    const sorted = [...response.data.rules].sort(
      (a, b) => a.sort_order - b.sort_order,
    );

    set_state({ rules: sorted, loading: false });
  } else {
    set_state({
      loading: false,
      error: response.error || "Failed to load rules",
    });
  }
}

let last_save_error: string | null = null;

export function get_last_save_error(): string | null {
  return last_save_error;
}

export async function create_rule(
  req: CreateRuleRequest,
): Promise<Rule | null> {
  last_save_error = null;

  const response = await api_create_rule(req);

  if (response.data) {
    const max_sort_order = state.rules.reduce(
      (highest, rule) => Math.max(highest, rule.sort_order),
      -1,
    );
    const created = { ...response.data, sort_order: max_sort_order + 1 };
    const next = [...state.rules, created].sort(
      (a, b) => a.sort_order - b.sort_order,
    );

    set_state({ rules: next });

    return created;
  }

  last_save_error = response.error ?? null;
  set_state({ error: response.error || "Failed to create rule" });

  return null;
}

export async function update_rule(
  id: string,
  patch: UpdateRuleRequest,
): Promise<Rule | null> {
  last_save_error = null;

  const previous = state.rules;
  const optimistic = state.rules.map((r) =>
    r.id === id ? ({ ...r, ...patch } as Rule) : r,
  );

  set_state({ rules: optimistic });

  const response = await api_update_rule(id, patch);

  if (response.data) {
    const next = state.rules.map((r) => (r.id === id ? response.data! : r));

    set_state({ rules: next });

    return response.data;
  }

  last_save_error = response.error ?? null;
  set_state({
    rules: previous,
    error: response.error || "Failed to update rule",
  });

  return null;
}

export async function delete_rule(id: string): Promise<boolean> {
  const previous = state.rules;

  set_state({ rules: state.rules.filter((r) => r.id !== id) });
  stop_run_poll(id);

  const response = await api_delete_rule(id);

  if (response.error) {
    set_state({ rules: previous, error: response.error });

    return false;
  }

  return true;
}

export async function reorder(ordered_ids: string[]): Promise<boolean> {
  const previous = state.rules;
  const rule_map = new Map(state.rules.map((r) => [r.id, r]));
  const next = ordered_ids
    .map((id, index) => {
      const rule = rule_map.get(id);

      return rule ? { ...rule, sort_order: index } : null;
    })
    .filter((r): r is Rule => r !== null);

  set_state({ rules: next });

  const response = await api_reorder_rules(ordered_ids);

  if (response.error) {
    set_state({ rules: previous, error: response.error });

    return false;
  }

  return true;
}

export async function run_on_existing(
  id: string,
  include_trashed = false,
): Promise<boolean> {
  const response = await api_run_on_existing(id, include_trashed);

  if (response.error) {
    set_state({ error: response.error });

    return false;
  }

  if (!response.data) {
    return false;
  }

  store_run(id, response.data);

  if (is_run_active(response.data)) {
    stop_run_poll(id);
    schedule_run_poll(id);
  }

  return true;
}

export async function refresh_run(id: string): Promise<void> {
  const response = await api_get_rule_run(id);

  if (response.error) {
    const failures = (run_poll_failures.get(id) ?? 0) + 1;

    run_poll_failures.set(id, failures);

    if (failures <= RUN_POLL_MAX_FAILURES && is_run_active(state.runs[id])) {
      schedule_run_poll(id);
    }

    return;
  }

  run_poll_failures.set(id, 0);

  const run = response.data ?? null;

  store_run(id, run);

  if (is_run_active(run)) {
    schedule_run_poll(id);
  } else {
    stop_run_poll(id);
  }
}

export async function cancel_run(id: string): Promise<boolean> {
  const response = await api_cancel_rule_run(id);

  if (response.error) {
    set_state({ error: response.error });

    return false;
  }

  await refresh_run(id);

  return true;
}

export async function load_runs(): Promise<void> {
  const response = await api_list_rule_runs();

  if (!response.data) {
    return;
  }

  const next: Record<string, RuleRun> = { ...state.runs };

  for (const run of response.data) {
    next[run.rule_id] = run;
  }

  set_state({ runs: next });

  for (const run of response.data) {
    if (is_run_active(run)) {
      schedule_run_poll(run.rule_id);
    }
  }
}

export function stop_all_run_polls(): void {
  for (const rule_id of Array.from(run_timers.keys())) {
    stop_run_poll(rule_id);
  }
}

export function clear_error(): void {
  set_state({ error: null });
}

export function use_mail_rules_store(): MailRulesState {
  return useSyncExternalStore(subscribe, get_state, get_state);
}
