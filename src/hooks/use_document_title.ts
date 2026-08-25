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
import type { TranslationKey } from "@/lib/i18n/types";

import { useLayoutEffect, useEffect, useRef } from "react";

import {
  use_mail_stats,
  get_mail_stats_snapshot,
  subscribe_mail_stats,
  type MailStats,
} from "./use_mail_stats";
import { use_folders, type DecryptedFolder } from "./use_folders";

import { use_auth_safe } from "@/contexts/auth_context";
import { use_i18n } from "@/lib/i18n/context";

type TranslateFn = (
  key: TranslationKey,
  params?: Record<string, string | number>,
) => string;

type ViewType =
  | "inbox"
  | "starred"
  | "sent"
  | "drafts"
  | "scheduled"
  | "snoozed"
  | "archive"
  | "spam"
  | "trash"
  | string;

interface DocumentTitleOptions {
  view?: ViewType;
  email_subject?: string;
  custom_title?: string;
}

const VIEW_COUNT_KEYS: Record<string, keyof MailStats> = {
  inbox: "unread",
  starred: "starred",
  sent: "sent",
  drafts: "drafts",
  scheduled: "scheduled",
  snoozed: "snoozed",
  archive: "archived",
  spam: "spam",
  trash: "trash",
};

const PRIORITY_BASE = 0;
const PRIORITY_OVERLAY = 10;

//
// Single source of truth for document.title.
//
// Multiple hooks (the inbox view and an open email detail) want to drive the
// tab title at the same time. Writing document.title from each one's own
// layout effect races: the last writer wins nondeterministically, and a writer
// only reasserts when its own title string changes, so a stale title (a stale
// unread count, or a leftover subject after the email closes) can stick until
// the next unrelated change or a full refresh.
//
// This controller fixes that by keeping every contributor in a registry keyed
// by a stable source id. On any change it recomputes the winning title from
// the full registry (highest priority wins) and writes it. Because the winner
// is always derived from the complete set, removing a contributor (an email
// detail unmounting) immediately and reliably falls back to the base title.
//
interface TitleEntry {
  signature: string;
  render: () => string;
  priority: number;
  seq: number;
}

const COUNT_PREFIX_PATTERN = /^\(\d[\d.,\s]*\)\s+/;
const HEARTBEAT_MS = 30_000;

class DocumentTitleController {
  private entries = new Map<string, TitleEntry>();
  private last_written: string | null = null;
  private seq_counter = 0;

  set(
    id: string,
    signature: string,
    render: () => string,
    priority: number,
  ): void {
    const existing = this.entries.get(id);

    if (
      existing &&
      existing.signature === signature &&
      existing.priority === priority
    ) {
      existing.render = render;
      this.apply();

      return;
    }

    this.entries.set(id, {
      signature,
      render,
      priority,
      seq: ++this.seq_counter,
    });
    this.apply();
  }

  remove(id: string): void {
    if (this.entries.delete(id)) {
      this.apply();
    }
  }

  reassert(): void {
    this.last_written = null;
    this.apply();
  }

  apply(): void {
    if (typeof document === "undefined") return;

    let best: TitleEntry | null = null;

    for (const entry of this.entries.values()) {
      if (
        !best ||
        entry.priority > best.priority ||
        (entry.priority === best.priority && entry.seq > best.seq)
      ) {
        best = entry;
      }
    }

    if (!best) {
      this.drop_orphan_count();

      return;
    }

    const next = best.render().trim();

    if (!next) return;

    if (this.last_written === next && document.title === next) {
      return;
    }

    this.last_written = next;

    if (document.title !== next) {
      document.title = next;
    }
  }

  private drop_orphan_count(): void {
    const stripped = document.title.replace(COUNT_PREFIX_PATTERN, "");

    if (stripped === document.title) return;

    this.last_written = stripped;
    document.title = stripped;
  }
}

const title_controller = new DocumentTitleController();

if (typeof window !== "undefined") {
  subscribe_mail_stats(() => {
    title_controller.apply();
  });

  window.addEventListener("focus", () => {
    title_controller.reassert();
  });

  setInterval(() => {
    title_controller.apply();
  }, HEARTBEAT_MS);
}

