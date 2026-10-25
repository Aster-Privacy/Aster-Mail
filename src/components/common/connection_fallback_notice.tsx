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
import { useEffect } from "react";

import { use_i18n } from "@/lib/i18n/context";
import { show_toast } from "@/components/toast/simple_toast";
import { connection_store } from "@/services/routing/connection_store";

const FALLBACK_NOTICE_DURATION_MS = 12000;

export function ConnectionFallbackNotice() {
  const { t } = use_i18n();

  useEffect(() => {
    const check = () => {
      const fallback = connection_store.take_unsupported_method_fallback();

      if (fallback === "tor" || fallback === "tor_snowflake") {
        show_toast(
          t("settings.connection.tor_unavailable_fallback"),
          "warning",
          FALLBACK_NOTICE_DURATION_MS,
        );
      }
    };

    check();

    return connection_store.subscribe(check);
  }, [t]);

  return null;
}
