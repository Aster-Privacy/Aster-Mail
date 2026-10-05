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
import type { Key } from "openpgp";

import { load_openpgp } from "@/services/crypto/openpgp_loader";

const MODERN_ALGORITHMS = new Set(["x25519", "x448", "ed25519", "ed448"]);

type KeyLike = {
  keyPacket: { version: number };
  getAlgorithmInfo: () => { algorithm: string };
};

function packet_is_known_bad(key: KeyLike): boolean {
  try {
    return (
      key.keyPacket.version === 4 &&
      MODERN_ALGORITHMS.has(key.getAlgorithmInfo().algorithm)
    );
  } catch {
    return false;
  }
}

export function is_known_bad_key(key: Key): boolean {
  if (packet_is_known_bad(key as unknown as KeyLike)) return true;

  return key
    .getSubkeys()
    .some((subkey) => packet_is_known_bad(subkey as unknown as KeyLike));
}

export async function is_publishable_armored_key(
  armored_key: string,
): Promise<boolean> {
  let key: Key;

  try {
    const openpgp = await load_openpgp();

    key = await openpgp.readKey({ armoredKey: armored_key });
  } catch {
    return true;
  }

  return !is_known_bad_key(key);
}
