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
interface AsterSecurityMarkProps {
  className?: string;
}

export function AsterSecurityMark({
  className = "h-5 w-5",
}: AsterSecurityMarkProps) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={1.7}
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M8 10.3V7.9a4 4 0 1 1 8 0v2.4" />
      <rect height="9.7" rx="3.3" width="13.8" x="5.1" y="10.3" />
      <circle cx="12" cy="14.6" r="1.15" />
      <path d="M12 15.7v1.6" />
    </svg>
  );
}
