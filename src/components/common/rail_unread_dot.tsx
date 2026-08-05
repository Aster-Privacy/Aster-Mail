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
interface RailUnreadDotProps {
  count: number;
  label: string;
}

export function RailUnreadDot({ count, label }: RailUnreadDotProps) {
  const safe_count =
    Number.isFinite(count) && count > 0 ? Math.floor(count) : 0;

  if (safe_count === 0) return null;

  return (
    <>
      <span
        aria-hidden="true"
        className="mail_unread_dot absolute h-[7px] w-[7px] rounded-full pointer-events-none"
        style={{
          left: "calc(50% + 8px)",
          top: "2px",
          boxShadow:
            "0 0 0 2px var(--sidebar-bg, var(--bg-secondary, var(--bg-primary)))",
        }}
      />
      <span className="sr-only">{`${label}: ${safe_count.toLocaleString()}`}</span>
    </>
  );
}
