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
use pgp::composed::{
    Deserializable, KeyType, SecretKeyParamsBuilder, SignedPublicKey, SignedSecretKey,
    SubkeyParamsBuilder,
};
use pgp::crypto::ecc_curve::ECCCurve;
use pgp::crypto::{hash::HashAlgorithm, sym::SymmetricKeyAlgorithm};
use pgp::packet::SignatureType;
use pgp::ser::Serialize;
use pgp::types::{CompressionAlgorithm, PublicKeyTrait, Tag};
use rand::rngs::OsRng;
use smallvec::smallvec;
use zeroize::Zeroizing;

use crate::error::{CryptoError, Result};

pub struct KeyPair {
    secret_key: SignedSecretKey,
}

pub enum PublicKeyInner {
    Standalone(SignedPublicKey),
    FromSecret(SignedSecretKey),
}

pub struct PublicKey {
    pub(crate) inner: PublicKeyInner,
}

impl KeyPair {
    pub fn secret_key(&self) -> &SignedSecretKey {
        &self.secret_key
    }

    pub fn fingerprint(&self) -> String {
        let fp = PublicKeyTrait::fingerprint(&self.secret_key);
        hex::encode(fp.as_bytes())
    }

    pub fn key_id(&self) -> String {
        let kid = PublicKeyTrait::key_id(&self.secret_key);
        hex::encode(kid.as_ref())
    }

    pub fn public_key(&self) -> PublicKey {
        PublicKey {
            inner: PublicKeyInner::FromSecret(self.secret_key.clone()),
        }
    }

    pub fn to_armored(&self) -> Result<String> {
        self.secret_key
            .to_armored_string(None.into())
            .map_err(|e| CryptoError::Serialization(e.to_string()))
    }

    pub fn public_key_armored(&self) -> Result<String> {
        let signed_public: SignedPublicKey = self.secret_key.clone().into();
        signed_public
            .to_armored_string(None.into())
            .map_err(|e| CryptoError::Serialization(e.to_string()))
    }

    pub fn public_key_bytes(&self) -> Result<Vec<u8>> {
        let signed_public: SignedPublicKey = self.secret_key.clone().into();
        Serialize::to_bytes(&signed_public).map_err(|e| CryptoError::Serialization(e.to_string()))
    }

    pub fn to_bytes(&self) -> Result<Vec<u8>> {
        Serialize::to_bytes(&self.secret_key).map_err(|e| CryptoError::Serialization(e.to_string()))
    }
}

impl PublicKey {
    pub fn fingerprint(&self) -> String {
        let fp = match &self.inner {
            PublicKeyInner::Standalone(pk) => PublicKeyTrait::fingerprint(pk),
            PublicKeyInner::FromSecret(sk) => PublicKeyTrait::fingerprint(sk),
        };
        hex::encode(fp.as_bytes())
    }

    pub fn key_id(&self) -> String {
        let kid = match &self.inner {
            PublicKeyInner::Standalone(pk) => PublicKeyTrait::key_id(pk),
            PublicKeyInner::FromSecret(sk) => PublicKeyTrait::key_id(sk),
        };
        hex::encode(kid.as_ref())
    }

    pub fn to_armored(&self) -> Result<String> {
        match &self.inner {
            PublicKeyInner::Standalone(pk) => pk
                .to_armored_string(None.into())
                .map_err(|e| CryptoError::Serialization(e.to_string())),
            PublicKeyInner::FromSecret(_) => Err(CryptoError::Serialization(
                "Cannot export derived public key - export the keypair and re-import as public key"
                    .into(),
            )),
        }
    }

    pub fn to_bytes(&self) -> Result<Vec<u8>> {
        match &self.inner {
            PublicKeyInner::Standalone(pk) => {
                Serialize::to_bytes(pk).map_err(|e| CryptoError::Serialization(e.to_string()))
            }
            PublicKeyInner::FromSecret(_) => Err(CryptoError::Serialization(
                "Cannot export derived public key - export the keypair and re-import as public key"
                    .into(),
            )),
        }
    }

