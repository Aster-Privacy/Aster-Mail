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
export const MODAL_SIZES = {
  small: { width: 400, height: 300 },
  medium: { width: 600, height: 500 },
  large: { width: 600, height: 600 },
} as const;

export const BUTTON_COLORS = {
  primary: "linear-gradient(to bottom, #526ef9, #374feb)",
  danger: "var(--color-danger)",
  success: "var(--color-success)",
  warning: "var(--color-warning)",
  disabled: "#d1d5db",
} as const;

export type ModalSize = (typeof MODAL_SIZES)[keyof typeof MODAL_SIZES];
