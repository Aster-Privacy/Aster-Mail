use std::ops::Deref;

use digest::{const_oid::AssociatedOid, Digest};
use md5::Md5;
use rand::{CryptoRng, Rng};
use ripemd::Ripemd160;
use rsa::traits::{PrivateKeyParts, PublicKeyParts};
use rsa::{BoxedUint, Pkcs1v15Encrypt, Pkcs1v15Sign};
use sha1_checked::Sha1; // not used for hashing, just as a source of the OID
use sha2::{Sha224, Sha256, Sha384, Sha512};
use sha3::{Sha3_256, Sha3_512};
use zeroize::{ZeroizeOnDrop, Zeroizing};

use crate::crypto::{hash::HashAlgorithm, Decryptor, KeyParams, RngNext, Signer};
use crate::errors::Result;
use crate::types::{Mpi, PkeskBytes, PlainSecretParams, PublicParams};

const MAX_KEY_SIZE: usize = 16384;

/// Private Key for RSA.
#[derive(derive_more::Debug, ZeroizeOnDrop)]
pub struct PrivateKey(#[debug("..")] rsa::PrivateKey);

impl Deref for PrivateKey {
    type Target = rsa::PrivateKey;

    fn deref(&self) -> &Self::Target {
        &self.0
    }
}

impl KeyParams for PrivateKey {
    type KeyParams = ();

    #[allow(clippy::unused_unit)]
    fn key_params(&self) -> Self::KeyParams {
        ()
    }
}

impl Decryptor for PrivateKey {
    type EncryptionFields<'a> = &'a Mpi;

    /// RSA decryption using PKCS1v15 padding.
    fn decrypt(&self, mpi: Self::EncryptionFields<'_>) -> Result<Vec<u8>> {
        let size = self.0.size();
        let ciphertext = mpi.as_bytes();
        ensure!(ciphertext.len() <= size, "invalid ciphertext length");
        let mut padded = vec![0u8; size];
        padded[size - ciphertext.len()..].copy_from_slice(ciphertext);
        let m = self.0.decrypt(Pkcs1v15Encrypt, &padded)?;

        Ok(m)
    }
}

impl Signer for PrivateKey {
    /// Sign using RSA, with PKCS1v15 padding.
    fn sign(
        &self,
        hash: HashAlgorithm,
        digest: &[u8],
        pub_params: &PublicParams,
    ) -> Result<Vec<Vec<u8>>> {
        ensure!(
            matches!(pub_params, PublicParams::RSA { .. }),
            "invalid public params"
        );

        let scheme = pkcs1v15_scheme(hash)?;
        let sig = self.0.sign(scheme, digest)?;

        Ok(vec![sig])
    }
}

impl From<rsa::PrivateKey> for PrivateKey {
    fn from(key: rsa::PrivateKey) -> Self {
        Self(key)
    }
}

impl PrivateKey {
    pub fn from_components(n: &[u8], e: &[u8], d: &[u8], p: &[u8], q: &[u8]) -> Result<Self> {
        let n = BoxedUint::from_be_slice_vartime(n);
        let e = BoxedUint::from_be_slice_vartime(e);
        let precision = n.bits_precision();
        let d = BoxedUint::from_be_slice(d, precision)
            .map_err(|_| format_err!("invalid rsa private exponent"))?;
        let p = BoxedUint::from_be_slice(p, precision)
            .map_err(|_| format_err!("invalid rsa prime"))?;
        let q = BoxedUint::from_be_slice(q, precision)
            .map_err(|_| format_err!("invalid rsa prime"))?;

        match rsa::PrivateKey::from_components(
            n.clone(),
            e.clone(),
            d.clone(),
            vec![p.clone(), q.clone()],
        ) {
            Ok(key) => Ok(Self(key)),
            Err(rsa::Error::InvalidPrime) => Ok(Self(
                rsa::PrivateKey::from_components_with_wide_primes(n, e, d, vec![p, q])?,
            )),
            Err(err) => Err(err.into()),
        }
    }
}

fn digest_info<D>() -> Pkcs1v15Sign
where
    D: Digest + AssociatedOid,
{
    let oid = D::OID.as_bytes();
    let oid_len = oid.len() as u8;
    let digest_len = <D as Digest>::output_size() as u8;
    let mut prefix = vec![
        0x30,
        oid_len + 8 + digest_len,
        0x30,
        oid_len + 4,
        0x6,
        oid_len,
    ];
    prefix.extend_from_slice(oid);
    prefix.extend_from_slice(&[0x05, 0x00, 0x04, digest_len]);

    Pkcs1v15Sign {
        hash_len: Some(<D as Digest>::output_size()),
        prefix: prefix.into_boxed_slice(),
    }
}

fn pkcs1v15_scheme(hash: HashAlgorithm) -> Result<Pkcs1v15Sign> {
    match hash {
        HashAlgorithm::None => Err(format_err!("none")),
        HashAlgorithm::MD5 => Ok(digest_info::<Md5>()),
        HashAlgorithm::RIPEMD160 => Ok(digest_info::<Ripemd160>()),
        HashAlgorithm::SHA1 => Ok(digest_info::<Sha1>()),
        HashAlgorithm::SHA2_224 => Ok(digest_info::<Sha224>()),
        HashAlgorithm::SHA2_256 => Ok(digest_info::<Sha256>()),
        HashAlgorithm::SHA2_384 => Ok(digest_info::<Sha384>()),
        HashAlgorithm::SHA2_512 => Ok(digest_info::<Sha512>()),
        HashAlgorithm::SHA3_256 => Ok(digest_info::<Sha3_256>()),
        HashAlgorithm::SHA3_512 => Ok(digest_info::<Sha3_512>()),
        HashAlgorithm::Private10 => unsupported_err!("Private10 should not be used"),
        HashAlgorithm::Other(o) => unsupported_err!("Hash algorithm {} is unsupported", o),
    }
}

fn public_key(n: &[u8], e: &[u8]) -> Result<rsa::PublicKey> {
    let key = rsa::PublicKey::new_with_size_limits(
        BoxedUint::from_be_slice_vartime(n),
        BoxedUint::from_be_slice_vartime(e),
        1..=MAX_KEY_SIZE,
    )?;
    Ok(key)
}

fn secret_mpi(value: &BoxedUint) -> Mpi {
    let bytes = Zeroizing::new(value.to_be_bytes());
    Mpi::from_slice(&bytes)
}

/// RSA encryption using PKCS1v15 padding.
pub fn encrypt<R: CryptoRng + Rng>(
    mut rng: R,
    n: &[u8],
    e: &[u8],
    plaintext: &[u8],
) -> Result<PkeskBytes> {
    let key = public_key(n, e)?;
    let data = key.encrypt(&mut RngNext(&mut rng), Pkcs1v15Encrypt, plaintext)?;

    Ok(PkeskBytes::Rsa {
        mpi: Mpi::from_slice(&data[..]),
    })
}

/// Generate an RSA KeyPair.
pub fn generate_key<R: Rng + CryptoRng>(
    mut rng: R,
    bit_size: usize,
) -> Result<(PublicParams, PlainSecretParams)> {
    let key = rsa::PrivateKey::new(&mut RngNext(&mut rng), bit_size)?;

    let p = &key.primes()[0];
    let q = &key.primes()[1];
    let u = Zeroizing::new(
        Option::<BoxedUint>::from(p.as_ref().invert_odd_mod(q)).ok_or_else(|| format_err!("invalid prime"))?,
    );

    Ok((
        PublicParams::RSA {
            n: Mpi::from_slice(&key.n().as_ref().to_be_bytes_trimmed_vartime()),
            e: Mpi::from_slice(&key.e().to_be_bytes_trimmed_vartime()),
        },
        PlainSecretParams::RSA {
            d: secret_mpi(key.d()),
            p: secret_mpi(p.as_ref()),
            q: secret_mpi(q.as_ref()),
            u: secret_mpi(&u),
        },
    ))
}

/// Verify a RSA, PKCS1v15 padded signature.
pub fn verify(
    n: &[u8],
    e: &[u8],
    hash: HashAlgorithm,
    hashed: &[u8],
    signature: &[u8],
) -> Result<()> {
    let key = public_key(n, e)?;
    let scheme = pkcs1v15_scheme(hash)?;

    let size = key.size();
    ensure!(signature.len() <= size, "invalid signature length");
    let mut signature_padded = vec![0u8; size];
    signature_padded[size - signature.len()..].copy_from_slice(signature);

    key.verify(scheme, hashed, &signature_padded)?;
    Ok(())
}
