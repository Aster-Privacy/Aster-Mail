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
import type { EmailListState } from "@/types/email";
import type { FormatOptions } from "@/utils/date_format";

import {
  VIEW_PARAMS,
  fetch_mail_from_api,
  resolve_list_total,
} from "./email_list_helpers";
import { set_view_cache, view_cache } from "./email_list_cache";

import { drop_removed_after } from "@/services/removed_items";
import { apply_flag_intents } from "@/services/read_intent";
import { has_passphrase_in_memory } from "@/services/crypto/memory_key_store";
import { ignore_error } from "@/lib/ignore_error";

export const PREFETCH_VIEWS: readonly string[] = [
  "sent",
  "starred",
  "archive",
  "spam",
  "trash",
];

const LIST_VIEW_PREFIXES = ["folder-", "tag-", "alias-"];

export function is_prefetchable_list_view(view: string): boolean {
  return (
    Object.prototype.hasOwnProperty.call(VIEW_PARAMS, view) ||
    LIST_VIEW_PREFIXES.some((prefix) => view.startsWith(prefix))
  );
}

export interface ViewPrefetchContext {
  owner: string;
  user_email: string;
  format_options: FormatOptions;
  conversation_grouping: boolean;
  sort_order: "newest_first" | "oldest_first";
  page_size: number;
}

let context: ViewPrefetchContext | null = null;
let generation = 0;
const in_flight = new Map<string, Promise<boolean>>();
const controllers = new Set<AbortController>();

function same_context(a: ViewPrefetchContext, b: ViewPrefetchContext): boolean {
  return (
    a.owner === b.owner &&
    a.user_email === b.user_email &&
    a.format_options === b.format_options &&
    a.conversation_grouping === b.conversation_grouping &&
    a.sort_order === b.sort_order &&
    a.page_size === b.page_size
  );
}

export function set_view_prefetch_context(
  next: ViewPrefetchContext | null,
): void {
  if (next && context && same_context(context, next)) return;
  if (!next || !context || context.owner !== next.owner) {
    cancel_view_prefetch();
  }
  context = next;
}

export function cancel_view_prefetch(): void {
  generation += 1;
  for (const controller of controllers) controller.abort();
  controllers.clear();
  in_flight.clear();
}

export function is_list_view_ready(view: string): boolean {
  if (!is_prefetchable_list_view(view)) return true;

  const cached = view_cache.get(view);

  return !!cached && cached.state.has_initial_load;
}

async function run_prefetch(
  view: string,
  ctx: ViewPrefetchContext,
  started_generation: number,
): Promise<boolean> {
  const controller = new AbortController();

  controllers.add(controller);
  const started_at = Date.now();

  try {
    const result = await fetch_mail_from_api(
      view,
      controller.signal,
      ctx.format_options,
      ctx.user_email,
      ctx.page_size,
      undefined,
      0,
      ctx.conversation_grouping,
      ctx.sort_order,
    );

    if (!result || controller.signal.aborted) return false;
    if (started_generation !== generation) return false;
    if (is_list_view_ready(view)) return true;

    const state: EmailListState = {
      emails: apply_flag_intents(drop_removed_after(result.emails, started_at)),
      is_loading: false,
      is_loading_more: false,
      total_messages: resolve_list_total(result.total, 0, 0, 0),
      has_more: result.has_more,
      has_initial_load: true,
      has_load_error: false,
    };

    set_view_cache(view, {
      state,
      time: started_at,
      is_stale: false,
      conversation_grouping: ctx.conversation_grouping,
      page: 0,
      page_offsets: [[1, result.raw_consumed]],
    });

    return true;
  } catch (caught) {
    ignore_error("hooks/view_prefetch:run_prefetch", caught);

    return false;
  } finally {
    controllers.delete(controller);
  }
}

export function prefetch_view(view: string): Promise<boolean> {
  if (is_list_view_ready(view)) return Promise.resolve(true);

  const ctx = context;

  if (!ctx || !has_passphrase_in_memory()) return Promise.resolve(false);

  const existing = in_flight.get(view);

  if (existing) return existing;

  const started_generation = generation;
  const pending = run_prefetch(view, ctx, started_generation).finally(() => {
    if (in_flight.get(view) === pending) in_flight.delete(view);
  });

  in_flight.set(view, pending);

  return pending;
}

type IdleScheduler = (callback: () => void) => () => void;

const schedule_idle: IdleScheduler = (callback) => {
  const idle_window = window as Window & {
    requestIdleCallback?: (
      cb: () => void,
      options?: { timeout: number },
    ) => number;
    cancelIdleCallback?: (handle: number) => void;
  };

  if (typeof idle_window.requestIdleCallback === "function") {
    const handle = idle_window.requestIdleCallback(callback, {
      timeout: 4000,
    });

    return () => idle_window.cancelIdleCallback?.(handle);
  }

  const timer = window.setTimeout(callback, 1500);

  return () => window.clearTimeout(timer);
};

export function prefetch_views_when_idle(
  views: readonly string[],
  skip_view: string,
  schedule: IdleScheduler = schedule_idle,
): () => void {
  let cancelled = false;
  let cancel_pending: () => void = () => {};
  const queue = views.filter((view) => view !== skip_view);

  const next = () => {
    if (cancelled) return;

    const view = queue.shift();

    if (view === undefined) return;

    cancel_pending = schedule(() => {
      if (cancelled) return;
      void prefetch_view(view).then(next);
    });
  };

  next();

  return () => {
    cancelled = true;
    cancel_pending();
  };
}