    pub fn user_id(&self) -> Option<String> {
        match &self.inner {
            PublicKeyInner::Standalone(pk) => pk
                .details
                .users
                .first()
                .map(|u| String::from_utf8_lossy(u.id.id()).to_string()),
            PublicKeyInner::FromSecret(sk) => sk
                .details
                .users
                .first()
                .map(|u| String::from_utf8_lossy(u.id.id()).to_string()),
        }
    }

    pub fn user_id_emails(&self) -> Vec<String> {
        let users = match &self.inner {
            PublicKeyInner::Standalone(pk) => &pk.details.users,
            PublicKeyInner::FromSecret(sk) => &sk.details.users,
        };

        let mut emails: Vec<String> = Vec::new();

        for user in users {
            let raw = String::from_utf8_lossy(user.id.id()).to_string();

            if let Some(email) = email_from_user_id(&raw) {
                if !emails.contains(&email) {
                    emails.push(email);
                }
            }
        }

        emails
    }

    pub fn has_verified_user_id_for(&self, email: &str) -> bool {
        let wanted = email.trim().to_lowercase();
        let signed = self.signed_public();
        let primary = &signed.primary_key;

        let key_revoked = signed
            .details
            .revocation_signatures
            .iter()
            .any(|signature| {
                matches!(signature.typ(), SignatureType::KeyRevocation)
                    && signature.verify_key(primary).is_ok()
            });

        if key_revoked {
            return false;
        }

        signed.details.users.iter().any(|user| {
            let raw = String::from_utf8_lossy(user.id.id()).to_string();

            if email_from_user_id(&raw).as_deref() != Some(wanted.as_str()) {
                return false;
            }

            let self_signed = |types: &[SignatureType]| {
                user.signatures.iter().any(|signature| {
                    types.contains(&signature.typ())
                        && signature
                            .verify_certification(primary, Tag::UserId, &user.id)
                            .is_ok()
                })
            };

            self_signed(&[
                SignatureType::CertGeneric,
                SignatureType::CertPersona,
                SignatureType::CertCasual,
                SignatureType::CertPositive,
            ]) && !self_signed(&[SignatureType::CertRevocation])
        })
    }

    pub fn is_standalone(&self) -> bool {
        matches!(&self.inner, PublicKeyInner::Standalone(_))
    }

