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
import type { BimiState } from "@/services/api/bimi";
import type { ComponentType, SVGProps } from "react";

import {
  CheckCircleIcon,
  ClockIcon,
  ExclamationTriangleIcon,
  GlobeAltIcon,
  PencilSquareIcon,
} from "@heroicons/react/16/solid";
import { Badge } from "@aster/ui";

import { BIMI_STATE_LABELS } from "./bimi_copy";

import { use_i18n } from "@/lib/i18n/context";

const STATE_ICONS: Record<
  Exclude<BimiState, "off">,
  ComponentType<SVGProps<SVGSVGElement>>
> = {
  draft: PencilSquareIcon,
  pending: ClockIcon,
  live: CheckCircleIcon,
  attention: ExclamationTriangleIcon,
  external: GlobeAltIcon,
};

export function BimiStateChip({ state }: { state: BimiState }) {
  const { t } = use_i18n();

  if (state === "off") return null;

  const { label, color } = BIMI_STATE_LABELS[state];
  const Icon = STATE_ICONS[state];

  return (
    <Badge className="whitespace-nowrap" color={color}>
      <Icon aria-hidden="true" className="w-3.5 h-3.5 flex-shrink-0" />
      {t(label)}
    </Badge>
  );
}
