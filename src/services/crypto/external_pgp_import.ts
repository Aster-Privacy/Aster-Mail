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
import type {
  AnyKeyPacket,
  AnyPacket,
  AnySecretKeyPacket,
  Config,
  PrivateKey,
  SignaturePacket,
  Subkey,
  User,
  UserIDPacket,
} from "openpgp";

import {
  load_openpgp,
  type openpgp_module,
} from "@/services/crypto/openpgp_loader";

interface private_key_runtime {
  clone(clone_key_packet?: boolean): PrivateKey;
  getPrimarySelfSignature(date?: Date): Promise<SignaturePacket>;
  validate(): Promise<void>;
}

function key_runtime(key: PrivateKey): private_key_runtime {
  return key as unknown as private_key_runtime;
}

export function get_primary_self_signature(
  key: PrivateKey,
  date?: Date,
): Promise<SignaturePacket> {
  return key_runtime(key).getPrimarySelfSignature(date);
}

export type external_key_rejection =
  | "unreadable"
  | "not_private"
  | "unsupported_version"
  | "unsupported_algorithm"
  | "rsa_too_large"
  | "weak_rsa"
  | "stub_key"
  | "missing_secret"
  | "passphrase_required"
  | "wrong_passphrase"
  | "invalid_key_material"
  | "expired"
  | "revoked"
  | "invalid_self_signature"
  | "weak_self_signature"
  | "no_encryption_subkey"
  | "fingerprint_changed";

export type external_key_warning = "rsa_2048" | "expires_soon";

export type external_key_change =
  | "preferences_updated"
  | "user_id_added"
  | "user_attributes_removed"
  | "third_party_certifications_removed"
  | "inactive_user_ids_removed"
  | "inactive_subkeys_removed";

export type external_key_algorithm = "rsa" | "curve25519";

export interface external_key_summary {
  fingerprint: string;
  key_id: string;
  algorithm: external_key_algorithm;
  key_size: number;
  created_at: Date;
  expires_at: Date | null;
  user_ids: string[];
  warnings: external_key_warning[];
}

export interface normalized_external_key {
  key: PrivateKey;
  summary: external_key_summary;
  changes: external_key_change[];
}

export class external_key_import_error extends Error {
  readonly reason: external_key_rejection;

  constructor(reason: external_key_rejection) {
    super(`external key rejected: ${reason}`);
    this.name = "external_key_import_error";
    this.reason = reason;
  }
}

const ALGORITHM_RSA_ENCRYPT_SIGN = 1;
const ALGORITHM_RSA_ENCRYPT = 2;
const ALGORITHM_RSA_SIGN = 3;
const ALGORITHM_ECDH = 18;
const ALGORITHM_EDDSA_LEGACY = 22;
const RSA_ALGORITHMS = new Set([
  ALGORITHM_RSA_ENCRYPT_SIGN,
  ALGORITHM_RSA_ENCRYPT,
  ALGORITHM_RSA_SIGN,
]);
const RSA_MIN_BITS = 2048;
const RSA_RECOMMENDED_BITS = 3072;
const RSA_MAX_BITS = 4096;
const WEAK_HASH_ALGORITHMS = new Set([1, 2, 3, 11]);
const HASH_SHA256 = 8;
const HASH_SHA512 = 10;
const SYMMETRIC_AES128 = 7;
const SYMMETRIC_AES256 = 9;
const COMPRESSION_UNCOMPRESSED = 0;
const COMPRESSION_ZIP = 1;
const COMPRESSION_ZLIB = 2;
const FEATURE_MODIFICATION_DETECTION = 0x01;
const SIGNATURE_CERT_POSITIVE = 0x13;
const SIGNATURE_SUBKEY_BINDING = 0x18;
const SIGNATURE_KEY_BINDING = 0x19;
const SIGNATURE_SUBKEY_REVOCATION = 0x28;
const S2K_USAGE_NONE = 0;
const S2K_USAGE_AEAD = 253;
const S2K_USAGE_SHA1 = 254;
const KEY_FLAG_CERTIFY = 0x01;
const KEY_FLAG_SIGN = 0x02;
const DEFAULT_PRIMARY_FLAGS = KEY_FLAG_CERTIFY | KEY_FLAG_SIGN;
const EXPIRY_WARNING_MS = 30 * 24 * 60 * 60 * 1000;
const ARMOR_PRIVATE_HEADER = "-----BEGIN PGP PRIVATE KEY BLOCK-----";
const ARMOR_PUBLIC_HEADER = "-----BEGIN PGP PUBLIC KEY BLOCK-----";
const CURVE25519_KEY_SIZE = 255;

