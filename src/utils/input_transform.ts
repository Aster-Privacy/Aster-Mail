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
export function transformed_caret_position(
  raw: string,
  caret: number,
  transform: (value: string) => string,
): number {
  return transform(raw.slice(0, caret)).length;
}

export function apply_input_transform(
  input: HTMLInputElement,
  transform: (value: string) => string,
): string {
  const raw = input.value;
  const next = transform(raw);

  if (next === raw) return next;

  const caret = input.selectionStart ?? raw.length;
  const position = transformed_caret_position(raw, caret, transform);

  if (typeof requestAnimationFrame === "function") {
    requestAnimationFrame(() => {
      if (input.isConnected && input.value === next) {
        input.setSelectionRange(position, position);
      }
    });
  }

  return next;
}
