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
import { useEffect, useMemo, useState } from "react";

import {
  resolve_alias_delivery,
  subscribe_aliases,
  type AliasDelivery,
} from "@/hooks/use_sidebar_aliases";
import { use_preferences } from "@/contexts/preferences_context";

export function normalize_alias_candidates(
  candidates: (string | undefined | null)[],
): string {
  const seen = new Set<string>();

  for (const candidate of candidates) {
    const normalized = candidate?.trim().toLowerCase();

    if (normalized) seen.add(normalized);
  }

  return [...seen].join(",");
}

export function use_alias_delivery(
  routing_token: string | undefined,
  candidates_key: string,
): AliasDelivery | null {
  const { preferences } = use_preferences();
  const [alias_version, set_alias_version] = useState(0);

  useEffect(() => {
    return subscribe_aliases(() => set_alias_version((v) => v + 1));
  }, []);

  const indicators_enabled = preferences.show_alias_indicators !== false;

  return useMemo(() => {
    if (!indicators_enabled) return null;

    return resolve_alias_delivery(
      routing_token,
      candidates_key ? candidates_key.split(",") : [],
    );
  }, [routing_token, candidates_key, alias_version, indicators_enabled]);
}
