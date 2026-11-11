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
import { device_traces_erased } from "@/lib/device_erase_latch";

let holders = 0;

function warn_before_unload(event: BeforeUnloadEvent): void {
  if (device_traces_erased()) return;
  event.preventDefault();
  event.returnValue = "";
}

export function hold_import_unload_guard(): () => void {
  if (typeof window === "undefined") return () => undefined;

  holders++;
  if (holders === 1) {
    window.addEventListener("beforeunload", warn_before_unload);
  }

  let released = false;

  return () => {
    if (released) return;
    released = true;
    holders--;
    if (holders === 0) {
      window.removeEventListener("beforeunload", warn_before_unload);
    }
  };
}
