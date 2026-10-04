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
const PENDING_MAX_AGE_MS = 30_000;
const SETTLED_MAX_AGE_MS = 10_000;
const MAX_TRACKED_IDS = 2000;

interface OwnMailMutation {
  actions: readonly string[];
  ids: Set<string>;
  noted_at: number;
  settled_at: number | null;
}

export type OwnMailMutationTicket = OwnMailMutation;

export interface OwnMailMutationEcho {
  settled_at: number | null;
}

let mutations: OwnMailMutation[] = [];
let tracked_ids = 0;

function now_ms(): number {
  return Date.now();
}

function is_expired(mutation: OwnMailMutation, at: number): boolean {
  return mutation.settled_at === null
    ? at - mutation.noted_at >= PENDING_MAX_AGE_MS
    : at - mutation.settled_at >= SETTLED_MAX_AGE_MS;
}

function drop(mutation: OwnMailMutation): void {
  const index = mutations.indexOf(mutation);

  if (index === -1) return;
  mutations.splice(index, 1);
  tracked_ids -= mutation.ids.size;
}

function prune(at: number): void {
  for (const mutation of [...mutations]) {
    if (mutation.ids.size === 0 || is_expired(mutation, at)) drop(mutation);
  }

  while (tracked_ids > MAX_TRACKED_IDS && mutations.length > 0) {
    drop(mutations[0]);
  }
}

export function note_own_mail_mutation(
  ids: readonly string[],
  actions: readonly string[],
): OwnMailMutationTicket | null {
  const unique = new Set(ids.filter((id) => !!id));

  if (unique.size === 0 || actions.length === 0) return null;

  const at = now_ms();
  const mutation: OwnMailMutation = {
    actions: [...actions],
    ids: unique,
    noted_at: at,
    settled_at: null,
  };

  mutations.push(mutation);
  tracked_ids += unique.size;
  prune(at);

  return mutation;
}

export function settle_own_mail_mutation(
  ticket: OwnMailMutationTicket | null,
  succeeded: boolean,
  failed_ids: readonly string[] = [],
): void {
  if (!ticket || !mutations.includes(ticket)) return;

  if (!succeeded) {
    drop(ticket);

    return;
  }

  for (const id of failed_ids) {
    if (ticket.ids.delete(id)) tracked_ids -= 1;
  }

  ticket.settled_at = now_ms();
  if (ticket.ids.size === 0) drop(ticket);
}

function find_owner(
  id: string,
  action: string,
  at: number,
): OwnMailMutation | undefined {
  let fallback: OwnMailMutation | undefined;

  for (const mutation of mutations) {
    if (is_expired(mutation, at) || !mutation.ids.has(id)) continue;
    if (mutation.actions[0] === action) return mutation;
    if (!fallback && mutation.actions.includes(action)) fallback = mutation;
  }

  return fallback;
}

export function claim_own_mail_mutation_echo(
  action: string | undefined,
  ids: readonly string[] | undefined,
): OwnMailMutationEcho | null {
  if (!action || !ids || ids.length === 0) return null;

  const at = now_ms();
  const owners = new Map<string, OwnMailMutation>();

  for (const id of new Set(ids)) {
    const owner = find_owner(id, action, at);

    if (!owner) return null;
    owners.set(id, owner);
  }

  let settled_at: number | null = 0;

  for (const [id, owner] of owners) {
    if (owner.ids.delete(id)) tracked_ids -= 1;
    if (owner.settled_at === null || settled_at === null) settled_at = null;
    else settled_at = Math.max(settled_at, owner.settled_at);
  }

  prune(at);

  return { settled_at };
}

export function clear_own_mail_mutations(): void {
  mutations = [];
  tracked_ids = 0;
}
