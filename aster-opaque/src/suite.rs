//
// Aster Communications Inc.
//
// Copyright (c) 2026 Aster Communications Inc.
//
// This file is part of this project.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
// GNU Affero General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License
// along with this program. If not, see <https://www.gnu.org/licenses/>.
//
use argon2::{Algorithm, Argon2, Params, Version};
use opaque_ke::errors::InternalError;
use opaque_ke::generic_array::{ArrayLength, GenericArray};
use opaque_ke::ksf::Ksf;
use opaque_ke::{CipherSuite, Ristretto255, TripleDh};

pub const LOGIN_CONTEXT: &[u8] = b"aster-login-v3";
pub const SEED_LEN: usize = 32;

pub const REGISTRATION_REQUEST_LEN: usize = 32;
pub const REGISTRATION_RESPONSE_LEN: usize = 64;
pub const REGISTRATION_RECORD_LEN: usize = 192;
pub const CREDENTIAL_REQUEST_LEN: usize = 96;
pub const CREDENTIAL_RESPONSE_LEN: usize = 320;
pub const CREDENTIAL_FINALIZATION_LEN: usize = 64;

const STRETCH_MEMORY_KIB: u32 = 47_104;
const STRETCH_PASSES: u32 = 1;
const STRETCH_LANES: u32 = 1;
const STRETCH_SALT: [u8; 16] = [0u8; 16];

pub struct PasswordStretch;

impl Default for PasswordStretch {
    fn default() -> Self {
        PasswordStretch
    }
}

impl Ksf for PasswordStretch {
    fn hash<L: ArrayLength<u8>>(
        &self,
        input: GenericArray<u8, L>,
    ) -> Result<GenericArray<u8, L>, InternalError> {
        let params = Params::new(STRETCH_MEMORY_KIB, STRETCH_PASSES, STRETCH_LANES, None)
            .map_err(|_| InternalError::KsfError)?;
        let mut output = GenericArray::default();
        Argon2::new(Algorithm::Argon2id, Version::V0x13, params)
            .hash_password_into(&input, &STRETCH_SALT, &mut output)
            .map_err(|_| InternalError::KsfError)?;
        Ok(output)
    }
}

pub struct Suite;

impl CipherSuite for Suite {
    type OprfCs = Ristretto255;
    type KeyExchange = TripleDh<Ristretto255, sha2::Sha512>;
    type Ksf = PasswordStretch;
}
