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
import type { DecryptedContact } from "@/types/contacts";

import { useEffect, useState } from "react";

import {
  get_cached_suggestion_pool,
  load_suggestion_pool,
  subscribe_suggestion_pool,
} from "@/services/contact_suggestion_pool";

export function use_suggestion_contacts(
  active: boolean,
  reload_key?: unknown,
): DecryptedContact[] {
  const [contacts, set_contacts] = useState<DecryptedContact[]>(
    () => get_cached_suggestion_pool() ?? [],
  );

  useEffect(() => {
    if (!active) return;

    let cancelled = false;
    const refresh = () => {
      load_suggestion_pool().then((next) => {
        if (!cancelled) set_contacts(next);
      });
    };
    const unsubscribe = subscribe_suggestion_pool(refresh);

    refresh();

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [active, reload_key]);

  return contacts;
}
