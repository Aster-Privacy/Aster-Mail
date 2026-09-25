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
use pgp::composed::{Message, SignedPublicKey, SignedPublicSubKey};
use pgp::crypto::aead::AeadAlgorithm;
use pgp::crypto::public_key::PublicKeyAlgorithm;
use pgp::crypto::{hash::HashAlgorithm, sym::SymmetricKeyAlgorithm};
use pgp::ser::Serialize;
use pgp::types::{KeyVersion, PublicKeyTrait};
use rand::rngs::OsRng;

use crate::error::{CryptoError, Result};
use crate::keys::{KeyPair, PublicKey, PublicKeyInner};

const SEIPDV2_CHUNK_SIZE: u8 = 0x06;

fn collect_recipient_public_keys(recipients: &[&PublicKey]) -> Vec<SignedPublicKey> {
    let mut out = Vec::with_capacity(recipients.len());
    for pk in recipients {
        match &pk.inner {
            PublicKeyInner::Standalone(spk) => out.push(spk.clone()),
            PublicKeyInner::FromSecret(ssk) => {
                let spk: SignedPublicKey = ssk.clone().into();
                out.push(spk);
            }
        }
    }
    out
}

fn is_aead_capable_algo(algo: PublicKeyAlgorithm) -> bool {
    matches!(
        algo,
        PublicKeyAlgorithm::ECDH | PublicKeyAlgorithm::X25519 | PublicKeyAlgorithm::X448
    )
}

fn select_public_encryption_subkey(spk: &SignedPublicKey) -> Result<&SignedPublicSubKey> {
    crate::key_selection::select_encryption_subkey(spk).ok_or_else(|| {
        CryptoError::Encryption("recipient key has no usable encryption subkey".into())
    })
}

pub(crate) fn subkey_supports_seipdv2(version: KeyVersion, algo: PublicKeyAlgorithm) -> bool {
    version == KeyVersion::V6 && is_aead_capable_algo(algo)
}

pub(crate) fn all_capabilities_support_seipdv2(caps: &[(KeyVersion, PublicKeyAlgorithm)]) -> bool {
    !caps.is_empty()
        && caps
            .iter()
            .all(|(version, algo)| subkey_supports_seipdv2(*version, *algo))
}

fn all_subkeys_support_seipdv2_public(subkeys: &[&SignedPublicSubKey]) -> bool {
    let caps: Vec<(KeyVersion, PublicKeyAlgorithm)> = subkeys
        .iter()
        .map(|sub| {
            (
                PublicKeyTrait::version(*sub),
                PublicKeyTrait::algorithm(*sub),
            )
        })
        .collect();
    all_capabilities_support_seipdv2(&caps)
}

fn encrypt_to_public_subkeys(
    msg: &Message,
    subkeys: &[&SignedPublicSubKey],
    use_seipdv2: bool,
) -> Result<Message> {
    if use_seipdv2 {
        msg.encrypt_to_keys_seipdv2(
            &mut OsRng,
            SymmetricKeyAlgorithm::AES256,
            AeadAlgorithm::Ocb,
            SEIPDV2_CHUNK_SIZE,
            subkeys,
        )
        .map_err(|e: pgp::errors::Error| CryptoError::Encryption(e.to_string()))
    } else {
        msg.encrypt_to_keys_seipdv1(&mut OsRng, SymmetricKeyAlgorithm::AES256, subkeys)
            .map_err(|e: pgp::errors::Error| CryptoError::Encryption(e.to_string()))
    }
}

fn build_encrypted_message(msg: &Message, recipients: &[&PublicKey]) -> Result<Message> {
    let public_keys = collect_recipient_public_keys(recipients);
    let subkeys: Vec<&SignedPublicSubKey> = public_keys
        .iter()
        .map(|pk| select_public_encryption_subkey(pk))
        .collect::<Result<Vec<_>>>()?;
    // SEIPDv2/AEAD produces v6-format ciphertext (RFC 9580: v6 PKESK + OCB).
    // A client that published a v4 key cannot be assumed to read it, and many
    // do not, so those recipients keep SEIPDv1 and its MDC. A v6 key is only
    // defined by RFC 9580, which mandates SEIPDv2 support, so a recipient set
    // that is entirely v6 gets AEAD integrity with no interoperability risk.
    let use_seipdv2 = all_subkeys_support_seipdv2_public(&subkeys);
    encrypt_to_public_subkeys(msg, &subkeys, use_seipdv2)
}