    fn signed_public(&self) -> std::borrow::Cow<'_, SignedPublicKey> {
        match &self.inner {
            PublicKeyInner::Standalone(pk) => std::borrow::Cow::Borrowed(pk),
            PublicKeyInner::FromSecret(sk) => std::borrow::Cow::Owned(sk.clone().into()),
        }
    }

    pub fn has_encryption_key(&self) -> bool {
        crate::key_selection::has_encryption_capable_subkey(&self.signed_public())
    }

    pub fn has_valid_encryption_key(&self) -> bool {
        crate::key_selection::has_valid_encryption_subkey(&self.signed_public())
    }

    pub fn has_unsupported_encryption_algorithm(&self) -> bool {
        crate::key_selection::has_unsupported_encryption_subkey(&self.signed_public())
    }

    pub fn encryption_expires_at(&self) -> Option<chrono::DateTime<chrono::Utc>> {
        crate::key_selection::encryption_expires_at(&self.signed_public())
    }

    pub fn algorithm_profile(&self) -> (String, i32) {
        use pgp::types::PublicParams;

        let signed = self.signed_public();
        match signed.primary_key.public_params() {
            PublicParams::RSA { n, .. } => {
                let bits = (n.as_bytes().len() * 8) as i32;
                (format!("rsa{bits}"), bits)
            }
            PublicParams::DSA { p, .. } => {
                let bits = (p.as_bytes().len() * 8) as i32;
                (format!("dsa{bits}"), bits)
            }
            PublicParams::Ed25519 { .. } => ("ed25519".to_string(), 256),
            PublicParams::X25519 { .. } => ("x25519".to_string(), 256),
            PublicParams::X448 { .. } => ("x448".to_string(), 448),
            PublicParams::EdDSALegacy { curve, .. } => {
                (format!("eddsa_{}", curve_label(curve)), curve_bits(curve))
            }
            PublicParams::ECDSA(params) => {
                use pgp::types::EcdsaPublicParams;
                let label = match params {
                    EcdsaPublicParams::P256 { .. } => "p256".to_string(),
                    EcdsaPublicParams::P384 { .. } => "p384".to_string(),
                    EcdsaPublicParams::P521 { .. } => "p521".to_string(),
                    EcdsaPublicParams::Secp256k1 { .. } => "secp256k1".to_string(),
                    EcdsaPublicParams::Unsupported { curve, .. } => curve_label(curve),
                };
                let bits = match params {
                    EcdsaPublicParams::P384 { .. } => 384,
                    EcdsaPublicParams::P521 { .. } => 521,
                    EcdsaPublicParams::P256 { .. } | EcdsaPublicParams::Secp256k1 { .. } => 256,
                    EcdsaPublicParams::Unsupported { curve, .. } => curve_bits(curve),
                };
                (format!("ecdsa_{label}"), bits)
            }
            PublicParams::ECDH(params) => {
                use pgp::types::EcdhPublicParams;
                let curve = match params {
                    EcdhPublicParams::Known { curve, .. } => curve,
                    EcdhPublicParams::Unsupported { curve, .. } => curve,
                };
                (format!("ecdh_{}", curve_label(curve)), curve_bits(curve))
            }
            PublicParams::Elgamal { p, .. } => {
                let bits = (p.as_bytes().len() * 8) as i32;
                (format!("elgamal{bits}"), bits)
            }
            PublicParams::Unknown { .. } => ("unknown".to_string(), 0),
        }
    }
}

fn curve_label(curve: &ECCCurve) -> String {
    curve.to_string().to_lowercase().replace(' ', "_")
}

fn curve_bits(curve: &ECCCurve) -> i32 {
    match curve {
        ECCCurve::P256 => 256,
        ECCCurve::P384 => 384,
        ECCCurve::P521 => 521,
        ECCCurve::Curve25519 | ECCCurve::Ed25519 => 256,
        _ => 0,
    }
}

pub fn generate_keypair(name: &str, email: &str) -> Result<KeyPair> {
    let user_id = format!("{} <{}>", name, email);
    let rng = OsRng;

    let key_params = SecretKeyParamsBuilder::default()
        .key_type(KeyType::EdDSALegacy)
        .can_certify(true)
        .can_sign(true)
        .primary_user_id(user_id)
        .preferred_symmetric_algorithms(smallvec![SymmetricKeyAlgorithm::AES256,])
        .preferred_hash_algorithms(smallvec![
            HashAlgorithm::SHA2_512,
            HashAlgorithm::SHA2_384,
            HashAlgorithm::SHA2_256,
        ])
        .preferred_compression_algorithms(smallvec![
            CompressionAlgorithm::ZLIB,
            CompressionAlgorithm::ZIP,
        ])
        .subkey(
            SubkeyParamsBuilder::default()
                .key_type(KeyType::ECDH(ECCCurve::Curve25519))
                .can_encrypt(true)
                .build()
                .map_err(|e| CryptoError::KeyGeneration(e.to_string()))?,
        )
        .build()
        .map_err(|e| CryptoError::KeyGeneration(e.to_string()))?;

    let secret_key = key_params
        .generate(rng)
        .map_err(|e| CryptoError::KeyGeneration(e.to_string()))?;

    let signed_secret_key = secret_key
        .sign(rng, || "".to_string())
        .map_err(|e| CryptoError::KeyGeneration(e.to_string()))?;

    Ok(KeyPair {
        secret_key: signed_secret_key,
    })
}

