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
use pgp::composed::cleartext::CleartextSignedMessage;
use pgp::composed::{
    Deserializable, Message, SignedPublicKey, SignedPublicSubKey, StandaloneSignature,
};
use pgp::crypto::hash::HashAlgorithm;
use pgp::packet::{Signature, SignatureType};
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

fn newest_verified_binding<'a>(
    spk: &SignedPublicKey,
    sub: &'a SignedPublicSubKey,
) -> Option<&'a Signature> {
    sub.signatures
        .iter()
        .filter(|s| matches!(s.typ(), SignatureType::SubkeyBinding))
        .filter(|s| s.verify_key_binding(&spk.primary_key, &sub.key).is_ok())
        .max_by_key(|s| s.created().copied())
}

pub(crate) fn binding_has_backsig(
    spk: &SignedPublicKey,
    sub: &SignedPublicSubKey,
    binding: &Signature,
) -> bool {
    binding
        .embedded_signature()
        .map(|emb| {
            matches!(emb.typ(), SignatureType::KeyBinding)
                && emb
                    .verify_backwards_key_binding(&sub.key, &spk.primary_key)
                    .is_ok()
        })
        .unwrap_or(false)
}

fn subkey_signing_bound(
    spk: &SignedPublicKey,
    sub: &SignedPublicSubKey,
    now: DateTime<Utc>,
) -> bool {
    if subkey_is_revoked(sub) {
        return false;
    }
    let Some(binding) = newest_verified_binding(spk, sub) else {
        return false;
    };
    if !binding.key_flags().sign() || !binding_has_backsig(spk, sub, binding) {
        return false;
    }
    let created = *pgp::types::PublicKeyTrait::created_at(&sub.key);
    match binding.key_expiration_time() {
        Some(duration) if !duration.is_zero() => created + *duration > now,
        _ => true,
    }
}

pub(crate) fn signing_identity_valid(spk: &SignedPublicKey, now: DateTime<Utc>) -> bool {
    !primary_is_revoked(spk) && !primary_is_expired(spk, now)
}

fn primary_may_sign(spk: &SignedPublicKey) -> bool {
    let mut has_flags = false;
    let mut can_sign = false;

    let primary_sigs = spk
        .details
        .users
        .iter()
        .flat_map(|u| u.signatures.iter())
        .chain(spk.details.direct_signatures.iter());

    for s in primary_sigs {
        let f = s.key_flags();
        if f.sign() || f.certify() || f.encrypt_comms() || f.encrypt_storage() || f.authentication()
        {
            has_flags = true;
        }
        if f.sign() {
            can_sign = true;
        }
    }

    !has_flags || can_sign
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

    if primary_may_sign(&signed_pub_key) && sig.verify(&signed_pub_key, data).is_ok() {
        return Ok(true);
    }
    for sub in &signed_pub_key.public_subkeys {
        if !subkey_signing_bound(&signed_pub_key, sub, now) {
            continue;
        }
        if sig.verify(&sub.key, data).is_ok() {
            return Ok(true);
        }
    }
    Ok(false)
}

pub fn detached_signature_issuer_key_id(signature_bytes: &[u8]) -> Option<String> {
    let standalone_sig = parse_standalone_signature(signature_bytes).ok()?;
    let issuers = standalone_sig.signature.issuer();
    let issuer = issuers.first()?;

    Some(
        issuer
            .as_ref()
            .iter()
            .map(|b| format!("{b:02X}"))
            .collect::<String>(),
    )
}

pub fn public_key_fingerprint_hex(armored_public_key: &[u8]) -> Option<String> {
    let key_str = std::str::from_utf8(armored_public_key).ok()?;
    let (signed_pub_key, _) = SignedPublicKey::from_string(key_str).ok()?;

    Some(
        pgp::types::PublicKeyTrait::fingerprint(&signed_pub_key.primary_key)
            .as_bytes()
            .iter()
            .map(|b| format!("{b:02X}"))
            .collect::<String>(),
    )
}

pub fn sign_cleartext_message(text: &str, signer: &KeyPair) -> Result<String> {
    CleartextSignedMessage::sign(&mut OsRng, text, signer.secret_key(), || "".to_string())
        .map_err(|e: pgp::errors::Error| CryptoError::Signing(e.to_string()))?
        .to_armored_string(Default::default())
        .map_err(|e: pgp::errors::Error| CryptoError::Signing(e.to_string()))
}

