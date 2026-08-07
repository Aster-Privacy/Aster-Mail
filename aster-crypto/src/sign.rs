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
use chrono::{DateTime, Utc};
use pgp::composed::{
    Deserializable, Message, SignedPublicKey, SignedPublicSubKey, SignedSecretKey,
    StandaloneSignature,
};
use pgp::crypto::hash::HashAlgorithm;
use pgp::packet::SignatureType;
use rand::rngs::OsRng;

use crate::error::{CryptoError, Result};
use crate::keys::{KeyPair, PublicKey, PublicKeyInner};

fn primary_is_revoked(spk: &SignedPublicKey) -> bool {
    spk.details
        .revocation_signatures
        .iter()
        .any(|s| matches!(s.typ(), SignatureType::KeyRevocation))
}

fn primary_is_expired(spk: &SignedPublicKey, now: DateTime<Utc>) -> bool {
    spk.expires_at().map(|e| e <= now).unwrap_or(false)
}

fn subkey_is_revoked(sub: &SignedPublicSubKey) -> bool {
    sub.signatures
        .iter()
        .any(|s| matches!(s.typ(), SignatureType::SubkeyRevocation))
}

fn subkey_is_expired(sub: &SignedPublicSubKey, now: DateTime<Utc>) -> bool {
    let created = *pgp::types::PublicKeyTrait::created_at(&sub.key);
    match sub
        .signatures
        .iter()
        .filter(|s| matches!(s.typ(), SignatureType::SubkeyBinding))
        .filter_map(|s| s.key_expiration_time().copied())
        .max()
    {
        Some(duration) => created + duration <= now,
        None => false,
    }
}

fn subkey_valid_for_signing(sub: &SignedPublicSubKey, now: DateTime<Utc>) -> bool {
    !subkey_is_revoked(sub) && !subkey_is_expired(sub, now)
}

pub(crate) fn signing_identity_valid(spk: &SignedPublicKey, now: DateTime<Utc>) -> bool {
    !primary_is_revoked(spk) && !primary_is_expired(spk, now)
}

pub(crate) fn signed_secret_signing_identity_valid(
    ssk: &SignedSecretKey,
    now: DateTime<Utc>,
) -> bool {
    let spk: SignedPublicKey = ssk.clone().into();
    signing_identity_valid(&spk, now)
}

pub fn verify_detached_signature(
    identity_key_armored: &[u8],
    data: &[u8],
    signature_bytes: &[u8],
) -> Result<bool> {
    const MAX_DETACHED_INPUT_BYTES: usize = 16 * 1024 * 1024;
    if identity_key_armored.len() > MAX_DETACHED_INPUT_BYTES
        || data.len() > MAX_DETACHED_INPUT_BYTES
        || signature_bytes.len() > MAX_DETACHED_INPUT_BYTES
    {
        return Ok(false);
    }

    let key_str = std::str::from_utf8(identity_key_armored)
        .map_err(|e| CryptoError::InvalidKeyFormat(e.to_string()))?;
    let (signed_pub_key, _) = SignedPublicKey::from_string(key_str)
        .map_err(|e| CryptoError::InvalidKeyFormat(e.to_string()))?;

    let now = Utc::now();
    if !signing_identity_valid(&signed_pub_key, now) {
        return Ok(false);
    }

    let standalone_sig = parse_standalone_signature(signature_bytes)?;
    let sig = &standalone_sig.signature;

    let primary_sigs = signed_pub_key
        .details
        .users
        .iter()
        .flat_map(|u| u.signatures.iter())
        .chain(signed_pub_key.details.direct_signatures.iter());
    let mut primary_has_flags = false;
    let mut primary_can_sign = false;
    for s in primary_sigs {
        let f = s.key_flags();
        if f.sign() || f.certify() || f.encrypt_comms() || f.encrypt_storage() || f.authentication()
        {
            primary_has_flags = true;
        }
        if f.sign() {
            primary_can_sign = true;
        }
    }
    if (!primary_has_flags || primary_can_sign) && sig.verify(&signed_pub_key, data).is_ok() {
        return Ok(true);
    }
    for sub in &signed_pub_key.public_subkeys {
        let mut sub_has_flags = false;
        let mut sub_can_sign = false;
        for s in &sub.signatures {
            let f = s.key_flags();
            if f.sign()
                || f.certify()
                || f.encrypt_comms()
                || f.encrypt_storage()
                || f.authentication()
            {
                sub_has_flags = true;
            }
            if f.sign() {
                sub_can_sign = true;
            }
        }
        if sub_has_flags && !sub_can_sign {
            continue;
        }
        if !subkey_valid_for_signing(sub, now) {
            continue;
        }
        if sig.verify(&sub.key, data).is_ok() {
            return Ok(true);
        }
    }
    Ok(false)
}

