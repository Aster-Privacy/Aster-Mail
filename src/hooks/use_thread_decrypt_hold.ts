//
// Aster Communications Inc.
//
// Copyright (c) 2026 Aster Communications Inc.
//
// This file is part of this project.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
// GNU Affero General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License
// along with this program. If not, see <https://www.gnu.org/licenses/>.
//
import { useEffect } from "react";

import { hold_thread_decrypt_cache } from "@/services/thread_decrypt_cache";

export function use_thread_decrypt_hold(
  thread_token: string | null | undefined,
): void {
  useEffect(() => {
    if (!thread_token) return;

    return hold_thread_decrypt_cache(thread_token);
  }, [thread_token]);
}
