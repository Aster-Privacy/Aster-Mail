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
  GuardSignInDeps,
  GuardSignInFinish,
  GuardSignInStart,
  GuardSignInState,
} from "@/services/guard/guard_sign_in";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  default_guard_sign_in_deps,
  GuardSignInController,
} from "@/services/guard/guard_sign_in";

const active = new Map<string, GuardSignInController>();

function start_request_id(start: GuardSignInStart): string {
  return start.kind === "fresh"
    ? start.info.request_id
    : start.stored.request_id;
}

function acquire(
  start: GuardSignInStart,
  finish: GuardSignInFinish,
  deps: GuardSignInDeps,
): GuardSignInController {
  const id = start_request_id(start);
  const existing = active.get(id);

  if (existing) {
    existing.set_finish(finish);

    return existing;
  }
  const controller = new GuardSignInController(start, finish, deps);

  active.set(id, controller);

  return controller;
}

function release(controller: GuardSignInController): void {
  setTimeout(() => {
    if (controller.listener_count() > 0) return;
    controller.stop();
    if (active.get(controller.get_request_id()) === controller) {
      active.delete(controller.get_request_id());
    }
  }, 0);
}

export interface GuardSignInHandle {
  state: GuardSignInState;
  number: number | null;
  phase: GuardSignInState["phase"];
  submit_code: (code: string) => Promise<void>;
  start_rescue: (rescue_code: string) => Promise<boolean>;
  cancel: () => void;
}

export function use_guard_sign_in(
  start: GuardSignInStart,
  on_complete: GuardSignInFinish,
  deps: GuardSignInDeps = default_guard_sign_in_deps,
): GuardSignInHandle {
  const finish_ref = useRef(on_complete);

  finish_ref.current = on_complete;
  const controller_ref = useRef<GuardSignInController | null>(null);

  if (
    !controller_ref.current ||
    controller_ref.current.get_request_id() !== start_request_id(start)
  ) {
    controller_ref.current = acquire(
      start,
      (response, passphrase) => finish_ref.current(response, passphrase),
      deps,
    );
  }
  const controller = controller_ref.current;
  const [state, set_state] = useState<GuardSignInState>(() =>
    controller.get_state(),
  );

  useEffect(() => {
    const unsubscribe = controller.subscribe(set_state);

    set_state(controller.get_state());
    controller.start();

    return () => {
      unsubscribe();
      release(controller);
    };
  }, [controller]);

  const submit_code = useCallback(
    (code: string) => controller.submit_code(code),
    [controller],
  );
  const start_rescue = useCallback(
    (code: string) => controller.start_rescue(code),
    [controller],
  );
  const cancel = useCallback(() => {
    controller.cancel();
    active.delete(controller.get_request_id());
  }, [controller]);

  return {
    state,
    number: state.number,
    phase: state.phase,
    submit_code,
    start_rescue,
    cancel,
  };
}
