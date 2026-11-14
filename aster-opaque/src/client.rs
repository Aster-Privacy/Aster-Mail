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
use opaque_ke::{
    ClientLogin, ClientLoginFinishParameters, ClientRegistration,
    ClientRegistrationFinishParameters, CredentialResponse, Identifiers, RegistrationResponse,
};
use rand_chacha::rand_core::SeedableRng;
use rand_chacha::ChaCha20Rng;
use zeroize::Zeroizing;

use crate::error::OpaqueError;
use crate::suite::{Suite, LOGIN_CONTEXT, SEED_LEN};

pub struct ClientStart {
    pub state: Zeroizing<Vec<u8>>,
    pub message: Vec<u8>,
}

fn seeded(seed: &[u8]) -> Result<ChaCha20Rng, OpaqueError> {
    let seed: [u8; SEED_LEN] = seed.try_into().map_err(|_| OpaqueError::Malformed)?;
    Ok(ChaCha20Rng::from_seed(seed))
}

pub fn client_registration_start(password: &[u8], seed: &[u8]) -> Result<ClientStart, OpaqueError> {
    let mut rng = seeded(seed)?;
    let started = ClientRegistration::<Suite>::start(&mut rng, password)
        .map_err(|_| OpaqueError::Internal)?;
    Ok(ClientStart {
        state: Zeroizing::new(started.state.serialize().to_vec()),
        message: started.message.serialize().to_vec(),
    })
}

pub fn client_registration_finish(
    state: &[u8],
    password: &[u8],
    response: &[u8],
    seed: &[u8],
) -> Result<Vec<u8>, OpaqueError> {
    let mut rng = seeded(seed)?;
    let state =
        ClientRegistration::<Suite>::deserialize(state).map_err(|_| OpaqueError::Malformed)?;
    let response = RegistrationResponse::<Suite>::deserialize(response)
        .map_err(|_| OpaqueError::Malformed)?;
    let finished = state
        .finish(
            &mut rng,
            password,
            response,
            ClientRegistrationFinishParameters::default(),
        )
        .map_err(|_| OpaqueError::Rejected)?;
    Ok(finished.message.serialize().to_vec())
}

pub fn client_login_start(password: &[u8], seed: &[u8]) -> Result<ClientStart, OpaqueError> {
    let mut rng = seeded(seed)?;
    let started =
        ClientLogin::<Suite>::start(&mut rng, password).map_err(|_| OpaqueError::Internal)?;
    Ok(ClientStart {
        state: Zeroizing::new(started.state.serialize().to_vec()),
        message: started.message.serialize().to_vec(),
    })
}

pub fn client_login_finish(
    state: &[u8],
    password: &[u8],
    response: &[u8],
    seed: &[u8],
) -> Result<Vec<u8>, OpaqueError> {
    let mut rng = seeded(seed)?;
    let state = ClientLogin::<Suite>::deserialize(state).map_err(|_| OpaqueError::Malformed)?;
    let response =
        CredentialResponse::<Suite>::deserialize(response).map_err(|_| OpaqueError::Malformed)?;
    let finished = state
        .finish(
            &mut rng,
            password,
            response,
            ClientLoginFinishParameters::new(Some(LOGIN_CONTEXT), Identifiers::default(), None),
        )
        .map_err(|_| OpaqueError::Rejected)?;
    Ok(finished.message.serialize().to_vec())
}
