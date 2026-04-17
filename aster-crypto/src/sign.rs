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
use pgp::crypto::hash::HashAlgorithm;
use rand::rngs::OsRng;

use crate::error::{CryptoError, Result};
use crate::keys::{KeyPair, PublicKey, PublicKeyInner};

pub fn sign_message(message: &[u8], signer: &KeyPair) -> Result<Vec<u8>> {
    let msg = Message::new_literal_bytes("", message);

    let signed = msg
        .sign(
            &mut OsRng,
            signer.secret_key(),
            || "".to_string(),
            HashAlgorithm::SHA2_256,
        )
        .map_err(|e: pgp::errors::Error| CryptoError::Signing(e.to_string()))?;

    let armored = signed
        .to_armored_bytes(None.into())
        .map_err(|e: pgp::errors::Error| CryptoError::Signing(e.to_string()))?;

    Ok(armored)
}

pub fn verify_signature(signed_message: &[u8], signer_keys: &[&PublicKey]) -> Result<Vec<u8>> {
    let (msg, _) = Message::from_armor_single(signed_message)
        .map_err(|e| CryptoError::SignatureVerification(e.to_string()))?;

    for pk in signer_keys {
        let verified = match &pk.inner {
            PublicKeyInner::Standalone(spk) => msg.verify(spk).is_ok(),
            PublicKeyInner::FromSecret(ssk) => msg.verify(ssk).is_ok(),
        };
        if verified {
            if let Some(literal) = msg.get_literal() {
                return Ok(literal.data().to_vec());
            }
        }
    }

    Err(CryptoError::SignatureVerification(
        "No valid signature found".into(),
    ))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::keys::generate_keypair;

    #[test]
    fn test_sign_and_verify() {
        let signer = generate_keypair("Signer", "signer@astermail.com").unwrap();
        let public = signer.public_key();

        let message = b"This message is signed!";
        let signed = sign_message(message, &signer).unwrap();

        let verified_content = verify_signature(&signed, &[&public]).unwrap();
        assert_eq!(message.as_slice(), verified_content.as_slice());
    }

    #[test]
    fn test_wrong_key_verification_fails() {
        let signer = generate_keypair("Signer", "signer@astermail.com").unwrap();
        let other = generate_keypair("Other", "other@astermail.com").unwrap();
        let other_public = other.public_key();

        let message = b"This message is signed by signer";
        let signed = sign_message(message, &signer).unwrap();

        let result = verify_signature(&signed, &[&other_public]);
        assert!(result.is_err());
    }
}
