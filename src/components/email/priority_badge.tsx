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
import type { MailPriority } from "@/services/mail_priority";

import { Badge } from "@aster/ui";

import { use_i18n } from "@/lib/i18n/context";

export function PriorityBadge({
  priority,
  class_name = "",
}: {
  priority: MailPriority;
  class_name?: string;
}) {
  const { t } = use_i18n();

  if (priority === "normal") return null;

  const is_high = priority === "high";

  return (
    <Badge
      className={`flex-shrink-0 whitespace-nowrap ${class_name}`}
      color={is_high ? "red" : "gray"}
    >
      {is_high ? t("mail.high_priority") : t("mail.low_priority")}
    </Badge>
  );
}
