pub mod decrypt;
pub mod encrypt;
pub mod error;
pub mod keys;
pub mod password;
pub mod sign;

pub use decrypt::decrypt_message;
pub use encrypt::encrypt_message;
pub use error::{CryptoError, Result};
pub use keys::{
    generate_keypair, generate_keypair_with_password, import_public_key, import_public_key_bytes,
    import_secret_key, import_secret_key_bytes, KeyPair, PublicKey,
};
pub use password::{derive_key, hash_password, verify_password};
pub use sign::{sign_message, verify_signature};
pub use zeroize::Zeroizing;

pub const VERSION: &str = env!("CARGO_PKG_VERSION");
