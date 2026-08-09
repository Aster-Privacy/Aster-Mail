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
import { } from "@aster/ui";

import { } from "@/components/ui/coin_icon";
import { } from "@/components/ui/rounded_qr_code";
import { } from "@/components/ui/spinner";
import { } from "@/components/email/inbox/inbox_confirmation_dialog";
import { } from "@/components/toast/simple_toast";
import { } from "@/lib/i18n/context";
import { } from "@/services/api/request_cache";
import { } from "@/hooks/use_mail_stats";


export async function write_to_clipboard(value: string): Promise<boolean> {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(value);

      return true;
    } catch {
      void 0;
    }
  }

  if (typeof document === "undefined") return false;

  const holder = document.createElement("textarea");

  holder.value = value;
  holder.setAttribute("readonly", "true");
  holder.style.position = "fixed";
  holder.style.top = "-1000px";
  holder.style.opacity = "0";
  document.body.appendChild(holder);

  try {
    holder.select();
    holder.setSelectionRange(0, value.length);

    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    document.body.removeChild(holder);
  }
}

export function measure_clock_skew(server_time?: string): number {
  if (!server_time) return 0;

  const server_ms = Date.parse(server_time);

  if (!Number.isFinite(server_ms)) return 0;

  return Date.now() - server_ms;
}

