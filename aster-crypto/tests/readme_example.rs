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
use aster_crypto::decrypt::decrypt_and_verify;
use aster_crypto::encrypt::encrypt_and_sign;
use aster_crypto::generate_keypair;

#[test]
fn readme_example() {
    let alice = generate_keypair("Alice", "alice@astermail.org").unwrap();
    let bob = generate_keypair("Bob", "bob@astermail.org").unwrap();

    let ct = encrypt_and_sign(b"hello", &[&bob.public_key()], &alice).unwrap();
    let pt = decrypt_and_verify(&ct, &[&bob], &[&alice.public_key()]).unwrap();

    assert_eq!(pt, b"hello");
}
