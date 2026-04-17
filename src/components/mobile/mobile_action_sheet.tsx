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

import { MobileBottomSheet } from "@/components/mobile/mobile_bottom_sheet";
import { use_i18n } from "@/lib/i18n/context";

interface ActionItem {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  on_action: () => void;
  destructive?: boolean;
}

interface MobileActionSheetProps {
  is_open: boolean;
  on_close: () => void;
  items: ActionItem[];
}

export const MobileActionSheet = memo(function MobileActionSheet({
  is_open,
  on_close,
  items,
}: MobileActionSheetProps) {
  const { t } = use_i18n();

  const handle_action = useCallback(
    (action: () => void) => {
      action();
      on_close();
    },
    [on_close],
  );

  return (
    <MobileBottomSheet is_open={is_open} on_close={on_close}>
      <div className="px-2 pb-2">
        {items.map((item) => (
          <button
            key={item.label}
            className={`flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left active:bg-[var(--bg-tertiary)] ${
              item.destructive
                ? "text-[var(--color-danger,#ef4444)]"
                : "text-[var(--text-primary)]"
            }`}
            type="button"
            onClick={() => handle_action(item.on_action)}
          >
            <item.icon className="h-5 w-5 shrink-0" />
            <span className="text-[15px]">{item.label}</span>
          </button>
        ))}

        <div className="mx-4 my-1 border-t border-[var(--border-primary)]" />

        <button
          className="flex w-full items-center justify-center rounded-xl px-4 py-3 text-[15px] font-medium text-[var(--text-secondary)] active:bg-[var(--bg-tertiary)]"
          type="button"
          onClick={on_close}
        >
          {t("common.cancel")}
        </button>
      </div>
    </MobileBottomSheet>
  );
});
