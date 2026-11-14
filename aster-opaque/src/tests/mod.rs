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
use rand_chacha::rand_core::SeedableRng;
use rand_chacha::ChaCha20Rng;

use crate::*;

const USER: &[u8] = b"3f2b8c1e-7a4d-4e9b-9c60-5d1a2b3c4d5e";
const OTHER_USER: &[u8] = b"11111111-1111-4111-8111-111111111111";
const PASSWORD: &[u8] = b"correct horse battery staple";

fn seed(tag: u8) -> [u8; SEED_LEN] {
    [tag; SEED_LEN]
}

fn rng(tag: u8) -> ChaCha20Rng {
    ChaCha20Rng::from_seed(seed(tag))
}

fn server() -> Server {
    Server::generate(&mut rng(1))
}

fn register(server: &Server, user: &[u8], password: &[u8]) -> Vec<u8> {
    let started = client_registration_start(password, &seed(2)).unwrap();
    let response = server.registration_response(&started.message, user).unwrap();
    let upload =
        client_registration_finish(&started.state, password, &response, &seed(3)).unwrap();
    registration_record(&upload).unwrap()
}

fn sign_in(
    server: &Server,
    record: Option<&[u8]>,
    user: &[u8],
    password: &[u8],
) -> Result<(), OpaqueError> {
    let started = client_login_start(password, &seed(4)).unwrap();
    let challenge = server
        .login_start(&mut rng(5), record, &started.message, user)
        .unwrap();
    let finalization =
        client_login_finish(&started.state, password, &challenge.message, &seed(6))?;
    login_finish(&challenge.state, &finalization)
}

#[test]
fn the_right_password_signs_in() {
    let server = server();
    let record = register(&server, USER, PASSWORD);
    assert_eq!(sign_in(&server, Some(&record), USER, PASSWORD), Ok(()));
}

#[test]
fn a_wrong_password_is_rejected_on_the_client() {
    let server = server();
    let record = register(&server, USER, PASSWORD);
    assert_eq!(
        sign_in(&server, Some(&record), USER, b"wrong password"),
        Err(OpaqueError::Rejected)
    );
}

#[test]
fn an_account_without_a_record_gets_a_challenge_that_never_opens() {
    let server = server();
    let started = client_login_start(PASSWORD, &seed(4)).unwrap();
    let challenge = server
        .login_start(&mut rng(5), None, &started.message, USER)
        .unwrap();
    assert_eq!(challenge.message.len(), CREDENTIAL_RESPONSE_LEN);
    assert_eq!(
        client_login_finish(&started.state, PASSWORD, &challenge.message, &seed(6)),
        Err(OpaqueError::Rejected)
    );
}

#[test]
fn a_record_does_not_open_for_another_account() {
    let server = server();
    let record = register(&server, USER, PASSWORD);
    assert_eq!(
        sign_in(&server, Some(&record), OTHER_USER, PASSWORD),
        Err(OpaqueError::Rejected)
    );
}

#[test]
fn a_record_does_not_open_under_another_server_setup() {
    let record = register(&server(), USER, PASSWORD);
    let other = Server::generate(&mut rng(9));
    assert_eq!(
        sign_in(&other, Some(&record), USER, PASSWORD),
        Err(OpaqueError::Rejected)
    );
}

#[test]
fn the_server_rejects_a_finalization_from_another_session() {
    let server = server();
    let record = register(&server, USER, PASSWORD);
    let first = client_login_start(PASSWORD, &seed(4)).unwrap();
    let first_challenge = server
        .login_start(&mut rng(5), Some(&record), &first.message, USER)
        .unwrap();
    let first_finalization =
        client_login_finish(&first.state, PASSWORD, &first_challenge.message, &seed(6)).unwrap();
    let second = client_login_start(PASSWORD, &seed(7)).unwrap();
    let second_challenge = server
        .login_start(&mut rng(8), Some(&record), &second.message, USER)
        .unwrap();
    assert_eq!(
        login_finish(&second_challenge.state, &first_finalization),
        Err(OpaqueError::Rejected)
    );
    assert_eq!(login_finish(&first_challenge.state, &first_finalization), Ok(()));
}

#[test]
fn the_server_rejects_a_forged_finalization() {
    let server = server();
    let record = register(&server, USER, PASSWORD);
    let started = client_login_start(PASSWORD, &seed(4)).unwrap();
    let challenge = server
        .login_start(&mut rng(5), Some(&record), &started.message, USER)
        .unwrap();
    assert_eq!(
        login_finish(&challenge.state, &[7u8; CREDENTIAL_FINALIZATION_LEN]),
        Err(OpaqueError::Rejected)
    );
}

#[test]
fn messages_have_the_documented_lengths() {
    let server = server();
    let started = client_registration_start(PASSWORD, &seed(2)).unwrap();
    assert_eq!(started.message.len(), REGISTRATION_REQUEST_LEN);
    let response = server.registration_response(&started.message, USER).unwrap();
    assert_eq!(response.len(), REGISTRATION_RESPONSE_LEN);
    let upload =
        client_registration_finish(&started.state, PASSWORD, &response, &seed(3)).unwrap();
    assert_eq!(upload.len(), REGISTRATION_RECORD_LEN);
    let record = registration_record(&upload).unwrap();
    assert_eq!(record.len(), REGISTRATION_RECORD_LEN);
    let login = client_login_start(PASSWORD, &seed(4)).unwrap();
    assert_eq!(login.message.len(), CREDENTIAL_REQUEST_LEN);
    let challenge = server
        .login_start(&mut rng(5), Some(&record), &login.message, USER)
        .unwrap();
    assert_eq!(challenge.message.len(), CREDENTIAL_RESPONSE_LEN);
    let finalization =
        client_login_finish(&login.state, PASSWORD, &challenge.message, &seed(6)).unwrap();
    assert_eq!(finalization.len(), CREDENTIAL_FINALIZATION_LEN);
}

