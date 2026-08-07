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
import { useEffect } from "react";

let lock_count = 0;
let restored_overflow = "";

export function lock_body_scroll(): void {
  if (lock_count === 0) {
    restored_overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
  }

  lock_count += 1;
}

export function unlock_body_scroll(): void {
  if (lock_count === 0) return;

  lock_count -= 1;

  if (lock_count === 0) {
    document.body.style.overflow = restored_overflow;
    restored_overflow = "";
  }
}

export function use_body_scroll_lock(is_locked: boolean): void {
  useEffect(() => {
    if (!is_locked) return;

    lock_body_scroll();

    return unlock_body_scroll;
  }, [is_locked]);
}
