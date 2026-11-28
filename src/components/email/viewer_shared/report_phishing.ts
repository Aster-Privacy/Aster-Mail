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
import type { DecryptedThreadMessage } from "@/types/thread";
import type { InboxEmail } from "@/types/email";
import type { TranslationKey } from "@/lib/i18n/types";
import type { SpamReportReceipt } from "@/services/api/mail_threads";

import { useSyncExternalStore } from "react";

import {
  bulk_update_metadata_by_ids,
  update_item_metadata,
} from "@/services/crypto/mail_metadata";
import { show_action_toast } from "@/components/toast/action_toast";
import { show_toast } from "@/components/toast/simple_toast";
import {
  emit_mail_changed,
  emit_mail_item_updated,
  emit_mail_items_removed,
  emit_mail_soft_refresh,
} from "@/hooks/mail_events";
import { invalidate_mail_stats } from "@/hooks/use_mail_stats";
import {
  remove_spam_sender,
  report_spam_sender,
  retract_spam_report,
} from "@/services/api/mail";
import { reindex_ids } from "@/services/category_index";
import { same_address_ignoring_dots } from "@/utils/address_dots";

export type PhishingReportOutcome = "moved" | "kept" | "failed";

export type PhishingMenuEntry = "hidden" | "enabled" | "reported";

export interface PhishingMenuState {
  show_not_spam: boolean;
  report_phishing: PhishingMenuEntry;
}

type Translate = (key: TranslationKey) => string;

const reported_ids = new Set<string>();
const report_listeners = new Set<() => void>();
let report_version = 0;

function notify_reports(): void {
  report_version += 1;
  report_listeners.forEach((listener) => listener());
}

function set_reported(ids: string[], reported: boolean): void {
  for (const id of ids) {
    if (reported) reported_ids.add(id);
    else reported_ids.delete(id);
  }
  notify_reports();
}

export function is_phishing_reported(id: string | null | undefined): boolean {
  return !!id && reported_ids.has(id);
}

export function clear_phishing_reports(): void {
  reported_ids.clear();
  notify_reports();
}

function subscribe_reports(listener: () => void): () => void {
  report_listeners.add(listener);

  return () => {
    report_listeners.delete(listener);
  };
}

function get_report_version(): number {
  return report_version;
}

export function use_phishing_reported(id: string | null | undefined): boolean {
  useSyncExternalStore(subscribe_reports, get_report_version);

  return is_phishing_reported(id);
}

export function can_report_phishing(
  item_type: string | null | undefined,
  is_own_message = false,
): boolean {
  return item_type === "received" && !is_own_message;
}

export function phishing_menu_state(input: {
  item_type: string | null | undefined;
  is_own_message?: boolean;
  in_spam: boolean;
  is_reported: boolean;
}): PhishingMenuState {
  const can_report = can_report_phishing(input.item_type, input.is_own_message);

  return {
    show_not_spam: input.in_spam && can_report,
    report_phishing: !can_report
      ? "hidden"
      : input.is_reported
        ? "reported"
        : "enabled",
  };
}

async function send_phishing_report(
  sender_email: string,
): Promise<SpamReportReceipt | null> {
  try {
    const response = await report_spam_sender(sender_email);

    return response.data ?? null;
  } catch {
    return null;
  }
}

function unique_senders(senders: Array<string | undefined>): string[] {
  return Array.from(new Set(senders.filter((s): s is string => !!s)));
}

interface ReportToastInput {
  ids: string[];
  senders: string[];
  t: Translate;
  restore_folder?: () => Promise<boolean>;
}

function report_and_offer_undo({
  ids,
  senders,
  t,
  restore_folder,
}: ReportToastInput): void {
  set_reported(ids, true);

  const reports = Promise.all(senders.map(send_phishing_report));
  let folder_restored = !restore_folder;
  let report_retracted = false;
  const undo_failed = {
    message: t("common.undo_failed"),
    tone: "error" as const,
    keep_undo: true,
  };

  show_action_toast({
    message: t("common.reported_as_phishing"),
    action_type: "spam",
    email_ids: ids,
    on_undo: async () => {
      if (!folder_restored && restore_folder) {
        if (!(await restore_folder())) return undo_failed;
        folder_restored = true;
      }

      if (!report_retracted) {
        const receipts = await reports;

        for (const receipt of receipts) {
          if (!receipt?.sender_entry_id && !receipt?.feedback_id) continue;
          const retracted = await retract_spam_report(receipt).catch(
            () => null,
          );

          if (!retracted?.data?.success) return undo_failed;
        }
        report_retracted = true;
      }

      set_reported(ids, false);
    },
  });
}

function announce_moved_to_spam(ids: string[]): void {
  emit_mail_items_removed({ ids });
  emit_mail_changed();
  invalidate_mail_stats();
}

function announce_restored(ids: string[]): void {
  reindex_ids(ids);
  emit_mail_soft_refresh();
  invalidate_mail_stats();
}

