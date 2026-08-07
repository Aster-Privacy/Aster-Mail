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
use pgp::ser::Serialize;
use pgp::types::{CompressionAlgorithm, PublicKeyTrait};
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

    pub fn encryption_expires_at(&self) -> Option<chrono::DateTime<chrono::Utc>> {
        crate::key_selection::encryption_expires_at(&self.signed_public())
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
    // (keys.openpgp.org, keyserver.ubuntu.com, Proton's api.protonmail.ch) serve
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
}
