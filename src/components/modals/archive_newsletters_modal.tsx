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
import { FaviconOrInitial } from "@/components/ui/favicon_or_initial";
import type { MailItem } from "@/services/api/mail";

import { useState, useEffect, useMemo, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  MagnifyingGlassIcon,
  CheckCircleIcon,
  XMarkIcon,
  NewspaperIcon,
} from "@heroicons/react/24/outline";
import { Button } from "@aster/ui";
import { Checkbox } from "@aster/ui";

import { use_shift_range_select } from "@/lib/use_shift_range_select";
import { Modal, ModalBody } from "@/components/ui/modal";
import { Spinner } from "@/components/ui/spinner";
import { bulk_patch_metadata } from "@/services/api/mail";
import {
  scan_received_items,
  DECRYPT_YIELD_CHUNK,
  decrypt_items_metadata_for_action,
} from "@/services/bulk_mail_scan";
import { yield_to_browser } from "@/lib/scheduling";
import { batch_archive, batch_unarchive } from "@/services/api/archive";
import { stale_all_view_caches } from "@/hooks/email_list_cache";
import { decrypt_mail_envelope } from "@/components/email/shared/decrypt_envelope";
import { normalize_envelope_from } from "@/services/crypto/envelope";
import { get_favicon_url } from "@/lib/favicon_url";
import {
  encrypt_mail_metadata,
  metadata_flag_patch,
} from "@/services/crypto/mail_metadata";
import { get_email_username, get_email_domain } from "@/lib/utils";
import { has_protected_folder_label } from "@/hooks/use_folders";
import {
  emit_mail_items_removed,
  emit_mail_soft_refresh,
} from "@/hooks/mail_events";
import { invalidate_mail_stats } from "@/hooks/use_mail_stats";
import { show_action_toast } from "@/components/toast/action_toast";
import { Input } from "@/components/ui/input";
import { use_should_reduce_motion } from "@/provider";
import { use_i18n } from "@/lib/i18n/context";
import { show_toast } from "@/components/toast/simple_toast";
import { detect_unsubscribe_info } from "@/utils/unsubscribe_detector";
import { map_in_chunks } from "@/lib/scheduling";

interface NewsletterSender {
  id: string;
  sender_email: string;
  sender_name: string;
  domain: string;
  email_count: number;
  mail_ids: string[];
  items: MailItem[];
}

interface ArchiveNewslettersModalProps {
  is_open: boolean;
  on_close: () => void;
}

interface DecryptedEnvelope {
  from: { name: string; email: string };
  body_html?: string;
  body_text?: string;
  list_unsubscribe?: string;
  list_unsubscribe_post?: string;
}

async function decrypt_envelope_local(
  encrypted: string,
  nonce: string,
): Promise<DecryptedEnvelope | null> {
  const raw = await decrypt_mail_envelope<Record<string, unknown>>(
    encrypted,
    nonce,
  );

  if (!raw) return null;

  const from = normalize_envelope_from(raw.from);

  if (!from?.email) return null;

  return {
    from,
    body_html: (raw.body_html ?? raw.html_body) as string | undefined,
    body_text: (raw.body_text ?? raw.text_body) as string | undefined,
    list_unsubscribe: raw.list_unsubscribe as string | undefined,
    list_unsubscribe_post: raw.list_unsubscribe_post as string | undefined,
  };
}

