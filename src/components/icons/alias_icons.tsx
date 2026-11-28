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
import type { ReactNode, SVGProps } from "react";

const LINE_PROPS = {
  "aria-hidden": true,
  fill: "none",
  stroke: "currentColor",
  strokeLinecap: "round",
  strokeLinejoin: "round",
  strokeWidth: 1.5,
  viewBox: "0 0 24 24",
} as const;

export function AliasAtIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...LINE_PROPS} {...props}>
      <path d="M15.375 12A3.375 3.375 0 1 1 8.625 12A3.375 3.375 0 1 1 15.375 12Z" />
      <path d="M15.375 9V13.5A2.8125 2.8125 0 0 0 21 13.5V12A9 9 0 1 0 18.894 17.785" />
    </svg>
  );
}

export function GhostMaskIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...LINE_PROPS} {...props}>
      <path d="M12 9C14.3 7.6 17.4 7.4 19.6 8L22 6C22.4 10.4 21.6 16.7 16.8 18C14.8 18.5 13.4 17.1 12 15.8C10.6 17.1 9.2 18.5 7.2 18C2.4 16.7 1.6 10.4 2 6L4.4 8C6.6 7.4 9.7 7.6 12 9Z" />
      <path d="M4.635 11.37C5.955 9.17 9.035 9.17 10.465 11.48C9.805 14.23 5.845 14.89 4.635 11.37Z" />
      <path d="M19.365 11.37C18.045 9.17 14.965 9.17 13.535 11.48C14.195 14.23 18.155 14.89 19.365 11.37Z" />
    </svg>
  );
}

export function AliasGlyphAvatar({
  children,
  size,
}: {
  children: ReactNode;
  size: number;
}) {
  return (
    <span
      className="inline-flex flex-shrink-0 items-center justify-center rounded-full bg-surf-tertiary text-txt-secondary ring-1 ring-inset ring-edge-secondary"
      style={{ width: size, height: size }}
    >
      {children}
    </span>
  );
}
