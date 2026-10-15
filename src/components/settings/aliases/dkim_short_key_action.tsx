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
import type { DnsRecord } from "@/services/api/domains";

import { useRef, useState } from "react";
import { Button } from "@aster/ui";

import { use_i18n } from "@/lib/i18n/context";
import { show_toast } from "@/components/toast/simple_toast";
import { rotate_dkim } from "@/services/api/domains";

interface DkimShortKeyActionProps {
  domain_id: string;
  on_record_replaced: (record: DnsRecord) => void;
}

export function DkimShortKeyAction({
  domain_id,
  on_record_replaced,
}: DkimShortKeyActionProps) {
  const { t } = use_i18n();
  const [confirming, set_confirming] = useState(false);
  const [working, set_working] = useState(false);
  const in_flight = useRef(false);

  const handle_confirm = async () => {
    if (in_flight.current) return;
    in_flight.current = true;
    set_working(true);

    try {
      const response = await rotate_dkim(domain_id, "compact");

      if (response.data?.success && response.data.dns_record) {
        set_confirming(false);
        on_record_replaced(response.data.dns_record);
        show_toast(
          response.data.dns_auto_published === true
            ? t("common.dkim_short_key_done_auto")
            : t("common.dkim_short_key_done"),
          "success",
        );
      } else if (response.status === 429) {
        show_toast(t("common.dkim_short_key_wait"), "error");
      } else {
        show_toast(t("common.something_went_wrong"), "error");
      }
    } catch {
      show_toast(t("common.something_went_wrong"), "error");
    } finally {
      in_flight.current = false;
      set_working(false);
    }
  };

  if (!confirming) {
    return (
      <Button
        className="mt-2"
        size="sm"
        variant="outline"
        onClick={() => set_confirming(true)}
      >
        {t("common.dkim_short_key_button")}
      </Button>
    );
  }

  return (
    <div
      className="mt-2 p-3 rounded-[var(--aster-radius-field,10px)] border border-edge-secondary"
      role="group"
    >
      <p className="text-xs text-txt-secondary">
        {t("common.dkim_short_key_confirm")}
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        <Button disabled={working} size="sm" onClick={handle_confirm}>
          {working
            ? t("common.dkim_short_key_working")
            : t("common.dkim_short_key_confirm_button")}
        </Button>
        <Button
          disabled={working}
          size="sm"
          variant="ghost"
          onClick={() => set_confirming(false)}
        >
          {t("common.cancel")}
        </Button>
      </div>
    </div>
  );
}
