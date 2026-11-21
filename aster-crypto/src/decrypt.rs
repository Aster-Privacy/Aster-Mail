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
use std::io::Read;

use pgp::composed::{Deserializable, Message};

use chrono::Utc;

use crate::error::{CryptoError, Result};
use crate::keys::{KeyPair, PublicKey};
use crate::sign::message_signed_by_public_key;

pub const MAX_CIPHERTEXT_BYTES: usize = 16 * 1024 * 1024;
pub const MAX_PLAINTEXT_BYTES: usize = 64 * 1024 * 1024;

fn decryption_failed() -> CryptoError {
    CryptoError::Decryption("Decryption failed".into())
}

fn require_secret_keys(secret_keys: &[&KeyPair]) -> Result<()> {
    if secret_keys.is_empty() {
        return Err(CryptoError::KeyNotFound("No secret keys provided".into()));
    }
    Ok(())
}

pub(crate) fn within_ciphertext_limit(ciphertext: &[u8]) -> bool {
    ciphertext.len() <= MAX_CIPHERTEXT_BYTES
}

fn require_ciphertext_size(ciphertext: &[u8]) -> Result<()> {
    if !within_ciphertext_limit(ciphertext) {
        return Err(decryption_failed());
    }
    Ok(())
}

fn parse_armored(ciphertext: &[u8]) -> Result<Message> {
    Message::from_armor_single(ciphertext)
        .map(|(msg, _)| msg)
        .map_err(|_| decryption_failed())
}

pub(crate) fn inflate_within_cap(msg: Message) -> Option<Message> {
    let Message::Compressed(data) = msg else {
        return Some(msg);
    };
    let mut bytes = Vec::new();
    data.decompress()
        .ok()?
        .take(MAX_PLAINTEXT_BYTES as u64 + 1)
        .read_to_end(&mut bytes)
        .ok()?;
    if bytes.len() > MAX_PLAINTEXT_BYTES {
        return None;
    }
    match Message::from_bytes(&bytes[..]).ok()? {
        Message::Compressed(_) => None,
        inner => Some(inner),
    }
}

fn inflated(msg: Message) -> Result<Message> {
    inflate_within_cap(msg).ok_or_else(decryption_failed)
}

fn decrypted_by_any<'a>(
    msg: &'a Message,
    secret_keys: &'a [&KeyPair],
    passphrase: &'a str,
) -> impl Iterator<Item = Result<Message>> + 'a {
    secret_keys.iter().filter_map(move |keypair| {
        msg.decrypt(|| passphrase.to_string(), &[keypair.secret_key()])
            .ok()
            .map(|(decrypted, _key_ids)| inflated(decrypted))
    })
}

fn literal_plaintext(msg: &Message) -> Option<Result<Vec<u8>>> {
    let data = msg.get_literal()?.data();
    if data.len() > MAX_PLAINTEXT_BYTES {
        return Some(Err(decryption_failed()));
    }
    Some(Ok(data.to_vec()))
}

fn first_plaintext(msg: &Message, secret_keys: &[&KeyPair], passphrase: &str) -> Result<Vec<u8>> {
    decrypted_by_any(msg, secret_keys, passphrase)
        .find_map(|decrypted| match decrypted {
            Ok(decrypted) => literal_plaintext(&decrypted),
            Err(err) => Some(Err(err)),
        })
        .unwrap_or_else(|| Err(decryption_failed()))
}

pub fn decrypt_message(ciphertext: &[u8], secret_keys: &[&KeyPair]) -> Result<Vec<u8>> {
    decrypt_message_with_passphrase(ciphertext, secret_keys, "")
}

pub fn decrypt_message_with_passphrase(
    ciphertext: &[u8],
    secret_keys: &[&KeyPair],
    passphrase: &str,
) -> Result<Vec<u8>> {
    require_secret_keys(secret_keys)?;
    require_ciphertext_size(ciphertext)?;
    first_plaintext(&parse_armored(ciphertext)?, secret_keys, passphrase)
}

pub fn decrypt_message_binary(ciphertext: &[u8], secret_keys: &[&KeyPair]) -> Result<Vec<u8>> {
    require_secret_keys(secret_keys)?;
    require_ciphertext_size(ciphertext)?;
    let msg = Message::from_bytes(ciphertext).map_err(|_| decryption_failed())?;
    first_plaintext(&msg, secret_keys, "")
}

fn verify_with_sender_keys(msg: &Message, sender_keys: &[&PublicKey]) -> bool {
    let now = Utc::now();
    sender_keys
        .iter()
        .any(|pk| message_signed_by_public_key(msg, pk, now))
}

