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
import { api_client } from "@/services/api/client";

interface IdentityHistoryEntry {
  kem_identity_key: string;
  first_published_at: string;
  last_published_at: string;
}

interface IdentityHistoryResponse {
  entries: IdentityHistoryEntry[];
}

export async function get_current_identity_cutoff(
  email: string | null | undefined,
  current_identity: string | null | undefined,
): Promise<number | null> {
  if (!email || !current_identity) return null;

  const username = email.split("@")[0];

  try {
    const response = await api_client.get<IdentityHistoryResponse>(
      `/crypto/v1/ratchet/prekey-bundle/${encodeURIComponent(username)}/history?email=${encodeURIComponent(email)}`,
    );
    const entries = response.data?.entries;

    if (response.error || !Array.isArray(entries)) return null;

    const current = entries.find(
      (entry) => entry.kem_identity_key === current_identity,
    );

    if (!current) return null;

    const first_published = Date.parse(current.first_published_at);

    if (!Number.isFinite(first_published)) return null;

    const replaced_until = entries
      .filter((entry) => entry !== current)
      .map((entry) => Date.parse(entry.last_published_at))
      .filter((time) => Number.isFinite(time));

    return Math.max(first_published, ...replaced_until);
  } catch {
    return null;
  }
}
