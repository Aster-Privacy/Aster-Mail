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
import type React from "react";

import { useMemo, useRef } from "react";

import {
  get_preload_in_flight,
  peek_preloaded_email,
} from "@/components/email/hooks/preload_cache_store";
import { prefetch_mail_item } from "@/services/api/mail";

export const PRESS_TAP_SLOP_PX = 10;
export const PRESS_TAP_MAX_MS = 500;

const PRESS_CONTROL_SELECTOR =
  'a, button, input, label, select, textarea, [role="button"], [role="checkbox"], [role="menuitem"], [data-star-btn]';

export function press_control(target: EventTarget | null): HTMLElement | null {
  if (!(target instanceof Element)) return null;

  return target.closest<HTMLElement>(PRESS_CONTROL_SELECTOR);
}

export function prefetch_item_on_press(
  email_id: string,
  conversation_grouping: boolean,
): boolean {
  if (get_preload_in_flight().has(email_id)) return false;

  const cached = peek_preloaded_email(email_id);

  if (
    cached &&
    !cached.is_stale &&
    cached.conversation_grouping === conversation_grouping
  ) {
    return false;
  }

  prefetch_mail_item(email_id);

  return true;
}

export interface PressPrefetchOptions {
  resolve_id: (e: React.PointerEvent) => string | null;
  conversation_grouping: boolean;
}

interface PendingTap {
  email_id: string;
  pointer_id: number;
  x: number;
  y: number;
  at: number;
}

export interface PressPrefetchHandlers {
  onPointerDown: (e: React.PointerEvent) => void;
  onPointerMove: (e: React.PointerEvent) => void;
  onPointerUp: (e: React.PointerEvent) => void;
  onPointerCancel: (e: React.PointerEvent) => void;
}

function is_plain_primary_press(e: React.PointerEvent): boolean {
  return (
    e.isPrimary !== false &&
    e.button === 0 &&
    !e.ctrlKey &&
    !e.metaKey &&
    !e.shiftKey &&
    !e.altKey
  );
}

function moved_past_slop(pending: PendingTap, e: React.PointerEvent): boolean {
  return (
    Math.abs(e.clientX - pending.x) > PRESS_TAP_SLOP_PX ||
    Math.abs(e.clientY - pending.y) > PRESS_TAP_SLOP_PX
  );
}

export function use_press_prefetch(
  options: PressPrefetchOptions,
): PressPrefetchHandlers {
  const options_ref = useRef(options);
  const pending_ref = useRef<PendingTap | null>(null);

  options_ref.current = options;

  return useMemo(() => {
    const fire = (email_id: string) => {
      prefetch_item_on_press(
        email_id,
        options_ref.current.conversation_grouping,
      );
    };

    return {
      onPointerDown: (e) => {
        pending_ref.current = null;
        if (!is_plain_primary_press(e)) return;

        const email_id = options_ref.current.resolve_id(e);

        if (!email_id) return;

        if (e.pointerType !== "touch") {
          fire(email_id);

          return;
        }

        pending_ref.current = {
          email_id,
          pointer_id: e.pointerId,
          x: e.clientX,
          y: e.clientY,
          at: performance.now(),
        };
      },
      onPointerMove: (e) => {
        const pending = pending_ref.current;

        if (!pending || pending.pointer_id !== e.pointerId) return;
        if (moved_past_slop(pending, e)) pending_ref.current = null;
      },
      onPointerUp: (e) => {
        const pending = pending_ref.current;

        pending_ref.current = null;
        if (!pending || pending.pointer_id !== e.pointerId) return;
        if (moved_past_slop(pending, e)) return;
        if (performance.now() - pending.at >= PRESS_TAP_MAX_MS) return;

        fire(pending.email_id);
      },
      onPointerCancel: () => {
        pending_ref.current = null;
      },
    };
  }, []);
}