fn parse_standalone_signature(bytes: &[u8]) -> Result<StandaloneSignature> {
    if let Ok(s) = std::str::from_utf8(bytes) {
        if let Ok((sig, _)) = StandaloneSignature::from_string(s) {
            return Ok(sig);
        }
    }
    let sig = StandaloneSignature::from_bytes(std::io::Cursor::new(bytes))
        .map_err(|e| CryptoError::SignatureVerification(e.to_string()))?;
    Ok(sig)
}

pub fn sign_message(message: &[u8], signer: &KeyPair) -> Result<Vec<u8>> {
    let msg = Message::new_literal_bytes("", message);

    let signed = msg
        .sign(
            &mut OsRng,
            signer.secret_key(),
            || "".to_string(),
            HashAlgorithm::SHA2_512,
        )
        .map_err(|e: pgp::errors::Error| CryptoError::Signing(e.to_string()))?;

    let armored = signed
        .to_armored_bytes(None.into())
        .map_err(|e: pgp::errors::Error| CryptoError::Signing(e.to_string()))?;

    Ok(armored)
}

pub(crate) fn signed_public_key_can_sign(spk: &SignedPublicKey) -> bool {
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
        if f.sign() || f.certify() || f.encrypt_comms() || f.encrypt_storage() || f.authentication()
        {
            primary_has_flags = true;
        }
        if f.sign() {
            primary_can_sign = true;
        }
    }
    if !primary_has_flags || primary_can_sign {
        return true;
    }
    let now = Utc::now();
    for sub in &spk.public_subkeys {
        let mut sub_has_flags = false;
        let mut sub_can_sign = false;
        for s in &sub.signatures {
            let f = s.key_flags();
            if f.sign()
                || f.certify()
                || f.encrypt_comms()
                || f.encrypt_storage()
                || f.authentication()
            {
                sub_has_flags = true;
            }
            if f.sign() {
                sub_can_sign = true;
            }
        }
        if (!sub_has_flags || sub_can_sign) && subkey_valid_for_signing(sub, now) {
            return true;
        }
    }
    false
}

pub(crate) fn signed_secret_key_can_sign(ssk: &SignedSecretKey) -> bool {
    let spk: SignedPublicKey = ssk.clone().into();
    signed_public_key_can_sign(&spk)
}