type key_signing_data = {
  key: AnyKeyPacket;
  bind?: AnyKeyPacket;
  userID?: UserIDPacket;
};

type signature_signer = {
  sign: (
    key: AnySecretKeyPacket,
    data: key_signing_data,
    date: Date,
    detached: boolean,
    config: Config,
  ) => Promise<void>;
};

function decode_text(bytes: Uint8Array): string {
  return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
}

function armored_text(bytes: Uint8Array): string | null {
  const head = decode_text(bytes.subarray(0, Math.min(bytes.length, 4096)));

  if (!head.includes("-----BEGIN PGP")) return null;

  return decode_text(bytes);
}

function classify_parse_error(error: unknown): external_key_import_error {
  const message = error instanceof Error ? error.message.toLowerCase() : "";

  if (message.includes("version")) {
    return new external_key_import_error("unsupported_version");
  }

  return new external_key_import_error("unreadable");
}

export async function parse_external_key(
  input: Uint8Array | string,
): Promise<PrivateKey> {
  const openpgp = await load_openpgp();
  const bytes =
    typeof input === "string" ? new TextEncoder().encode(input) : input;
  const armored = armored_text(bytes);

  if (armored !== null) {
    if (!armored.includes(ARMOR_PRIVATE_HEADER)) {
      throw new external_key_import_error(
        armored.includes(ARMOR_PUBLIC_HEADER) ? "not_private" : "unreadable",
      );
    }

    try {
      return await openpgp.readPrivateKey({ armoredKey: armored });
    } catch (error) {
      throw classify_parse_error(error);
    }
  }

  try {
    return await openpgp.readPrivateKey({ binaryKey: bytes });
  } catch (error) {
    const public_key = await openpgp
      .readKey({ binaryKey: bytes })
      .catch(() => null);

    if (public_key && !public_key.isPrivate()) {
      throw new external_key_import_error("not_private");
    }

    throw classify_parse_error(error);
  }
}

function key_packets(key: PrivateKey): AnyKeyPacket[] {
  return key.getKeys().map(({ keyPacket }) => keyPacket);
}

function is_secret_packet(packet: AnyKeyPacket): packet is AnySecretKeyPacket {
  const candidate = packet as Partial<AnySecretKeyPacket>;

  return (
    typeof candidate.isDummy === "function" &&
    typeof candidate.decrypt === "function"
  );
}

export function check_external_key_structure(key: PrivateKey): void {
  if (!key.isPrivate()) {
    throw new external_key_import_error("not_private");
  }

  for (const packet of key_packets(key)) {
    if (packet.version !== 4) {
      throw new external_key_import_error("unsupported_version");
    }

    if (!is_secret_packet(packet)) {
      throw new external_key_import_error("missing_secret");
    }

    if (packet.isDummy() || packet.isMissingSecretKeyMaterial()) {
      throw new external_key_import_error("stub_key");
    }
  }
}

export function external_key_needs_passphrase(key: PrivateKey): boolean {
  return key_packets(key).some(
    (packet) => is_secret_packet(packet) && !packet.isDecrypted(),
  );
}

export async function unlock_external_key(
  key: PrivateKey,
  passphrase: string,
): Promise<PrivateKey> {
  check_external_key_structure(key);

  const clone = key_runtime(key).clone(true);

  if (!external_key_needs_passphrase(clone)) return clone;

  if (!passphrase) {
    throw new external_key_import_error("passphrase_required");
  }

  const weak_checksum = key_packets(clone).some(has_weak_checksum);

  for (const packet of key_packets(clone)) {
    if (!is_secret_packet(packet) || packet.isDecrypted()) continue;

    try {
      await packet.decrypt(passphrase);
    } catch {
      throw new external_key_import_error("wrong_passphrase");
    }
  }

  try {
    await key_runtime(clone).validate();
  } catch {
    throw new external_key_import_error(
      weak_checksum ? "wrong_passphrase" : "invalid_key_material",
    );
  }

  return clone;
}

