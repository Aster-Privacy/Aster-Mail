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
import type { CalendarAttendeeResponse } from "@/types/calendar";

import {
  safe_local_get,
  safe_local_keys,
  safe_local_remove,
  safe_local_set,
} from "@/lib/safe_storage";

export const INVITE_ANSWER_PREFIX = "aster_invite_answer:";
export const MAX_INVITE_ANSWERS = 200;

const RESPONSES: ReadonlySet<string> = new Set([
  "accepted",
  "tentative",
  "declined",
  "needs_action",
]);

export interface InviteAnswer {
  response: CalendarAttendeeResponse;
  sequence: number;
  at: number;
}

export interface InviteAnswerTarget {
  account_id: string;
  uid: string | null;
  recurrence_id: string | null;
}

async function answer_key(target: InviteAnswerTarget): Promise<string> {
  const material = new TextEncoder().encode(
    [target.account_id, target.uid, target.recurrence_id ?? ""].join("\u0000"),
  );
  const digest = await crypto.subtle.digest("SHA-256", material);
  const hex = Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");

  return `${INVITE_ANSWER_PREFIX}${hex}`;
}

function parse_answer(raw: string | null): InviteAnswer | null {
  if (!raw) {
    return null;
  }

  try {
    const value = JSON.parse(raw) as Partial<InviteAnswer>;

    if (
      typeof value.response !== "string" ||
      !RESPONSES.has(value.response) ||
      typeof value.sequence !== "number" ||
      !Number.isFinite(value.sequence) ||
      typeof value.at !== "number"
    ) {
      return null;
    }

    return {
      response: value.response as CalendarAttendeeResponse,
      sequence: value.sequence,
      at: value.at,
    };
  } catch {
    return null;
  }
}

function prune_answers(keep: string): void {
  const entries = safe_local_keys()
    .filter((key) => key.startsWith(INVITE_ANSWER_PREFIX) && key !== keep)
    .map((key) => ({ key, at: parse_answer(safe_local_get(key))?.at ?? 0 }))
    .sort((a, b) => a.at - b.at);
  const overflow = entries.length - (MAX_INVITE_ANSWERS - 1);

  for (const entry of entries.slice(0, Math.max(0, overflow))) {
    safe_local_remove(entry.key);
  }
}

export async function read_invite_answer(
  target: InviteAnswerTarget,
): Promise<InviteAnswer | null> {
  if (!target.account_id || !target.uid) {
    return null;
  }

  return parse_answer(safe_local_get(await answer_key(target)));
}

export async function write_invite_answer(
  target: InviteAnswerTarget,
  response: CalendarAttendeeResponse,
  sequence: number,
): Promise<void> {
  if (!target.account_id || !target.uid) {
    return;
  }

  const key = await answer_key(target);

  prune_answers(key);
  safe_local_set(key, JSON.stringify({ response, sequence, at: Date.now() }));
}

export async function forget_invite_answer(
  target: InviteAnswerTarget,
): Promise<void> {
  if (!target.account_id || !target.uid) {
    return;
  }

  safe_local_remove(await answer_key(target));
}

export function answer_is_current(
  answer: InviteAnswer | null,
  response: CalendarAttendeeResponse,
  sequence: number,
): boolean {
  return (
    answer !== null &&
    answer.response === response &&
    answer.sequence >= sequence
  );
}

export function clear_invite_answers(): void {
  for (const key of safe_local_keys()) {
    if (key.startsWith(INVITE_ANSWER_PREFIX)) {
      safe_local_remove(key);
    }
  }
}
