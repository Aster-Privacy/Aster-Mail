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
import { InformationCircleIcon } from "@heroicons/react/24/outline";

import { use_i18n } from "@/lib/i18n/context";

interface TrashBannerProps {
  retention_days?: number;
}

export function TrashBanner({ retention_days = 30 }: TrashBannerProps) {
  const { t } = use_i18n();

  return (
    <div
      className="mx-3 mt-2 px-4 py-2.5 rounded-lg flex items-center gap-3"
      style={{
        backgroundColor: "var(--bg-tertiary)",
        color: "var(--text-muted)",
      }}
    >
      <InformationCircleIcon className="w-5 h-5 flex-shrink-0" />
      <p className="text-xs">
        {t("mail.trash_auto_delete_notice", { days: retention_days })}
      </p>
    </div>
  );
}
