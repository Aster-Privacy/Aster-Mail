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
import type { SaveStatus } from "@aster/ui";

import { SaveStatusIndicatorView } from "@aster/ui";

import { use_i18n } from "@/lib/i18n/context";
import { use_should_reduce_motion } from "@/provider";

export type { SaveStatus };

interface SaveStatusIndicatorProps {
  status: SaveStatus;
  error_label?: string;
  className?: string;
}

export function SaveStatusIndicator({
  status,
  error_label,
  className = "",
}: SaveStatusIndicatorProps): JSX.Element {
  const { t } = use_i18n();
  const reduce_motion = use_should_reduce_motion();

  return (
    <SaveStatusIndicatorView
      className={className}
      error_label={error_label ?? t("common.error_label")}
      reduce_motion={reduce_motion}
      saved_label={t("mail.saved")}
      saving_label={t("common.saving")}
      status={status}
    />
  );
}
