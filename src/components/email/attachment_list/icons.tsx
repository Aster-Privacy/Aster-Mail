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
import type {} from "@/lib/i18n/types";

export function AttachmentCardSkeleton() {
  return (
    <div
      className="w-[200px] rounded-lg overflow-hidden animate-pulse"
      style={{ border: "1px solid var(--thread-card-border)" }}
    >
      <div
        className="w-full h-[140px]"
        style={{ backgroundColor: "var(--thread-card-border)" }}
      />
      <div
        className="px-3 py-2 border-t"
        style={{
          backgroundColor: "var(--thread-content-bg)",
          borderColor: "var(--thread-card-border)",
        }}
      >
        <div
          className="h-3 rounded w-3/4 mb-1.5"
          style={{ backgroundColor: "var(--thread-card-border)" }}
        />
        <div
          className="h-2.5 rounded w-1/3"
          style={{ backgroundColor: "var(--thread-card-border)" }}
        />
      </div>
    </div>
  );
}

export function DownloadIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      viewBox="0 0 24 24"
    >
      <path
        d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function FileDocIcon({
  color,
  label,
}: {
  color: string;
  label: string;
}) {
  return (
    <svg
      className="w-10 h-12"
      fill="none"
      viewBox="0 0 40 48"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M4 0h22l14 14v30a4 4 0 01-4 4H4a4 4 0 01-4-4V4a4 4 0 014-4z"
        fill={`${color}20`}
      />
      <path d="M26 0l14 14H30a4 4 0 01-4-4V0z" fill={`${color}40`} />
      <path
        d="M4 0h22l14 14v30a4 4 0 01-4 4H4a4 4 0 01-4-4V4a4 4 0 014-4z"
        fill="none"
        stroke={`${color}50`}
        strokeWidth="1"
      />
      <text
        dominantBaseline="middle"
        fill={color}
        fontFamily="system-ui, -apple-system, sans-serif"
        fontSize="10"
        fontWeight="700"
        textAnchor="middle"
        x="20"
        y="32"
      >
        {label}
      </text>
    </svg>
  );
}

export function PreviewChevronIcon({
  direction,
}: {
  direction: "left" | "right";
}) {
  return (
    <svg
      className="w-5 h-5"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      viewBox="0 0 24 24"
    >
      <path
        d={
          direction === "left"
            ? "M15.75 19.5L8.25 12l7.5-7.5"
            : "M8.25 4.5l7.5 7.5-7.5 7.5"
        }
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
