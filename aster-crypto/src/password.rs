use argon2::password_hash::SaltString;
use argon2::{Argon2, Params, PasswordHash, PasswordHasher, PasswordVerifier, Version};
use rand::rngs::OsRng;
use zeroize::Zeroizing;

use crate::error::{CryptoError, Result};

pub const ARGON2_MEMORY_COST: u32 = 131072;
pub const ARGON2_TIME_COST: u32 = 3;
pub const ARGON2_PARALLELISM: u32 = 4;

pub fn hash_password(password: Zeroizing<String>) -> Result<String> {
    let salt = SaltString::generate(&mut OsRng);

    let params = Params::new(
        ARGON2_MEMORY_COST,
        ARGON2_TIME_COST,
        ARGON2_PARALLELISM,
        None,
    )
    .map_err(|e| CryptoError::PasswordHashing(e.to_string()))?;

    let argon2 = Argon2::new(argon2::Algorithm::Argon2id, Version::V0x13, params);

    let hash = argon2
        .hash_password(password.as_bytes(), &salt)
        .map_err(|e| CryptoError::PasswordHashing(e.to_string()))?;

    Ok(hash.to_string())
}

pub fn verify_password(password: Zeroizing<String>, hash: &str) -> Result<bool> {
    let parsed_hash =
        PasswordHash::new(hash).map_err(|e| CryptoError::PasswordHashing(e.to_string()))?;

    let params = Params::new(
        ARGON2_MEMORY_COST,
        ARGON2_TIME_COST,
        ARGON2_PARALLELISM,
        None,
    )
    .map_err(|e| CryptoError::PasswordHashing(e.to_string()))?;

    let argon2 = Argon2::new(argon2::Algorithm::Argon2id, Version::V0x13, params);

    match argon2.verify_password(password.as_bytes(), &parsed_hash) {
        Ok(()) => Ok(true),
        Err(argon2::password_hash::Error::Password) => Ok(false),
        Err(e) => Err(CryptoError::PasswordHashing(e.to_string())),
    }
}

pub fn derive_key(
    password: Zeroizing<String>,
    salt: &[u8],
    key_len: usize,
) -> Result<Zeroizing<Vec<u8>>> {
    let params = Params::new(
        ARGON2_MEMORY_COST,
        ARGON2_TIME_COST,
        ARGON2_PARALLELISM,
        Some(key_len),
    )
    .map_err(|e| CryptoError::KeyDerivation(e.to_string()))?;

    let argon2 = Argon2::new(argon2::Algorithm::Argon2id, Version::V0x13, params);

    let mut output = Zeroizing::new(vec![0u8; key_len]);
    argon2
        .hash_password_into(password.as_bytes(), salt, &mut output)
        .map_err(|e| CryptoError::KeyDerivation(e.to_string()))?;

    Ok(output)
}

pub fn generate_salt() -> [u8; 32] {
    let mut salt = [0u8; 32];
    rand::RngCore::fill_bytes(&mut OsRng, &mut salt);
    salt
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_hash_and_verify() {
        let password = Zeroizing::new("correct horse battery staple".to_string());
        let hash = hash_password(password.clone()).unwrap();

        assert!(verify_password(password, &hash).unwrap());
        assert!(!verify_password(Zeroizing::new("wrong password".to_string()), &hash).unwrap());
    }

    #[test]
    fn test_different_passwords_different_hashes() {
        let hash1 = hash_password(Zeroizing::new("password1".to_string())).unwrap();
        let hash2 = hash_password(Zeroizing::new("password2".to_string())).unwrap();

        assert_ne!(hash1, hash2);
    }

    #[test]
    fn test_same_password_different_hashes() {
        let password = Zeroizing::new("same_password".to_string());
        let hash1 = hash_password(password.clone()).unwrap();
        let hash2 = hash_password(password.clone()).unwrap();

        assert_ne!(hash1, hash2);

        assert!(verify_password(password.clone(), &hash1).unwrap());
        assert!(verify_password(password, &hash2).unwrap());
    }

    #[test]
    fn test_derive_key() {
        let password = Zeroizing::new("key derivation test".to_string());
        let salt = generate_salt();

        let key1 = derive_key(password.clone(), &salt, 32).unwrap();
        let key2 = derive_key(password, &salt, 32).unwrap();

        assert_eq!(*key1, *key2);
        assert_eq!(key1.len(), 32);
    }

    #[test]
    fn test_derive_key_different_salts() {
        let password = Zeroizing::new("key derivation test".to_string());
        let salt1 = generate_salt();
        let salt2 = generate_salt();

        let key1 = derive_key(password.clone(), &salt1, 32).unwrap();
        let key2 = derive_key(password, &salt2, 32).unwrap();

        assert_ne!(*key1, *key2);
    }
}
