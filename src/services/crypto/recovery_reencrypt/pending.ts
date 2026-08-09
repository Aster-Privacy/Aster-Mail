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
import { } from "@/services/crypto/constants";
import type { } from "../key_manager";
import { } from "../key_manager";
import { } from "../memory_key_store";
import { } from "../secure_memory";
import { } from "../legacy_keks";
import { device_store, device_retrieve } from "../secure_storage";
import { } from "@/services/api/client";
import type { } from "@/services/api/signatures";
import type { } from "@/services/api/templates";
import type { } from "@/services/api/blocked_senders";
import type { } from "@/services/api/allowed_senders";
import { } from "@/services/api/aliases";
import { } from "@/services/api/contacts";
import { } from "@/services/api/alias_pins";
import { } from "@/services/api/alias_contacts";
import { } from "@/services/api/alias_destinations";
import { } from "@/services/api/alias_directories";
import { } from "@/services/api/auth";
import { } from "@/services/crypto/envelope";


export const PENDING_KEY = "aster_pending_reencryption";

export interface PendingReencryptData {
  old_data_kek?: string;
  old_identity_key: string;
}

export async function store_pending_reencryption(
  data: PendingReencryptData,
): Promise<void> {
  try {
    await device_store(PENDING_KEY, data);
  } catch {}
}

export function clear_pending_reencryption(): void {
  try {
    localStorage.removeItem(PENDING_KEY);
  } catch {}
}

export async function get_pending(): Promise<PendingReencryptData | null> {
  try {
    return await device_retrieve<PendingReencryptData>(PENDING_KEY);
  } catch {
    return null;
  }
}

