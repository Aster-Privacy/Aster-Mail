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
use pgp::composed::{Deserializable, Message, SignedPublicKey, SignedSecretKey};
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

fn signed_public_key_can_sign(spk: &SignedPublicKey) -> bool {
    let primary_sigs = spk
        .details
        .users
        .iter()
        .flat_map(|u| u.signatures.iter())
        .chain(spk.details.direct_signatures.iter());
    let mut primary_has_flags = false;
    let mut primary_can_sign = false;
    for s in primary_sigs {
        let f = s.key_flags();
        if f.sign() || f.certify() || f.encrypt_comms() || f.encrypt_storage() || f.authentication() {
            primary_has_flags = true;
        }
        if f.sign() {
            primary_can_sign = true;
        }
    }
    if !primary_has_flags || primary_can_sign {
        return true;
    }
    for sub in &spk.public_subkeys {
        let mut sub_has_flags = false;
        let mut sub_can_sign = false;
        for s in &sub.signatures {
            let f = s.key_flags();
            if f.sign() || f.certify() || f.encrypt_comms() || f.encrypt_storage() || f.authentication() {
                sub_has_flags = true;
            }
            if f.sign() {
                sub_can_sign = true;
            }
        }
        if !sub_has_flags || sub_can_sign {
            return true;
        }
    }
    false
}

fn signed_secret_key_can_sign(ssk: &SignedSecretKey) -> bool {
    let spk: SignedPublicKey = ssk.clone().into();
    signed_public_key_can_sign(&spk)
}

pub fn verify_signature(signed_message: &[u8], signer_keys: &[&PublicKey]) -> Result<Vec<u8>> {
    let (msg, _) = Message::from_armor_single(signed_message)
        .map_err(|e| CryptoError::SignatureVerification(e.to_string()))?;

    for pk in signer_keys {
        let verified = match &pk.inner {
            PublicKeyInner::Standalone(spk) => {
                signed_public_key_can_sign(spk) && msg.verify(spk).is_ok()
            }
            PublicKeyInner::FromSecret(ssk) => {
                signed_secret_key_can_sign(ssk) && msg.verify(ssk).is_ok()
            }
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
    use crate::keys::{generate_keypair, KeyPair};
    use pgp::composed::{KeyType, SecretKeyParamsBuilder};
    use rand::rngs::OsRng;
    use smallvec::smallvec;

    fn generate_non_signing_keypair(name: &str, email: &str) -> KeyPair {
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
    fn test_sign_and_verify() {
        let signer = generate_keypair("Signer", "signer@astermail.com").unwrap();
        let public = signer.public_key();

        let message = b"This message is signed!";
        let signed = sign_message(message, &signer).unwrap();

        let verified_content = verify_signature(&signed, &[&public]).unwrap();
        assert_eq!(message.as_slice(), verified_content.as_slice());
    }

    #[test]
    fn test_signing_capable_key_still_verifies() {
        let signer = generate_keypair("Signer", "signer@astermail.com").unwrap();
        let public = signer.public_key();

        let message = b"signing capable key must keep working";
        let signed = sign_message(message, &signer).unwrap();

        let verified = verify_signature(&signed, &[&public]).unwrap();
        assert_eq!(message.as_slice(), verified.as_slice());
    }

    #[test]
    fn test_non_signing_key_rejected() {
        let signer = generate_non_signing_keypair("NoSign", "nosign@astermail.com");
        let public = signer.public_key();

        let message = b"signature from a key forbidden to sign";
        let signed = sign_message(message, &signer).unwrap();

        let result = verify_signature(&signed, &[&public]);
        assert!(result.is_err());
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
