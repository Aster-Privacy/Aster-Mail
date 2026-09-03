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
import { useEffect, useState, useSyncExternalStore } from "react";

import {
  fetch_peer_profile,
  get_cached_peer_profile,
  is_aster_email,
  subscribe_profile_updates,
  type PublicProfile,
} from "@/services/api/profiles";
import { use_preferences } from "@/contexts/preferences_context";
import {
  get_local_address_avatar,
  subscribe_local_address_avatars,
  type local_address_avatar,
} from "@/services/local_address_avatars";

function use_local_address_avatar(
  normalized: string,
): local_address_avatar | null {
  return useSyncExternalStore(
    subscribe_local_address_avatars,
    () => (normalized ? get_local_address_avatar(normalized) : null),
    () => null,
  );
}

export function use_peer_profile(
  email: string | undefined | null,
): PublicProfile | null | undefined {
  const { preferences } = use_preferences();
  const low_network = preferences.low_network_mode;
  const normalized = email ? email.trim().toLowerCase() : "";
  const enabled = !low_network && !!normalized && is_aster_email(normalized);
  const read_cache = () =>
    enabled ? get_cached_peer_profile(normalized) : null;
  const local = use_local_address_avatar(normalized);
  const [entry, set_entry] = useState<{
    email: string;
    profile: PublicProfile | null | undefined;
  }>(() => ({ email: normalized, profile: read_cache() }));

  useEffect(() => {
    if (!enabled) {
      set_entry({ email: normalized, profile: null });

      return;
    }

    let cancelled = false;
    const cached = get_cached_peer_profile(normalized);

    if (cached !== undefined) {
      set_entry({ email: normalized, profile: cached });
    } else {
      fetch_peer_profile(normalized).then((result) => {
        if (!cancelled) set_entry({ email: normalized, profile: result });
      });
    }

    const unsubscribe = subscribe_profile_updates(() => {
      if (cancelled) return;
      const next = get_cached_peer_profile(normalized);

      if (next !== undefined) set_entry({ email: normalized, profile: next });
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [normalized, enabled]);

  const remote = entry.email === normalized ? entry.profile : read_cache();

  if (!local) return remote;

  return {
    ...(remote ?? {}),
    display_name: remote?.display_name ?? local.display_name ?? null,
    profile_picture: local.profile_picture ?? remote?.profile_picture ?? null,
  };
}
