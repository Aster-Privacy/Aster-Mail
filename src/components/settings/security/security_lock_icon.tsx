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
import { LockClosedIcon } from "@heroicons/react/24/solid";

export type SecurityStatus = "weak" | "fair" | "partial" | "strong";

export const SECURITY_LOCK_COLOR: Record<SecurityStatus, string> = {
  weak: "#ef4444",
  fair: "#f59e0b",
  partial: "#eab308",
  strong: "#22c55e",
};

interface SecurityLockIconProps {
  status: SecurityStatus;
  className?: string;
}

export function SecurityLockIcon({
  status,
  className = "w-4 h-4",
}: SecurityLockIconProps) {
  return (
    <LockClosedIcon
      className={className}
      style={{ color: SECURITY_LOCK_COLOR[status] }}
    />
  );
}