function has_weak_checksum(packet: AnyKeyPacket): boolean {
  if (!is_secret_packet(packet) || packet.isDecrypted()) return false;

  const usage = (packet as unknown as { s2kUsage?: number }).s2kUsage;

  return (
    typeof usage === "number" &&
    usage !== S2K_USAGE_NONE &&
    usage !== S2K_USAGE_AEAD &&
    usage !== S2K_USAGE_SHA1
  );
}

function check_packet_algorithm(packet: AnyKeyPacket): number | null {
  const algorithm = packet.algorithm as number;
  const info = packet.getAlgorithmInfo();

  if (RSA_ALGORITHMS.has(algorithm)) {
    const bits = info.bits ?? 0;

    if (bits < RSA_MIN_BITS) {
      throw new external_key_import_error("weak_rsa");
    }

    if (bits > RSA_MAX_BITS) {
      throw new external_key_import_error("rsa_too_large");
    }

    return bits;
  }

  const curve = String(info.curve ?? "");

  if (algorithm === ALGORITHM_EDDSA_LEGACY && curve === "ed25519Legacy") {
    return null;
  }

  if (algorithm === ALGORITHM_ECDH && curve === "curve25519Legacy") {
    return null;
  }

  throw new external_key_import_error("unsupported_algorithm");
}

async function active_subkeys(key: PrivateKey, now: Date): Promise<Subkey[]> {
  const result: Subkey[] = [];

  for (const subkey of key.subkeys) {
    try {
      await subkey.verify(now);
      result.push(subkey);
    } catch {
      continue;
    }
  }

  return result;
}

type subkey_status = "active" | "revoked" | "expired" | "invalid";

function status_from_error(error: unknown): subkey_status {
  const message = error instanceof Error ? error.message.toLowerCase() : "";

  if (message.includes("subkey is revoked")) return "revoked";
  if (message.includes("subkey is expired")) return "expired";

  return "invalid";
}

async function subkey_status_at(
  subkey: Subkey,
  date: Date,
): Promise<subkey_status> {
  try {
    await subkey.verify(date);

    return "active";
  } catch (error) {
    return status_from_error(error);
  }
}

function newest_signature(
  signatures: SignaturePacket[],
): SignaturePacket | null {
  const sorted = [...signatures].sort(
    (a, b) => (b.created?.getTime() ?? 0) - (a.created?.getTime() ?? 0),
  );

  return sorted[0] ?? null;
}

async function classify_subkey(
  subkey: Subkey,
  now: Date,
): Promise<subkey_status> {
  const status = await subkey_status_at(subkey, now);

  if (status !== "invalid") return status;

  const binding = newest_signature(subkey.bindingSignatures);

  if (!binding?.created || binding.created.getTime() > now.getTime()) {
    return "invalid";
  }

  const earlier = await subkey_status_at(subkey, binding.created);

  return earlier === "invalid" ? "invalid" : "expired";
}

function algorithm_allowed(packet: AnyKeyPacket): boolean {
  try {
    check_packet_algorithm(packet);

    return true;
  } catch {
    return false;
  }
}

interface kept_subkey {
  subkey: Subkey;
  status: Exclude<subkey_status, "invalid">;
  binding: SignaturePacket | null;
  expiration_seconds: number | null;
}

async function inactive_expiration_seconds(
  subkey: Subkey,
  binding: SignaturePacket | null,
  status: kept_subkey["status"],
  now: Date,
): Promise<number | null | undefined> {
  const at = status === "expired" && binding?.created ? binding.created : now;
  const expiration = await subkey.getExpirationTime(at).catch(() => null);

  if (expiration instanceof Date) {
    const seconds = expiry_seconds(subkey.getCreationTime(), expiration);

    return seconds ?? undefined;
  }

  return status === "expired" ? undefined : null;
}

async function kept_subkeys(key: PrivateKey, now: Date): Promise<kept_subkey[]> {
  const result: kept_subkey[] = [];

  for (const subkey of key.subkeys) {
    const status = await classify_subkey(subkey, now);

    if (status === "invalid") continue;

    if (status === "active") {
      const binding = latest_signature(subkey.bindingSignatures, now);

      result.push({
        subkey,
        status,
        binding,
        expiration_seconds:
          binding && binding.keyNeverExpires === false
            ? binding.keyExpirationTime
            : null,
      });
      continue;
    }

    if (!algorithm_allowed(subkey.keyPacket)) continue;

    const binding =
      latest_signature(subkey.bindingSignatures, now) ??
      newest_signature(subkey.bindingSignatures);
    const expiration_seconds = await inactive_expiration_seconds(
      subkey,
      binding,
      status,
      now,
    );

    if (expiration_seconds === undefined) continue;

    result.push({ subkey, status, binding, expiration_seconds });
  }

  return result;
}

