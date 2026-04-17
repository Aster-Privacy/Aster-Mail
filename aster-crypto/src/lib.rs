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
