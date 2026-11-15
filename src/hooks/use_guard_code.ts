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
import type { GuardDevice } from "@/services/guard/guard_device";

import { useEffect, useRef, useState } from "react";

import {
  guard_code_at,
  guard_code_seconds_left,
  GUARD_CODE_STEP_SECONDS,
} from "@/lib/crypto/guard_code";
import { server_now } from "@/lib/server_clock";

export interface GuardCodeState {
  code: string | null;
  seconds_left: number;
  ready: boolean;
}

const TICK_MS = 1_000;

function current_seconds(): number {
  return Math.floor(server_now() / 1000);
}

export function use_guard_code(device: GuardDevice | null): GuardCodeState {
  const secret_ref = useRef<Uint8Array | null>(null);
  const [state, set_state] = useState<GuardCodeState>({
    code: null,
    seconds_left: GUARD_CODE_STEP_SECONDS,
    ready: false,
  });

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setInterval> | null = null;

    const tick = () => {
      const secret = secret_ref.current;
      const now = current_seconds();
      const seconds_left = guard_code_seconds_left(now);

      if (!secret) {
        set_state({ code: null, seconds_left, ready: true });

        return;
      }
      const code = guard_code_at(secret, now);

      set_state((prev) =>
        prev.code === code && prev.seconds_left === seconds_left && prev.ready
          ? prev
          : { code, seconds_left, ready: true },
      );
    };

    const load = async () => {
      let secret: Uint8Array | null = null;

      try {
        secret = device ? await device.code_secret() : null;
      } catch {
        secret = null;
      }
      if (!alive) {
        secret?.fill(0);

        return;
      }
      secret_ref.current = secret;
      tick();
      timer = setInterval(tick, TICK_MS);
    };

    void load();

    return () => {
      alive = false;
      if (timer) clearInterval(timer);
      secret_ref.current?.fill(0);
      secret_ref.current = null;
    };
  }, [device]);

  return state;
}
