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
import { array_to_base64 } from "./envelope";
import {
  decrypt_message_verified,
  derive_public_keys_from_private,
  encrypt_message,
} from "./key_manager_pgp_messages";

import { get_account_key_capabilities } from "@/services/api/account_key";

export interface SealedSentEnvelope {
  encrypted_envelope: string;
  envelope_nonce: string;
}

export async function seal_sent_envelope(
  envelope: object,
  identity_key: string,
  passphrase: string,
): Promise<SealedSentEnvelope | null> {
  try {
    const [public_key] = await derive_public_keys_from_private([identity_key]);

    if (!public_key) return null;

    const plaintext = JSON.stringify(envelope);
    const armored = await encrypt_message(plaintext, public_key, {
      armored_secret_key: identity_key,
      passphrase,
    });

    const reopened = await decrypt_message_verified(
      armored,
      identity_key,
      passphrase,
      [public_key],
    );

    if (reopened.plaintext !== plaintext) return null;
    if (reopened.verification !== "verified") return null;

    return {
      encrypted_envelope: array_to_base64(new TextEncoder().encode(armored)),
      envelope_nonce: "",
    };
  } catch {
    return null;
  }
}

export async function seal_sent_envelope_when_enabled(
  envelope: object,
  identity_key: string,
  passphrase: string | null,
): Promise<SealedSentEnvelope | null> {
  if (!passphrase) return null;

  const capabilities = await get_account_key_capabilities();

  if (!capabilities.format_writes) return null;

  return seal_sent_envelope(envelope, identity_key, passphrase);
}
