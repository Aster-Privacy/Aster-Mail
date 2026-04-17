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
import { memo, useCallback } from "react";
import { PencilSquareIcon } from "@heroicons/react/24/outline";
import { Button } from "@aster/ui";

import { use_platform } from "@/hooks/use_platform";
import { haptic_impact } from "@/native/haptic_feedback";
import { use_i18n } from "@/lib/i18n/context";

interface MobileFabProps {
  on_press: () => void;
}

export const MobileFab = memo(function MobileFab({ on_press }: MobileFabProps) {
  const { safe_area_insets } = use_platform();
  const { t } = use_i18n();

  const handle_press = useCallback(() => {
    haptic_impact("light");
    on_press();
  }, [on_press]);

  return (
    <Button
      aria-label={t("common.compose_email_label")}
      className="fixed right-4 z-40 flex h-16 w-16 items-center justify-center !rounded-full"
      style={{
        bottom: 16 + Math.max(safe_area_insets.bottom, 8),
        borderRadius: "9999px",
      }}
      type="button"
      variant="depth"
      onClick={handle_press}
    >
      <PencilSquareIcon className="h-7 w-7" />
    </Button>
  );
});
