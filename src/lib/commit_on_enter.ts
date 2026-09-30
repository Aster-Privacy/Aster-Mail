//
// Aster Communications Inc.
//
// Copyright (c) 2026 Aster Communications Inc.
//
// This file is part of this project.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
// GNU Affero General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License
// along with this program. If not, see <https://www.gnu.org/licenses/>.
//
import type { KeyboardEvent } from "react";

export function commit_on_enter(
  event: KeyboardEvent<HTMLInputElement>,
): boolean {
  if (event.key !== "Enter" || event.nativeEvent.isComposing) return false;

  event.preventDefault();
  event.currentTarget.blur();

  return true;
}

export function submit_on_enter(
  action: () => void,
): (event: KeyboardEvent<HTMLInputElement>) => void {
  return (event) => {
    if (event.key !== "Enter" || event.nativeEvent.isComposing) return;

    event.preventDefault();
    action();
  };
}
