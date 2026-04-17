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
interface CountBadgeProps {
  count: number;
  show_zero?: boolean;
  is_active?: boolean;
  is_loading?: boolean;
  className?: string;
}

export function CountBadge({
  count,
  show_zero = false,
  is_active = false,
  is_loading = false,
  className = "",
}: CountBadgeProps) {
  if (is_loading) {
    return (
      <span
        className={`inline-block w-5 h-3 rounded-sm animate-pulse bg-current opacity-10 ${className}`}
      />
    );
  }

  if (count === 0 && !show_zero) {
    return null;
  }

  const display_value = count.toLocaleString();

  return (
    <span
      className={`text-[12px] font-medium tabular-nums ${is_active ? "text-txt-secondary" : "text-txt-muted"} ${className}`}
    >
      {display_value}
    </span>
  );
}
