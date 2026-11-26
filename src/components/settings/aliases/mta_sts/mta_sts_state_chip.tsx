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
import type { MtaStsState } from "@/services/api/mta_sts";
import type { ComponentType, SVGProps } from "react";

import {
  ArrowPathIcon,
  CheckCircleIcon,
  ClockIcon,
  ExclamationTriangleIcon,
  LockClosedIcon,
  PowerIcon,
} from "@heroicons/react/16/solid";
import { Badge } from "@aster/ui";

import { MTA_STS_STATE_LABELS } from "./mta_sts_copy";

import { use_i18n } from "@/lib/i18n/context";

const STATE_ICONS: Record<
  Exclude<MtaStsState, "off">,
  ComponentType<SVGProps<SVGSVGElement>>
> = {
  locked: LockClosedIcon,
  retiring: PowerIcon,
  pending_dns: ClockIcon,
  pending_certificate: ArrowPathIcon,
  live: CheckCircleIcon,
  attention: ExclamationTriangleIcon,
};

export function MtaStsStateChip({ state }: { state: MtaStsState }) {
  const { t } = use_i18n();

  if (state === "off") return null;

  const { label, color } = MTA_STS_STATE_LABELS[state];
  const Icon = STATE_ICONS[state];

  return (
    <Badge className="whitespace-nowrap" color={color}>
      <Icon aria-hidden="true" className="w-3.5 h-3.5 flex-shrink-0" />
      {t(label)}
    </Badge>
  );
}
