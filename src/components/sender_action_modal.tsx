import { useState, useEffect, useMemo, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  MagnifyingGlassIcon,
  XMarkIcon,
  ArrowPathIcon,
  ArchiveBoxIcon,
  TrashIcon,
  FolderArrowDownIcon,
  CheckIcon,
} from "@heroicons/react/24/outline";

import { Button } from "@/components/ui/button";
import {
  list_mail_items,
  bulk_update_mail_items,
  bulk_add_folder,
} from "@/services/api/mail";
import { batch_archive, batch_unarchive } from "@/services/api/archive";
import {
  decrypt_envelope_with_bytes,
  base64_to_array,
} from "@/services/crypto/envelope";
import { zero_uint8_array } from "@/services/crypto/secure_memory";
import {
  get_passphrase_bytes,
  get_vault_from_memory,
} from "@/services/crypto/memory_key_store";
import { show_action_toast } from "@/components/action_toast";
import { use_auth } from "@/contexts/auth_context";
import { get_email_username } from "@/lib/utils";

interface DecryptedEnvelope {
  from_address?: string;
  from_name?: string;
}

async function decrypt_envelope_local(
  encrypted: string,
  nonce: string,
): Promise<DecryptedEnvelope | null> {
  const passphrase = get_passphrase_bytes();

  if (!passphrase) return null;

  try {
    const nonce_bytes = base64_to_array(nonce);

    if (nonce_bytes.length === 1 && nonce_bytes[0] === 1) {
      const result = await decrypt_envelope_with_bytes<DecryptedEnvelope>(
        encrypted,
        passphrase,
      );

      zero_uint8_array(passphrase);

      return result;
    }

    zero_uint8_array(passphrase);

    const vault = get_vault_from_memory();

    if (!vault?.identity_key) return null;

    const key_hash = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(vault.identity_key + "astermail-envelope-v1"),
    );
    const crypto_key = await crypto.subtle.importKey(
      "raw",
      key_hash,
      { name: "AES-GCM", length: 256 },
      false,
      ["decrypt"],
    );
    const decrypted = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: new Uint8Array(base64_to_array(nonce)) },
      crypto_key,
      new Uint8Array(base64_to_array(encrypted)),
    );

    return JSON.parse(new TextDecoder().decode(decrypted));
  } catch {
    zero_uint8_array(passphrase);

    return null;
  }
}

type ActionType = "archive" | "delete" | "move";

interface SenderInfo {
  email: string;
  name: string;
  count: number;
  ids: string[];
}

interface Folder {
  token: string;
  name: string;
}

interface SenderActionModalProps {
  is_open: boolean;
  on_close: () => void;
  action_type: ActionType;
  folders?: Folder[];
}

const ACTION_CONFIG: Record<
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
    title: "Archive emails from sender",
    icon: ArchiveBoxIcon,
    button_text: "Archive",
  },
  delete: {
    title: "Delete emails from sender",
    icon: TrashIcon,
    button_text: "Delete",
  },
  move: {
    title: "Move emails from sender",
    icon: FolderArrowDownIcon,
    button_text: "Move",
  },
};

