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
import { } from "@/components/settings/billing/shared_mailboxes_tab";
import { } from "@/components/ui/input";
import { } from "@/components/ui/slider";
import { } from "@/components/ui/info_popover";
import { } from "@/components/ui/spinner";
import { } from "@/components/ui/profile_avatar";
import { } from "@/services/api/billing";
import { } from "../family_seats";
import { } from "../family_kids_addresses";
import { } from "@/components/settings/settings_tab_bar";
import { } from "@/components/settings/stat_ring";
import { } from "@/components/toast/simple_toast";
import { } from "@/services/api/aliases";
import { } from "@/lib/i18n/context";
import { } from "@/contexts/preferences_context";
import type { } from "@/lib/i18n/types";
import { } from "@/lib/utils";

import { storage_pct } from "./helpers";
export function StorageBar({ used, total }: { used: number; total: number }) {
  const pct = storage_pct(used, total);
  const color = pct >= 90 ? "bg-red-500" : pct >= 70 ? "bg-amber-500" : "bg-accent-blue";
  return (
    <div className="w-full bg-edge-secondary rounded-full h-1 mt-1.5">
      <div className={`${color} h-1 rounded-full transition-all`} style={{ width: `${pct}%` }} />
    </div>
  );
}

export function SkeletonRows({ count = 3, has_icon = true }: { count?: number; has_icon?: boolean }) {
  return (
    <div className="space-y-1">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 py-3">
          {has_icon && <div className="w-8 h-8 rounded-full bg-edge-secondary animate-pulse flex-shrink-0" />}
          <div className="flex-1 space-y-2">
            <div className="h-3 bg-edge-secondary rounded-full animate-pulse" style={{ width: `${60 + (i % 3) * 10}%` }} />
            <div className="h-2 bg-edge-secondary rounded-full animate-pulse" style={{ width: `${35 + (i % 2) * 15}%` }} />
          </div>
          <div className="h-2 bg-edge-secondary rounded-full animate-pulse w-16 flex-shrink-0" />
        </div>
      ))}
    </div>
  );
}

