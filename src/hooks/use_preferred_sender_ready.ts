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
import { useEffect, useState } from "react";
import {
  is_preferred_sender_ready,
  subscribe_preferred_sender_ready,
} from "@/lib/preferred_sender";

const PREFERRED_SENDER_READY_TIMEOUT_MS = 2500;

export function use_preferred_sender_ready(): boolean {
  const [ready, set_ready] = useState(() => is_preferred_sender_ready());

  useEffect(() => {
    if (ready) return;

    const unsubscribe = subscribe_preferred_sender_ready(() =>
      set_ready(true),
    );
    const timer = window.setTimeout(
      () => set_ready(true),
      PREFERRED_SENDER_READY_TIMEOUT_MS,
    );

    return () => {
      unsubscribe();
      window.clearTimeout(timer);
    };
  }, [ready]);

  return ready;
}
