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

use chrono::Utc;

use crate::error::{CryptoError, Result};
use crate::keys::{KeyPair, PublicKey, PublicKeyInner};
use crate::sign::{
    signed_public_key_can_sign, signed_secret_key_can_sign, signed_secret_signing_identity_valid,
    signing_identity_valid,
};

pub const MAX_CIPHERTEXT_BYTES: usize = 16 * 1024 * 1024;
pub const MAX_PLAINTEXT_BYTES: usize = 64 * 1024 * 1024;

fn capped_plaintext(data: &[u8]) -> Result<Vec<u8>> {
    if data.len() > MAX_PLAINTEXT_BYTES {
        return Err(CryptoError::Decryption("Decryption failed".into()));
    }
    Ok(data.to_vec())
}

pub fn decrypt_message(ciphertext: &[u8], secret_keys: &[&KeyPair]) -> Result<Vec<u8>> {
    if secret_keys.is_empty() {
        return Err(CryptoError::KeyNotFound("No secret keys provided".into()));
    }
    if ciphertext.len() > MAX_CIPHERTEXT_BYTES {
        return Err(CryptoError::Decryption("Decryption failed".into()));
    }

    let (msg, _) = Message::from_armor_single(ciphertext)
        .map_err(|_| CryptoError::Decryption("Decryption failed".into()))?;

    for keypair in secret_keys {
        let decrypted = msg.decrypt(|| "".to_string(), &[keypair.secret_key()]);

        if let Ok((decrypted_msg, _key_ids)) = decrypted {
            if let Some(literal) = decrypted_msg.get_literal() {
                return capped_plaintext(literal.data());
            }

            if let Message::Literal(lit) = decrypted_msg {
                return capped_plaintext(lit.data());
            }
        }
    }

    Err(CryptoError::Decryption("Decryption failed".into()))
}

pub fn decrypt_message_binary(ciphertext: &[u8], secret_keys: &[&KeyPair]) -> Result<Vec<u8>> {
    if secret_keys.is_empty() {
        return Err(CryptoError::KeyNotFound("No secret keys provided".into()));
    }
    if ciphertext.len() > MAX_CIPHERTEXT_BYTES {
        return Err(CryptoError::Decryption("Decryption failed".into()));
    }

    let msg = Message::from_bytes(ciphertext)
        .map_err(|_| CryptoError::Decryption("Decryption failed".into()))?;

    for keypair in secret_keys {
        let decrypted = msg.decrypt(|| "".to_string(), &[keypair.secret_key()]);

        if let Ok((decrypted_msg, _key_ids)) = decrypted {
            if let Some(literal) = decrypted_msg.get_literal() {
                return capped_plaintext(literal.data());
            }

            if let Message::Literal(lit) = decrypted_msg {
                return capped_plaintext(lit.data());
            }
        }
    }

    Err(CryptoError::Decryption("Decryption failed".into()))
}

fn verify_with_sender_keys(msg: &Message, sender_keys: &[&PublicKey]) -> bool {
    let now = Utc::now();
    for pk in sender_keys {
        let verified = match &pk.inner {
            PublicKeyInner::Standalone(spk) => {
                signing_identity_valid(spk, now)
                    && signed_public_key_can_sign(spk)
                    && msg.verify(spk).is_ok()
            }
            PublicKeyInner::FromSecret(ssk) => {
                signed_secret_signing_identity_valid(ssk, now)
                    && signed_secret_key_can_sign(ssk)
                    && msg.verify(ssk).is_ok()
            }
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
    if sender_keys.is_empty() {
        return Err(CryptoError::SignatureVerification(
            "decrypt_and_verify requires at least one sender key".into(),
        ));
    }
    if ciphertext.len() > MAX_CIPHERTEXT_BYTES {
        return Err(CryptoError::Decryption("Decryption failed".into()));
    }

    let (msg, _) = Message::from_armor_single(ciphertext)
        .map_err(|_| CryptoError::Decryption("Decryption failed".into()))?;

    for keypair in secret_keys {
        let decrypted = msg.decrypt(|| "".to_string(), &[keypair.secret_key()]);

        if let Ok((decrypted_msg, _key_ids)) = decrypted {
            if !verify_with_sender_keys(&decrypted_msg, sender_keys) {
                return Err(CryptoError::Decryption("Decryption failed".into()));
            }

            if let Some(literal) = decrypted_msg.get_literal() {
                return capped_plaintext(literal.data());
            }

            if let Message::Literal(lit) = decrypted_msg {
                return capped_plaintext(lit.data());
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

    fn generate_non_signing_keypair(name: &str, email: &str) -> KeyPair {
        use pgp::composed::{KeyType, SecretKeyParamsBuilder};
        use pgp::crypto::hash::HashAlgorithm;
        use rand::rngs::OsRng;
        use smallvec::smallvec;

        let user_id = format!("{} <{}>", name, email);
        let rng = OsRng;
        let key_params = SecretKeyParamsBuilder::default()
            .key_type(KeyType::Rsa(2048))
            .can_certify(false)
            .can_sign(false)
            .can_encrypt(true)
            .primary_user_id(user_id)
            .preferred_symmetric_algorithms(smallvec![
                pgp::crypto::sym::SymmetricKeyAlgorithm::AES256,
            ])
            .preferred_hash_algorithms(smallvec![HashAlgorithm::SHA2_512])
            .build()
            .unwrap();
        let secret_key = key_params.generate(rng).unwrap();
        let signed_secret_key = secret_key.sign(rng, || "".to_string()).unwrap();
        let armored = signed_secret_key.to_armored_string(None.into()).unwrap();
        crate::keys::import_secret_key(&armored).unwrap()
    }

    #[test]
    fn verified_path_accepts_signing_capable_key() {
        use crate::encrypt::encrypt_and_sign;

        let alice = generate_keypair("Alice", "alice@astermail.com").unwrap();
        let bob = generate_keypair("Bob", "bob@astermail.com").unwrap();
        let alice_pub = alice.public_key();
        let bob_pub = bob.public_key();

        let plaintext = b"signed and encrypted";
        let ciphertext = encrypt_and_sign(plaintext, &[&bob_pub], &alice).unwrap();

        let decrypted = decrypt_and_verify(&ciphertext, &[&bob], &[&alice_pub]).unwrap();
        assert_eq!(plaintext.as_slice(), decrypted.as_slice());
    }

    #[test]
    fn verified_path_rejects_non_signing_sender_key() {
        use crate::encrypt::encrypt_and_sign;

        let signer = generate_non_signing_keypair("NoSign", "nosign@astermail.com");
        let bob = generate_keypair("Bob", "bob@astermail.com").unwrap();
        let signer_pub = signer.public_key();
        let bob_pub = bob.public_key();

        let plaintext = b"forged-by-encryption-only-key";
        let ciphertext = encrypt_and_sign(plaintext, &[&bob_pub], &signer).unwrap();

        let result = decrypt_and_verify(&ciphertext, &[&bob], &[&signer_pub]);
        assert!(result.is_err());
    }
}
