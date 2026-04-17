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
import type { MailItem } from "@/services/api/mail";

import { useState, useEffect, useMemo, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  MagnifyingGlassIcon,
  XMarkIcon,
  ArchiveBoxIcon,
  TrashIcon,
  FolderArrowDownIcon,
  FolderIcon,
  CheckIcon,
} from "@heroicons/react/24/outline";
import { Button } from "@aster/ui";
import { Checkbox } from "@aster/ui";

import { Spinner } from "@/components/ui/spinner";
import {
  list_mail_items,
  bulk_add_folder,
  bulk_patch_metadata,
} from "@/services/api/mail";
import { batch_archive, batch_unarchive } from "@/services/api/archive";
import {
  decrypt_mail_envelope,
  normalize_envelope_from,
} from "@/services/crypto/envelope";
import { zero_uint8_array } from "@/services/crypto/secure_memory";
import {
  get_passphrase_bytes,
  get_vault_from_memory,
} from "@/services/crypto/memory_key_store";
import { get_favicon_url } from "@/lib/favicon_url";
import { show_action_toast } from "@/components/toast/action_toast";
import {
  decrypt_mail_metadata,
  create_default_metadata,
  encrypt_mail_metadata,
} from "@/services/crypto/mail_metadata";
import { use_auth } from "@/contexts/auth_context";
import { get_email_username, get_email_domain } from "@/lib/utils";
import { has_protected_folder_label } from "@/hooks/use_folders";
import { emit_mail_items_removed } from "@/hooks/mail_events";
import { invalidate_mail_stats } from "@/hooks/use_mail_stats";
import { Input } from "@/components/ui/input";
import { use_should_reduce_motion } from "@/provider";
import { use_i18n } from "@/lib/i18n/context";

interface DecryptedEnvelope {
  from: { name: string; email: string };
}

async function decrypt_envelope_local(
  encrypted: string,
  nonce: string,
): Promise<DecryptedEnvelope | null> {
  const passphrase = get_passphrase_bytes();
  const vault = get_vault_from_memory();

  try {
    const raw = await decrypt_mail_envelope<Record<string, unknown>>(
      encrypted,
      nonce,
      passphrase,
      vault?.identity_key ?? null,
    );

    if (!raw) return null;
    const from = normalize_envelope_from(raw.from);

    if (!from) return null;

    return { from };
  } finally {
    if (passphrase) zero_uint8_array(passphrase);
  }
}

async function decrypt_items_metadata_for_action(
  items: MailItem[],
): Promise<void> {
  for (const item of items) {
    if (item.metadata) continue;
    if (!item.encrypted_metadata || !item.metadata_nonce) {
      const is_sent =
        item.item_type === "sent" ||
        item.item_type === "draft" ||
        item.item_type === "scheduled";
      const defaults = create_default_metadata(item.item_type);

      defaults.is_read = is_sent;
      if (item.message_ts) defaults.message_ts = item.message_ts;
      item.metadata = defaults;
      continue;
    }
    try {
      const meta = await decrypt_mail_metadata(
        item.encrypted_metadata,
        item.metadata_nonce,
        item.metadata_version,
      );

      item.metadata = meta ?? create_default_metadata(item.item_type);
    } catch {
      item.metadata = create_default_metadata(item.item_type);
    }
  }
}

type ActionType = "archive" | "delete" | "move";

interface SenderInfo {
  email: string;
  name: string;
  count: number;
  ids: string[];
  items: MailItem[];
}

interface Folder {
  token: string;
  name: string;
  color?: string;
}

interface SenderActionModalProps {
  is_open: boolean;
  on_close: () => void;
  action_type: ActionType;
  folders?: Folder[];
}

function get_action_config(
  action_type: ActionType,
  t: (key: TranslationKey, params?: Record<string, string | number>) => string,
) {
  const configs: Record<
    ActionType,
    {
      title: string;
      icon: React.ComponentType<{
        className?: string;
        style?: React.CSSProperties;
      }>;
      button_text: string;
    }
  > = {
    archive: {
      title: t("common.archive_emails_from_sender"),
      icon: ArchiveBoxIcon,
      button_text: t("mail.archive"),
    },
    delete: {
      title: t("common.delete_emails_from_sender"),
      icon: TrashIcon,
      button_text: t("common.delete"),
    },
    move: {
      title: t("common.move_emails_from_sender"),
      icon: FolderArrowDownIcon,
      button_text: t("mail.move_to"),
    },
  };

  return configs[action_type];
}