#[test]
fn a_known_and_an_unknown_account_get_challenges_of_the_same_shape() {
    let server = server();
    let record = register(&server, USER, PASSWORD);
    let started = client_login_start(PASSWORD, &seed(4)).unwrap();
    let known = server
        .login_start(&mut rng(5), Some(&record), &started.message, USER)
        .unwrap();
    let unknown = server
        .login_start(&mut rng(5), None, &started.message, OTHER_USER)
        .unwrap();
    assert_eq!(known.message.len(), unknown.message.len());
    assert_eq!(known.state.len(), unknown.state.len());
}

#[test]
fn an_unknown_account_gets_the_same_oprf_answer_every_time() {
    let server = server();
    let started = client_login_start(PASSWORD, &seed(4)).unwrap();
    let first = server
        .login_start(&mut rng(5), None, &started.message, OTHER_USER)
        .unwrap();
    let second = server
        .login_start(&mut rng(6), None, &started.message, OTHER_USER)
        .unwrap();
    assert_eq!(first.message[..32], second.message[..32]);
}

#[test]
fn malformed_input_is_refused_without_a_panic() {
    let server = server();
    assert_eq!(
        client_registration_start(PASSWORD, &[0u8; 31]).err(),
        Some(OpaqueError::Malformed)
    );
    assert_eq!(
        server.registration_response(&[0u8; 5], USER).err(),
        Some(OpaqueError::Malformed)
    );
    assert_eq!(
        server.registration_response(&[0u8; REGISTRATION_REQUEST_LEN], USER).err(),
        Some(OpaqueError::Malformed)
    );
    assert_eq!(registration_record(&[1u8; 10]).err(), Some(OpaqueError::Malformed));
    assert_eq!(
        server
            .login_start(&mut rng(5), None, &[0u8; CREDENTIAL_REQUEST_LEN], USER)
            .err(),
        Some(OpaqueError::Malformed)
    );
    let started = client_login_start(PASSWORD, &seed(4)).unwrap();
    assert_eq!(
        client_login_finish(&started.state, PASSWORD, &[0u8; 12], &seed(6)).err(),
        Some(OpaqueError::Malformed)
    );
    assert_eq!(
        server
            .login_start(&mut rng(5), Some(&[9u8; 7]), &started.message, USER)
            .err(),
        Some(OpaqueError::Internal)
    );
    assert_eq!(Server::from_bytes(&[1u8; 3]).err(), Some(OpaqueError::Malformed));
}

#[test]
fn a_server_setup_survives_storage() {
    let server = server();
    let record = register(&server, USER, PASSWORD);
    let restored = Server::from_bytes(&server.to_bytes()).unwrap();
    assert_eq!(sign_in(&restored, Some(&record), USER, PASSWORD), Ok(()));
}

#[test]
fn registration_is_deterministic_for_a_fixed_seed() {
    let server = server();
    assert_eq!(
        register(&server, USER, PASSWORD),
        register(&server, USER, PASSWORD)
    );
    assert_ne!(
        register(&server, USER, PASSWORD),
        register(&server, USER, b"another password")
    );
}

const VECTORS: &str = include_str!("../../vectors/login_v3.txt");

fn hex(bytes: &[u8]) -> String {
    bytes.iter().map(|byte| format!("{byte:02x}")).collect()
}

fn fixed_seed_vectors() -> String {
    let server = server();
    let registration = client_registration_start(PASSWORD, &seed(2)).unwrap();
    let registration_response = server
        .registration_response(&registration.message, USER)
        .unwrap();
    let upload =
        client_registration_finish(&registration.state, PASSWORD, &registration_response, &seed(3))
            .unwrap();
    let record = registration_record(&upload).unwrap();
    let login = client_login_start(PASSWORD, &seed(4)).unwrap();
    let challenge = server
        .login_start(&mut rng(5), Some(&record), &login.message, USER)
        .unwrap();
    let finalization =
        client_login_finish(&login.state, PASSWORD, &challenge.message, &seed(6)).unwrap();
    let unknown = server
        .login_start(&mut rng(5), None, &login.message, OTHER_USER)
        .unwrap();
    [
        ("password", hex(PASSWORD)),
        ("registration_start_seed", hex(&seed(2))),
        ("registration_finish_seed", hex(&seed(3))),
        ("login_start_seed", hex(&seed(4))),
        ("login_finish_seed", hex(&seed(6))),
        ("registration_request", hex(&registration.message)),
        ("registration_response", hex(&registration_response)),
        ("registration_upload", hex(&upload)),
        ("credential_request", hex(&login.message)),
        ("credential_response", hex(&challenge.message)),
        ("credential_finalization", hex(&finalization)),
        ("unknown_account_credential_response", hex(&unknown.message)),
    ]
    .iter()
    .map(|(name, value)| format!("{name}={value}\n"))
    .collect()
}

#[test]
fn fixed_seed_messages_match_the_shared_vectors() {
    assert_eq!(fixed_seed_vectors(), VECTORS.replace("\r\n", "\n"));
}
