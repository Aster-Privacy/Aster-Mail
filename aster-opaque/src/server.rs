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
use opaque_ke::rand::{CryptoRng, RngCore};
use opaque_ke::{
    CredentialFinalization, CredentialRequest, Identifiers, RegistrationRequest,
    RegistrationUpload, ServerLogin, ServerLoginParameters, ServerRegistration, ServerSetup,
};
use zeroize::Zeroizing;

use crate::error::OpaqueError;
use crate::suite::{Suite, LOGIN_CONTEXT};

pub struct Server(ServerSetup<Suite>);

pub struct LoginStart {
    pub state: Zeroizing<Vec<u8>>,
    pub message: Vec<u8>,
}

fn login_parameters() -> ServerLoginParameters<'static, 'static> {
    ServerLoginParameters {
        context: Some(LOGIN_CONTEXT),
        identifiers: Identifiers::default(),
    }
}

impl Server {
    pub fn generate<R: RngCore + CryptoRng>(rng: &mut R) -> Self {
        Server(ServerSetup::<Suite>::new(rng))
    }

    pub fn from_bytes(setup: &[u8]) -> Result<Self, OpaqueError> {
        ServerSetup::<Suite>::deserialize(setup)
            .map(Server)
            .map_err(|_| OpaqueError::Malformed)
    }

    pub fn to_bytes(&self) -> Zeroizing<Vec<u8>> {
        Zeroizing::new(self.0.serialize().to_vec())
    }

    pub fn registration_response(
        &self,
        request: &[u8],
        credential_id: &[u8],
    ) -> Result<Vec<u8>, OpaqueError> {
        let request = RegistrationRequest::<Suite>::deserialize(request)
            .map_err(|_| OpaqueError::Malformed)?;
        let started = ServerRegistration::<Suite>::start(&self.0, request, credential_id)
            .map_err(|_| OpaqueError::Internal)?;
        Ok(started.message.serialize().to_vec())
    }

    pub fn login_start<R: RngCore + CryptoRng>(
        &self,
        rng: &mut R,
        record: Option<&[u8]>,
        request: &[u8],
        credential_id: &[u8],
    ) -> Result<LoginStart, OpaqueError> {
        let record = record
            .map(ServerRegistration::<Suite>::deserialize)
            .transpose()
            .map_err(|_| OpaqueError::Internal)?;
        let request =
            CredentialRequest::<Suite>::deserialize(request).map_err(|_| OpaqueError::Malformed)?;
        let started = ServerLogin::<Suite>::start(
            rng,
            &self.0,
            record,
            request,
            credential_id,
            login_parameters(),
        )
        .map_err(|_| OpaqueError::Internal)?;
        Ok(LoginStart {
            state: Zeroizing::new(started.state.serialize().to_vec()),
            message: started.message.serialize().to_vec(),
        })
    }
}

pub fn registration_record(upload: &[u8]) -> Result<Vec<u8>, OpaqueError> {
    let upload =
        RegistrationUpload::<Suite>::deserialize(upload).map_err(|_| OpaqueError::Malformed)?;
    Ok(ServerRegistration::<Suite>::finish(upload)
        .serialize()
        .to_vec())
}

pub fn login_finish(state: &[u8], finalization: &[u8]) -> Result<(), OpaqueError> {
    let state = ServerLogin::<Suite>::deserialize(state).map_err(|_| OpaqueError::Internal)?;
    let finalization = CredentialFinalization::<Suite>::deserialize(finalization)
        .map_err(|_| OpaqueError::Malformed)?;
    state
        .finish(finalization, login_parameters())
        .map(|_| ())
        .map_err(|_| OpaqueError::Rejected)
}