pub fn encrypt_message(plaintext: &[u8], recipients: &[&PublicKey]) -> Result<Vec<u8>> {
    if recipients.is_empty() {
        return Err(CryptoError::NoValidRecipient);
    }

    let msg = Message::new_literal_bytes("", plaintext);
    let encrypted = build_encrypted_message(&msg, recipients)?;

    encrypted
        .to_armored_bytes(None.into())
        .map_err(|e: pgp::errors::Error| CryptoError::Encryption(e.to_string()))
}

pub fn encrypt_message_binary(plaintext: &[u8], recipients: &[&PublicKey]) -> Result<Vec<u8>> {
    if recipients.is_empty() {
        return Err(CryptoError::NoValidRecipient);
    }

    let msg = Message::new_literal_bytes("", plaintext);
    let encrypted = build_encrypted_message(&msg, recipients)?;

    Serialize::to_bytes(&encrypted)
        .map_err(|e: pgp::errors::Error| CryptoError::Encryption(e.to_string()))
}

pub fn encrypt_and_sign(
    plaintext: &[u8],
    recipients: &[&PublicKey],
    signer: &KeyPair,
) -> Result<Vec<u8>> {
    encrypt_and_sign_with_passphrase(plaintext, recipients, signer, "")
}

pub fn encrypt_and_sign_with_passphrase(
    plaintext: &[u8],
    recipients: &[&PublicKey],
    signer: &KeyPair,
    passphrase: &str,
) -> Result<Vec<u8>> {
    if recipients.is_empty() {
        return Err(CryptoError::NoValidRecipient);
    }

    let msg = Message::new_literal_bytes("", plaintext);

    let signed = msg
        .sign(
            &mut OsRng,
            signer.secret_key(),
            || passphrase.to_string(),
            HashAlgorithm::SHA2_512,
        )
        .map_err(|e: pgp::errors::Error| CryptoError::Signing(e.to_string()))?;

    let encrypted = build_encrypted_message(&signed, recipients)?;

    encrypted
        .to_armored_bytes(None.into())
        .map_err(|e: pgp::errors::Error| CryptoError::Encryption(e.to_string()))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::decrypt::decrypt_message;
    use crate::keys::{generate_keypair, generate_legacy_rsa_keypair};
    use pgp::composed::{Deserializable, Edata};

    #[test]
    fn test_encrypt_message() {
        let recipient = generate_keypair("Recipient", "recipient@astermail.com").unwrap();
        let public = recipient.public_key();

        let plaintext = b"Hello, this is a secret message!";
        let ciphertext = encrypt_message(plaintext, &[&public]).unwrap();

        assert!(ciphertext.len() > plaintext.len());
        let ciphertext_str = String::from_utf8_lossy(&ciphertext);
        assert!(ciphertext_str.contains("BEGIN PGP MESSAGE"));
    }

    #[test]
    fn test_encrypt_multiple_recipients() {
        let recipient1 = generate_keypair("Alice", "alice@astermail.com").unwrap();
        let recipient2 = generate_keypair("Bob", "bob@astermail.com").unwrap();
        let pub1 = recipient1.public_key();
        let pub2 = recipient2.public_key();

        let plaintext = b"Message for multiple recipients";
        let ciphertext = encrypt_message(plaintext, &[&pub1, &pub2]).unwrap();

        assert!(!ciphertext.is_empty());
    }

    fn seipd_version(armored: &[u8]) -> usize {
        let (msg, _) = Message::from_armor_single(armored).unwrap();
        match msg {
            Message::Encrypted { edata, .. } => match edata {
                Edata::SymEncryptedProtectedData(seipd) => seipd.version(),
                Edata::SymEncryptedData(_) => panic!("non-protected encrypted data"),
            },
            _ => panic!("expected Encrypted message"),
        }
    }

    #[test]
    fn test_encrypt_emits_seipdv1_for_compat() {
        // Even for modern (ECDH/X25519) recipients we emit SEIPDv1, not
        // SEIPDv2/AEAD. SEIPDv2 produces v6-format ciphertext that many clients
        // (e.g. Proton) cannot decrypt, surfacing as unreadable PGP armor.
        let recipient = generate_keypair("Modern", "modern@astermail.com").unwrap();
        let public = recipient.public_key();

        let plaintext = b"modern recipient message";
        let ciphertext = encrypt_message(plaintext, &[&public]).unwrap();

        assert_eq!(seipd_version(&ciphertext), 1);

        let decrypted = decrypt_message(&ciphertext, &[&recipient]).unwrap();
        assert_eq!(plaintext.as_slice(), decrypted.as_slice());
    }

    #[test]
    fn a_v4_recipient_never_gets_aead_ciphertext() {
        for algo in [
            PublicKeyAlgorithm::ECDH,
            PublicKeyAlgorithm::X25519,
            PublicKeyAlgorithm::X448,
            PublicKeyAlgorithm::RSA,
        ] {
            assert!(!subkey_supports_seipdv2(KeyVersion::V4, algo));
        }
    }

    #[test]
    fn a_v6_recipient_with_an_aead_algorithm_gets_seipdv2() {
        assert!(subkey_supports_seipdv2(
            KeyVersion::V6,
            PublicKeyAlgorithm::X25519
        ));
        assert!(!subkey_supports_seipdv2(
            KeyVersion::V6,
            PublicKeyAlgorithm::RSA
        ));
    }

    #[test]
    fn the_capability_check_is_used_rather_than_discarded() {
        assert!(all_capabilities_support_seipdv2(&[(
            KeyVersion::V6,
            PublicKeyAlgorithm::X25519
        )]));
        assert!(!all_capabilities_support_seipdv2(&[]));
    }

    #[test]
    fn one_v4_recipient_holds_the_whole_message_at_seipdv1() {
        let caps = [
            (KeyVersion::V6, PublicKeyAlgorithm::X25519),
            (KeyVersion::V4, PublicKeyAlgorithm::X25519),
        ];
        assert!(!all_capabilities_support_seipdv2(&caps));
    }

    #[test]
    fn test_legacy_rsa_recipient_uses_seipdv1() {
        let legacy = generate_legacy_rsa_keypair("Legacy", "legacy@astermail.com").unwrap();
        let public = legacy.public_key();

        let plaintext = b"message for rsa-only recipient";
        let ciphertext = encrypt_message(plaintext, &[&public]).unwrap();

        assert_eq!(seipd_version(&ciphertext), 1);

        let decrypted = decrypt_message(&ciphertext, &[&legacy]).unwrap();
        assert_eq!(plaintext.as_slice(), decrypted.as_slice());
    }

    #[test]
    fn test_mixed_modern_and_legacy_falls_back_to_seipdv1() {
        let modern = generate_keypair("Modern", "modern@astermail.com").unwrap();
        let legacy = generate_legacy_rsa_keypair("Legacy", "legacy@astermail.com").unwrap();
        let modern_pub = modern.public_key();
        let legacy_pub = legacy.public_key();

        let plaintext = b"mixed recipients";
        let ciphertext = encrypt_message(plaintext, &[&modern_pub, &legacy_pub]).unwrap();

        assert_eq!(seipd_version(&ciphertext), 1);

        let decrypted_modern = decrypt_message(&ciphertext, &[&modern]).unwrap();
        assert_eq!(plaintext.as_slice(), decrypted_modern.as_slice());
        let decrypted_legacy = decrypt_message(&ciphertext, &[&legacy]).unwrap();
        assert_eq!(plaintext.as_slice(), decrypted_legacy.as_slice());
    }

    #[test]
    fn test_decrypt_legacy_seipdv1() {
        let legacy = generate_legacy_rsa_keypair("Legacy", "legacy@astermail.com").unwrap();
        let armored_public = legacy.public_key_armored().unwrap();
        let standalone_public = crate::keys::import_public_key(&armored_public).unwrap();

        let recipients = [&standalone_public];
        let public_keys = collect_recipient_public_keys(&recipients);
        let subkeys: Vec<&SignedPublicSubKey> = public_keys
            .iter()
            .map(|pk| select_public_encryption_subkey(pk).unwrap())
            .collect();
        let msg = Message::new_literal_bytes("", b"explicit seipdv1 ciphertext");
        let encrypted = encrypt_to_public_subkeys(&msg, &subkeys, false).unwrap();
        let armored = encrypted.to_armored_bytes(None.into()).unwrap();

        assert_eq!(seipd_version(&armored), 1);

        let decrypted = decrypt_message(&armored, &[&legacy]).unwrap();
        assert_eq!(
            b"explicit seipdv1 ciphertext".as_slice(),
            decrypted.as_slice()
        );
    }
}