pub fn generate_keypair_with_password(
    name: &str,
    email: &str,
    password: Zeroizing<String>,
) -> Result<KeyPair> {
    if password.is_empty() {
        return Err(CryptoError::KeyGeneration(
            "Password cannot be empty - use generate_keypair() for unprotected keys".into(),
        ));
    }

    let user_id = format!("{} <{}>", name, email);
    let rng = OsRng;

    let key_params = SecretKeyParamsBuilder::default()
        .key_type(KeyType::EdDSALegacy)
        .can_certify(true)
        .can_sign(true)
        .primary_user_id(user_id)
        .preferred_symmetric_algorithms(smallvec![SymmetricKeyAlgorithm::AES256,])
        .preferred_hash_algorithms(smallvec![
            HashAlgorithm::SHA2_512,
            HashAlgorithm::SHA2_384,
            HashAlgorithm::SHA2_256,
        ])
        .preferred_compression_algorithms(smallvec![
            CompressionAlgorithm::ZLIB,
            CompressionAlgorithm::ZIP,
        ])
        .subkey(
            SubkeyParamsBuilder::default()
                .key_type(KeyType::ECDH(ECCCurve::Curve25519))
                .can_encrypt(true)
                .build()
                .map_err(|e| CryptoError::KeyGeneration(e.to_string()))?,
        )
        .build()
        .map_err(|e| CryptoError::KeyGeneration(e.to_string()))?;

    let secret_key = key_params
        .generate(rng)
        .map_err(|e| CryptoError::KeyGeneration(e.to_string()))?;

    let signed_secret_key = secret_key
        .sign(rng, move || (*password).clone())
        .map_err(|e| CryptoError::KeyGeneration(e.to_string()))?;

    Ok(KeyPair {
        secret_key: signed_secret_key,
    })
}

pub const MAX_KEY_IMPORT_BYTES: usize = 16 * 1024 * 1024;

fn check_import_size(len: usize) -> Result<()> {
    if len > MAX_KEY_IMPORT_BYTES {
        return Err(CryptoError::KeyTooLarge {
            size: len,
            max: MAX_KEY_IMPORT_BYTES,
        });
    }
    Ok(())
}

fn email_from_user_id(user_id: &str) -> Option<String> {
    let candidate = match (user_id.rfind('<'), user_id.rfind('>')) {
        (Some(open), Some(close)) if open < close => &user_id[open + 1..close],
        _ => user_id,
    };
    let email = candidate.trim().to_lowercase();
    let (local, domain) = email.split_once('@')?;

    if local.is_empty()
        || domain.is_empty()
        || domain.contains('@')
        || email.chars().any(|c| c.is_whitespace() || c.is_control())
    {
        return None;
    }

    Some(email)
}

const INVALID_KEY_FORMAT_MSG: &str = "invalid key format";

pub fn import_public_key(armored: &str) -> Result<PublicKey> {
    check_import_size(armored.len())?;
    let (public_key, _) = SignedPublicKey::from_string(armored)
        .map_err(|_| CryptoError::InvalidKeyFormat(INVALID_KEY_FORMAT_MSG.into()))?;

    Ok(PublicKey {
        inner: PublicKeyInner::Standalone(public_key),
    })
}

pub fn import_public_key_bytes(bytes: &[u8]) -> Result<PublicKey> {
    check_import_size(bytes.len())?;

    // Keys arrive in two shapes: WKD serves binary OpenPGP, while HKP keyservers
    // (keys.openpgp.org, keyserver.ubuntu.com, and provider key endpoints) serve
    // ASCII-armored blocks. Detect armor and parse accordingly so keyserver keys
    // can actually be used for encryption.
    let public_key = if bytes.starts_with(b"-----BEGIN") {
        let armored = std::str::from_utf8(bytes)
            .map_err(|_| CryptoError::InvalidKeyFormat(INVALID_KEY_FORMAT_MSG.into()))?;
        let (pk, _) = SignedPublicKey::from_string(armored)
            .map_err(|_| CryptoError::InvalidKeyFormat(INVALID_KEY_FORMAT_MSG.into()))?;
        pk
    } else {
        SignedPublicKey::from_bytes(std::io::Cursor::new(bytes))
            .map_err(|_| CryptoError::InvalidKeyFormat(INVALID_KEY_FORMAT_MSG.into()))?
    };

    Ok(PublicKey {
        inner: PublicKeyInner::Standalone(public_key),
    })
}

