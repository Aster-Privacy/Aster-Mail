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

import { get_mail_stats } from "@/services/api/mail";
import { ignore_error } from "@/lib/ignore_error";
import { mailbox_index_total } from "@/hooks/use_search/progress_math";

export async function fetch_mailbox_index_total(cap: number): Promise<number> {
  try {
    const response = await get_mail_stats();

    if (response.error || !response.data) return 0;

    return mailbox_index_total(response.data, cap);
  } catch (caught) {
    ignore_error(
      "services/search/index_total:fetch_mailbox_index_total",
      caught,
    );

    return 0;
  }
}

export function settle_within(
  request: Promise<number>,
  wait_ms: number,
): Promise<number> {
  return new Promise<number>((resolve) => {
    const timer = setTimeout(() => resolve(0), wait_ms);

    void request.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      () => {
        clearTimeout(timer);
        resolve(0);
      },
    );
  });
}