export function SenderActionModal({
  is_open,
  on_close,
  action_type,
  folders = [],
}: SenderActionModalProps) {
  const { vault } = use_auth();
  const [senders, set_senders] = useState<SenderInfo[]>([]);
  const [selected_sender, set_selected_sender] = useState<string | null>(null);
  const [selected_folder, set_selected_folder] = useState<string | null>(null);
  const [search_query, set_search_query] = useState("");
  const [is_loading, set_is_loading] = useState(true);
  const [is_executing, set_is_executing] = useState(false);

  const config = ACTION_CONFIG[action_type];
  const Icon = config.icon;

  const load_senders = useCallback(async () => {
    if (!vault) return;
    set_is_loading(true);
    try {
      const response = await list_mail_items({
        item_type: "received",
        limit: 500,
      });

      if (response.data?.items) {
        const sender_map = new Map<string, SenderInfo>();

        for (const item of response.data.items) {
          if (item.is_trashed) continue;
          try {
            const envelope = await decrypt_envelope_local(
              item.encrypted_envelope,
              item.envelope_nonce,
            );

            if (!envelope) continue;
            const email = envelope.from_address || "unknown@unknown.com";
            const name = envelope.from_name || get_email_username(email);

            if (sender_map.has(email)) {
              const existing = sender_map.get(email)!;

              existing.count++;
              existing.ids.push(item.id);
            } else {
              sender_map.set(email, { email, name, count: 1, ids: [item.id] });
            }
          } catch {
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
      set_selected_sender(null);
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

  const handle_execute = async () => {
    if (!selected_sender) return;
    const sender = senders.find((s) => s.email === selected_sender);

    if (!sender) return;

    set_is_executing(true);
    try {
      if (action_type === "archive") {
        await batch_archive({ ids: sender.ids, tier: "hot" });
        show_action_toast({
          message: `${sender.count} email${sender.count > 1 ? "s" : ""} from ${sender.name} archived`,
          action_type: "archive",
          email_ids: sender.ids,
          on_undo: async () => {
            await batch_unarchive({ ids: sender.ids });
            window.dispatchEvent(new CustomEvent("astermail:mail-changed"));
          },
        });
      } else if (action_type === "delete") {
        await bulk_update_mail_items({ ids: sender.ids, is_trashed: true });
        show_action_toast({
          message: `${sender.count} email${sender.count > 1 ? "s" : ""} from ${sender.name} deleted`,
          action_type: "trash",
          email_ids: sender.ids,
          on_undo: async () => {
            await bulk_update_mail_items({
              ids: sender.ids,
              is_trashed: false,
            });
            window.dispatchEvent(new CustomEvent("astermail:mail-changed"));
          },
        });
      } else if (action_type === "move" && selected_folder) {
        await bulk_add_folder(sender.ids, selected_folder);
        const folder = folders.find((f) => f.token === selected_folder);

        show_action_toast({
          message: `${sender.count} email${sender.count > 1 ? "s" : ""} moved to ${folder?.name || "folder"}`,
          action_type: "archive",
          email_ids: sender.ids,
        });
      }
      window.dispatchEvent(new CustomEvent("astermail:mail-changed"));
      on_close();
    } finally {
      set_is_executing(false);
    }
  };

  const can_execute =
    selected_sender && (action_type !== "move" || selected_folder);

  return (
    <AnimatePresence>
      {is_open && (
        <motion.div
          animate={{ opacity: 1 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          exit={{ opacity: 0 }}
          initial={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
        >
          <motion.div
            className="absolute inset-0 backdrop-blur-md"
            style={{ backgroundColor: "var(--modal-overlay)" }}
            onClick={on_close}
          />
          <motion.div
            animate={{ opacity: 1, scale: 1, y: 0 }}
            className="relative w-full max-w-md rounded-xl border overflow-hidden"
            exit={{ opacity: 0, scale: 0.96, y: 0 }}
            initial={{ opacity: 0, scale: 0.96, y: 0 }}
            style={{
              backgroundColor: "var(--modal-bg)",
              borderColor: "var(--border-primary)",
              boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.35)",
            }}
            transition={{ duration: 0.15, ease: "easeOut" }}
          >
            <div className="flex items-center justify-between px-6 py-5">
              <div className="flex items-center gap-3">
                <Icon
                  className="w-5 h-5"
                  style={{ color: "var(--text-secondary)" }}
                />
                <h2
                  className="text-[16px] font-semibold"
                  style={{ color: "var(--text-primary)" }}
                >
                  {config.title}
                </h2>
              </div>
              <button
                className="p-1.5 rounded-lg transition-colors hover:bg-black/[0.05] dark:hover:bg-white/[0.05]"
                style={{ color: "var(--text-muted)" }}
                onClick={on_close}
              >
                <XMarkIcon className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4">
              <div className="relative mb-3">
                <MagnifyingGlassIcon
                  className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4"
                  style={{ color: "var(--text-muted)" }}
                />
                <input
                  className="w-full h-10 pl-10 pr-4 rounded-lg text-[13px] focus:outline-none"
                  placeholder="Search senders..."
                  style={{
                    backgroundColor: "var(--bg-secondary)",
                    color: "var(--text-primary)",
                    border: "1px solid var(--border-secondary)",
                  }}
                  type="text"
                  value={search_query}
                  onChange={(e) => set_search_query(e.target.value)}
                />
              </div>

              <div
                className="rounded-lg overflow-hidden mb-3"
                style={{ border: "1px solid var(--border-secondary)" }}
              >
                <div
                  className="max-h-64 overflow-y-auto"
                  style={{ scrollbarWidth: "thin" }}
                >
                  {is_loading ? (
                    <div className="flex items-center justify-center py-12">
                      <ArrowPathIcon
                        className="w-5 h-5 animate-spin"
                        style={{ color: "var(--text-muted)" }}
                      />
                    </div>
                  ) : filtered_senders.length === 0 ? (
                    <div className="py-8 text-center">
                      <p
                        className="text-[13px]"
                        style={{ color: "var(--text-muted)" }}
                      >
                        {search_query
                          ? "No senders found"
                          : "No emails to process"}
                      </p>
                    </div>
                  ) : (
                    filtered_senders.map((sender) => {
                      const is_selected = selected_sender === sender.email;

                      return (
                        <button
                          key={sender.email}
                          className="w-full flex items-center gap-3 px-3 py-2.5 transition-colors"
                          style={{
                            backgroundColor: is_selected
                              ? "var(--bg-secondary)"
                              : "transparent",
                          }}
                          onClick={() => set_selected_sender(sender.email)}
                        >
                          <div
                            className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-[12px] font-semibold"
                            style={{
                              backgroundColor: "var(--bg-tertiary)",
                              color: "var(--text-secondary)",
                            }}
                          >
                            {sender.name.charAt(0).toUpperCase()}
                          </div>
                          <div className="flex-1 min-w-0 text-left">
                            <p
                              className="text-[13px] font-medium truncate"
                              style={{ color: "var(--text-primary)" }}
                            >
                              {sender.name}
                            </p>
                            <p
                              className="text-[11px] truncate"
                              style={{ color: "var(--text-muted)" }}
                            >
                              {sender.email}
                            </p>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <span
                              className="text-[11px] tabular-nums"
                              style={{ color: "var(--text-muted)" }}
                            >
                              {sender.count} email{sender.count > 1 ? "s" : ""}
                            </span>
                            {is_selected && (
                              <CheckIcon
                                className="w-4 h-4"
                                style={{ color: "var(--accent-color)" }}
                              />
                            )}
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>
              </div>

              {action_type === "move" && selected_sender && (
                <div className="mb-3">
                  <p
                    className="text-[12px] font-medium mb-2"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    Select destination folder
                  </p>
                  <div
                    className="rounded-lg overflow-hidden"
                    style={{ border: "1px solid var(--border-secondary)" }}
                  >
                    <div
                      className="max-h-32 overflow-y-auto"
                      style={{ scrollbarWidth: "thin" }}
                    >
                      {folders.length === 0 ? (
                        <div className="py-4 text-center">
                          <p
                            className="text-[12px]"
                            style={{ color: "var(--text-muted)" }}
                          >
                            No folders available
                          </p>
                        </div>
                      ) : (
                        folders.map((folder) => {
                          const is_selected = selected_folder === folder.token;

                          return (
                            <button
                              key={folder.token}
                              className="w-full flex items-center justify-between px-3 py-2 transition-colors"
                              style={{
                                backgroundColor: is_selected
                                  ? "var(--bg-secondary)"
                                  : "transparent",
                              }}
                              onClick={() => set_selected_folder(folder.token)}
                            >
                              <span
                                className="text-[13px]"
                                style={{ color: "var(--text-primary)" }}
                              >
                                {folder.name}
                              </span>
                              {is_selected && (
                                <CheckIcon
                                  className="w-4 h-4"
                                  style={{ color: "var(--accent-color)" }}
                                />
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

            <div className="flex items-center justify-end gap-3 px-6 pb-6 pt-2">
              <Button size="lg" variant="outline" onClick={on_close}>
                Cancel
              </Button>
              <Button
                disabled={!can_execute || is_executing}
                size="lg"
                variant="primary"
                onClick={handle_execute}
              >
                {is_executing ? (
                  <ArrowPathIcon className="w-4 h-4 animate-spin" />
                ) : (
                  config.button_text
                )}
              </Button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
