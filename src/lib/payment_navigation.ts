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
const RELEASE_DELAY_MS = 20_000;

let leaving_for_payment = false;
let release_timer: ReturnType<typeof setTimeout> | null = null;

export function mark_payment_navigation(): void {
  leaving_for_payment = true;

  if (release_timer) clearTimeout(release_timer);

  release_timer = setTimeout(() => {
    leaving_for_payment = false;
    release_timer = null;
  }, RELEASE_DELAY_MS);
}

export function clear_payment_navigation(): void {
  leaving_for_payment = false;

  if (release_timer) {
    clearTimeout(release_timer);
    release_timer = null;
  }
}

export function is_payment_navigation(): boolean {
  return leaving_for_payment;
}
