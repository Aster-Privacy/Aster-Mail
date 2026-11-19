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
import { useCallback, useEffect, useRef, useState } from "react";

export const SENDER_WAIT_LIMIT_MS = 15000;

export function use_send_when_sender_ready(
  is_sender_pending: () => boolean,
  is_open = true,
) {
  const action_ref = useRef<(() => void) | null>(null);
  const [waiting, set_waiting] = useState(false);
  const pending_now = is_sender_pending();

  const cancel_wait = useCallback(() => {
    action_ref.current = null;
    set_waiting(false);
  }, []);

  const wait_for_sender = useCallback((action: () => void) => {
    action_ref.current = action;
    set_waiting(true);
  }, []);

  useEffect(() => {
    if (!waiting || pending_now) return;
    const action = action_ref.current;

    action_ref.current = null;
    set_waiting(false);
    action?.();
  }, [waiting, pending_now]);

  useEffect(() => {
    if (!waiting) return;
    const timer = window.setTimeout(cancel_wait, SENDER_WAIT_LIMIT_MS);

    return () => window.clearTimeout(timer);
  }, [waiting, cancel_wait]);

  useEffect(() => {
    if (!is_open) cancel_wait();
  }, [is_open, cancel_wait]);

  return { wait_for_sender, cancel_wait, waiting_for_sender: waiting };
}
