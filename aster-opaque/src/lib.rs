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
#![deny(unsafe_code)]

mod client;
mod error;
#[cfg(feature = "server")]
mod server;
mod suite;
#[cfg(target_arch = "wasm32")]
mod wasm_abi;

pub use client::{
    client_login_finish, client_login_start, client_registration_finish,
    client_registration_start, ClientStart,
};
pub use error::OpaqueError;
#[cfg(feature = "server")]
pub use server::{login_finish, registration_record, LoginStart, Server};
pub use suite::{
    CREDENTIAL_FINALIZATION_LEN, CREDENTIAL_REQUEST_LEN, CREDENTIAL_RESPONSE_LEN, LOGIN_CONTEXT,
    REGISTRATION_RECORD_LEN, REGISTRATION_REQUEST_LEN, REGISTRATION_RESPONSE_LEN, SEED_LEN,
};

#[cfg(all(test, feature = "server"))]
mod tests;
