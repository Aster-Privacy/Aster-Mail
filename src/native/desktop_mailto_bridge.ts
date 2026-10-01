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
import { type MailtoDraft, parse_mailto_link } from "@/lib/mailto_link";

const MAILTO_ACTIVATED_EVENT = "aster://mailto-activated";
const MAX_QUEUED_DRAFTS = 8;

type MailtoListener = (draft: MailtoDraft) => void;

let active_listener: MailtoListener | null = null;
let queued_drafts: MailtoDraft[] = [];

function is_desktop(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export function deliver_mailto_link(raw_link: string): void {
  const draft = parse_mailto_link(raw_link);

  if (!draft) return;

  if (active_listener) {
    active_listener(draft);

    return;
  }

  queued_drafts = [...queued_drafts, draft].slice(-MAX_QUEUED_DRAFTS);
}

export function subscribe_mailto_drafts(listener: MailtoListener): () => void {
  active_listener = listener;

  const waiting = queued_drafts;

  queued_drafts = [];
  waiting.forEach((draft) => listener(draft));
  if (is_desktop()) void drain_pending_links().catch(() => undefined);

  return () => {
    if (active_listener === listener) active_listener = null;
  };
}

export function reset_mailto_bridge(): void {
  active_listener = null;
  queued_drafts = [];
}

async function drain_pending_links(): Promise<void> {
  if (!active_listener) return;

  const { invoke } = await import("@tauri-apps/api/core");
  const links = await invoke<string[]>("take_pending_mailto");

  links.forEach((link) => deliver_mailto_link(link));
}

export async function start_desktop_mailto_bridge(): Promise<void> {
  if (!is_desktop()) return;
  try {
    const { listen } = await import("@tauri-apps/api/event");

    await listen(MAILTO_ACTIVATED_EVENT, () => {
      void drain_pending_links().catch(() => undefined);
    });
    await drain_pending_links();
  } catch {
    if (import.meta.env.DEV) {
      console.error("desktop mailto bridge unavailable");
    }
  }
}