function latest_revocation(subkey: Subkey): SignaturePacket | null {
  return newest_signature(subkey.revocationSignatures);
}

async function active_users(key: PrivateKey, now: Date): Promise<User[]> {
  const result: User[] = [];

  for (const user of key.users) {
    if (!user.userID) continue;

    try {
      await user.verify(now);
      result.push(user);
    } catch {
      continue;
    }
  }

  return result;
}

function user_email(user: User): string {
  return (user.userID?.email ?? "").trim().toLowerCase();
}

async function primary_expiry(key: PrivateKey): Promise<Date | null> {
  const expiry = await key.getExpirationTime();

  return expiry instanceof Date ? expiry : null;
}

function rejection_from_primary_error(error: unknown): external_key_rejection {
  const message = error instanceof Error ? error.message.toLowerCase() : "";

  if (message.includes("revoked")) return "revoked";
  if (message.includes("expired")) return "expired";

  return "invalid_self_signature";
}

export async function validate_external_key(
  key: PrivateKey,
  now: Date = new Date(),
): Promise<external_key_summary> {
  check_external_key_structure(key);

  if (await key.isRevoked(undefined, undefined, now)) {
    throw new external_key_import_error("revoked");
  }

  try {
    await key.verifyPrimaryKey(now);
  } catch (error) {
    throw new external_key_import_error(rejection_from_primary_error(error));
  }

  const self_signature = await get_primary_self_signature(key, now).catch(
    () => null,
  );

  if (!self_signature) {
    throw new external_key_import_error("invalid_self_signature");
  }

  if (
    self_signature.hashAlgorithm === null ||
    WEAK_HASH_ALGORITHMS.has(self_signature.hashAlgorithm as number)
  ) {
    throw new external_key_import_error("weak_self_signature");
  }

  const subkeys = await active_subkeys(key, now);
  let smallest_rsa = check_packet_algorithm(key.keyPacket);

  for (const subkey of subkeys) {
    const bits = check_packet_algorithm(subkey.keyPacket);

    if (bits !== null) {
      smallest_rsa =
        smallest_rsa === null ? bits : Math.min(smallest_rsa, bits);
    }
  }

  try {
    await key.getEncryptionKey(undefined, now);
  } catch {
    throw new external_key_import_error("no_encryption_subkey");
  }

  const expires_at = await primary_expiry(key);
  const warnings: external_key_warning[] = [];

  if (smallest_rsa !== null && smallest_rsa < RSA_RECOMMENDED_BITS) {
    warnings.push("rsa_2048");
  }

  if (
    expires_at &&
    expires_at.getTime() - now.getTime() < EXPIRY_WARNING_MS
  ) {
    warnings.push("expires_soon");
  }

  const users = await active_users(key, now);
  const is_rsa = RSA_ALGORITHMS.has(key.keyPacket.algorithm as number);

  return {
    fingerprint: key.getFingerprint().toLowerCase(),
    key_id: key.getKeyID().toHex().toLowerCase(),
    algorithm: is_rsa ? "rsa" : "curve25519",
    key_size: is_rsa
      ? (key.keyPacket.getAlgorithmInfo().bits ?? 0)
      : CURVE25519_KEY_SIZE,
    created_at: key.getCreationTime(),
    expires_at,
    user_ids: users
      .map((user) => user.userID?.userID ?? "")
      .filter((label) => label.length > 0),
    warnings,
  };
}

function latest_signature(
  signatures: SignaturePacket[],
  now: Date,
): SignaturePacket | null {
  const live = signatures
    .filter((signature) => !signature.isExpired(now))
    .sort((a, b) => (b.created?.getTime() ?? 0) - (a.created?.getTime() ?? 0));

  return live[0] ?? null;
}