export function ArchiveNewslettersModal({
  is_open,
  on_close,
}: ArchiveNewslettersModalProps) {
  const { t } = use_i18n();
  const reduce_motion = use_should_reduce_motion();
  const [newsletters, set_newsletters] = useState<NewsletterSender[]>([]);
  const [selected_ids, set_selected_ids] = useState<Set<string>>(new Set());
  const [search_query, set_search_query] = useState("");
  const [is_loading, set_is_loading] = useState(true);
  const [is_archiving, set_is_archiving] = useState(false);
  const [completed_count, set_completed_count] = useState(0);
  const [show_success, set_show_success] = useState(false);
  const [last_archived, set_last_archived] = useState<{
    ids: string[];
    items: MailItem[];
  } | null>(null);

  const [scan_failed, set_scan_failed] = useState(false);

  const fetch_newsletters = useCallback(async (signal?: AbortSignal) => {
    set_is_loading(true);
    set_scan_failed(false);
    try {
      const { items: all_items, failed } = await scan_received_items(signal);

      if (signal?.aborted) return;

      set_scan_failed(failed);

      if (signal?.aborted) return;

      if (all_items.length > 0) {
        await decrypt_items_metadata_for_action(all_items, signal);
        const sender_map = new Map<
          string,
          {
            email: string;
            name: string;
            count: number;
            ids: string[];
            items: MailItem[];
          }
        >();

        let scanned = 0;

        for (const item of all_items) {
          if (signal?.aborted) return;

          scanned += 1;
          if (scanned % DECRYPT_YIELD_CHUNK === 0) await yield_to_browser();

          if (item.metadata?.is_trashed || item.metadata?.is_archived) continue;
          if (has_protected_folder_label(item.labels)) continue;

          try {
            const envelope = await decrypt_envelope_local(
              item.encrypted_envelope,
              item.envelope_nonce,
            );

            if (!envelope?.from?.email) continue;

            const unsub_info = detect_unsubscribe_info(
              envelope.body_html || "",
              envelope.body_text || "",
              {
                list_unsubscribe: envelope.list_unsubscribe,
                list_unsubscribe_post: envelope.list_unsubscribe_post,
              },
            );

            if (!unsub_info.has_unsubscribe) continue;

            const email = envelope.from.email.toLowerCase();
            const name = envelope.from.name || get_email_username(email);

            if (sender_map.has(email)) {
              const existing = sender_map.get(email)!;

              existing.count++;
              existing.ids.push(item.id);
              existing.items.push(item);
            } else {
              sender_map.set(email, {
                email,
                name,
                count: 1,
                ids: [item.id],
                items: [item],
              });
            }
          } catch (error) {
            if (import.meta.env.DEV) console.error(error);
            continue;
          }
        }

        const senders = Array.from(sender_map.values()).map(
          (s) =>
            ({
              id: s.email,
              sender_email: s.email,
              sender_name: s.name,
              domain: get_email_domain(s.email) || s.email,
              email_count: s.count,
              mail_ids: s.ids,
              items: s.items,
            }) as NewsletterSender,
        );

        set_newsletters(senders);
        set_selected_ids(new Set(senders.map((s) => s.id)));
      } else {
        set_newsletters([]);
        set_selected_ids(new Set());
      }
    } finally {
      set_is_loading(false);
    }
  }, []);

  useEffect(() => {
    if (is_open) {
      const controller = new AbortController();

      fetch_newsletters(controller.signal);
      set_search_query("");
      set_show_success(false);
      set_completed_count(0);
      set_last_archived(null);

      return () => controller.abort();
    }
  }, [is_open, fetch_newsletters]);

  const filtered_newsletters = useMemo(() => {
    if (!search_query)
      return [...newsletters].sort((a, b) => b.email_count - a.email_count);

    const query = search_query.toLowerCase();

    return newsletters
      .filter(
        (n) =>
          n.sender_name.toLowerCase().includes(query) ||
          n.sender_email.toLowerCase().includes(query) ||
          n.domain.toLowerCase().includes(query),
      )
      .sort((a, b) => b.email_count - a.email_count);
  }, [newsletters, search_query]);

  const all_selected =
    filtered_newsletters.length > 0 &&
    filtered_newsletters.every((n) => selected_ids.has(n.id));

  const handle_select_all = () => {
    const next = new Set(selected_ids);

    if (all_selected) {
      for (const newsletter of filtered_newsletters) next.delete(newsletter.id);
    } else {
      for (const newsletter of filtered_newsletters) next.add(newsletter.id);
    }
    set_selected_ids(next);
  };

  const handle_select = use_shift_range_select(
    filtered_newsletters,
    (n) => n.id,
    selected_ids,
    set_selected_ids,
  );

  const handle_archive = async () => {
    if (selected_ids.size === 0) return;

    set_is_archiving(true);

    try {
      const selected = newsletters.filter((n) => selected_ids.has(n.id));
      const all_mail_ids = selected.flatMap((n) => n.mail_ids);
      const all_items = selected.flatMap((n) => n.items);

      const metadata_updates = await map_in_chunks(all_items, async (item) => {
        const updated_metadata = {
          ...item.metadata!,
          is_archived: true,
        };
        const encrypted = await encrypt_mail_metadata(updated_metadata);

        return encrypted
          ? {
              id: item.id,
              ...encrypted,
              ...metadata_flag_patch(updated_metadata),
            }
          : null;
      });

      const valid_updates = metadata_updates.filter(
        (u) => u !== null,
      ) as Array<{
        id: string;
        encrypted_metadata: string;
        metadata_nonce: string;
      }>;

      if (valid_updates.length > 0) {
        const patch_result = await bulk_patch_metadata({
          items: valid_updates,
        });

        if (patch_result.error) {
          show_toast(t("common.something_went_wrong_try_again"), "error");

          return;
        }
      }

      stale_all_view_caches();
      const archive_result = await batch_archive({
        ids: all_mail_ids,
        tier: "hot",
      });

      if (archive_result.error) {
        show_toast(t("common.something_went_wrong_try_again"), "error");

        return;
      }
      emit_mail_items_removed({ ids: all_mail_ids });
      invalidate_mail_stats();

      set_completed_count(all_mail_ids.length);
      set_last_archived({ ids: all_mail_ids, items: all_items });
      set_newsletters((prev) => prev.filter((n) => !selected_ids.has(n.id)));
      set_selected_ids(new Set());
      set_show_success(true);
    } finally {
      set_is_archiving(false);
    }
  };

  const handle_undo = useCallback(async () => {
    if (!last_archived) return;

    const undo_updates = await Promise.all(
      last_archived.items.map(async (item) => {
        const updated_metadata = {
          ...item.metadata!,
          is_archived: false,
        };
        const encrypted = await encrypt_mail_metadata(updated_metadata);

        return encrypted
          ? {
              id: item.id,
              ...encrypted,
              ...metadata_flag_patch(updated_metadata),
            }
          : null;
      }),
    );

    const valid_undo = undo_updates.filter((u) => u !== null) as Array<{
      id: string;
      encrypted_metadata: string;
      metadata_nonce: string;
    }>;

    if (valid_undo.length > 0) {
      const undo_patch_result = await bulk_patch_metadata({
        items: valid_undo,
      });

      if (undo_patch_result.error) {
        show_toast(t("common.something_went_wrong_try_again"), "error");

        return;
      }
    }

    const unarchive_result = await batch_unarchive({ ids: last_archived.ids });

    if (unarchive_result.error) {
      show_toast(t("common.something_went_wrong_try_again"), "error");

      return;
    }
    emit_mail_soft_refresh();
    invalidate_mail_stats();
  }, [last_archived, t]);

  const handle_done = useCallback(() => {
    if (last_archived) {
      show_action_toast({
        message: t("common.newsletters_archived", {
          count: completed_count,
        }),
        action_type: "archive",
        email_ids: last_archived.ids,
        on_undo: handle_undo,
      });
    }
    on_close();
  }, [last_archived, completed_count, t, handle_undo, on_close]);

  return (
    <Modal
      close_on_overlay={!is_archiving}
      is_open={is_open}
      on_close={on_close}
      show_close_button={false}
      size="md"
    >
      <div className="flex flex-col" style={{ height: "520px" }}>
        <div className="flex items-center justify-between px-6 py-5 flex-shrink-0">
          <div className="flex items-center gap-3">
            <NewspaperIcon
              className="w-5 h-5"
              style={{ color: "var(--text-secondary)" }}
            />
            <h2
              className="text-[16px] font-semibold"
              style={{ color: "var(--text-primary)" }}
            >
              {t("mail.archive_all_newsletters")}
            </h2>
          </div>
          <button
            className="p-1.5 rounded-[14px] transition-colors hover:bg-black/[0.05] dark:hover:bg-white/[0.05]"
            style={{ color: "var(--text-muted)" }}
            onClick={on_close}
          >
            <XMarkIcon className="w-4 h-4" />
          </button>
        </div>

        <ModalBody className="p-0 flex-1 overflow-hidden flex flex-col">
          <AnimatePresence mode="wait">
            {show_success ? (
              <motion.div
                key="success"
                animate={{ opacity: 1 }}
                className="flex flex-col items-center justify-center flex-1 px-6"
                exit={{ opacity: 0 }}
                initial={reduce_motion ? false : { opacity: 0 }}
              >
                <CheckCircleIcon className="w-8 h-8 text-green-500 mb-4" />
                <p
                  className="text-[15px] font-medium mb-1"
                  style={{ color: "var(--text-primary)" }}
                >
                  {t("common.all_done")}
                </p>
                <p
                  className="text-[12px] text-center"
                  style={{ color: "var(--text-muted)" }}
                >
                  {t("common.newsletters_archived", {
                    count: completed_count,
                  })}
                </p>
                <div className="mt-6" />
                <div className="flex gap-2">
                  <Button
                    size="xl"
                    variant="outline"
                    onClick={() => {
                      set_show_success(false);
                      fetch_newsletters();
                    }}
                  >
                    {t("common.continue_label")}
                  </Button>
                  <Button size="xl" variant="depth" onClick={handle_done}>
                    {t("common.done")}
                  </Button>
                </div>
              </motion.div>
            ) : is_archiving ? (
              <motion.div
                key="loading"
                animate={{ opacity: 1 }}
                className="flex flex-col items-center justify-center flex-1"
                exit={{ opacity: 0 }}
                initial={reduce_motion ? false : { opacity: 0 }}
              >
                <Spinner
                  className="mb-3 text-[var(--accent-color)]"
                  size="lg"
                />
                <p
                  className="text-[13px]"
                  style={{ color: "var(--text-muted)" }}
                >
                  {t("mail.archiving_newsletters")}
                </p>
              </motion.div>
            ) : (
              <div
                key="content"
                className="flex flex-col flex-1 overflow-hidden"
              >
                <div className="px-3 py-2.5 flex-shrink-0">
                  <div className="relative">
                    <MagnifyingGlassIcon
                      className="absolute start-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5"
                      style={{ color: "var(--text-muted)" }}
                    />
                    <Input
                      className="w-full"
                      placeholder={t("common.search") + "..."}
                      style={{
                        paddingInlineStart: "34px",
                        paddingInlineEnd: "12px",
                      }}
                      value={search_query}
                      onChange={(e) => set_search_query(e.target.value)}
                    />
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto">
                  {is_loading ? (
                    <div className="flex flex-col items-center justify-center h-full">
                      <Spinner
                        className="mb-2 text-[var(--text-muted)]"
                        size="md"
                      />
                      <p
                        className="text-[12px]"
                        style={{ color: "var(--text-muted)" }}
                      >
                        {t("mail.scanning_for_newsletters")}
                      </p>
                    </div>
                  ) : filtered_newsletters.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full px-6">
                      <NewspaperIcon
                        className="w-6 h-6 mb-2"
                        style={{ color: "var(--text-muted)" }}
                      />
                      <p
                        className="text-[13px] font-medium mb-0.5"
                        style={{ color: "var(--text-primary)" }}
                      >
                        {search_query
                          ? t("common.no_results")
                          : scan_failed
                            ? t("common.something_went_wrong_try_again")
                            : t("common.no_newsletters_found")}
                      </p>
                      {scan_failed && !search_query && (
                        <button
                          className="mt-2 text-[12px] font-medium text-accent-primary hover:underline"
                          type="button"
                          onClick={() => void fetch_newsletters()}
                        >
                          {t("common.retry")}
                        </button>
                      )}
                    </div>
                  ) : (
                    filtered_newsletters.map((newsletter, index) => {
                      const is_selected = selected_ids.has(newsletter.id);

                      return (
                        <button
                          key={newsletter.id}
                          className="w-full flex items-center gap-3 px-4 py-2 cursor-pointer select-none transition-colors"
                          style={{ backgroundColor: "transparent" }}
                          onClick={() => handle_select(index)}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.backgroundColor =
                              "var(--bg-hover)";
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.backgroundColor =
                              "transparent";
                          }}
                        >
                          <Checkbox
                            checked={is_selected}
                            onCheckedChange={() => handle_select(index)}
                            onClick={(e) => e.stopPropagation()}
                          />
                          <div className="w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0 overflow-hidden bg-black/[0.03] dark:bg-white/[0.04]">
                            <FaviconOrInitial
                              initial={newsletter.sender_name.charAt(0)}
                              initial_class_name="text-[11px] font-medium"
                              initial_style={{ color: "var(--text-muted)" }}
                              src={get_favicon_url(
                                newsletter.domain.toLowerCase(),
                              )}
                            />
                          </div>
                          <div className="flex-1 min-w-0 text-start">
                            <p
                              className="text-[13px] font-medium truncate"
                              style={{ color: "var(--text-primary)" }}
                            >
                              {newsletter.sender_name}
                            </p>
                            <p
                              className="text-[11px] truncate"
                              style={{ color: "var(--text-muted)" }}
                            >
                              {newsletter.sender_email}
                            </p>
                          </div>
                          <span
                            className="text-[11px] tabular-nums flex-shrink-0"
                            style={{ color: "var(--text-muted)" }}
                          >
                            {newsletter.email_count}
                          </span>
                        </button>
                      );
                    })
                  )}
                </div>

                <div
                  className="flex items-center justify-between px-4 py-3 flex-shrink-0"
                  style={{ borderTop: "1px solid var(--border-secondary)" }}
                >
                  <button
                    className="flex items-center gap-3 text-[12px] font-medium"
                    style={{ color: "var(--text-muted)" }}
                    onClick={handle_select_all}
                  >
                    <Checkbox
                      checked={all_selected}
                      onCheckedChange={handle_select_all}
                    />
                    {selected_ids.size > 0
                      ? `${selected_ids.size} ${t("common.selected")}`
                      : t("common.select_all")}
                  </button>
                  <Button
                    disabled={selected_ids.size === 0}
                    size="xl"
                    variant="depth"
                    onClick={handle_archive}
                  >
                    {t("mail.archive")}
                    {selected_ids.size > 0 ? ` (${selected_ids.size})` : ""}
                  </Button>
                </div>
              </div>
            )}
          </AnimatePresence>
        </ModalBody>
      </div>
    </Modal>
  );
}
