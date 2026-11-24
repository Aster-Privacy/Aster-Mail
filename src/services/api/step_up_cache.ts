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
type Listener = (value: boolean | null) => void;

let known_totp_required: boolean | null = null;
const listeners = new Set<Listener>();

function emit(): void {
  for (const listener of listeners) listener(known_totp_required);
}

export function peek_totp_required(): boolean | null {
  return known_totp_required;
}

export function remember_totp_required(value: boolean): void {
  if (known_totp_required === value) return;
  known_totp_required = value;
  emit();
}

export function forget_totp_required(): void {
  if (known_totp_required === null) return;
  known_totp_required = null;
  emit();
}

export function subscribe_totp_required(listener: Listener): () => void {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}
