//! # Cryptography module

use self::hash::HashAlgorithm;
use crate::types::PublicParams;

pub mod aead;
pub mod aes_kw;
pub mod checksum;
pub mod dsa;
pub mod ecc_curve;
pub mod ecdh;
pub mod ecdsa;
pub mod eddsa;
pub mod hash;
pub mod public_key;
pub mod rsa;
pub mod sym;
pub mod x25519;
pub mod x448;

pub trait Decryptor {
    type EncryptionFields<'a>;

    fn decrypt(&self, data: Self::EncryptionFields<'_>) -> crate::errors::Result<Vec<u8>>;
}

pub trait Signer {
    // TODO: make pub_params type safe
    fn sign(
        &self,
        hash: HashAlgorithm,
        digest: &[u8],
        pub_params: &PublicParams,
    ) -> crate::errors::Result<Vec<Vec<u8>>>;
}

pub trait KeyParams {
    type KeyParams;

    fn key_params(&self) -> Self::KeyParams;
}

pub(crate) struct RngNext<'a, R: ?Sized>(pub(crate) &'a mut R);

impl<R: rand::RngCore + rand::CryptoRng + ?Sized> rand_core_next::TryRng for RngNext<'_, R> {
    type Error = core::convert::Infallible;

    fn try_next_u32(&mut self) -> Result<u32, Self::Error> {
        Ok(self.0.next_u32())
    }

    fn try_next_u64(&mut self) -> Result<u64, Self::Error> {
        Ok(self.0.next_u64())
    }

    fn try_fill_bytes(&mut self, dst: &mut [u8]) -> Result<(), Self::Error> {
        self.0.fill_bytes(dst);
        Ok(())
    }
}

impl<R: rand::RngCore + rand::CryptoRng + ?Sized> rand_core_next::TryCryptoRng for RngNext<'_, R> {}
