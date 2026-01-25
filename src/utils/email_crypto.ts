import type { DecryptedEnvelope } from "@/types/email";

import {
  decrypt_envelope_with_bytes,
  base64_to_array,
} from "@/services/crypto/envelope";
import { get_passphrase_bytes } from "@/services/crypto/memory_key_store";
import { zero_uint8_array } from "@/services/crypto/secure_memory";

export async function decrypt_mail_envelope<T = DecryptedEnvelope>(
  encrypted_envelope: string,
  envelope_nonce: string,
): Promise<T | null> {
  const nonce_bytes = envelope_nonce
    ? base64_to_array(envelope_nonce)
    : new Uint8Array(0);

  if (nonce_bytes.length === 0) {
    try {
      const encrypted_bytes = base64_to_array(encrypted_envelope);
      const json = new TextDecoder().decode(encrypted_bytes);

      return JSON.parse(json) as T;
    } catch {
      return null;
    }
  }

  const passphrase_bytes = get_passphrase_bytes();

  if (!passphrase_bytes) return null;

  try {
    const result = await decrypt_envelope_with_bytes<T>(
      encrypted_envelope,
      passphrase_bytes,
    );

    zero_uint8_array(passphrase_bytes);

    return result;
  } catch {
    zero_uint8_array(passphrase_bytes);

    return null;
  }
}
