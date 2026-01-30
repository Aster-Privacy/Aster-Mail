use thiserror::Error;

#[derive(Debug, Error)]
pub enum CryptoError {
    #[error("key generation failed: {0}")]
    KeyGeneration(String),

    #[error("encryption failed: {0}")]
    Encryption(String),

    #[error("decryption failed: {0}")]
    Decryption(String),

    #[error("signing failed: {0}")]
    Signing(String),

    #[error("signature verification failed: {0}")]
    SignatureVerification(String),

    #[error("invalid key format: {0}")]
    InvalidKeyFormat(String),

    #[error("key not found: {0}")]
    KeyNotFound(String),

    #[error("no valid recipient key")]
    NoValidRecipient,

    #[error("no valid signer key")]
    NoValidSigner,

    #[error("password hashing failed: {0}")]
    PasswordHashing(String),

    #[error("invalid password")]
    InvalidPassword,

    #[error("key derivation failed: {0}")]
    KeyDerivation(String),

    #[error("serialization failed: {0}")]
    Serialization(String),

    #[error("io error: {0}")]
    Io(#[from] std::io::Error),
}

pub type Result<T> = std::result::Result<T, CryptoError>;

impl From<serde_json::Error> for CryptoError {
    fn from(e: serde_json::Error) -> Self {
        CryptoError::Serialization(e.to_string())
    }
}
