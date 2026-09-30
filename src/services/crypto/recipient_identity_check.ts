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
import { base64_to_array, compute_hash } from "./key_manager_core";
import { fetch_ratchet_identity } from "./ratchet_prekey_bundle";
import {
  get_identity_change,
  get_pinned_identity_fingerprint,
} from "./ratchet_identity_pin";

export async function has_recipient_identity_changed(
  email: string,
): Promise<boolean> {
  const pin_id = email.trim().toLowerCase();
  const username = pin_id.split("@")[0] ?? "";

  if (!pin_id || !username) return false;

  try {
    if (await get_identity_change(pin_id)) return true;

    const pinned = await get_pinned_identity_fingerprint(pin_id);

    if (!pinned) return false;

    const identity = await fetch_ratchet_identity(username, pin_id);

    if (!identity?.kem_identity_key) return false;

    const current = await compute_hash(
      base64_to_array(identity.kem_identity_key),
    );

    return current !== pinned;
  } catch {
    return false;
  }
}