function expiry_seconds(created: Date, expires_at: Date | null): number | null {
  if (!expires_at) return null;

  const seconds = Math.floor(
    (expires_at.getTime() - created.getTime()) / 1000,
  );

  return seconds > 0 ? seconds : null;
}

async function create_signature(
  openpgp: openpgp_module,
  signing_packet: AnySecretKeyPacket,
  data: key_signing_data,
  properties: Partial<SignaturePacket>,
  date: Date,
): Promise<SignaturePacket> {
  const signature = new openpgp.SignaturePacket();

  Object.assign(signature, properties);
  signature.publicKeyAlgorithm = signing_packet.algorithm;
  signature.hashAlgorithm = HASH_SHA512 as SignaturePacket["hashAlgorithm"];

  await (signature as unknown as signature_signer).sign(
    signing_packet,
    data,
    date,
    false,
    openpgp.config as Config,
  );

  return signature;
}

function preference_properties(): Partial<SignaturePacket> {
  return {
    preferredSymmetricAlgorithms: [
      SYMMETRIC_AES256,
      SYMMETRIC_AES128,
    ] as SignaturePacket["preferredSymmetricAlgorithms"],
    preferredHashAlgorithms: [
      HASH_SHA512,
      HASH_SHA256,
    ] as SignaturePacket["preferredHashAlgorithms"],
    preferredCompressionAlgorithms: [
      COMPRESSION_UNCOMPRESSED,
      COMPRESSION_ZLIB,
      COMPRESSION_ZIP,
    ] as SignaturePacket["preferredCompressionAlgorithms"],
    features: new Uint8Array([FEATURE_MODIFICATION_DETECTION]),
  };
}

function first_flag(signature: SignaturePacket | null, fallback: number) {
  return signature?.keyFlags && signature.keyFlags.length > 0
    ? signature.keyFlags[0]
    : fallback;
}

async function subkey_packets(
  openpgp: openpgp_module,
  primary_packet: AnySecretKeyPacket,
  entry: kept_subkey,
  now: Date,
): Promise<AnyPacket[]> {
  const { subkey, status, binding, expiration_seconds } = entry;
  const subkey_packet = subkey.keyPacket as AnySecretKeyPacket;
  const flags = first_flag(binding, 0);
  const data = { key: primary_packet, bind: subkey_packet };
  const properties: Partial<SignaturePacket> = {
    signatureType: SIGNATURE_SUBKEY_BINDING as SignaturePacket["signatureType"],
    keyFlags: new Uint8Array([flags]),
    keyExpirationTime: expiration_seconds,
    keyNeverExpires: expiration_seconds === null,
  };

  if (flags & KEY_FLAG_SIGN) {
    properties.embeddedSignature = await create_signature(
      openpgp,
      subkey_packet,
      data,
      {
        signatureType: SIGNATURE_KEY_BINDING as SignaturePacket["signatureType"],
      },
      now,
    );
  }

  const result: AnyPacket[] = [
    subkey_packet,
    await create_signature(openpgp, primary_packet, data, properties, now),
  ];

  if (status === "revoked") {
    const original = latest_revocation(subkey);
    const revoked_at =
      original?.created && original.created.getTime() <= now.getTime()
        ? original.created
        : now;

    result.push(
      await create_signature(
        openpgp,
        primary_packet,
        data,
        {
          signatureType:
            SIGNATURE_SUBKEY_REVOCATION as SignaturePacket["signatureType"],
          reasonForRevocationFlag: original?.reasonForRevocationFlag ?? null,
          reasonForRevocationString:
            original?.reasonForRevocationString ?? null,
        },
        revoked_at,
      ),
    );
  }

  return result;
}

async function assemble_key(
  openpgp: openpgp_module,
  header: AnyPacket[],
  primary_packet: AnySecretKeyPacket,
  entries: kept_subkey[],
  now: Date,
): Promise<PrivateKey> {
  const packets = new openpgp.PacketList<AnyPacket>();

  packets.push(...header);

  for (const entry of entries) {
    packets.push(...(await subkey_packets(openpgp, primary_packet, entry, now)));
  }

  return new openpgp.PrivateKey(packets);
}

