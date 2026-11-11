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
pub const DEVICE_CHALLENGE_LABEL: &[u8] = b"aster-device-challenge-v1";
pub const DEVICE_CHALLENGE_NONCE_LEN: usize = 32;

pub fn device_challenge_message(nonce: &[u8]) -> Result<Vec<u8>, String> {
    if nonce.len() != DEVICE_CHALLENGE_NONCE_LEN {
        return Err("invalid challenge nonce".to_string());
    }
    let mut message = Vec::with_capacity(DEVICE_CHALLENGE_LABEL.len() + nonce.len());
    message.extend_from_slice(DEVICE_CHALLENGE_LABEL);
    message.extend_from_slice(nonce);
    Ok(message)
}

#[cfg(test)]
mod tests {
    use super::*;
    use ed25519_dalek::{Signature, Signer, SigningKey};

    fn sign_device_challenge(key: &SigningKey, nonce: &[u8]) -> Result<Signature, String> {
        let message = device_challenge_message(nonce)?;
        Ok(key.sign(&message))
    }

    fn test_key() -> SigningKey {
        SigningKey::from_bytes(&[7u8; 32])
    }

    #[test]
    fn message_is_label_followed_by_nonce() {
        let nonce = [9u8; DEVICE_CHALLENGE_NONCE_LEN];
        let message = device_challenge_message(&nonce).unwrap();

        assert_eq!(message.len(), DEVICE_CHALLENGE_LABEL.len() + nonce.len());
        assert_eq!(
            &message[..DEVICE_CHALLENGE_LABEL.len()],
            DEVICE_CHALLENGE_LABEL
        );
        assert_eq!(&message[DEVICE_CHALLENGE_LABEL.len()..], &nonce[..]);
    }

    #[test]
    fn signature_verifies_over_labeled_message() {
        let key = test_key();
        let nonce = [3u8; DEVICE_CHALLENGE_NONCE_LEN];
        let signature = sign_device_challenge(&key, &nonce).unwrap();
        let mut labeled = DEVICE_CHALLENGE_LABEL.to_vec();
        labeled.extend_from_slice(&nonce);

        assert!(key
            .verifying_key()
            .verify_strict(&labeled, &signature)
            .is_ok());
    }

    #[test]
    fn signature_does_not_verify_over_raw_nonce() {
        let key = test_key();
        let nonce = [3u8; DEVICE_CHALLENGE_NONCE_LEN];
        let signature = sign_device_challenge(&key, &nonce).unwrap();

        assert!(key
            .verifying_key()
            .verify_strict(&nonce, &signature)
            .is_err());
    }

    #[test]
    fn signature_does_not_verify_for_other_nonce() {
        let key = test_key();
        let signature = sign_device_challenge(&key, &[3u8; DEVICE_CHALLENGE_NONCE_LEN]).unwrap();
        let mut other = DEVICE_CHALLENGE_LABEL.to_vec();
        other.extend_from_slice(&[4u8; DEVICE_CHALLENGE_NONCE_LEN]);

        assert!(key
            .verifying_key()
            .verify_strict(&other, &signature)
            .is_err());
    }

    #[test]
    fn wrong_nonce_lengths_are_rejected() {
        let key = test_key();
        for len in [0usize, 1, 16, 31, 33, 57, 64, 4096] {
            let nonce = vec![5u8; len];

            assert!(device_challenge_message(&nonce).is_err());
            assert!(sign_device_challenge(&key, &nonce).is_err());
        }
    }

    #[test]
    fn labeled_message_cannot_collide_with_raw_nonce() {
        let nonce = [0u8; DEVICE_CHALLENGE_NONCE_LEN];
        let message = device_challenge_message(&nonce).unwrap();

        assert_ne!(message.len(), DEVICE_CHALLENGE_NONCE_LEN);
    }
}
