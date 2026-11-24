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
import type { SerializedState, SkippedMessageKey } from "./double_ratchet";

import { describe, expect, it } from "vitest";

import vectors from "./ratchet_merge_vectors.json";
import {
  merge_ratchet_states,
  merge_retired_ratchet_state,
  retired_send_target,
} from "./ratchet_state_merge";

type Side = Record<string, unknown> & { skipped_count?: number };

function skipped(side: string, count: number): SkippedMessageKey[] {
  return Array.from({ length: count }, (_, index) => ({
    dh_public: side,
    message_number: index,
    message_key: `${side}-${index}`,
    timestamp: index,
  })) as unknown as SkippedMessageKey[];
}

function build(name: string, side: Side): SerializedState {
  const { skipped_count, ...fields } = side;

  return {
    conversation_id: "conv-vectors",
    state: {
      ...vectors.base_state,
      ...fields,
      skipped_message_keys: skipped(name, skipped_count ?? 0),
    },
  } as unknown as SerializedState;
}

describe("shared ratchet merge vectors", () => {
  for (const vector of vectors.vectors) {
    it(vector.name, () => {
      const merged = merge_ratchet_states(
        build("local", vector.local as Side),
        build("remote", vector.remote as Side),
        vector.remote_versioned,
      ).state as unknown as Record<string, unknown>;
      const { skipped_count, ...expected } = vector.expect as Side;

      for (const [field, value] of Object.entries(expected)) {
        expect(merged[field], field).toEqual(value);
      }

      if (skipped_count !== undefined) {
        expect((merged.skipped_message_keys as unknown[]).length).toBe(
          skipped_count,
        );
      }
    });
  }
});

describe("shared retired copy merge vectors", () => {
  for (const vector of vectors.retired_vectors) {
    it(vector.name, () => {
      const local = build("local", vector.local as Side);
      const remote = build("remote", vector.remote as Side);
      const merged = merge_retired_ratchet_state(local, remote)
        .state as unknown as Record<string, unknown>;
      const { skipped_count, ...expected } = vector.expect as Side;

      for (const [field, value] of Object.entries(expected)) {
        expect(merged[field], field).toEqual(value);
      }

      if (skipped_count !== undefined) {
        expect((merged.skipped_message_keys as unknown[]).length).toBe(
          skipped_count,
        );
      }

      expect(retired_send_target(local, remote)).toBe(vector.send_target);
    });
  }
});
