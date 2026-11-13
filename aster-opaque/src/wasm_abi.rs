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
#![allow(unsafe_code)]

use zeroize::Zeroize;

use crate::client::{
    client_login_finish, client_login_start, client_registration_finish,
    client_registration_start, ClientStart,
};
use crate::error::OpaqueError;
use crate::suite::SEED_LEN;

const LENGTH_PREFIX: usize = 4;
const STATUS_OK: u8 = 0;

fn leak(bytes: Vec<u8>) -> *mut u8 {
    Box::into_raw(bytes.into_boxed_slice()) as *mut u8
}

unsafe fn borrow<'a>(ptr: *const u8, len: usize) -> &'a [u8] {
    if ptr.is_null() || len == 0 {
        &[]
    } else {
        core::slice::from_raw_parts(ptr, len)
    }
}

fn reply(result: Result<Vec<u8>, OpaqueError>) -> *mut u8 {
    let (status, mut payload) = match result {
        Ok(payload) => (STATUS_OK, payload),
        Err(error) => (error.code(), Vec::new()),
    };
    let body_len = 1 + payload.len();
    let mut out = Vec::with_capacity(LENGTH_PREFIX + body_len);
    out.extend_from_slice(&(body_len as u32).to_le_bytes());
    out.push(status);
    out.extend_from_slice(&payload);
    payload.zeroize();
    leak(out)
}

fn pack(started: ClientStart) -> Vec<u8> {
    let mut out = Vec::with_capacity(LENGTH_PREFIX + started.state.len() + started.message.len());
    out.extend_from_slice(&(started.state.len() as u32).to_le_bytes());
    out.extend_from_slice(&started.state);
    out.extend_from_slice(&started.message);
    out
}

#[no_mangle]
pub extern "C" fn aster_opaque_alloc(len: usize) -> *mut u8 {
    if len == 0 {
        return core::ptr::null_mut();
    }
    leak(vec![0u8; len])
}

#[no_mangle]
pub unsafe extern "C" fn aster_opaque_free(ptr: *mut u8, len: usize) {
    if ptr.is_null() || len == 0 {
        return;
    }
    let mut owned = Box::from_raw(core::ptr::slice_from_raw_parts_mut(ptr, len));
    owned.zeroize();
}

#[no_mangle]
pub unsafe extern "C" fn aster_opaque_registration_start(
    password: *const u8,
    password_len: usize,
    seed: *const u8,
) -> *mut u8 {
    reply(
        client_registration_start(borrow(password, password_len), borrow(seed, SEED_LEN))
            .map(pack),
    )
}

#[no_mangle]
pub unsafe extern "C" fn aster_opaque_registration_finish(
    state: *const u8,
    state_len: usize,
    password: *const u8,
    password_len: usize,
    response: *const u8,
    response_len: usize,
    seed: *const u8,
) -> *mut u8 {
    reply(client_registration_finish(
        borrow(state, state_len),
        borrow(password, password_len),
        borrow(response, response_len),
        borrow(seed, SEED_LEN),
    ))
}

#[no_mangle]
pub unsafe extern "C" fn aster_opaque_login_start(
    password: *const u8,
    password_len: usize,
    seed: *const u8,
) -> *mut u8 {
    reply(client_login_start(borrow(password, password_len), borrow(seed, SEED_LEN)).map(pack))
}

#[no_mangle]
pub unsafe extern "C" fn aster_opaque_login_finish(
    state: *const u8,
    state_len: usize,
    password: *const u8,
    password_len: usize,
    response: *const u8,
    response_len: usize,
    seed: *const u8,
) -> *mut u8 {
    reply(client_login_finish(
        borrow(state, state_len),
        borrow(password, password_len),
        borrow(response, response_len),
        borrow(seed, SEED_LEN),
    ))
}

#[cfg(feature = "server")]
mod server_exports {
    use rand_chacha::rand_core::SeedableRng;
    use rand_chacha::ChaCha20Rng;

    use super::{borrow, reply, LENGTH_PREFIX};
    use crate::error::OpaqueError;
    use crate::server::{login_finish, registration_record, Server};
    use crate::suite::SEED_LEN;

    fn seeded(seed: &[u8]) -> Result<ChaCha20Rng, OpaqueError> {
        let seed: [u8; SEED_LEN] = seed.try_into().map_err(|_| OpaqueError::Malformed)?;
        Ok(ChaCha20Rng::from_seed(seed))
    }

    #[no_mangle]
    pub unsafe extern "C" fn aster_opaque_server_setup(seed: *const u8) -> *mut u8 {
        reply(
            seeded(borrow(seed, SEED_LEN))
                .map(|mut rng| Server::generate(&mut rng).to_bytes().to_vec()),
        )
    }

    #[no_mangle]
    pub unsafe extern "C" fn aster_opaque_server_registration_response(
        setup: *const u8,
        setup_len: usize,
        request: *const u8,
        request_len: usize,
        credential_id: *const u8,
        credential_id_len: usize,
    ) -> *mut u8 {
        reply(Server::from_bytes(borrow(setup, setup_len)).and_then(|server| {
            server.registration_response(
                borrow(request, request_len),
                borrow(credential_id, credential_id_len),
            )
        }))
    }

    #[no_mangle]
    pub unsafe extern "C" fn aster_opaque_server_registration_record(
        upload: *const u8,
        upload_len: usize,
    ) -> *mut u8 {
        reply(registration_record(borrow(upload, upload_len)))
    }

    #[no_mangle]
    pub unsafe extern "C" fn aster_opaque_server_login_start(
        setup: *const u8,
        setup_len: usize,
        record: *const u8,
        record_len: usize,
        request: *const u8,
        request_len: usize,
        credential_id: *const u8,
        credential_id_len: usize,
        seed: *const u8,
    ) -> *mut u8 {
        let record = borrow(record, record_len);
        reply(
            Server::from_bytes(borrow(setup, setup_len))
                .and_then(|server| {
                    let mut rng = seeded(borrow(seed, SEED_LEN))?;
                    server.login_start(
                        &mut rng,
                        (!record.is_empty()).then_some(record),
                        borrow(request, request_len),
                        borrow(credential_id, credential_id_len),
                    )
                })
                .map(|started| {
                    let mut out = Vec::with_capacity(
                        LENGTH_PREFIX + started.state.len() + started.message.len(),
                    );
                    out.extend_from_slice(&(started.state.len() as u32).to_le_bytes());
                    out.extend_from_slice(&started.state);
                    out.extend_from_slice(&started.message);
                    out
                }),
        )
    }

    #[no_mangle]
    pub unsafe extern "C" fn aster_opaque_server_login_finish(
        state: *const u8,
        state_len: usize,
        finalization: *const u8,
        finalization_len: usize,
    ) -> *mut u8 {
        reply(
            login_finish(
                borrow(state, state_len),
                borrow(finalization, finalization_len),
            )
            .map(|_| Vec::new()),
        )
    }
}
