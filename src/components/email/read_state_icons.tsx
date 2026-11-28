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
import type { ComponentType, SVGProps } from "react";

import { EnvelopeOpenIcon } from "@heroicons/react/24/outline";

type ReadStateIcon = ComponentType<SVGProps<SVGSVGElement>>;

export const MarkReadIcon = EnvelopeOpenIcon;

export function MarkUnreadIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      aria-hidden="true"
      data-slot="icon"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <path
        d="M13.5 4.5h-9a2.25 2.25 0 0 0-2.25 2.25v10.5a2.25 2.25 0 0 0 2.25 2.25h15a2.25 2.25 0 0 0 2.25-2.25V10.5M2.25 6.75v.243a2.25 2.25 0 0 0 1.07 1.916l7.5 4.615a2.25 2.25 0 0 0 2.36 0l5.114-3.147"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="19.5" cy="4.5" fill="currentColor" r="3" stroke="none" />
    </svg>
  );
}

export function read_toggle_icon(is_read: boolean | undefined): ReadStateIcon {
  return is_read ? MarkUnreadIcon : MarkReadIcon;
}

export function ReadToggleIcon({
  is_read,
  ...props
}: SVGProps<SVGSVGElement> & { is_read: boolean | undefined }) {
  const Icon = read_toggle_icon(is_read);

  return <Icon {...props} />;
}
