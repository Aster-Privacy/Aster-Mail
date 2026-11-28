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
import type { UnboundPolicy } from "@/services/crypto/aes_gcm_aad_fallback";

import { stored_unbound_policy } from "@/services/crypto/aes_gcm_aad_fallback";
import { is_format_refused } from "@/services/format_retirement/record";

export function ratchet_unbound_policy(): UnboundPolicy {
  return stored_unbound_policy("ratchet_unbound");
}

export function unbound_gcm(iv: Uint8Array): AesGcmParams {
  if (is_format_refused("inbound_unbound_marker")) {
    throw new Error("unbound inbound envelope refused");
  }

  return { name: "AES-GCM", iv };
}