async function mismatched_subkeys(
  normalized: PrivateKey,
  entries: kept_subkey[],
  now: Date,
): Promise<Set<Subkey>> {
  const result = new Set<Subkey>();

  for (const entry of entries) {
    const id = entry.subkey.getKeyID();
    const rebuilt = normalized.subkeys.find((candidate) =>
      candidate.getKeyID().equals(id),
    );

    if (!rebuilt || (await subkey_status_at(rebuilt, now)) !== entry.status) {
      result.add(entry.subkey);
    }
  }

  return result;
}

export async function normalize_external_key(
  key: PrivateKey,
  primary_address: string,
  now: Date = new Date(),
): Promise<normalized_external_key> {
  const openpgp = await load_openpgp();

  if (external_key_needs_passphrase(key)) {
    throw new external_key_import_error("passphrase_required");
  }

  await validate_external_key(key, now);

  const original_fingerprint = key.getFingerprint().toLowerCase();
  const primary_packet = key.keyPacket as AnySecretKeyPacket;
  const primary_signature = await get_primary_self_signature(key, now);
  const primary_user = await key.getPrimaryUser(now).catch(() => null);
  const users = await active_users(key, now);
  const kept = await kept_subkeys(key, now);
  const changes: external_key_change[] = ["preferences_updated"];
  const address = primary_address.trim().toLowerCase();

  if (key.users.some((user) => user.userAttribute)) {
    changes.push("user_attributes_removed");
  }

  if (key.users.some((user) => user.otherCertifications.length > 0)) {
    changes.push("third_party_certifications_removed");
  }

  if (key.users.filter((user) => user.userID).length > users.length) {
    changes.push("inactive_user_ids_removed");
  }

  const primary_flags = first_flag(primary_signature, DEFAULT_PRIMARY_FLAGS);
  const key_expiration_time = expiry_seconds(
    key.getCreationTime(),
    await primary_expiry(key),
  );
  const user_id_packets: UserIDPacket[] = users.map((user) => user.userID!);
  const has_address = users.some((user) => user_email(user) === address);

  if (address && !has_address) {
    const name = primary_user?.user.userID?.name ?? "";

    user_id_packets.push(
      openpgp.UserIDPacket.fromObject(
        name ? { name, email: address } : { email: address },
      ),
    );
    changes.push("user_id_added");
  }

  if (user_id_packets.length === 0) {
    throw new external_key_import_error("invalid_self_signature");
  }

  const primary_user_id = primary_user?.user.userID ?? user_id_packets[0];
  const header: AnyPacket[] = [primary_packet];

  for (const user_id_packet of user_id_packets) {
    const certification = await create_signature(
      openpgp,
      primary_packet,
      { userID: user_id_packet, key: primary_packet },
      {
        ...preference_properties(),
        signatureType:
          SIGNATURE_CERT_POSITIVE as SignaturePacket["signatureType"],
        keyFlags: new Uint8Array([primary_flags]),
        keyExpirationTime: key_expiration_time,
        keyNeverExpires: key_expiration_time === null,
        isPrimaryUserID: user_id_packet === primary_user_id ? true : null,
      },
      now,
    );

    header.push(user_id_packet, certification);
  }

  let entries = kept;
  let normalized = await assemble_key(
    openpgp,
    header,
    primary_packet,
    entries,
    now,
  );
  const mismatched = await mismatched_subkeys(normalized, entries, now);

  if (mismatched.size > 0) {
    entries = entries.filter((entry) => !mismatched.has(entry.subkey));
    normalized = await assemble_key(
      openpgp,
      header,
      primary_packet,
      entries,
      now,
    );
  }

  if (key.subkeys.length > entries.length) {
    changes.push("inactive_subkeys_removed");
  }

  if (normalized.getFingerprint().toLowerCase() !== original_fingerprint) {
    throw new external_key_import_error("fingerprint_changed");
  }

  const summary = await validate_external_key(normalized, now);

  return { key: normalized, summary, changes };
}

export function serialize_unprotected_key(key: PrivateKey): Uint8Array {
  if (external_key_needs_passphrase(key)) {
    throw new external_key_import_error("passphrase_required");
  }

  return key.write() as Uint8Array;
}

export async function read_unprotected_key(
  bytes: Uint8Array,
): Promise<PrivateKey> {
  const openpgp = await load_openpgp();
  const key = await openpgp.readPrivateKey({ binaryKey: bytes });

  if (external_key_needs_passphrase(key)) {
    throw new external_key_import_error("passphrase_required");
  }

  return key;
}
