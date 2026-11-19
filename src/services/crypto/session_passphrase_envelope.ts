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
import {
  decrypt_envelope_with_bytes,
  type MailKeyOptions,
} from "./envelope";
import { get_passphrase_bytes } from "./memory_key_store";
import { zero_uint8_array } from "./secure_memory";

export async function decrypt_envelope_with_session_passphrase<T>(
  encrypted_data: string,
  options?: MailKeyOptions,
): Promise<T | null> {
  const passphrase = get_passphrase_bytes();

  if (!passphrase) return null;

  try {
    return await decrypt_envelope_with_bytes<T>(
      encrypted_data,
      passphrase,
      options,
    );
  } finally {
    zero_uint8_array(passphrase);
  }
}