pub fn decrypt_and_verify(
    ciphertext: &[u8],
    secret_keys: &[&KeyPair],
    sender_keys: &[&PublicKey],
) -> Result<Vec<u8>> {
    decrypt_and_verify_with_passphrase(ciphertext, secret_keys, sender_keys, "")
}

pub fn decrypt_and_verify_with_passphrase(
    ciphertext: &[u8],
    secret_keys: &[&KeyPair],
    sender_keys: &[&PublicKey],
    passphrase: &str,
) -> Result<Vec<u8>> {
    require_secret_keys(secret_keys)?;
    if sender_keys.is_empty() {
        return Err(CryptoError::SignatureVerification(
            "decrypt_and_verify requires at least one sender key".into(),
        ));
    }
    require_ciphertext_size(ciphertext)?;

    let msg = parse_armored(ciphertext)?;
    for decrypted in decrypted_by_any(&msg, secret_keys, passphrase) {
        let decrypted = decrypted?;
        if !verify_with_sender_keys(&decrypted, sender_keys) {
            return Err(decryption_failed());
        }
        if let Some(plaintext) = literal_plaintext(&decrypted) {
            return plaintext;
        }
    }

    Err(decryption_failed())
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

    fn protected_keypair(passphrase: &str) -> crate::keys::KeyPair {
        use pgp::composed::{KeyType, SecretKeyParamsBuilder, SubkeyParamsBuilder};
        use pgp::crypto::ecc_curve::ECCCurve;

        let rng = rand::rngs::OsRng;
        let pw = passphrase.to_string();
        let params = SecretKeyParamsBuilder::default()
            .key_type(KeyType::EdDSALegacy)
            .can_certify(true)
            .can_sign(true)
            .primary_user_id("Owner <owner@astermail.com>".into())
            .passphrase(Some(pw.clone()))
            .subkey(
                SubkeyParamsBuilder::default()
                    .key_type(KeyType::ECDH(ECCCurve::Curve25519))
                    .can_encrypt(true)
                    .passphrase(Some(pw.clone()))
                    .build()
                    .unwrap(),
            )
            .build()
            .unwrap();
        let signed = params.generate(rng).unwrap().sign(rng, || pw).unwrap();
        let armored = signed.to_armored_string(None.into()).unwrap();
        crate::keys::import_secret_key(&armored).unwrap()
    }

    #[test]
    fn passphrase_path_opens_token_from_protected_own_key() {
        use crate::encrypt::encrypt_and_sign_with_passphrase;
        let owner = protected_keypair("hunter2 hunter2");
        let owner_pub = owner.public_key();

        let plaintext = b"account key token";
        let ciphertext =
            encrypt_and_sign_with_passphrase(plaintext, &[&owner_pub], &owner, "hunter2 hunter2")
                .unwrap();

        let decrypted = decrypt_and_verify_with_passphrase(
            &ciphertext,
            &[&owner],
            &[&owner_pub],
            "hunter2 hunter2",
        )
        .unwrap();
        assert_eq!(plaintext.as_slice(), decrypted.as_slice());

        assert!(decrypt_and_verify_with_passphrase(
            &ciphertext,
            &[&owner],
            &[&owner_pub],
            "wrong passphrase",
        )
        .is_err());
        assert!(decrypt_and_verify(&ciphertext, &[&owner], &[&owner_pub]).is_err());
    }

    #[test]
    fn passphrase_decrypt_opens_message_for_protected_key() {
        let owner = protected_keypair("hunter2 hunter2");
        let other = protected_keypair("hunter2 hunter2");
        let ciphertext = encrypt_message(b"sealed envelope", &[&owner.public_key()]).unwrap();

        let decrypted =
            decrypt_message_with_passphrase(&ciphertext, &[&other, &owner], "hunter2 hunter2")
                .unwrap();
        assert_eq!(b"sealed envelope".as_slice(), decrypted.as_slice());

        assert!(decrypt_message_with_passphrase(&ciphertext, &[&owner], "wrong").is_err());
        assert!(decrypt_message(&ciphertext, &[&owner]).is_err());
        assert!(decrypt_message_with_passphrase(&ciphertext, &[], "hunter2 hunter2").is_err());
    }

    #[test]
    fn passphrase_path_rejects_foreign_signer() {
        use crate::encrypt::encrypt_and_sign_with_passphrase;
        let owner = protected_keypair("hunter2 hunter2");
        let attacker = generate_keypair("Attacker", "attacker@example.com").unwrap();
        let owner_pub = owner.public_key();

        let ciphertext =
            encrypt_and_sign_with_passphrase(b"forged", &[&owner_pub], &attacker, "").unwrap();

        assert!(decrypt_and_verify_with_passphrase(
            &ciphertext,
            &[&owner],
            &[&owner_pub],
            "hunter2 hunter2",
        )
        .is_err());
    }

    #[test]
    fn passphrase_path_rejects_unsigned_message() {
        let owner = protected_keypair("hunter2 hunter2");
        let owner_pub = owner.public_key();

        let ciphertext = encrypt_message(b"unsigned", &[&owner_pub]).unwrap();

        assert!(decrypt_and_verify_with_passphrase(
            &ciphertext,
            &[&owner],
            &[&owner_pub],
            "hunter2 hunter2",
        )
        .is_err());
    }

    fn sealed_for(recipient: &KeyPair, msg: &Message) -> Vec<u8> {
        use pgp::composed::SignedPublicKey;
        use pgp::crypto::sym::SymmetricKeyAlgorithm;

        let public: SignedPublicKey = recipient.secret_key().clone().into();
        let subkey = crate::key_selection::select_encryption_subkey(&public).unwrap();
        msg.encrypt_to_keys_seipdv1(rand::rngs::OsRng, SymmetricKeyAlgorithm::AES256, &[subkey])
            .unwrap()
            .to_armored_bytes(None.into())
            .unwrap()
    }

    fn compressed(msg: Message, alg: pgp::types::CompressionAlgorithm) -> Message {
        msg.compress(alg).unwrap()
    }

    #[test]
    fn opens_compressed_incoming_message() {
        use pgp::types::CompressionAlgorithm;

        let bob = generate_keypair("Bob", "bob@astermail.com").unwrap();
        let plaintext = b"compressed incoming mail body";

        for alg in [CompressionAlgorithm::ZLIB, CompressionAlgorithm::ZIP] {
            let literal = Message::new_literal_bytes("", plaintext);
            let ciphertext = sealed_for(&bob, &compressed(literal, alg));

            assert_eq!(
                decrypt_message(&ciphertext, &[&bob]).ok(),
                Some(plaintext.to_vec())
            );
        }
    }

    #[test]
    fn verifies_signed_then_compressed_incoming_message() {
        use pgp::crypto::hash::HashAlgorithm;
        use pgp::types::CompressionAlgorithm;

        let alice = generate_keypair("Alice", "alice@astermail.com").unwrap();
        let bob = generate_keypair("Bob", "bob@astermail.com").unwrap();
        let plaintext = b"signed, compressed, then encrypted";

        let signed = Message::new_literal_bytes("", plaintext)
            .sign(
                rand::rngs::OsRng,
                alice.secret_key(),
                String::new,
                HashAlgorithm::SHA2_256,
            )
            .unwrap();
        let ciphertext = sealed_for(&bob, &compressed(signed, CompressionAlgorithm::ZLIB));

        assert_eq!(
            decrypt_and_verify(&ciphertext, &[&bob], &[&alice.public_key()]).ok(),
            Some(plaintext.to_vec())
        );

        let mallory = generate_keypair("Mallory", "mallory@astermail.com").unwrap();
        assert!(decrypt_and_verify(&ciphertext, &[&bob], &[&mallory.public_key()]).is_err());
    }

    #[test]
    fn refuses_compressed_message_beyond_plaintext_cap() {
        use pgp::types::CompressionAlgorithm;

        let bob = generate_keypair("Bob", "bob@astermail.com").unwrap();
        let oversized = vec![0u8; MAX_PLAINTEXT_BYTES + 1];
        let literal = Message::new_literal_bytes("", &oversized);
        let ciphertext = sealed_for(&bob, &compressed(literal, CompressionAlgorithm::ZLIB));

        assert!(ciphertext.len() < MAX_CIPHERTEXT_BYTES);
        assert!(decrypt_message(&ciphertext, &[&bob]).is_err());
    }

    #[test]
    fn refuses_nested_compression() {
        use pgp::types::CompressionAlgorithm;

        let bob = generate_keypair("Bob", "bob@astermail.com").unwrap();
        let inner = compressed(
            Message::new_literal_bytes("", b"nested"),
            CompressionAlgorithm::ZLIB,
        );
        let ciphertext = sealed_for(&bob, &compressed(inner, CompressionAlgorithm::ZIP));

        assert!(decrypt_message(&ciphertext, &[&bob]).is_err());
    }
}
