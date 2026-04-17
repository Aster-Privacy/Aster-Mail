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
use pgp::composed::{Message, SignedPublicKey, SignedSecretKey};
use pgp::crypto::{hash::HashAlgorithm, sym::SymmetricKeyAlgorithm};
use pgp::ser::Serialize;
use rand::rngs::OsRng;

use crate::error::{CryptoError, Result};
use crate::keys::{KeyPair, PublicKey, PublicKeyInner};

fn collect_recipient_keys<'a>(
    recipients: &'a [&'a PublicKey],
) -> (Vec<&'a SignedPublicKey>, Vec<&'a SignedSecretKey>) {
    let mut public_keys = Vec::new();
    let mut secret_keys = Vec::new();

    for pk in recipients {
        match &pk.inner {
            PublicKeyInner::Standalone(spk) => public_keys.push(spk),
            PublicKeyInner::FromSecret(ssk) => secret_keys.push(ssk),
        }
    }

    (public_keys, secret_keys)
}

pub fn encrypt_message(plaintext: &[u8], recipients: &[&PublicKey]) -> Result<Vec<u8>> {
    if recipients.is_empty() {
        return Err(CryptoError::NoValidRecipient);
    }

    let (public_keys, secret_keys) = collect_recipient_keys(recipients);

    let msg = Message::new_literal_bytes("", plaintext);

    let encrypted = if !public_keys.is_empty() && secret_keys.is_empty() {
        msg.encrypt_to_keys_seipdv1(&mut OsRng, SymmetricKeyAlgorithm::AES256, &public_keys)
            .map_err(|e: pgp::errors::Error| CryptoError::Encryption(e.to_string()))?
    } else if public_keys.is_empty() && !secret_keys.is_empty() {
        msg.encrypt_to_keys_seipdv1(&mut OsRng, SymmetricKeyAlgorithm::AES256, &secret_keys)
            .map_err(|e: pgp::errors::Error| CryptoError::Encryption(e.to_string()))?
    } else {
        return Err(CryptoError::Encryption(
            "Mixed public key types not supported - use all standalone or all derived keys".into(),
        ));
    };

    let armored = encrypted
        .to_armored_bytes(None.into())
        .map_err(|e: pgp::errors::Error| CryptoError::Encryption(e.to_string()))?;

    Ok(armored)
}

pub fn encrypt_message_binary(plaintext: &[u8], recipients: &[&PublicKey]) -> Result<Vec<u8>> {
    if recipients.is_empty() {
        return Err(CryptoError::NoValidRecipient);
    }

    let (public_keys, secret_keys) = collect_recipient_keys(recipients);

    let msg = Message::new_literal_bytes("", plaintext);

    let encrypted = if !public_keys.is_empty() && secret_keys.is_empty() {
        msg.encrypt_to_keys_seipdv1(&mut OsRng, SymmetricKeyAlgorithm::AES256, &public_keys)
            .map_err(|e: pgp::errors::Error| CryptoError::Encryption(e.to_string()))?
    } else if public_keys.is_empty() && !secret_keys.is_empty() {
        msg.encrypt_to_keys_seipdv1(&mut OsRng, SymmetricKeyAlgorithm::AES256, &secret_keys)
            .map_err(|e: pgp::errors::Error| CryptoError::Encryption(e.to_string()))?
    } else {
        return Err(CryptoError::Encryption(
            "Mixed public key types not supported - use all standalone or all derived keys".into(),
        ));
    };

    Serialize::to_bytes(&encrypted)
        .map_err(|e: pgp::errors::Error| CryptoError::Encryption(e.to_string()))
}

pub fn encrypt_and_sign(
    plaintext: &[u8],
    recipients: &[&PublicKey],
    signer: &KeyPair,
) -> Result<Vec<u8>> {
    if recipients.is_empty() {
        return Err(CryptoError::NoValidRecipient);
    }

    let (public_keys, secret_keys) = collect_recipient_keys(recipients);

    let msg = Message::new_literal_bytes("", plaintext);

    let signed = msg
        .sign(
            &mut OsRng,
            signer.secret_key(),
            || "".to_string(),
            HashAlgorithm::SHA2_256,
        )
        .map_err(|e: pgp::errors::Error| CryptoError::Signing(e.to_string()))?;

    let encrypted = if !public_keys.is_empty() && secret_keys.is_empty() {
        signed
            .encrypt_to_keys_seipdv1(&mut OsRng, SymmetricKeyAlgorithm::AES256, &public_keys)
            .map_err(|e: pgp::errors::Error| CryptoError::Encryption(e.to_string()))?
    } else if public_keys.is_empty() && !secret_keys.is_empty() {
        signed
            .encrypt_to_keys_seipdv1(&mut OsRng, SymmetricKeyAlgorithm::AES256, &secret_keys)
            .map_err(|e: pgp::errors::Error| CryptoError::Encryption(e.to_string()))?
    } else {
        return Err(CryptoError::Encryption(
            "Mixed public key types not supported - use all standalone or all derived keys".into(),
        ));
    };

    let armored = encrypted
        .to_armored_bytes(None.into())
        .map_err(|e: pgp::errors::Error| CryptoError::Encryption(e.to_string()))?;

    Ok(armored)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::keys::generate_keypair;

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
}
