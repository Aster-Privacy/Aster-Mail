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
import { decrypt_message_with_any_key } from "@/services/crypto/key_manager_pgp";

export interface pgp_decrypt_worker_request {
  id: number;
  ciphertext: string;
  secret_keys: (string | null | undefined)[];
  passphrase: string;
}

export interface pgp_decrypt_worker_response {
  id: number;
  plaintext?: string;
  error?: string;
}

self.onmessage = async (
  event: MessageEvent<pgp_decrypt_worker_request>,
) => {
  if (event.origin !== "" && event.origin !== self.location.origin) {
    return;
  }

  const { id, ciphertext, secret_keys, passphrase } = event.data;

  try {
    const plaintext = await decrypt_message_with_any_key(
      ciphertext,
      secret_keys,
      passphrase,
    );

    const response: pgp_decrypt_worker_response = { id, plaintext };

    (self as unknown as Worker).postMessage(response);
  } catch (error) {
    const response: pgp_decrypt_worker_response = {
      id,
      error: error instanceof Error ? error.message : "decrypt_failed",
    };

    (self as unknown as Worker).postMessage(response);
  }
};
