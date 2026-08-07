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
use pgp::composed::{Deserializable, SignedPublicKey};
use pgp::crypto::public_key::PublicKeyAlgorithm;
use pgp::types::{KeyVersion, PublicKeyTrait};

use crate::error::{CryptoError, Result};

fn is_modern_algorithm(algorithm: PublicKeyAlgorithm) -> bool {
    matches!(
        algorithm,
        PublicKeyAlgorithm::X25519
            | PublicKeyAlgorithm::X448
            | PublicKeyAlgorithm::Ed25519
            | PublicKeyAlgorithm::Ed448
    )
}

fn packet_is_known_bad(version: KeyVersion, algorithm: PublicKeyAlgorithm) -> bool {
    version == KeyVersion::V4 && is_modern_algorithm(algorithm)
}

pub fn is_known_bad_published_key(armored_public_key: &str) -> bool {
    let Ok((signed_public_key, _)) = SignedPublicKey::from_string(armored_public_key) else {
        return false;
    };

    if packet_is_known_bad(
        PublicKeyTrait::version(&signed_public_key.primary_key),
        PublicKeyTrait::algorithm(&signed_public_key.primary_key),
    ) {
        return true;
    }

    signed_public_key.public_subkeys.iter().any(|sub| {
        packet_is_known_bad(
            PublicKeyTrait::version(&sub.key),
            PublicKeyTrait::algorithm(&sub.key),
        )
    })
}

pub fn ensure_publishable_key(armored_public_key: &str) -> Result<()> {
    if is_known_bad_published_key(armored_public_key) {
        return Err(CryptoError::InvalidKeyFormat(
            "non-standard PGP key: a v4 key using the modern X25519/Ed25519 algorithm IDs is rejected by strict OpenPGP implementations; regenerate the key as ed25519Legacy".into(),
        ));
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::keys::generate_keypair;

    const MODERN_V4_PUBLIC_KEY: &str = "-----BEGIN PGP PUBLIC KEY BLOCK-----\n\nxiYEakOyohvvSnYOHVEKq1Lx7kx6EGCYlDpiMfTcnYFx4UMrus4+Y80iQnJ1\nbm8gVGVzdCA8YnJ1bm90ZXN0QGV4YW1wbGUuY29tPsLADwQTGwoAhQWCakOy\nogMLCQcJEGopfWL5aEtBRRQAAAAAABwAIHNhbHRAbm90YXRpb25zLm9wZW5w\nZ3Bqcy5vcmebnGnOR0ZytXyKPha0jtPQoKtwo1sB1QSFQ1KKq6nKhQUVCggO\nDAQWAAIBAhkBApsDAh4BFiEEaWeXYPhYVPMJtkvVail9YvloS0EAALsa+yx2\nF8ELxWdHbtx1GAMfn+bqr0Y3oXggSEXBJ7xksWUNAQ92GRMyvz13NWpE+xOY\n80UeSyir4wftaEbfsubjC84mBGpDsqIZZ8JMkVAQw41d9fVlSyIwVorSm1xO\nEb24RzCcxWItCQ3CugQYGwoAcAWCakOyogkQail9YvloS0FFFAAAAAAAHAAg\nc2FsdEBub3RhdGlvbnMub3BlbnBncGpzLm9yZ3frVDb0X26/srtD0nUlxmnI\nCItI42aya24p92BW/0aIApsMFiEEaWeXYPhYVPMJtkvVail9YvloS0EAAHGT\nbJdv03TSbx/mdos45pk05Cqzx1y7Ouf8tipRfzBKSNfFr2J+dEK+/fQW9W/M\nGPeauy6x4yWHEJIYbgkgzOcWDQ==\n=+2R8\n-----END PGP PUBLIC KEY BLOCK-----\n";

    #[test]
    fn legacy_generated_key_is_allowed() {
        let keypair = generate_keypair("Test", "test@example.com").unwrap();
        let armored = keypair.public_key_armored().unwrap();
        assert!(!is_known_bad_published_key(&armored));
        assert!(ensure_publishable_key(&armored).is_ok());
    }

    #[test]
    fn modern_v4_key_is_rejected() {
        assert!(is_known_bad_published_key(MODERN_V4_PUBLIC_KEY));
        assert!(ensure_publishable_key(MODERN_V4_PUBLIC_KEY).is_err());
    }

    #[test]
    fn unparseable_input_is_fail_open() {
        assert!(!is_known_bad_published_key("not a key"));
        assert!(ensure_publishable_key("not a key").is_ok());
    }
}
