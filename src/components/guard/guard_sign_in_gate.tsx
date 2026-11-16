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
import type { GuardRequiredInfo } from "@/services/api/client/helpers";
import type { GuardRescueStart } from "@/services/api/guard";
import type {
  GuardSignInDeps,
  GuardSignInFinish,
  GuardSignInStart,
} from "@/services/guard/guard_sign_in";

import { useCallback, useEffect, useRef, useState } from "react";

import { GuardWaitingScreen } from "@/components/guard/guard_waiting_screen";
import { use_guard_sign_in } from "@/components/guard/use_guard_sign_in";
import {
  GuardRescueProgress,
  load_guard_rescue,
} from "@/pages/guard/guard_rescue_form";
import { GUARD_REQUIRED_EVENT } from "@/services/api/client/helpers";
import {
  default_guard_sign_in_deps,
  read_stored_guard_sign_in,
} from "@/services/guard/guard_sign_in";

export type GuardGateStart =
  | GuardSignInStart
  | { kind: "rescue"; rescue: GuardRescueStart };

export interface GuardSignInGate {
  guard_start: GuardGateStart | null;
  set_guard_user_hash: (user_hash: string | null) => void;
  clear_guard: () => void;
}

export function use_guard_sign_in_gate(
  deps: GuardSignInDeps = default_guard_sign_in_deps,
): GuardSignInGate {
  const user_hash_ref = useRef<string | null>(null);
  const [guard_start, set_guard_start] = useState<GuardGateStart | null>(
    () => {
      const stored = read_stored_guard_sign_in(deps.storage(), deps.now());

      if (stored) return { kind: "stored", stored };
      const rescue = load_guard_rescue();

      return rescue ? { kind: "rescue", rescue } : null;
    },
  );

  useEffect(() => {
    const on_required = (event: Event) => {
      const info = (event as CustomEvent<GuardRequiredInfo>).detail;

      if (!info?.request_id) return;
      set_guard_start({ kind: "fresh", info, user_hash: user_hash_ref.current });
    };

    window.addEventListener(GUARD_REQUIRED_EVENT, on_required);

    return () => window.removeEventListener(GUARD_REQUIRED_EVENT, on_required);
  }, []);

  const set_guard_user_hash = useCallback((user_hash: string | null) => {
    user_hash_ref.current = user_hash;
  }, []);
  const clear_guard = useCallback(() => set_guard_start(null), []);

  return { guard_start, set_guard_user_hash, clear_guard };
}

interface GuardSignInPanelProps {
  start: GuardGateStart;
  on_complete: GuardSignInFinish;
  on_back: () => void;
  deps?: GuardSignInDeps;
}

export function GuardSignInPanel(props: GuardSignInPanelProps) {
  const { start, on_back } = props;

  if (start.kind === "rescue") {
    return <GuardRescueScreen rescue={start.rescue} on_back={on_back} />;
  }

  return <GuardSignInFlow {...props} start={start} />;
}

function GuardRescueScreen({
  rescue,
  on_back,
}: {
  rescue: GuardRescueStart;
  on_back: () => void;
}) {
  return (
    <div className="w-full" data-testid="guard_rescue_screen">
      <GuardRescueProgress rescue={rescue} on_back={on_back} />
    </div>
  );
}

function GuardSignInFlow({
  start,
  on_complete,
  on_back,
  deps,
}: GuardSignInPanelProps & { start: GuardSignInStart }) {
  const guard = use_guard_sign_in(start, on_complete, deps);

  return (
    <GuardWaitingScreen
      state={guard.state}
      on_back={() => {
        guard.cancel();
        on_back();
      }}
      on_start_rescue={guard.start_rescue}
      on_submit_code={guard.submit_code}
    />
  );
}
