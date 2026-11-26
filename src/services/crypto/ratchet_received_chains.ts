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
export interface ReceivedChain {
  dh_public: string;
  next: number;
}

export const MAX_RECEIVED_CHAINS = 256;

export function record_received_chain(
  chains: ReceivedChain[] | undefined,
  dh_public: string,
  next: number,
): ReceivedChain[] {
  const existing = chains ?? [];
  const highest = existing.reduce(
    (current, chain) =>
      chain.dh_public === dh_public ? Math.max(current, chain.next) : current,
    next,
  );
  const kept = existing
    .filter((chain) => chain.dh_public !== dh_public)
    .map((chain) => ({ ...chain }));

  kept.push({ dh_public, next: highest });

  return kept.slice(Math.max(0, kept.length - MAX_RECEIVED_CHAINS));
}
