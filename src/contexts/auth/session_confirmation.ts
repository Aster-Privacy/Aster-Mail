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
interface PendingConfirmation {
  user_id: string;
  verdict: Promise<boolean>;
}

let pending: PendingConfirmation | null = null;

export function begin_session_confirmation(
  user_id: string,
  verdict: Promise<boolean>,
): void {
  const entry: PendingConfirmation = {
    user_id,
    verdict: verdict.then(
      (confirmed) => confirmed === true,
      () => false,
    ),
  };

  pending = entry;
  entry.verdict.then((confirmed) => {
    if (confirmed && pending === entry) pending = null;
  });
}

export function end_session_confirmation(): void {
  pending = null;
}

export function is_session_confirmation_pending(): boolean {
  return pending !== null;
}

export async function session_confirmed_for(
  user_id: string | null | undefined,
): Promise<boolean> {
  let entry = pending;

  while (entry) {
    if (user_id && entry.user_id !== user_id) return false;

    const confirmed = await entry.verdict;

    if (pending === entry) return confirmed;
    if (pending === null) return confirmed;

    entry = pending;
  }

  return true;
}

export function run_when_session_confirmed(
  user_id: string | null | undefined,
  still_bound: () => boolean,
  job: () => void,
): void {
  session_confirmed_for(user_id)
    .then((confirmed) => {
      if (confirmed && still_bound()) job();
    })
    .catch(() => undefined);
}
