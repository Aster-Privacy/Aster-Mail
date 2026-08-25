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
import { Button } from "@aster/ui";

import { use_i18n } from "@/lib/i18n/context";

export function LoadFailedNotice({ on_retry }: { on_retry: () => void }) {
  const { t } = use_i18n();

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 rounded-lg bg-surf-tertiary border border-edge-secondary">
      <p className="text-xs text-txt-muted">
        {t("common.something_went_wrong_try_again")}
      </p>
      <Button size="sm" variant="outline" onClick={on_retry}>
        {t("common.retry")}
      </Button>
    </div>
  );
}
