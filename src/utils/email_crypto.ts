import type { DecryptedEnvelope } from "@/types/email";

import {
  decrypt_envelope_with_bytes,
  base64_to_array,
} from "@/services/crypto/envelope";
import {
  get_passphrase_bytes,
  get_passphrase_from_memory,
  get_vault_from_memory,
} from "@/services/crypto/memory_key_store";
import {
  parse_ratchet_envelope,
  decrypt_ratchet_message,
} from "@/services/crypto/ratchet_manager";
import { zero_uint8_array } from "@/services/crypto/secure_memory";
import {
  decrypt_message,
  encrypt_message_multi,
} from "@/services/crypto/key_manager";
import {
  discover_external_keys_batch,
  type ExternalKeyInfo,
} from "@/services/api/keys";

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

export async function try_decrypt_ratchet_body(
  body_text: string,
  our_email: string,
  sender_email: string,
): Promise<string> {
  if (!body_text.startsWith("{")) return body_text;

  const envelope = parse_ratchet_envelope(body_text);

  if (!envelope) return body_text;

  const vault = get_vault_from_memory();

  if (!vault) return body_text;

  try {
    const decrypted = await decrypt_ratchet_message(
      our_email,
      sender_email,
      envelope,
      vault,
    );

    return decrypted ?? body_text;
  } catch {
    return body_text;
  }
}

const PGP_MESSAGE_BEGIN = "-----BEGIN PGP MESSAGE-----";

export async function try_decrypt_pgp_body(body_text: string): Promise<string> {
  if (!body_text.includes(PGP_MESSAGE_BEGIN)) return body_text;

  const vault = get_vault_from_memory();
  const passphrase = get_passphrase_from_memory();

  if (!vault || !passphrase) return body_text;

  const private_key = vault.identity_key;

  if (!private_key) return body_text;

  try {
    const decrypted = await decrypt_message(body_text, private_key, passphrase);

    return decrypted;
  } catch {
    return body_text;
  }
}
