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
use pgp::composed::{Deserializable, Message};

use crate::error::{CryptoError, Result};
use crate::keys::{KeyPair, PublicKey, PublicKeyInner};

pub fn decrypt_message(ciphertext: &[u8], secret_keys: &[&KeyPair]) -> Result<Vec<u8>> {
    if secret_keys.is_empty() {
        return Err(CryptoError::KeyNotFound("No secret keys provided".into()));
    }

    let (msg, _) = Message::from_armor_single(ciphertext)
        .map_err(|_| CryptoError::Decryption("Decryption failed".into()))?;

    for keypair in secret_keys {
        let decrypted = msg.decrypt(|| "".to_string(), &[keypair.secret_key()]);

        if let Ok((decrypted_msg, _key_ids)) = decrypted {
            if let Some(literal) = decrypted_msg.get_literal() {
                return Ok(literal.data().to_vec());
            }

            if let Message::Literal(lit) = decrypted_msg {
                return Ok(lit.data().to_vec());
            }
        }
    }

    Err(CryptoError::Decryption("Decryption failed".into()))
}

pub fn decrypt_message_binary(ciphertext: &[u8], secret_keys: &[&KeyPair]) -> Result<Vec<u8>> {
    if secret_keys.is_empty() {
        return Err(CryptoError::KeyNotFound("No secret keys provided".into()));
    }

    let msg = Message::from_bytes(ciphertext)
        .map_err(|_| CryptoError::Decryption("Decryption failed".into()))?;

    for keypair in secret_keys {
        let decrypted = msg.decrypt(|| "".to_string(), &[keypair.secret_key()]);

        if let Ok((decrypted_msg, _key_ids)) = decrypted {
            if let Some(literal) = decrypted_msg.get_literal() {
                return Ok(literal.data().to_vec());
            }

            if let Message::Literal(lit) = decrypted_msg {
                return Ok(lit.data().to_vec());
            }
        }
    }

    Err(CryptoError::Decryption("Decryption failed".into()))
}

fn verify_with_sender_keys(msg: &Message, sender_keys: &[&PublicKey]) -> bool {
    for pk in sender_keys {
        let verified = match &pk.inner {
            PublicKeyInner::Standalone(spk) => msg.verify(spk).is_ok(),
            PublicKeyInner::FromSecret(ssk) => msg.verify(ssk).is_ok(),
        };
        if verified {
            return true;
        }
    }
    false
}

pub fn decrypt_and_verify(
    ciphertext: &[u8],
    secret_keys: &[&KeyPair],
    sender_keys: &[&PublicKey],
) -> Result<Vec<u8>> {
    if secret_keys.is_empty() {
        return Err(CryptoError::KeyNotFound("No secret keys provided".into()));
    }

    let (msg, _) = Message::from_armor_single(ciphertext)
        .map_err(|_| CryptoError::Decryption("Decryption failed".into()))?;

    for keypair in secret_keys {
        let decrypted = msg.decrypt(|| "".to_string(), &[keypair.secret_key()]);

        if let Ok((decrypted_msg, _key_ids)) = decrypted {
            if !sender_keys.is_empty() && !verify_with_sender_keys(&decrypted_msg, sender_keys) {
                return Err(CryptoError::SignatureVerification(
                    "Message signature could not be verified with provided sender keys".into(),
                ));
            }

            if let Some(literal) = decrypted_msg.get_literal() {
                return Ok(literal.data().to_vec());
            }

            if let Message::Literal(lit) = decrypted_msg {
                return Ok(lit.data().to_vec());
            }
        }
    }

    Err(CryptoError::Decryption("Decryption failed".into()))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::encrypt::encrypt_message;
    use crate::keys::generate_keypair;

    #[test]
    fn test_encrypt_decrypt_roundtrip() {
        let keypair = generate_keypair("Test", "test@astermail.com").unwrap();
        let public = keypair.public_key();

        let plaintext = b"This is a secret message that should be encrypted and decrypted!";
        let ciphertext = encrypt_message(plaintext, &[&public]).unwrap();

        let decrypted = decrypt_message(&ciphertext, &[&keypair]).unwrap();

        assert_eq!(plaintext.as_slice(), decrypted.as_slice());
    }

    #[test]
    fn test_decrypt_with_multiple_keys() {
        let alice = generate_keypair("Alice", "alice@astermail.com").unwrap();
        let bob = generate_keypair("Bob", "bob@astermail.com").unwrap();
        let alice_pub = alice.public_key();
        let bob_pub = bob.public_key();

        let plaintext = b"Message for both Alice and Bob";
        let ciphertext = encrypt_message(plaintext, &[&alice_pub, &bob_pub]).unwrap();

        let decrypted_alice = decrypt_message(&ciphertext, &[&alice]).unwrap();
        assert_eq!(plaintext.as_slice(), decrypted_alice.as_slice());

        let decrypted_bob = decrypt_message(&ciphertext, &[&bob]).unwrap();
        assert_eq!(plaintext.as_slice(), decrypted_bob.as_slice());
    }

    #[test]
    fn test_wrong_key_fails() {
        let alice = generate_keypair("Alice", "alice@astermail.com").unwrap();
        let bob = generate_keypair("Bob", "bob@astermail.com").unwrap();
        let alice_pub = alice.public_key();

        let plaintext = b"Secret for Alice only";
        let ciphertext = encrypt_message(plaintext, &[&alice_pub]).unwrap();

        let result = decrypt_message(&ciphertext, &[&bob]);
        assert!(result.is_err());
    }
}