pub fn verify_cleartext_signature(
    identity_key_armored: &str,
    armored_message: &str,
) -> Result<Option<String>> {
    const MAX_CLEARTEXT_INPUT_BYTES: usize = 1024 * 1024;

    if identity_key_armored.len() > MAX_CLEARTEXT_INPUT_BYTES
        || armored_message.len() > MAX_CLEARTEXT_INPUT_BYTES
    {
        return Ok(None);
    }

    let (signed_pub_key, _) = SignedPublicKey::from_string(identity_key_armored)
        .map_err(|e| CryptoError::InvalidKeyFormat(e.to_string()))?;

    let now = Utc::now();
    if !signing_identity_valid(&signed_pub_key, now) {
        return Ok(None);
    }

    let (message, _) = CleartextSignedMessage::from_string(armored_message)
        .map_err(|e| CryptoError::SignatureVerification(e.to_string()))?;

    if primary_may_sign(&signed_pub_key) && message.verify(&signed_pub_key).is_ok() {
        return Ok(Some(message.signed_text()));
    }

    for sub in &signed_pub_key.public_subkeys {
        if !subkey_signing_bound(&signed_pub_key, sub, now) {
            continue;
        }
        if message.verify(&sub.key).is_ok() {
            return Ok(Some(message.signed_text()));
        }
    }

    Ok(None)
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

pub(crate) fn message_signed_by(msg: &Message, spk: &SignedPublicKey, now: DateTime<Utc>) -> bool {
    if !signing_identity_valid(spk, now) {
        return false;
    }
    if primary_may_sign(spk) && msg.verify(spk).is_ok() {
        return true;
    }
    spk.public_subkeys
        .iter()
        .any(|sub| subkey_signing_bound(spk, sub, now) && msg.verify(&sub.key).is_ok())
}

pub(crate) fn message_signed_by_public_key(
    msg: &Message,
    pk: &PublicKey,
    now: DateTime<Utc>,
) -> bool {
    match &pk.inner {
        PublicKeyInner::Standalone(spk) => message_signed_by(msg, spk, now),
        PublicKeyInner::FromSecret(ssk) => {
            let spk: SignedPublicKey = ssk.clone().into();
            message_signed_by(msg, &spk, now)
        }
    }
}

pub fn verify_signature(signed_message: &[u8], signer_keys: &[&PublicKey]) -> Result<Vec<u8>> {
    let (msg, _) = Message::from_armor_single(signed_message)
        .map_err(|e| CryptoError::SignatureVerification(e.to_string()))?;

    let now = Utc::now();
    for pk in signer_keys {
        if message_signed_by_public_key(&msg, pk, now) {
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
pub(crate) mod subkey_fixtures {
    use chrono::{SubsecRound, Utc};
    use pgp::composed::{
        KeyType, Message, SecretKeyParamsBuilder, SignedPublicKey, SignedSecretKey,
        SubkeyParamsBuilder,
    };
    use pgp::crypto::ecc_curve::ECCCurve;
    use pgp::crypto::hash::HashAlgorithm;
    use pgp::packet::{Signature, SignatureConfig, SignatureType, Subpacket, SubpacketData};
    use pgp::types::{PublicKeyTrait, SecretKeyTrait};
    use rand::rngs::OsRng;

    pub fn signing_subkey_secret() -> SignedSecretKey {
        let mut encrypt = SubkeyParamsBuilder::default();
        encrypt
            .key_type(KeyType::ECDH(ECCCurve::Curve25519))
            .can_encrypt(true);
        let mut sign = SubkeyParamsBuilder::default();
        sign.key_type(KeyType::EdDSALegacy).can_sign(true);
        SecretKeyParamsBuilder::default()
            .key_type(KeyType::EdDSALegacy)
            .can_certify(true)
            .can_sign(false)
            .primary_user_id("Outside Owner <owner@astermail.org>".into())
            .subkey(encrypt.build().unwrap())
            .subkey(sign.build().unwrap())
            .build()
            .unwrap()
            .generate(OsRng)
            .unwrap()
            .sign(OsRng, || "".to_string())
            .unwrap()
    }

    fn back_signature(
        primary: &impl PublicKeyTrait,
        sub_public: &impl PublicKeyTrait,
        sub_secret: &impl SecretKeyTrait,
    ) -> Signature {
        let mut config = SignatureConfig::v4(
            SignatureType::KeyBinding,
            sub_secret.algorithm(),
            HashAlgorithm::SHA2_256,
        );
        config.hashed_subpackets = vec![
            Subpacket::regular(SubpacketData::SignatureCreationTime(
                Utc::now().trunc_subsecs(0),
            )),
            Subpacket::regular(SubpacketData::IssuerFingerprint(sub_secret.fingerprint())),
        ];
        let mut hasher = HashAlgorithm::SHA2_256.new_hasher().unwrap();
        primary.serialize_for_hashing(&mut hasher).unwrap();
        sub_public.serialize_for_hashing(&mut hasher).unwrap();
        let len = config.hash_signature_data(&mut hasher).unwrap();
        hasher.update(&config.trailer(len).unwrap());
        let hash = hasher.finish();
        let signed_hash_value = [hash[0], hash[1]];
        let bytes = sub_secret
            .create_signature(|| "".to_string(), HashAlgorithm::SHA2_256, &hash)
            .unwrap();
        Signature::from_config(config, signed_hash_value, bytes)
    }

    pub fn public_with_signing_subkey(
        secret: &SignedSecretKey,
        with_backsig: bool,
    ) -> SignedPublicKey {
        let mut public = secret
            .public_key()
            .sign(OsRng, secret, || "".to_string())
            .unwrap();
        if !with_backsig {
            return public;
        }
        let backsig = back_signature(
            &public.primary_key,
            &public.public_subkeys[1].key,
            &secret.secret_subkeys[1],
        );
        let mut config = SignatureConfig::v4(
            SignatureType::SubkeyBinding,
            secret.algorithm(),
            HashAlgorithm::SHA2_256,
        );
        config.hashed_subpackets = vec![
            Subpacket::regular(SubpacketData::SignatureCreationTime(
                Utc::now().trunc_subsecs(0),
            )),
            Subpacket::regular(SubpacketData::KeyFlags(vec![0x02u8].into())),
            Subpacket::regular(SubpacketData::IssuerFingerprint(secret.fingerprint())),
        ];
        config.unhashed_subpackets = vec![
            Subpacket::regular(SubpacketData::Issuer(secret.key_id())),
            Subpacket::regular(SubpacketData::EmbeddedSignature(Box::new(backsig))),
        ];
        let sub = &mut public.public_subkeys[1];
        let binding = config
            .sign_key_binding(secret, || "".to_string(), &sub.key)
            .unwrap();
        sub.signatures = vec![binding];
        public
    }

    pub fn detached_by(secret: &impl SecretKeyTrait, data: &[u8]) -> String {
        Message::new_literal_bytes("", data)
            .sign(OsRng, secret, || "".to_string(), HashAlgorithm::SHA2_256)
            .unwrap()
            .into_signature()
            .to_armored_string(Default::default())
            .unwrap()
    }

    pub fn inline_by(secret: &impl SecretKeyTrait, data: &[u8]) -> Vec<u8> {
        Message::new_literal_bytes("", data)
            .sign(OsRng, secret, || "".to_string(), HashAlgorithm::SHA2_256)
            .unwrap()
            .to_armored_bytes(None.into())
            .unwrap()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::keys::generate_keypair;

    const PREKEY_CANONICAL: &str =
        "aster-ratchet-prekey-v1:BFVQ0mBTeXVnUGF5bG9hZA==.c2lnbmVkUHJla2V5UGF5bG9hZA==";

    fn cleartext_sign(signer: &KeyPair, text: &str) -> String {
        sign_cleartext_message(text, signer).unwrap()
    }

    #[test]
    fn verifies_a_cleartext_prekey_binding() {
        let signer = generate_keypair("Signer", "signer@astermail.com").unwrap();
        let armored_key = signer.public_key_armored().unwrap();
        let signed = cleartext_sign(&signer, PREKEY_CANONICAL);

        let verified = verify_cleartext_signature(&armored_key, &signed).unwrap();

        assert_eq!(verified.as_deref().map(str::trim), Some(PREKEY_CANONICAL));
    }

    #[test]
    #[ignore]
    fn external_cleartext_vector_verifies() {
        let Ok(dir) = std::env::var("ASTER_CLEARSIGN_VECTOR_DIR") else {
            return;
        };
        let read = |name: &str| std::fs::read_to_string(format!("{dir}/{name}")).unwrap();
        let public_key = read("public_key.asc");
        let signature = read("signature.asc");
        let text = read("text.txt");

        let verified = verify_cleartext_signature(&public_key, &signature).unwrap();

        assert_eq!(
            verified.as_deref().map(str::trim),
            Some(text.trim()),
            "external cleartext vector must verify under rpgp"
        );
    }

    #[test]
    fn rejects_a_cleartext_signature_from_another_key() {
        let signer = generate_keypair("Signer", "signer@astermail.com").unwrap();
        let stranger = generate_keypair("Stranger", "stranger@astermail.com").unwrap();
        let signed = cleartext_sign(&signer, PREKEY_CANONICAL);

        let verified =
            verify_cleartext_signature(&stranger.public_key_armored().unwrap(), &signed).unwrap();

        assert!(verified.is_none());
    }

    #[test]
    fn rejects_a_tampered_prekey_binding() {
        let signer = generate_keypair("Signer", "signer@astermail.com").unwrap();
        let armored_key = signer.public_key_armored().unwrap();
        let signed = cleartext_sign(&signer, PREKEY_CANONICAL).replace("BFVQ", "BFVR");

        let verified = verify_cleartext_signature(&armored_key, &signed).unwrap();

        assert!(verified.is_none());
    }

    #[test]
    fn rejects_a_non_cleartext_field() {
        let signer = generate_keypair("Signer", "signer@astermail.com").unwrap();
        let armored_key = signer.public_key_armored().unwrap();

        assert!(verify_cleartext_signature(&armored_key, "not-a-signature").is_err());
    }

    #[test]
    fn refuses_oversized_cleartext_input() {
        let signer = generate_keypair("Signer", "signer@astermail.com").unwrap();
        let armored_key = signer.public_key_armored().unwrap();
        let huge = "a".repeat(1024 * 1024 + 1);

        assert!(verify_cleartext_signature(&armored_key, &huge)
            .unwrap()
            .is_none());
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
    fn armored(public: &SignedPublicKey) -> String {
        public.to_armored_string(Default::default()).unwrap()
    }

    #[test]
    fn detached_signature_from_a_backsigned_subkey_verifies() {
        use super::subkey_fixtures::*;
        let secret = signing_subkey_secret();
        let public = armored(&public_with_signing_subkey(&secret, true));
        let sig = detached_by(&secret.secret_subkeys[1], b"payload");

        assert!(verify_detached_signature(public.as_bytes(), b"payload", sig.as_bytes()).unwrap());
        assert!(!verify_detached_signature(public.as_bytes(), b"other", sig.as_bytes()).unwrap());
    }

    #[test]
    fn detached_signature_from_a_subkey_without_backsig_is_rejected() {
        use super::subkey_fixtures::*;
        let secret = signing_subkey_secret();
        let public = armored(&public_with_signing_subkey(&secret, false));
        let sig = detached_by(&secret.secret_subkeys[1], b"payload");

        assert!(!verify_detached_signature(public.as_bytes(), b"payload", sig.as_bytes()).unwrap());
    }

    #[test]
    fn detached_signature_from_an_appended_foreign_subkey_is_rejected() {
        use super::subkey_fixtures::*;
        let victim = generate_keypair("Victim", "victim@astermail.com").unwrap();
        let attacker = signing_subkey_secret();
        let mut forged: SignedPublicKey = victim.secret_key().clone().into();
        forged
            .public_subkeys
            .push(public_with_signing_subkey(&attacker, true).public_subkeys[1].clone());
        let sig = detached_by(&attacker.secret_subkeys[1], b"payload");

        assert!(!verify_detached_signature(
            armored(&forged).as_bytes(),
            b"payload",
            sig.as_bytes()
        )
        .unwrap());
    }

    #[test]
    fn detached_signature_from_a_certify_only_primary_is_rejected() {
        use super::subkey_fixtures::*;
        let secret = signing_subkey_secret();
        let public = armored(&public_with_signing_subkey(&secret, true));
        let sig = detached_by(&secret, b"payload");

        assert!(!verify_detached_signature(public.as_bytes(), b"payload", sig.as_bytes()).unwrap());
    }

    #[test]
    fn inline_message_from_a_backsigned_subkey_verifies() {
        use super::subkey_fixtures::*;
        let secret = signing_subkey_secret();
        let good =
            crate::keys::import_public_key(&armored(&public_with_signing_subkey(&secret, true)))
                .unwrap();
        let bare =
            crate::keys::import_public_key(&armored(&public_with_signing_subkey(&secret, false)))
                .unwrap();
        let signed = inline_by(&secret.secret_subkeys[1], b"payload");
        let by_primary = inline_by(&secret, b"payload");

        assert_eq!(
            verify_signature(&signed, &[&good]).unwrap(),
            b"payload".to_vec()
        );
        assert!(verify_signature(&signed, &[&bare]).is_err());
        assert!(verify_signature(&by_primary, &[&good]).is_err());
    }
}
