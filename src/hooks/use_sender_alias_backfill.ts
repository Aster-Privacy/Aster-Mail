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

import {
  get_backfill_status,
  run_sender_alias_backfill,
  subscribe_backfill_status,
  type BackfillStatus,
} from "@/services/sender_alias_backfill";
import {
  alias_direction_of,
  is_alias_view,
} from "@/hooks/email_list_helpers/alias_view";

export function use_sender_alias_backfill(
  current_view: string,
  account_id: string | undefined,
): BackfillStatus {
  const [status, set_status] = useState<BackfillStatus>(get_backfill_status);

  const direction = alias_direction_of(current_view);
  const wants_sent = is_alias_view(current_view) && direction !== "received";

  useEffect(() => subscribe_backfill_status(set_status), []);

  useEffect(() => {
    if (!wants_sent || !account_id) return;
    void run_sender_alias_backfill(account_id);
  }, [wants_sent, account_id]);

  return status;
}