const MAX_KEYS_PER_IMPORT: usize = 16;

pub fn import_public_keys_bytes(bytes: &[u8]) -> Result<Vec<PublicKey>> {
    check_import_size(bytes.len())?;

    let parsed: Vec<SignedPublicKey> = if bytes.starts_with(b"-----BEGIN") {
        let armored = std::str::from_utf8(bytes)
            .map_err(|_| CryptoError::InvalidKeyFormat(INVALID_KEY_FORMAT_MSG.into()))?;
        let (keys, _) = SignedPublicKey::from_string_many(armored)
            .map_err(|_| CryptoError::InvalidKeyFormat(INVALID_KEY_FORMAT_MSG.into()))?;
        keys.take(MAX_KEYS_PER_IMPORT)
            .filter_map(|k| k.ok())
            .collect()
    } else {
        SignedPublicKey::from_bytes_many(std::io::Cursor::new(bytes))
            .take(MAX_KEYS_PER_IMPORT)
            .filter_map(|k| k.ok())
            .collect()
    };

    if parsed.is_empty() {
        return Err(CryptoError::InvalidKeyFormat(INVALID_KEY_FORMAT_MSG.into()));
    }

    Ok(parsed
        .into_iter()
        .map(|pk| PublicKey {
            inner: PublicKeyInner::Standalone(pk),
        })
        .collect())
}

pub fn import_secret_key(armored: &str) -> Result<KeyPair> {
    check_import_size(armored.len())?;
    let (secret_key, _) = SignedSecretKey::from_string(armored)
        .map_err(|_| CryptoError::InvalidKeyFormat(INVALID_KEY_FORMAT_MSG.into()))?;

    Ok(KeyPair { secret_key })
}

pub fn import_secret_key_bytes(bytes: &[u8]) -> Result<KeyPair> {
    check_import_size(bytes.len())?;
    let secret_key = SignedSecretKey::from_bytes(std::io::Cursor::new(bytes))
        .map_err(|_| CryptoError::InvalidKeyFormat(INVALID_KEY_FORMAT_MSG.into()))?;

    Ok(KeyPair { secret_key })
}

