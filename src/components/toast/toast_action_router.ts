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
import type { NavigateOptions } from "react-router-dom";
import type { LocalEmailData } from "@/components/email/email_viewer_types";
import type { EditDraftData } from "@/components/compose/compose_manager";

import {
  account_index_path,
  get_active_account_index,
} from "@/lib/account_index_url";

export const SENT_ROUTE = "/sent";
export const HOME_ROUTE = "/";

export type MessageListView = "sent" | "inbox";

const LIST_ROUTES: Record<MessageListView, string> = {
  sent: SENT_ROUTE,
  inbox: HOME_ROUTE,
};
export const PENDING_REQUEST_TTL_MS = 15000;

export interface ToastNavigator {
  navigate: (path: string, options?: NavigateOptions) => void;
  is_mobile_app: boolean;
  prefers_full_page: boolean;
}

export interface MessageViewHost {
  can_show_message: () => boolean;
  can_show_preview: () => boolean;
  show_message: (email_id: string) => void;
  show_preview: (data: LocalEmailData) => void;
  go_to_list: (route: string) => void;
}

export interface ComposeHost {
  restores_undone_sends: boolean;
  open_draft: (draft: EditDraftData) => void;
}

type PendingView =
  | { kind: "message"; email_id: string; expires_at: number }
  | { kind: "preview"; data: LocalEmailData; expires_at: number };

interface PendingDraft {
  draft: EditDraftData;
  expires_at: number;
}

let active_navigator: ToastNavigator | null = null;
let active_view_host: MessageViewHost | null = null;
let active_compose_host: ComposeHost | null = null;
let pending_view: PendingView | null = null;
let pending_draft: PendingDraft | null = null;

export function full_page_message_path(email_id: string): string {
  return `/email/${encodeURIComponent(email_id)}`;
}

export function hard_navigation_target(path: string): string {
  const account_index = get_active_account_index();

  if (account_index !== null) return account_index_path(account_index, path);
  if (typeof window !== "undefined" && "__TAURI_INTERNALS__" in window) {
    return `#${path}`;
  }

  return path;
}

function go(path: string, options?: NavigateOptions): void {
  if (active_navigator) {
    active_navigator.navigate(path, options);

    return;
  }

  if (typeof window === "undefined") return;

  window.location.assign(hard_navigation_target(path));
}

function flush_pending_view(): void {
  if (!pending_view || !active_view_host) return;

  const request = pending_view;

  if (request.expires_at < Date.now()) {
    pending_view = null;

    return;
  }

  if (request.kind === "message") {
    if (!active_view_host.can_show_message()) return;
    pending_view = null;
    active_view_host.show_message(request.email_id);

    return;
  }

  if (!active_view_host.can_show_preview()) return;
  pending_view = null;
  active_view_host.show_preview(request.data);
}

function flush_pending_draft(): void {
  if (!pending_draft || !active_compose_host) return;

  const request = pending_draft;

  pending_draft = null;

  if (request.expires_at < Date.now()) return;

  active_compose_host.open_draft(request.draft);
}

export function register_toast_navigator(
  navigator: ToastNavigator,
): () => void {
  active_navigator = navigator;

  return () => {
    if (active_navigator === navigator) active_navigator = null;
  };
}

export function register_message_view_host(host: MessageViewHost): () => void {
  active_view_host = host;
  flush_pending_view();

  return () => {
    if (active_view_host === host) active_view_host = null;
  };
}

export function register_compose_host(host: ComposeHost): () => void {
  active_compose_host = host;
  flush_pending_draft();

  return () => {
    if (active_compose_host === host) active_compose_host = null;
  };
}

export function can_preview_pending_send(): boolean {
  return active_navigator?.is_mobile_app !== true;
}

export function open_message_in_view_mode(
  email_id: string,
  list_view: MessageListView = "sent",
): void {
  if (active_navigator?.prefers_full_page) {
    pending_view = null;
    go(full_page_message_path(email_id), { state: { from_view: list_view } });

    return;
  }

  if (active_view_host?.can_show_message()) {
    pending_view = null;
    active_view_host.show_message(email_id);

    return;
  }

  pending_view = {
    kind: "message",
    email_id,
    expires_at: Date.now() + PENDING_REQUEST_TTL_MS,
  };

  if (active_view_host) {
    active_view_host.go_to_list(LIST_ROUTES[list_view]);

    return;
  }

  go(LIST_ROUTES[list_view]);
}

export function open_sent_folder(): void {
  pending_view = null;

  if (active_view_host && !active_navigator?.is_mobile_app) {
    active_view_host.go_to_list(SENT_ROUTE);

    return;
  }

  go(SENT_ROUTE);
}

export function open_pending_send_preview(data: LocalEmailData): boolean {
  if (!can_preview_pending_send()) return false;

  if (active_view_host?.can_show_preview()) {
    pending_view = null;
    active_view_host.show_preview(data);

    return true;
  }

  pending_view = {
    kind: "preview",
    data,
    expires_at: Date.now() + PENDING_REQUEST_TTL_MS,
  };

  if (active_view_host) {
    active_view_host.go_to_list(SENT_ROUTE);

    return true;
  }

  go(SENT_ROUTE);

  return true;
}

export function restore_undone_send_draft(draft: EditDraftData): void {
  if (active_navigator?.is_mobile_app) return;
  if (active_compose_host?.restores_undone_sends) return;

  if (active_compose_host) {
    pending_draft = null;
    active_compose_host.open_draft(draft);

    return;
  }

  pending_draft = {
    draft,
    expires_at: Date.now() + PENDING_REQUEST_TTL_MS,
  };
  go(HOME_ROUTE);
}

export function undone_send_is_restored_by_host(): boolean {
  return (
    active_navigator?.is_mobile_app === true ||
    active_compose_host?.restores_undone_sends === true
  );
}

export function reset_toast_action_router(): void {
  active_navigator = null;
  active_view_host = null;
  active_compose_host = null;
  pending_view = null;
  pending_draft = null;
}
