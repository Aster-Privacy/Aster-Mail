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

import type { ComposeToolbarState } from "@/components/compose/compose_shared";

import { DraftStatusIndicator as SharedDraftStatusIndicator } from "@aster/ui";

import { use_i18n } from "@/lib/i18n/context";
import { format_last_saved } from "@/components/compose/compose_shared";

export function DraftStatusIndicator({
  compose,
  reduce_motion,
}: {
  compose: ComposeToolbarState;
  reduce_motion: boolean;
}) {
  const { t } = use_i18n();

  return (
    <SharedDraftStatusIndicator
      labels={{
        saving: t("common.saving"),
        save_failed: t("common.save_failed"),
        saved: compose.last_saved_time
          ? format_last_saved(compose.last_saved_time, t)
          : t("mail.saved"),
      }}
      reduce_motion={reduce_motion}
      status={compose.draft_status}
    />
  );
}
