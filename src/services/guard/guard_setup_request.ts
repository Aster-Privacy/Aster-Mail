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
export const GUARD_SETUP_OPEN_EVENT = "aster:guard-setup-open";

let setup_requested = false;

export function request_guard_setup(): void {
  setup_requested = true;
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(GUARD_SETUP_OPEN_EVENT));
}

export function take_guard_setup_request(): boolean {
  const requested = setup_requested;

  setup_requested = false;

  return requested;
}
