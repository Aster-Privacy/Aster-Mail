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
import { useCallback, useEffect, useMemo, useRef } from "react";

export interface AttachmentSession {
  begin_read: () => number;
  end_read: (token: number) => void;
  is_current: (token: number) => boolean;
  has_pending_reads: () => boolean;
  reset: () => void;
}

export function use_attachment_session(
  on_pending_change?: (has_pending: boolean) => void,
): AttachmentSession {
  const generation_ref = useRef(0);
  const pending_ref = useRef(0);
  const on_pending_change_ref = useRef(on_pending_change);

  on_pending_change_ref.current = on_pending_change;

  const reset = useCallback(() => {
    generation_ref.current += 1;
    if (pending_ref.current === 0) return;
    pending_ref.current = 0;
    on_pending_change_ref.current?.(false);
  }, []);

  const begin_read = useCallback(() => {
    pending_ref.current += 1;
    on_pending_change_ref.current?.(true);

    return generation_ref.current;
  }, []);

  const end_read = useCallback((token: number) => {
    if (token !== generation_ref.current) return;
    pending_ref.current = Math.max(0, pending_ref.current - 1);
    on_pending_change_ref.current?.(pending_ref.current > 0);
  }, []);

  const is_current = useCallback(
    (token: number) => token === generation_ref.current,
    [],
  );

  const has_pending_reads = useCallback(() => pending_ref.current > 0, []);

  useEffect(
    () => () => {
      generation_ref.current += 1;
      pending_ref.current = 0;
    },
    [],
  );

  return useMemo(
    () => ({ begin_read, end_read, is_current, has_pending_reads, reset }),
    [begin_read, end_read, is_current, has_pending_reads, reset],
  );
}
