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
  fetch_peer_profile,
  get_cached_peer_profile,
  is_aster_email,
  subscribe_profile_updates,
  type PublicProfile,
} from "@/services/api/profiles";

export function use_peer_profile(email: string | undefined | null): PublicProfile | null {
  const normalized = email ? email.trim().toLowerCase() : "";
  const initial =
    normalized && is_aster_email(normalized)
      ? (get_cached_peer_profile(normalized) ?? null)
      : null;
  const [profile, set_profile] = useState<PublicProfile | null>(initial);

  useEffect(() => {
    if (!normalized || !is_aster_email(normalized)) {
      set_profile(null);
      return;
    }

    let cancelled = false;
    const cached = get_cached_peer_profile(normalized);
    if (cached !== undefined) {
      set_profile(cached);
    } else {
      fetch_peer_profile(normalized).then((result) => {
        if (!cancelled) set_profile(result);
      });
    }

    const unsubscribe = subscribe_profile_updates(() => {
      if (cancelled) return;
      const next = get_cached_peer_profile(normalized);
      if (next !== undefined) set_profile(next);
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [normalized]);

  return profile;
}
