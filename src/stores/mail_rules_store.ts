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
  type Rule,
  type CreateRuleRequest,
  type UpdateRuleRequest,
} from "@/services/api/mail_rules";

interface MailRulesState {
  rules: Rule[];
  loading: boolean;
  error: string | null;
}

type Listener = () => void;

let state: MailRulesState = {
  rules: [],
  loading: false,
  error: null,
};

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

export async function create_rule(
  req: CreateRuleRequest,
): Promise<Rule | null> {
  const response = await api_create_rule(req);

  if (response.data) {
    const next = [...state.rules, response.data].sort(
      (a, b) => a.sort_order - b.sort_order,
    );

    set_state({ rules: next });

    return response.data;
  }

  set_state({ error: response.error || "Failed to create rule" });

  return null;
}

export async function update_rule(
  id: string,
  patch: UpdateRuleRequest,
): Promise<Rule | null> {
  const previous = state.rules;
  const optimistic = state.rules.map((r) =>
    r.id === id ? ({ ...r, ...patch } as Rule) : r,
  );

  set_state({ rules: optimistic });

  const response = await api_update_rule(id, patch);

  if (response.data) {
    const next = state.rules.map((r) =>
      r.id === id ? response.data! : r,
    );

    set_state({ rules: next });

    return response.data;
  }

  set_state({ rules: previous, error: response.error || "Failed to update rule" });

  return null;
}

export async function delete_rule(id: string): Promise<boolean> {
  const previous = state.rules;

  set_state({ rules: state.rules.filter((r) => r.id !== id) });

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
): Promise<{ matched: number; applied: number } | null> {
  const response = await api_run_on_existing(id);

  if (response.data) {
    const next = state.rules.map((r) =>
      r.id === id
        ? { ...r, applied_count: r.applied_count + response.data!.applied }
        : r,
    );

    set_state({ rules: next });

    return response.data;
  }

  set_state({ error: response.error || "Failed to run rule" });

  return null;
}

export function clear_error(): void {
  set_state({ error: null });
}

export function use_mail_rules_store(): MailRulesState {
  return useSyncExternalStore(subscribe, get_state, get_state);
}
