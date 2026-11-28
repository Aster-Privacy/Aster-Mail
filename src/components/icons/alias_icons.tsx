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
import type { SVGProps } from "react";

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
      <path d="M15.625 12A3.75 3.75 0 1 1 8.125 12A3.75 3.75 0 1 1 15.625 12Z" />
      <path d="M15.625 8.25V13.25A2.625 2.625 0 0 0 20.875 13.25V12A9 9 0 1 0 17.66 18.894" />
    </svg>
  );
}

export function GhostMaskIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...LINE_PROPS} {...props}>
      <path d="M12 3.05C16.75 3.05 19.75 5.2 19.75 9.3C19.75 14.55 15.9 19.6 12 21.55C8.1 19.6 4.25 14.55 4.25 9.3C4.25 5.2 7.25 3.05 12 3.05Z" />
      <path d="M6.85 10.2C7.9 8.65 9.75 8.6 10.6 10.05M17.15 10.2C16.1 8.65 14.25 8.6 13.4 10.05" />
      <path d="M12 14.7C10.75 13.95 9.1 14.1 8.25 15.45C7.95 15.85 7.4 15.7 7.45 15.15M12 14.7C13.25 13.95 14.9 14.1 15.75 15.45C16.05 15.85 16.6 15.7 16.55 15.15M12 17.55V19.3" />
    </svg>
  );
}
