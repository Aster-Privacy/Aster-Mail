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
export async function decrypt_aes_gcm_bound_or_unbound(
  key: CryptoKey,
  iv: BufferSource,
  data: BufferSource,
  additional_data: BufferSource,
): Promise<ArrayBuffer> {
  try {
    return await crypto.subtle.decrypt(
      { name: "AES-GCM", iv, additionalData: additional_data },
      key,
      data,
    );
  } catch (bound_error) {
    try {
      return await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, data);
    } catch {
      throw bound_error;
    }
  }
}