if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      title_controller.reassert();
    }
  });
}

let source_sequence = 0;

function truncate_subject(subject: string, max_length: number = 60): string {
  if (subject.length <= max_length) return subject;

  return subject.substring(0, max_length - 3) + "...";
}

function format_workspace_name(name: string, t: TranslateFn): string {
  const trimmed = name.trim();

  if (!trimmed) return t("common.aster_mail");

  const capitalized = trimmed.charAt(0).toUpperCase() + trimmed.slice(1);

  return t("common.workspace_title", { name: capitalized });
}

function get_view_label(
  view: string,
  folders: DecryptedFolder[],
  view_labels: Record<string, string>,
  folder_fallback: string,
  inbox_fallback: string,
): string {
  if (view.startsWith("folder-")) {
    const folder_token = view.replace("folder-", "");
    const folder = folders.find((f) => f.folder_token === folder_token);

    return folder?.name || folder_fallback;
  }

  return view_labels[view] || inbox_fallback;
}

function build_view_title(
  view: string,
  counts: MailStats,
  workspace: string,
  label: string,
): string {
  const count_key = VIEW_COUNT_KEYS[view];
  const count = count_key ? (counts[count_key] ?? 0) : 0;

  return count > 0
    ? `(${count}) ${label} | ${workspace}`
    : `${label} | ${workspace}`;
}

export function use_document_title(options: DocumentTitleOptions = {}): void {
  const { view = "inbox", email_subject, custom_title } = options;
  const { t } = use_i18n();

  use_mail_stats();
  const auth = use_auth_safe();
  const user = auth?.user ?? null;
  const { state: folder_state } = use_folders();

  // A hook instance is an "overlay" (an open email detail / custom title) if it
  // owns those option keys, regardless of whether a value is currently present.
  // This keeps its priority stable while an email loads, so it never briefly
  // competes with the base inbox title at equal priority.
  const is_overlay = "email_subject" in options || "custom_title" in options;
  const priority = is_overlay ? PRIORITY_OVERLAY : PRIORITY_BASE;

  const id_ref = useRef<string>();

  if (id_ref.current === undefined) {
    id_ref.current = `doc-title-${source_sequence++}`;
  }

  const view_labels: Record<string, string> = {
    inbox: t("mail.inbox"),
    all: t("mail.all_mail"),
    starred: t("mail.starred"),
    sent: t("mail.sent"),
    drafts: t("mail.drafts"),
    scheduled: t("mail.scheduled"),
    snoozed: t("mail.snoozed"),
    archive: t("mail.archive"),
    spam: t("mail.spam"),
    trash: t("mail.trash"),
  };

  const user_name = user?.display_name || user?.username || "";
  const workspace = format_workspace_name(user_name, t);

  const label = get_view_label(
    view,
    folder_state.folders,
    view_labels,
    t("common.folder_label"),
    t("mail.inbox"),
  );

  let signature: string;

  if (is_overlay) {
    if (custom_title) {
      signature = `custom:${custom_title}|${workspace}`;
    } else if (email_subject) {
      signature = `subject:${truncate_subject(email_subject)}|${workspace}`;
    } else {
      // Overlay with nothing to show yet: contribute nothing so the base
      // inbox title is what the user sees.
      signature = "";
    }
  } else {
    signature = `view:${view}|${label}|${workspace}`;
  }

  const render_ref = useRef<() => string>(() => "");

  render_ref.current = () => {
    if (is_overlay) {
      if (custom_title) return `${custom_title} | ${workspace}`;
      if (email_subject) {
        return `${truncate_subject(email_subject)} | ${workspace}`;
      }

      return "";
    }

    return build_view_title(view, get_mail_stats_snapshot(), workspace, label);
  };

  useLayoutEffect(() => {
    const id = id_ref.current as string;

    if (signature) {
      title_controller.set(id, signature, () => render_ref.current(), priority);
    } else {
      title_controller.remove(id);
    }
  }, [signature, priority]);

  useEffect(() => {
    const id = id_ref.current as string;

    return () => {
      title_controller.remove(id);
    };
  }, []);
}
