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
import type { UnsubscribeInfo } from "@/types/email";
import type { MailItem } from "@/services/api/mail";

import { useState, useEffect, useMemo, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  MagnifyingGlassIcon,
  CheckCircleIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { Button } from "@aster/ui";
import { Checkbox } from "@aster/ui";

import { use_shift_range_select } from "@/lib/use_shift_range_select";
import { Modal, ModalBody } from "@/components/ui/modal";
import { Spinner } from "@/components/ui/spinner";
import { SnoozeIcon } from "@/components/common/icons";
import { bulk_patch_metadata } from "@/services/api/mail";
import {
  scan_received_items,
  DECRYPT_YIELD_CHUNK,
  decrypt_items_metadata_for_action,
} from "@/services/bulk_mail_scan";
import { yield_to_browser } from "@/lib/scheduling";
import { batch_archive } from "@/services/api/archive";
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
import { emit_mail_items_removed } from "@/hooks/mail_events";
import { invalidate_mail_stats } from "@/hooks/use_mail_stats";
import { Input } from "@/components/ui/input";
import { use_should_reduce_motion } from "@/provider";
import { use_i18n } from "@/lib/i18n/context";
import {
  detect_unsubscribe_info,
  execute_unsubscribe,
} from "@/utils/unsubscribe_detector";
import { confirm_unsubscribe_bulk } from "@/components/modals/unsubscribe_confirmation_modal";
import { map_in_chunks } from "@/lib/scheduling";

interface Subscription {
  id: string;
  sender_email: string;
  sender_name: string;
  domain: string;
  email_count: number;
  mail_ids: string[];
  items: MailItem[];
  unsub_info: UnsubscribeInfo;
}

interface MassUnsubscribeModalProps {
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

export function MassUnsubscribeModal({
  is_open,
  on_close,
}: MassUnsubscribeModalProps) {
  const { t } = use_i18n();
  const reduce_motion = use_should_reduce_motion();
  const [subscriptions, set_subscriptions] = useState<Subscription[]>([]);
  const [selected_ids, set_selected_ids] = useState<Set<string>>(new Set());
  const [search_query, set_search_query] = useState("");
  const [is_loading, set_is_loading] = useState(true);
  const [is_unsubscribing, set_is_unsubscribing] = useState(false);
  const [completed_count, set_completed_count] = useState(0);
  const [link_opened_count, set_link_opened_count] = useState(0);
  const [failed_count, set_failed_count] = useState(0);
  const [show_success, set_show_success] = useState(false);

  const fetch_subscriptions = useCallback(async (signal?: AbortSignal) => {
    set_is_loading(true);
    try {
      const { items: all_items } = await scan_received_items(signal);

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
            unsub_info: UnsubscribeInfo;
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
                unsub_info,
              });
            }
          } catch (error) {
            if (import.meta.env.DEV) console.error(error);
            continue;
          }
        }

        const subs = Array.from(sender_map.values()).map(
          (s) =>
            ({
              id: s.email,
              sender_email: s.email,
              sender_name: s.name,
              domain: get_email_domain(s.email) || s.email,
              email_count: s.count,
              mail_ids: s.ids,
              items: s.items,
              unsub_info: s.unsub_info,
            }) as Subscription,
        );

        set_subscriptions(subs);
      }
    } finally {
      set_is_loading(false);
    }
  }, []);

  useEffect(() => {
    if (is_open) {
      const controller = new AbortController();

      fetch_subscriptions(controller.signal);
      set_selected_ids(new Set());
      set_search_query("");
      set_show_success(false);
      set_completed_count(0);
      set_link_opened_count(0);
      set_failed_count(0);

      return () => controller.abort();
    }
  }, [is_open, fetch_subscriptions]);

  const filtered_subscriptions = useMemo(() => {
    if (!search_query)
      return [...subscriptions].sort((a, b) => b.email_count - a.email_count);

    const query = search_query.toLowerCase();

    return subscriptions
      .filter(
        (sub) =>
          sub.sender_name.toLowerCase().includes(query) ||
          sub.sender_email.toLowerCase().includes(query) ||
          sub.domain.toLowerCase().includes(query),
      )
      .sort((a, b) => b.email_count - a.email_count);
  }, [subscriptions, search_query]);

  const handle_select_all = () => {
    if (selected_ids.size === filtered_subscriptions.length) {
      set_selected_ids(new Set());
    } else {
      set_selected_ids(new Set(filtered_subscriptions.map((sub) => sub.id)));
    }
  };

  const handle_select = use_shift_range_select(
    filtered_subscriptions,
    (sub) => sub.id,
    selected_ids,
    set_selected_ids,
  );

  const handle_unsubscribe = async () => {
    if (selected_ids.size === 0) return;

    const confirmed = await confirm_unsubscribe_bulk(selected_ids.size);

    if (!confirmed) return;

    set_is_unsubscribing(true);
    const total = selected_ids.size;

    try {
      const selected_subs = subscriptions.filter((sub) =>
        selected_ids.has(sub.id),
      );
      const all_mail_ids = selected_subs.flatMap((sub) => sub.mail_ids);
      const all_items = selected_subs.flatMap((sub) => sub.items);

      let api_count = 0;
      let links_opened = 0;
      let failures = 0;

      const BATCH_SIZE = 5;

      for (let i = 0; i < selected_subs.length; i += BATCH_SIZE) {
        const batch = selected_subs.slice(i, i + BATCH_SIZE);
        const results = await Promise.allSettled(
          batch.map((sub) => execute_unsubscribe(sub.unsub_info)),
        );

        for (const result of results) {
          if (result.status === "fulfilled") {
            if (result.value === "api") {
              api_count++;
            } else {
              links_opened++;
            }
          } else {
            failures++;
          }
        }
      }

      set_link_opened_count(links_opened);
      set_failed_count(failures);

      const metadata_updates = await map_in_chunks(all_items, async (item) => {
        const updated_metadata = {
          ...item.metadata!,
          is_archived: true,
          is_trashed: false,
          is_spam: false,
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
        await bulk_patch_metadata({ items: valid_updates });
      }

      stale_all_view_caches();
      await batch_archive({ ids: all_mail_ids, tier: "hot" });
      emit_mail_items_removed({ ids: all_mail_ids });
      invalidate_mail_stats();

      set_completed_count(total);
      set_subscriptions((prev) =>
        prev.filter((sub) => !selected_ids.has(sub.id)),
      );
      set_selected_ids(new Set());
      set_show_success(true);
    } finally {
      set_is_unsubscribing(false);
    }
  };

  const all_selected =
    selected_ids.size === filtered_subscriptions.length &&
    filtered_subscriptions.length > 0;

  return (
    <Modal
      close_on_overlay={!is_unsubscribing}
      is_open={is_open}
      on_close={on_close}
      show_close_button={false}
      size="md"
    >
      <div className="flex flex-col" style={{ height: "520px" }}>
        <div className="flex items-center justify-between px-6 py-5 flex-shrink-0">
          <div className="flex items-center gap-3">
            <SnoozeIcon size={20} />
            <h2
              className="text-[16px] font-semibold"
              style={{ color: "var(--text-primary)" }}
            >
              {t("settings.bulk_unsubscribe")}
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
                  {t("settings.senders_unsubscribed", {
                    count: completed_count,
                  })}
                </p>
                {link_opened_count > 0 && (
                  <p
                    className="text-[11px] text-center mt-1"
                    style={{ color: "var(--text-muted)" }}
                  >
                    {t("settings.opened_in_browser", {
                      count: link_opened_count,
                    })}
                  </p>
                )}
                {failed_count > 0 && (
                  <p
                    className="text-[11px] text-center mt-1"
                    style={{ color: "var(--text-muted)" }}
                  >
                    {t("settings.could_not_unsubscribe", {
                      count: failed_count,
                    })}
                  </p>
                )}
                <div className="mt-6" />
                <div className="flex gap-2">
                  <Button
                    size="xl"
                    variant="outline"
                    onClick={() => {
                      set_show_success(false);
                      fetch_subscriptions();
                    }}
                  >
                    {t("common.continue_label")}
                  </Button>
                  <Button size="xl" variant="depth" onClick={on_close}>
                    {t("common.done")}
                  </Button>
                </div>
              </motion.div>
            ) : is_unsubscribing ? (
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
                  {t("settings.unsubscribing")}
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
                      className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5"
                      style={{ color: "var(--text-muted)" }}
                    />
                    <Input
                      className="w-full"
                      placeholder={t("common.search") + "..."}
                      style={{ paddingLeft: "34px", paddingRight: "12px" }}
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
                        {t("settings.scanning")}
                      </p>
                    </div>
                  ) : filtered_subscriptions.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full px-6">
                      <MagnifyingGlassIcon
                        className="w-6 h-6 mb-2"
                        style={{ color: "var(--text-muted)" }}
                      />
                      <p
                        className="text-[13px] font-medium mb-0.5"
                        style={{ color: "var(--text-primary)" }}
                      >
                        {search_query
                          ? t("common.no_results")
                          : t("settings.all_clear")}
                      </p>
                      <p
                        className="text-[11px]"
                        style={{ color: "var(--text-muted)" }}
                      >
                        {search_query
                          ? t("settings.try_different_search")
                          : t("settings.no_subscriptions_found")}
                      </p>
                    </div>
                  ) : (
                    filtered_subscriptions.map((sub, index) => {
                      const is_selected = selected_ids.has(sub.id);

                      return (
                        <button
                          key={sub.id}
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
                            <img
                              alt=""
                              className="w-4 h-4 object-contain"
                              src={get_favicon_url(sub.domain.toLowerCase())}
                              onError={(e) => {
                                e.currentTarget.style.display = "none";
                                const parent = e.currentTarget.parentElement;

                                if (parent) {
                                  parent.textContent = "";
                                  const span = document.createElement("span");

                                  span.className = "text-[11px] font-medium";
                                  span.style.color = "var(--text-muted)";
                                  span.textContent = sub.sender_name.charAt(0);
                                  parent.appendChild(span);
                                }
                              }}
                            />
                          </div>
                          <div className="flex-1 min-w-0 text-left">
                            <p
                              className="text-[13px] font-medium truncate"
                              style={{ color: "var(--text-primary)" }}
                            >
                              {sub.sender_name}
                            </p>
                            <p
                              className="text-[11px] truncate"
                              style={{ color: "var(--text-muted)" }}
                            >
                              {sub.sender_email}
                            </p>
                          </div>
                          <span
                            className="text-[11px] tabular-nums flex-shrink-0"
                            style={{ color: "var(--text-muted)" }}
                          >
                            {sub.email_count}
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
                    onClick={handle_unsubscribe}
                  >
                    {t("mail.unsubscribe")}
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
