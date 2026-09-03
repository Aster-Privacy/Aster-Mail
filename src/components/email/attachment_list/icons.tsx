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
import type { AttachmentGlyph } from "@/lib/attachment_utils";
import type {} from "@/lib/i18n/types";

export function AttachmentCardSkeleton() {
  return (
    <div
      className="w-[200px] rounded-[14px] overflow-hidden animate-pulse"
      style={{ border: "1px solid var(--thread-card-border)" }}
    >
      <div
        className="w-full h-[128px]"
        style={{ backgroundColor: "var(--thread-card-border)" }}
      />
      <div
        className="px-3 py-2.5 border-t"
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

const SHEET_PATH =
  "M6.3 1.2h10.7l3.6 3.6v15.1a2.9 2.9 0 01-2.9 2.9H6.3a2.9 2.9 0 01-2.9-2.9V4.1a2.9 2.9 0 012.9-2.9z";
const FOLD_PATH = "M17 1.2l3.6 3.6h-2.2a1.4 1.4 0 01-1.4-1.4z";
const FOLD_FILL = "#c8d0da";

const SYMBOLS: Partial<
  Record<AttachmentGlyph, { d: string; transform: string }>
> = {
  table: {
    d: "M120-640v-120q0-33 23.5-56.5T200-840h560q33 0 56.5 23.5T840-760v120H120Zm80 520q-33 0-56.5-23.5T120-200v-360h180v440H200Zm460 0v-440h180v360q0 33-23.5 56.5T760-120H660Zm-280 0v-440h200v440H380Z",
    transform: "translate(5.467 16.583) scale(0.0136111)",
  },
  photo: {
    d: "M200-120q-33 0-56.5-23.5T120-200v-560q0-33 23.5-56.5T200-840h560q33 0 56.5 23.5T840-760v560q0 33-23.5 56.5T760-120H200Zm40-160h480L570-480 450-320l-90-120-120 160Z",
    transform: "translate(5.467 16.583) scale(0.0136111)",
  },
  video: {
    d: "m380-300 280-180-280-180v360ZM160-160q-33 0-56.5-23.5T80-240v-480q0-33 23.5-56.5T160-800h640q33 0 56.5 23.5T880-720v480q0 33-23.5 56.5T800-160H160Z",
    transform: "translate(5.7 16.35) scale(0.013125)",
  },
  presentation: {
    d: "M640-160v-280h160v280H640Zm-240 0v-640h160v640H400Zm-240 0v-440h160v440H160Z",
    transform: "translate(4.875 17.175) scale(0.01484375)",
  },
  music: {
    d: "M287-167q-47-47-47-113t47-113q47-47 113-47 23 0 42.5 5.5T480-418v-422h240v160H560v400q0 66-47 113t-113 47q-66 0-113-47Z",
    transform: "translate(4.868 17.531) scale(0.0148588)",
  },
  code: {
    d: "M305-208 32-480l273-273 90 89-184 184 183 183-89 89Zm350 1-90-89 184-184-183-183 89-89 273 272-273 273Z",
    transform: "translate(6.214 15.836) scale(0.0120536)",
  },
};

const GLYPH_MARKS: Partial<
  Record<AttachmentGlyph, (color: string) => React.ReactNode>
> = {
  code: (color) => (
    <rect
      fill={color}
      height="7.96"
      rx="0.75"
      transform="rotate(15 12 10.05)"
      width="1.5"
      x="11.25"
      y="6.07"
    />
  ),
  document: (color) => (
    <>
      <rect fill={color} height="1.92" rx="0.96" width="9.8" x="7.1" y="5.71" />
      <rect fill={color} height="1.92" rx="0.96" width="9.8" x="7.1" y="9.09" />
      <rect fill={color} height="1.92" rx="0.96" width="6.49" x="7.1" y="12.47" />
    </>
  ),
  archive: (color) => (
    <>
      <rect fill={color} height="8.352" width="3.944" x="10.028" y="1.2" />
      <rect fill="#ffffff" height="1.102" width="3.944" x="10.028" y="2.36" />
      <rect fill="#ffffff" height="1.102" width="3.944" x="10.028" y="4.912" />
      <rect fill="#ffffff" height="1.102" width="3.944" x="10.028" y="7.464" />
      <rect
        fill={color}
        height="4.872"
        rx="1.276"
        width="5.104"
        x="9.448"
        y="9.552"
      />
      <rect
        fill="#ffffff"
        height="2.32"
        rx="0.638"
        width="1.276"
        x="11.362"
        y="10.596"
      />
    </>
  ),
};

export function FileTypeIcon({
  color,
  glyph,
  label,
}: {
  color: string;
  glyph: AttachmentGlyph;
  label: string;
}) {
  const mark = GLYPH_MARKS[glyph];
  const symbol = SYMBOLS[glyph];
  const font_size = label.length > 3 ? 4.49 : 5.36;

  return (
    <div
      className="w-[68px] h-[68px] rounded-[18px] flex items-center justify-center"
      style={{ backgroundColor: color }}
    >
      <svg
        className="w-[44px] h-[44px]"
        fill="none"
        viewBox="0 0 24 24"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path d={SHEET_PATH} fill="#ffffff" />
        {symbol ? (
          <g transform={symbol.transform}>
            <path d={symbol.d} fill={color} />
          </g>
        ) : null}
        {mark?.(color)}
        <path d={FOLD_PATH} fill={FOLD_FILL} />
        <rect fill={color} height="5.8" rx="1.7" width="15.6" x="4.2" y="15.2" />
        <text
          fill="#ffffff"
          fontSize={font_size}
          fontWeight="500"
          letterSpacing="0.131"
          textAnchor="middle"
          x="12.07"
          y="19.58"
        >
          {label}
        </text>
      </svg>
    </div>
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
