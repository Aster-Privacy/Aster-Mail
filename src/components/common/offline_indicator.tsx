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
import { useEffect, useState } from "react";
import { OfflineIndicatorView } from "@aster/ui";

import { use_online_status } from "@/hooks/use_online_status";
import { use_should_reduce_motion } from "@/provider";
import { use_i18n } from "@/lib/i18n/context";

interface OfflineIndicatorProps {
  position?: "top" | "bottom";
  className?: string;
}

export function OfflineIndicator({
  position = "bottom",
  className,
}: OfflineIndicatorProps) {
  const reduce_motion = use_should_reduce_motion();
  const { t } = use_i18n();
  const { is_online, was_offline } = use_online_status();
  const [show_reconnected, set_show_reconnected] = useState(false);

  useEffect(() => {
    if (is_online && was_offline) {
      set_show_reconnected(true);
      const timer = setTimeout(() => {
        set_show_reconnected(false);
      }, 3000);

      return () => clearTimeout(timer);
    }
  }, [is_online, was_offline]);

  return (
    <OfflineIndicatorView
      className={className}
      is_online={is_online}
      offline_label={t("common.offline_features_limited")}
      position={position}
      reconnected_label={t("common.back_online")}
      reduce_motion={reduce_motion}
      show_reconnected={show_reconnected}
    />
  );
}