#[cfg(test)]
pub(crate) fn generate_legacy_rsa_keypair(name: &str, email: &str) -> Result<KeyPair> {
    let user_id = format!("{} <{}>", name, email);
    let rng = OsRng;

    let key_params = SecretKeyParamsBuilder::default()
        .key_type(KeyType::Rsa(2048))
        .can_certify(true)
        .can_sign(true)
        .primary_user_id(user_id)
        .preferred_symmetric_algorithms(smallvec![SymmetricKeyAlgorithm::AES256,])
        .preferred_hash_algorithms(smallvec![HashAlgorithm::SHA2_256,])
        .preferred_compression_algorithms(smallvec![CompressionAlgorithm::ZLIB,])
        .subkey(
            SubkeyParamsBuilder::default()
                .key_type(KeyType::Rsa(2048))
                .can_encrypt(true)
                .build()
                .map_err(|e| CryptoError::KeyGeneration(e.to_string()))?,
        )
        .build()
        .map_err(|e| CryptoError::KeyGeneration(e.to_string()))?;

    let secret_key = key_params
        .generate(rng)
        .map_err(|e| CryptoError::KeyGeneration(e.to_string()))?;

    let signed_secret_key = secret_key
        .sign(rng, || "".to_string())
        .map_err(|e| CryptoError::KeyGeneration(e.to_string()))?;

    Ok(KeyPair {
        secret_key: signed_secret_key,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use pgp::crypto::public_key::PublicKeyAlgorithm;

    fn public_key_for(email: &str) -> PublicKey {
        let keypair = generate_keypair("Alice", email).unwrap();
        import_public_key(&keypair.public_key_armored().unwrap()).unwrap()
    }

    #[test]
    fn import_many_returns_every_key_in_a_binary_stream() {
        let first = generate_keypair("First", "first@example.org").unwrap();
        let second = generate_keypair("Second", "second@example.org").unwrap();
        let mut stream = first.public_key_bytes().unwrap();
        stream.extend(second.public_key_bytes().unwrap());

        let keys = import_public_keys_bytes(&stream).unwrap();

        assert_eq!(keys.len(), 2);
        assert!(keys[0].has_verified_user_id_for("first@example.org"));
        assert!(keys[1].has_verified_user_id_for("second@example.org"));
    }

    #[test]
    fn import_many_reads_a_single_armored_key() {
        let keypair = generate_keypair("Solo", "solo@example.org").unwrap();
        let armored = keypair.public_key_armored().unwrap();

        let keys = import_public_keys_bytes(armored.as_bytes()).unwrap();

        assert_eq!(keys.len(), 1);
        assert_eq!(keys[0].fingerprint(), keypair.fingerprint());
    }

    #[test]
    fn import_many_rejects_garbage() {
        assert!(import_public_keys_bytes(b"not a key").is_err());
    }

    #[test]
    fn verified_user_id_matches_the_address_in_any_case() {
        let public = public_key_for("Alice@AsterMail.org");

        assert!(public.has_verified_user_id_for("alice@astermail.org"));
        assert!(public.has_verified_user_id_for(" ALICE@astermail.org "));
    }

    #[test]
    fn verified_user_id_rejects_another_address() {
        let public = public_key_for("alice@astermail.org");

        assert!(!public.has_verified_user_id_for("mallory@astermail.org"));
        assert!(!public.has_verified_user_id_for(""));
    }

    #[test]
    fn verified_user_id_rejects_an_unsigned_user_id() {
        let public = public_key_for("alice@astermail.org");
        let PublicKeyInner::Standalone(mut signed) = public.inner else {
            panic!("expected a standalone key");
        };
        signed.details.users[0].id =
            pgp::packet::UserId::from_str(Default::default(), "Mallory <mallory@astermail.org>");
        let forged = PublicKey {
            inner: PublicKeyInner::Standalone(signed),
        };

        assert_eq!(
            forged.user_id_emails(),
            vec!["mallory@astermail.org".to_string()]
        );
        assert!(!forged.has_verified_user_id_for("mallory@astermail.org"));
        assert!(!forged.has_verified_user_id_for("alice@astermail.org"));
    }

    #[test]
    fn verified_user_id_rejects_a_user_id_without_signatures() {
        let public = public_key_for("alice@astermail.org");
        let PublicKeyInner::Standalone(mut signed) = public.inner else {
            panic!("expected a standalone key");
        };
        signed.details.users[0].signatures.clear();
        let stripped = PublicKey {
            inner: PublicKeyInner::Standalone(signed),
        };

        assert!(!stripped.has_verified_user_id_for("alice@astermail.org"));
    }

    #[test]
    fn user_id_emails_reads_the_address_of_every_user_id() {
        let keypair = generate_keypair("Alice", "Alice@AsterMail.org").unwrap();
        let public = import_public_key(&keypair.public_key_armored().unwrap()).unwrap();

        assert_eq!(
            public.user_id_emails(),
            vec!["alice@astermail.org".to_string()]
        );
    }

    #[test]
    fn email_from_user_id_handles_bare_and_named_forms() {
        assert_eq!(
            email_from_user_id("Jordan Doe <Jordan@Example.com>"),
            Some("jordan@example.com".to_string())
        );
        assert_eq!(
            email_from_user_id("jordan@example.com"),
            Some("jordan@example.com".to_string())
        );
        assert_eq!(email_from_user_id("Jordan Doe"), None);
        assert_eq!(email_from_user_id("Jordan <not an address>"), None);
        assert_eq!(email_from_user_id("<a@b@c>"), None);
    }

    #[test]
    fn test_generate_keypair() {
        let keypair = generate_keypair("Alice", "alice@astermail.com").unwrap();

        assert!(!keypair.fingerprint().is_empty());
        assert!(!keypair.key_id().is_empty());

        let public = keypair.public_key();
        assert_eq!(keypair.fingerprint(), public.fingerprint());
    }

    #[test]
    fn test_keypair_export_import() {
        let keypair = generate_keypair("Bob", "bob@astermail.com").unwrap();

        let armored = keypair.to_armored().unwrap();
        assert!(armored.contains("BEGIN PGP PRIVATE KEY BLOCK"));

        let imported = import_secret_key(&armored).unwrap();
        assert_eq!(keypair.fingerprint(), imported.fingerprint());
    }

    #[test]
    fn test_public_key_standalone_export_import() {
        let keypair = generate_keypair("Charlie", "charlie@astermail.com").unwrap();

        let armored_secret = keypair.to_armored().unwrap();
        let imported_keypair = import_secret_key(&armored_secret).unwrap();
        let armored_public = imported_keypair.to_armored().unwrap();

        assert!(armored_public.contains("BEGIN PGP PRIVATE KEY BLOCK"));
    }

    #[test]
    fn test_user_id() {
        let keypair = generate_keypair("Test User", "test@astermail.com").unwrap();
        let public = keypair.public_key();

        let uid = public.user_id().unwrap();
        assert!(uid.contains("Test User"));
        assert!(uid.contains("test@astermail.com"));
    }

    #[test]
    fn test_bytes_roundtrip() {
        let keypair = generate_keypair("Dave", "dave@astermail.com").unwrap();

        let bytes = keypair.to_bytes().unwrap();
        let imported = import_secret_key_bytes(&bytes).unwrap();

        assert_eq!(keypair.fingerprint(), imported.fingerprint());
    }

    #[test]
    fn test_generate_keypair_is_ed25519() {
        let keypair = generate_keypair("Eve", "eve@astermail.com").unwrap();
        let algo = PublicKeyTrait::algorithm(keypair.secret_key());
        assert_eq!(algo, PublicKeyAlgorithm::EdDSALegacy);
    }

    #[test]
    fn test_generate_keypair_encryption_subkey_is_x25519() {
        let keypair = generate_keypair("Frank", "frank@astermail.com").unwrap();
        let subkeys = &keypair.secret_key().secret_subkeys;
        assert!(!subkeys.is_empty());
        let sub_algo = PublicKeyTrait::algorithm(&subkeys[0]);
        assert_eq!(sub_algo, PublicKeyAlgorithm::ECDH);
    }

    #[test]
    fn test_legacy_rsa_key_roundtrip() {
        let keypair = generate_legacy_rsa_keypair("Legacy", "legacy@astermail.com").unwrap();

        let armored = keypair.to_armored().unwrap();
        let imported = import_secret_key(&armored).unwrap();
        assert_eq!(keypair.fingerprint(), imported.fingerprint());

        let primary_algo = PublicKeyTrait::algorithm(imported.secret_key());
        assert_eq!(primary_algo, PublicKeyAlgorithm::RSA);
        let sub_algo = PublicKeyTrait::algorithm(&imported.secret_key().secret_subkeys[0]);
        assert_eq!(sub_algo, PublicKeyAlgorithm::RSA);
    }
    #[test]
    fn algorithm_profile_reports_the_real_curve_not_rsa4096() {
        let keypair = generate_keypair("Curve", "curve@astermail.com").unwrap();
        let armored = keypair.public_key_armored().unwrap();
        let imported = import_public_key(&armored).unwrap();
        let (algorithm, bits) = imported.algorithm_profile();
        assert_ne!(algorithm, "rsa4096");
        assert!(bits > 0);
    }

    #[test]
    fn algorithm_profile_reports_rsa_modulus_size() {
        let keypair = generate_legacy_rsa_keypair("Legacy", "legacy@astermail.com").unwrap();
        let armored = keypair.public_key_armored().unwrap();
        let imported = import_public_key(&armored).unwrap();
        let (algorithm, bits) = imported.algorithm_profile();
        assert!(algorithm.starts_with("rsa"));
        assert_eq!(algorithm, format!("rsa{bits}"));
    }
}