pub fn verify_signature(signed_message: &[u8], signer_keys: &[&PublicKey]) -> Result<Vec<u8>> {
    let (msg, _) = Message::from_armor_single(signed_message)
        .map_err(|e| CryptoError::SignatureVerification(e.to_string()))?;

    let now = Utc::now();
    for pk in signer_keys {
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
    fn test_verify_signature_accepts_implicit_signing_primary() {
        let signer = generate_keypair("Signer", "signer@astermail.com").unwrap();
        let spk: SignedPublicKey = signer.secret_key().clone().into();
        let primary_sigs = spk
            .details
            .users
            .iter()
            .flat_map(|u| u.signatures.iter())
            .chain(spk.details.direct_signatures.iter());
        let mut has_explicit_flags = false;
        for s in primary_sigs {
            let f = s.key_flags();
            if f.sign()
                || f.certify()
                || f.encrypt_comms()
                || f.encrypt_storage()
                || f.authentication()
            {
                has_explicit_flags = true;
            }
        }
        if has_explicit_flags {
            return;
        }
        let message = b"implicit signing primary";
        let signed = sign_message(message, &signer).unwrap();
        let public = signer.public_key();
        let verified = verify_signature(&signed, &[&public]).unwrap();
        assert_eq!(message.as_slice(), verified.as_slice());
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

    #[test]
    fn signing_identity_valid_accepts_generated_key() {
        let signer = generate_keypair("Signer", "signer@astermail.com").unwrap();
        let spk: SignedPublicKey = signer.secret_key().clone().into();
        let now = Utc::now();

        assert!(signing_identity_valid(&spk, now));
        assert!(signing_identity_valid(
            &spk,
            now + chrono::Duration::days(3650)
        ));
        assert!(!primary_is_revoked(&spk));
        assert!(!primary_is_expired(
            &spk,
            now + chrono::Duration::days(3650)
        ));
    }

    #[test]
    fn valid_key_still_verifies_after_gate() {
        let signer = generate_keypair("Signer", "signer@astermail.com").unwrap();
        let public = signer.public_key();

        let message = b"gated but valid";
        let signed = sign_message(message, &signer).unwrap();

        let verified = verify_signature(&signed, &[&public]).unwrap();
        assert_eq!(message.as_slice(), verified.as_slice());
    }

    const OPENPGPJS_DETACHED_PUBLIC_KEY: &str = "-----BEGIN PGP PUBLIC KEY BLOCK-----\n\nxjMEamJfdhYJKwYBBAHaRw8BAQdALtG5v9chUwLrZ+pkRlDV4tbtsc2kK5xf\n87AfV1RokdTNG1JvdGF0b3IgPHJvdEBhc3Rlcm1haWwub3JnPsLAEwQTFgoA\nhQWCamJfdgMLCQcJEIuCasej7nvXRRQAAAAAABwAIHNhbHRAbm90YXRpb25z\nLm9wZW5wZ3Bqcy5vcmcZz//n21xuqk98LC0MPDPjTTVujyKk3cuKHbXDUDUQ\n0wUVCggODAQWAAIBAhkBApsDAh4BFiEEhlIo54nQiV28eP7ei4Jqx6Pue9cA\nAN+GAQDCEYwickPub42kKH5EIzsoqeP+BitkJX6/j0m41nEVNQD9Gv4C4Rsq\n9ux7PY7i8HkLc/PFfE5yC30+2uLfiXN+JgjOOARqYl92EgorBgEEAZdVAQUB\nAQdA5S3J9q6mAqm6dfED0jqz3BRw5NW6FTK8vXC1mrkLrT4DAQgHwr4EGBYK\nAHAFgmpiX3YJEIuCasej7nvXRRQAAAAAABwAIHNhbHRAbm90YXRpb25zLm9w\nZW5wZ3Bqcy5vcmccdTLh5sVvJZCyjBI9va7DLdJ1eguI/K1BrSpu0sBtJQKb\nDBYhBIZSKOeJ0IldvHj+3ouCasej7nvXAAAqJgEAs6cQztyaafh+HQu+4nD+\n3s8MPJED+w2h80bHgi86tZgA/RZr41jTbjx57BFZ6EFNLscpMVfCMzmir/BT\nKS5/cS8K\n=Y5aB\n-----END PGP PUBLIC KEY BLOCK-----\n";

    const OPENPGPJS_DETACHED_DATA: &str = "-----BEGIN PGP PUBLIC KEY BLOCK-----\nNEW-IDENTITY-KEY-PLACEHOLDER\n-----END PGP PUBLIC KEY BLOCK-----\n";

    const OPENPGPJS_DETACHED_SIGNATURE: &str = "-----BEGIN PGP SIGNATURE-----\n\nwrsEABYKAG0FgmpiX3YJEIuCasej7nvXRRQAAAAAABwAIHNhbHRAbm90YXRp\nb25zLm9wZW5wZ3Bqcy5vcmcE/nMwvFLjOKYm7j6aA5Fn29+l55nqA2h7kHd8\n6cdhXRYhBIZSKOeJ0IldvHj+3ouCasej7nvXAAAnqQD/dklR9rUp4a31irzE\nIoQXCgRp8mMMNDidUCqSMli+4zgBAJMpmpbiJWKM+8smyc4SDJodyqhVREFI\ntdKj8dYGxa4K\n=eIKz\n-----END PGP SIGNATURE-----\n";

    #[test]
    fn verifies_openpgpjs_generated_detached_signature() {
        let verified = verify_detached_signature(
            OPENPGPJS_DETACHED_PUBLIC_KEY.as_bytes(),
            OPENPGPJS_DETACHED_DATA.as_bytes(),
            OPENPGPJS_DETACHED_SIGNATURE.as_bytes(),
        )
        .unwrap();
        assert!(verified);
    }

    #[test]
    fn rejects_openpgpjs_detached_signature_over_tampered_data() {
        let mut tampered = OPENPGPJS_DETACHED_DATA.as_bytes().to_vec();
        tampered[40] ^= 0x01;
        let verified = verify_detached_signature(
            OPENPGPJS_DETACHED_PUBLIC_KEY.as_bytes(),
            &tampered,
            OPENPGPJS_DETACHED_SIGNATURE.as_bytes(),
        )
        .unwrap();
        assert!(!verified);
    }

    #[test]
    fn rejects_openpgpjs_detached_signature_from_wrong_key() {
        let other = generate_keypair("Other", "other@astermail.com").unwrap();
        let other_public = other.public_key_armored().unwrap();
        let verified = verify_detached_signature(
            other_public.as_bytes(),
            OPENPGPJS_DETACHED_DATA.as_bytes(),
            OPENPGPJS_DETACHED_SIGNATURE.as_bytes(),
        )
        .unwrap();
        assert!(!verified);
    }
}