export async function report_phishing_with_undo(
  msg: DecryptedThreadMessage,
  t: Translate,
): Promise<PhishingReportOutcome> {
  const senders = unique_senders([msg.sender_email]);

  if (msg.is_spam === true) {
    report_and_offer_undo({ ids: [msg.id], senders, t });

    return "kept";
  }

  const previous = { is_spam: false, is_trashed: msg.is_trashed ?? false };
  const result = await update_item_metadata(
    msg.id,
    {
      encrypted_metadata: msg.encrypted_metadata,
      metadata_nonce: msg.metadata_nonce,
    },
    { is_spam: true, is_trashed: false },
  );

  if (!result.success) {
    show_toast(t("common.failed_to_mark_as_spam"), "error");

    return "failed";
  }

  announce_moved_to_spam([msg.id]);
  report_and_offer_undo({
    ids: [msg.id],
    senders,
    t,
    restore_folder: async () => {
      const undo_result = await update_item_metadata(
        msg.id,
        {
          encrypted_metadata: result.encrypted?.encrypted_metadata,
          metadata_nonce: result.encrypted?.metadata_nonce,
        },
        previous,
      );

      if (!undo_result.success) return false;
      emit_mail_item_updated({ id: msg.id, ...previous });
      announce_restored([msg.id]);

      return true;
    },
  });

  return "moved";
}

function conversation_ids(email: InboxEmail): string[] {
  return email.grouped_email_ids && email.grouped_email_ids.length > 0
    ? Array.from(new Set([email.id, ...email.grouped_email_ids]))
    : [email.id];
}

export async function report_phishing_for_emails(
  emails: InboxEmail[],
  in_spam: boolean,
  t: Translate,
): Promise<PhishingReportOutcome> {
  const targets = emails.filter((e) => can_report_phishing(e.item_type));

  if (targets.length === 0) return "failed";

  const row_ids = targets.map((e) => e.id);
  const senders = unique_senders(targets.map((e) => e.sender_email));

  if (in_spam) {
    report_and_offer_undo({ ids: row_ids, senders, t });

    return "kept";
  }

  const ids = Array.from(new Set(targets.flatMap(conversation_ids)));
  const trashed_ids = new Set(
    targets.filter((e) => e.is_trashed).flatMap(conversation_ids),
  );
  const result = await bulk_update_metadata_by_ids(ids, {
    is_spam: true,
    is_trashed: false,
  }).catch(() => null);

  if (!result?.success) {
    show_toast(t("common.failed_to_mark_as_spam"), "error");

    return "failed";
  }

  announce_moved_to_spam(ids);
  report_and_offer_undo({
    ids: row_ids,
    senders,
    t,
    restore_folder: async () => {
      const kept_ids = ids.filter((id) => !trashed_ids.has(id));
      const restores = await Promise.all([
        kept_ids.length > 0
          ? bulk_update_metadata_by_ids(kept_ids, { is_spam: false })
          : null,
        trashed_ids.size > 0
          ? bulk_update_metadata_by_ids(Array.from(trashed_ids), {
              is_spam: false,
              is_trashed: true,
            })
          : null,
      ]).catch(() => null);

      if (!restores || restores.some((r) => r && !r.success)) return false;
      for (const id of ids) {
        emit_mail_item_updated({
          id,
          is_spam: false,
          is_trashed: trashed_ids.has(id),
        });
      }
      announce_restored(ids);

      return true;
    },
  });

  return "moved";
}

export async function mark_message_not_spam(
  msg: DecryptedThreadMessage,
  t: Translate,
): Promise<boolean> {
  const result = await update_item_metadata(
    msg.id,
    {
      encrypted_metadata: msg.encrypted_metadata,
      metadata_nonce: msg.metadata_nonce,
    },
    { is_spam: false },
  );

  if (!result.success) {
    show_toast(t("common.failed_to_update"), "error");

    return false;
  }

  if (msg.sender_email) remove_spam_sender(msg.sender_email).catch(() => null);
  set_reported([msg.id], false);
  emit_mail_item_updated({ id: msg.id, is_spam: false });
  emit_mail_items_removed({ ids: [msg.id] });
  emit_mail_changed();
  announce_restored([msg.id]);

  let undone = false;

  show_action_toast({
    message: t("common.marked_as_not_spam"),
    action_type: "not_spam",
    email_ids: [msg.id],
    on_undo: async () => {
      if (undone) return;
      const undo_result = await update_item_metadata(
        msg.id,
        {
          encrypted_metadata: result.encrypted?.encrypted_metadata,
          metadata_nonce: result.encrypted?.metadata_nonce,
        },
        { is_spam: true },
      );

      if (!undo_result.success) {
        return {
          message: t("common.undo_failed"),
          tone: "error" as const,
          keep_undo: true,
        };
      }
      undone = true;
      if (msg.sender_email) {
        report_spam_sender(msg.sender_email).catch(() => null);
      }
      emit_mail_item_updated({ id: msg.id, is_spam: true });
      announce_moved_to_spam([msg.id]);
      emit_mail_soft_refresh();
    },
  });

  return true;
}

export function reportable_message(
  messages: DecryptedThreadMessage[] | null | undefined,
  preferred_id?: string | null,
  current_user_email?: string | null,
): DecryptedThreadMessage | undefined {
  const own = (m: DecryptedThreadMessage) =>
    !!current_user_email &&
    same_address_ignoring_dots(m.sender_email, current_user_email);
  const candidates = (messages ?? []).filter(
    (m) => can_report_phishing(m.item_type) && !own(m),
  );

  return (
    candidates.find((m) => m.id === preferred_id) ??
    candidates[candidates.length - 1]
  );
}

export function report_spam_with_retract(
  sender_email: string,
): () => Promise<void> {
  const receipt = send_phishing_report(sender_email);

  return async () => {
    const sent = await receipt;

    if (sent?.sender_entry_id || sent?.feedback_id) {
      await retract_spam_report(sent).catch(() => null);
    } else if (sent) {
      await remove_spam_sender(sender_email).catch(() => null);
    }
  };
}