export function SenderActionModal({
  is_open,
  on_close,
  action_type,
  folders = [],
}: SenderActionModalProps) {
  const { t } = use_i18n();
  const reduce_motion = use_should_reduce_motion();
  const { vault } = use_auth();
  const [senders, set_senders] = useState<SenderInfo[]>([]);
  const [selected_senders, set_selected_senders] = useState<Set<string>>(
    new Set(),
  );
  const [selected_folder, set_selected_folder] = useState<string | null>(null);
  const [search_query, set_search_query] = useState("");
  const [is_loading, set_is_loading] = useState(true);
  const [is_executing, set_is_executing] = useState(false);
  const config = get_action_config(action_type, t);
  const Icon = config.icon;

  const load_senders = useCallback(async () => {
    if (!vault) return;
    set_is_loading(true);
    try {
      let all_items: MailItem[] = [];
      let cursor: string | undefined;

      do {
        const response = await list_mail_items({
          item_type: "received",
          cursor,
        });

        if (!response.data?.items) break;
        all_items.push(...response.data.items);
        cursor = response.data.next_cursor;
      } while (cursor);

      if (all_items.length > 0) {
        await decrypt_items_metadata_for_action(all_items);
        const sender_map = new Map<string, SenderInfo>();

        for (const item of all_items) {
          if (item.metadata?.is_trashed) continue;
          if (has_protected_folder_label(item.labels)) continue;
          try {
            const envelope = await decrypt_envelope_local(
              item.encrypted_envelope,
              item.envelope_nonce,
            );

            if (!envelope) continue;
            const email = envelope.from?.email || "unknown@unknown.com";
            const name = envelope.from?.name || get_email_username(email);

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

        const sorted = Array.from(sender_map.values()).sort(
          (a, b) => b.count - a.count,
        );

        set_senders(sorted);
      }
    } finally {
      set_is_loading(false);
    }
  }, [vault]);

  useEffect(() => {
    if (is_open) {
      set_selected_senders(new Set());
      set_selected_folder(null);
      set_search_query("");
      load_senders();
    }
  }, [is_open, load_senders]);

  const filtered_senders = useMemo(() => {
    if (!search_query.trim()) return senders;
    const query = search_query.toLowerCase();

    return senders.filter(
      (s) =>
        s.email.toLowerCase().includes(query) ||
        s.name.toLowerCase().includes(query),
    );
  }, [senders, search_query]);

  const handle_select = (email: string) => {
    const next = new Set(selected_senders);

    if (next.has(email)) {
      next.delete(email);
    } else {
      next.add(email);
    }
    set_selected_senders(next);
  };

  const handle_select_all = () => {
    if (selected_senders.size === filtered_senders.length) {
      set_selected_senders(new Set());
    } else {
      set_selected_senders(new Set(filtered_senders.map((s) => s.email)));
    }
  };

  const handle_execute = async () => {
    if (selected_senders.size === 0) return;
    const selected = senders.filter((s) => selected_senders.has(s.email));
    const all_ids = selected.flatMap((s) => s.ids);
    const all_items = selected.flatMap((s) => s.items);
    const total_count = selected.reduce((sum, s) => sum + s.count, 0);

    set_is_executing(true);
    try {
      if (action_type === "archive") {
        const metadata_updates = await Promise.all(
          all_items.map(async (item) => {
            const updated_metadata = { ...item.metadata!, is_archived: true };
            const encrypted = await encrypt_mail_metadata(updated_metadata);

            return encrypted ? { id: item.id, ...encrypted } : null;
          }),
        );
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
        await batch_archive({ ids: all_ids, tier: "hot" });
        emit_mail_items_removed({ ids: all_ids });
        invalidate_mail_stats();
        show_action_toast({
          message: t("common.emails_from_senders_archived", {
            count: String(total_count),
            senders: String(selected.length),
          }),
          action_type: "archive",
          email_ids: all_ids,
          on_undo: async () => {
            const undo_updates = await Promise.all(
              all_items.map(async (item) => {
                const restored_metadata = {
                  ...item.metadata!,
                  is_archived: false,
                };
                const encrypted =
                  await encrypt_mail_metadata(restored_metadata);

                return encrypted ? { id: item.id, ...encrypted } : null;
              }),
            );
            const valid_undo = undo_updates.filter((u) => u !== null) as Array<{
              id: string;
              encrypted_metadata: string;
              metadata_nonce: string;
            }>;

            if (valid_undo.length > 0) {
              await bulk_patch_metadata({ items: valid_undo });
            }
            await batch_unarchive({ ids: all_ids });
            invalidate_mail_stats();
            window.dispatchEvent(
              new CustomEvent("astermail:mail-soft-refresh"),
            );
          },
        });
      } else if (action_type === "delete") {
        const metadata_updates = await Promise.all(
          all_items.map(async (item) => {
            const updated_metadata = { ...item.metadata!, is_trashed: true };
            const encrypted = await encrypt_mail_metadata(updated_metadata);

            return encrypted ? { id: item.id, ...encrypted } : null;
          }),
        );
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
        emit_mail_items_removed({ ids: all_ids });
        invalidate_mail_stats();
        show_action_toast({
          message: t("common.emails_from_senders_deleted", {
            count: String(total_count),
            senders: String(selected.length),
          }),
          action_type: "trash",
          email_ids: all_ids,
          on_undo: async () => {
            const undo_updates = await Promise.all(
              all_items.map(async (item) => {
                const restored_metadata = {
                  ...item.metadata!,
                  is_trashed: false,
                };
                const encrypted =
                  await encrypt_mail_metadata(restored_metadata);

                return encrypted ? { id: item.id, ...encrypted } : null;
              }),
            );
            const valid_undo = undo_updates.filter((u) => u !== null) as Array<{
              id: string;
              encrypted_metadata: string;
              metadata_nonce: string;
            }>;

            if (valid_undo.length > 0) {
              await bulk_patch_metadata({ items: valid_undo });
            }
            invalidate_mail_stats();
            window.dispatchEvent(
              new CustomEvent("astermail:mail-soft-refresh"),
            );
          },
        });
      } else if (action_type === "move" && selected_folder) {
        await bulk_add_folder(all_ids, selected_folder);
        const folder = folders.find((f) => f.token === selected_folder);

        invalidate_mail_stats();
        window.dispatchEvent(new CustomEvent("astermail:mail-soft-refresh"));
        show_action_toast({
          message: t("common.emails_added_to_folder", {
            count: String(total_count),
            folder: folder?.name || t("mail.folder"),
          }),
          action_type: "archive",
          email_ids: all_ids,
        });
      }
      on_close();
    } finally {
      set_is_executing(false);
    }
  };

  const all_selected =
    selected_senders.size === filtered_senders.length &&
    filtered_senders.length > 0;

  const can_execute =
    selected_senders.size > 0 && (action_type !== "move" || selected_folder);

  return (
    <AnimatePresence>
      {is_open && (
        <motion.div
          animate={{ opacity: 1 }}
          className="fixed inset-0 z-[60] flex items-center justify-center p-4"
          exit={{ opacity: 0 }}
          initial={reduce_motion ? false : { opacity: 0 }}
          transition={{ duration: reduce_motion ? 0 : 0.15 }}
        >
          <motion.div
            className="absolute inset-0 backdrop-blur-md"
            style={{ backgroundColor: "var(--modal-overlay)" }}
            onClick={on_close}
          />
          <motion.div
            animate={{ opacity: 1, scale: 1, y: 0 }}
            className="relative w-full max-w-md rounded-xl border overflow-hidden bg-modal-bg border-edge-primary"
            exit={{ opacity: 0, scale: 0.96, y: 0 }}
            initial={reduce_motion ? false : { opacity: 0, scale: 0.96, y: 0 }}
            style={{
              boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.35)",
            }}
            transition={{ duration: reduce_motion ? 0 : 0.15, ease: "easeOut" }}
          >
            <div className="flex items-center justify-between px-6 py-5">
              <div className="flex items-center gap-3">
                <Icon className="w-5 h-5 text-txt-secondary" />
                <h2 className="text-[16px] font-semibold text-txt-primary">
                  {config.title}
                </h2>
              </div>
              <button
                className="p-1.5 rounded-lg transition-colors hover:bg-black/[0.05] dark:hover:bg-white/[0.05] text-txt-muted"
                onClick={on_close}
              >
                <XMarkIcon className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4">
              <div className="relative mb-3">
                <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-txt-muted" />
                <Input
                  className="w-full pl-10 pr-4"
                  placeholder={t("common.search_senders")}
                  type="text"
                  value={search_query}
                  onChange={(e) => set_search_query(e.target.value)}
                />
              </div>

              <div className="rounded-lg overflow-hidden mb-3 border border-edge-secondary">
                <div
                  className="max-h-64 overflow-y-auto"
                  style={{ scrollbarWidth: "thin" }}
                >
                  {is_loading ? (
                    <div className="flex items-center justify-center py-12">
                      <Spinner className="text-txt-muted" size="md" />
                    </div>
                  ) : filtered_senders.length === 0 ? (
                    <div className="py-8 text-center">
                      <p className="text-[13px] text-txt-muted">
                        {search_query
                          ? t("common.no_senders_found")
                          : t("common.no_emails_to_process")}
                      </p>
                    </div>
                  ) : (
                    filtered_senders.map((sender) => {
                      const is_selected = selected_senders.has(sender.email);

                      return (
                        <button
                          key={sender.email}
                          className="w-full flex items-center gap-3 px-4 py-2 cursor-pointer select-none transition-colors"
                          style={{ backgroundColor: "transparent" }}
                          onClick={() => handle_select(sender.email)}
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
                            onCheckedChange={() => handle_select(sender.email)}
                            onClick={(e) => e.stopPropagation()}
                          />
                          <div className="w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0 overflow-hidden bg-black/[0.03] dark:bg-white/[0.04]">
                            <img
                              alt=""
                              className="w-4 h-4 object-contain"
                              src={get_favicon_url(
                                get_email_domain(sender.email).toLowerCase(),
                              )}
                              onError={(e) => {
                                e.currentTarget.style.display = "none";
                                const parent = e.currentTarget.parentElement;

                                if (parent) {
                                  parent.textContent = "";
                                  const span = document.createElement("span");

                                  span.className =
                                    "text-[11px] font-medium text-txt-muted";
                                  span.textContent = sender.name.charAt(0);
                                  parent.appendChild(span);
                                }
                              }}
                            />
                          </div>
                          <div className="flex-1 min-w-0 text-left">
                            <p className="text-[13px] font-medium truncate text-txt-primary">
                              {sender.name}
                            </p>
                            <p className="text-[11px] truncate text-txt-muted">
                              {sender.email}
                            </p>
                          </div>
                          <span className="text-[11px] tabular-nums flex-shrink-0 text-txt-muted">
                            {sender.count}
                          </span>
                        </button>
                      );
                    })
                  )}
                </div>
              </div>

              {action_type === "move" && selected_senders.size > 0 && (
                <div className="mb-3">
                  <p className="text-[12px] font-medium mb-2 text-txt-secondary">
                    {t("common.select_destination_folder")}
                  </p>
                  <div className="rounded-lg overflow-hidden border border-edge-secondary">
                    <div
                      className="max-h-32 overflow-y-auto"
                      style={{ scrollbarWidth: "thin" }}
                    >
                      {folders.length === 0 ? (
                        <div className="py-4 text-center">
                          <p className="text-[12px] text-txt-muted">
                            {t("common.no_folders_available")}
                          </p>
                        </div>
                      ) : (
                        folders.map((folder) => {
                          const is_selected = selected_folder === folder.token;

                          return (
                            <button
                              key={folder.token}
                              className={`w-full flex items-center gap-2.5 px-3 py-2 transition-colors ${is_selected ? "bg-surf-secondary" : ""}`}
                              onClick={() => set_selected_folder(folder.token)}
                            >
                              <FolderIcon
                                className="w-4 h-4 flex-shrink-0"
                                style={{ color: folder.color || "#3b82f6" }}
                              />
                              <span className="text-[13px] flex-1 text-left truncate text-txt-primary">
                                {folder.name}
                              </span>
                              {is_selected && (
                                <CheckIcon className="w-4 h-4 flex-shrink-0 text-brand" />
                              )}
                            </button>
                          );
                        })
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center justify-between px-4 py-3 border-t border-edge-secondary">
              <button
                className="flex items-center gap-3 text-[12px] font-medium text-txt-muted"
                onClick={handle_select_all}
              >
                <Checkbox
                  checked={all_selected}
                  onCheckedChange={handle_select_all}
                />
                {selected_senders.size > 0
                  ? `${selected_senders.size} ${t("common.selected")}`
                  : t("common.select_all")}
              </button>
              <Button
                disabled={!can_execute || is_executing}
                size="xl"
                variant="depth"
                onClick={handle_execute}
              >
                {is_executing ? (
                  <Spinner size="md" />
                ) : (
                  <>
                    {config.button_text}
                    {selected_senders.size > 0
                      ? ` (${selected_senders.size})`
                      : ""}
                  </>
                )}
              </Button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
