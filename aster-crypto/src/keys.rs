use pgp::composed::{
    Deserializable, KeyType, SecretKeyParamsBuilder, SignedPublicKey, SignedSecretKey,
    SubkeyParamsBuilder,
};
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

impl Drop for KeyPair {
    fn drop(&mut self) {
        let bytes = Serialize::to_bytes(&self.secret_key).unwrap_or_default();
        let mut zeroizing_bytes = Zeroizing::new(bytes);
        zeroizing_bytes.iter_mut().for_each(|b| *b = 0);
        std::sync::atomic::compiler_fence(std::sync::atomic::Ordering::SeqCst);
    }
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
}

pub fn generate_keypair(name: &str, email: &str) -> Result<KeyPair> {
    let user_id = format!("{} <{}>", name, email);
    let rng = OsRng;

    let key_params = SecretKeyParamsBuilder::default()
        .key_type(KeyType::Rsa(4096))
        .can_certify(true)
        .can_sign(true)
        .primary_user_id(user_id)
        .preferred_symmetric_algorithms(smallvec![
            SymmetricKeyAlgorithm::AES256,
            SymmetricKeyAlgorithm::AES192,
            SymmetricKeyAlgorithm::AES128,
        ])
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
                .key_type(KeyType::Rsa(4096))
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
        .key_type(KeyType::Rsa(4096))
        .can_certify(true)
        .can_sign(true)
        .primary_user_id(user_id)
        .preferred_symmetric_algorithms(smallvec![
            SymmetricKeyAlgorithm::AES256,
            SymmetricKeyAlgorithm::AES192,
            SymmetricKeyAlgorithm::AES128,
        ])
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
                .key_type(KeyType::Rsa(4096))
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

pub fn import_public_key(armored: &str) -> Result<PublicKey> {
    let (public_key, _) = SignedPublicKey::from_string(armored)
        .map_err(|e| CryptoError::InvalidKeyFormat(e.to_string()))?;

    Ok(PublicKey {
        inner: PublicKeyInner::Standalone(public_key),
    })
}

pub fn import_public_key_bytes(bytes: &[u8]) -> Result<PublicKey> {
    let public_key = SignedPublicKey::from_bytes(std::io::Cursor::new(bytes))
        .map_err(|e| CryptoError::InvalidKeyFormat(e.to_string()))?;

    Ok(PublicKey {
        inner: PublicKeyInner::Standalone(public_key),
    })
}

pub fn import_secret_key(armored: &str) -> Result<KeyPair> {
    let (secret_key, _) = SignedSecretKey::from_string(armored)
        .map_err(|e| CryptoError::InvalidKeyFormat(e.to_string()))?;

    Ok(KeyPair { secret_key })
}

pub fn import_secret_key_bytes(bytes: &[u8]) -> Result<KeyPair> {
    let secret_key = SignedSecretKey::from_bytes(std::io::Cursor::new(bytes))
        .map_err(|e| CryptoError::InvalidKeyFormat(e.to_string()))?;

    Ok(KeyPair { secret_key })
}

#[cfg(test)]
mod tests {
    use super::*;

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
}
