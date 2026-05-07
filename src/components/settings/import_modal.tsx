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
import { useState, useCallback, useRef } from "react";
import {
  CheckCircleIcon,
  DocumentArrowUpIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { AnimatePresence, motion } from "framer-motion";
import { Button } from "@aster/ui";

import { Spinner } from "@/components/ui/spinner";
import { use_auth } from "@/contexts/auth_context";
import { use_should_reduce_motion } from "@/provider";
import {
  parse_import_file,
  compute_message_id_hash,
  type ParsedEmail,
  type ParseProgress,
} from "@/services/import/parser";
import {
  encrypt_imported_email,
  type EncryptedImportEmail,
} from "@/services/import/encrypt";
import {
  create_import_job,
  update_import_job,
  store_imported_emails,
  check_duplicates,
  type ImportSource,
} from "@/services/api/email_import";
import { emit_mail_changed } from "@/hooks/mail_events";
import { invalidate_mail_cache } from "@/hooks/use_email_list";
import { thread_imported_emails } from "@/services/import/repair_threads";
import { use_i18n } from "@/lib/i18n/context";
import { extract_email_address } from "@/services/import/mime_utils";
import {
  list_aliases,
  decrypt_aliases,
} from "@/services/api/aliases";

interface ImportModalProps {
  is_open: boolean;
  on_close: () => void;
  provider: ImportSource;
}

type ImportStep = "upload" | "progress" | "complete";

function normalize_subject(subject: string): string {
  return subject
    .replace(/^(\s*(re|fwd?|aw|sv|vs|ref|rif|r)\s*:\s*)+/i, "")
    .trim()
    .toLowerCase();
}

function uint8_to_base64(array: Uint8Array): string {
  let binary = "";

  for (let i = 0; i < array.length; i++) {
    binary += String.fromCharCode(array[i]);
  }

  return btoa(binary);
}

async function build_thread_map(
  emails: ParsedEmail[],
): Promise<Map<string, string>> {
  const thread_tokens = new Map<string, string>();
  const message_id_to_group = new Map<string, string>();
  const group_members = new Map<string, Set<string>>();

  for (const email of emails) {
    message_id_to_group.set(email.message_id, email.message_id);
    const members = new Set<string>();

    members.add(email.message_id);
    group_members.set(email.message_id, members);
  }

  const find_root = (id: string): string => {
    let root = id;

    while (
      message_id_to_group.has(root) &&
      message_id_to_group.get(root) !== root
    ) {
      root = message_id_to_group.get(root)!;
    }

    return root;
  };

  const merge = (a: string, b: string) => {
    const root_a = find_root(a);
    const root_b = find_root(b);

    if (root_a === root_b) return;
    const members_a = group_members.get(root_a);
    const members_b = group_members.get(root_b);

    if (!members_a || !members_b) return;
    for (const m of members_b) {
      members_a.add(m);
      message_id_to_group.set(m, root_a);
    }
    group_members.delete(root_b);
  };

  for (const email of emails) {
    const in_reply_to = email.raw_headers["in-reply-to"]
      ?.replace(/[<>]/g, "")
      .trim();

    if (in_reply_to && message_id_to_group.has(in_reply_to)) {
      merge(email.message_id, in_reply_to);
    }

    const references = email.raw_headers["references"];

    if (references) {
      const ref_ids =
        references.match(/<[^>]+>/g)?.map((r) => r.replace(/[<>]/g, "")) || [];

      for (const ref_id of ref_ids) {
        if (message_id_to_group.has(ref_id)) {
          merge(email.message_id, ref_id);
        }
      }
    }
  }

  const subject_groups = new Map<string, string[]>();

  for (const email of emails) {
    const root = find_root(email.message_id);

    if (
      root === email.message_id &&
      (group_members.get(root)?.size ?? 0) <= 1
    ) {
      const norm = normalize_subject(email.subject);

      if (!norm) continue;
      const existing = subject_groups.get(norm);

      if (existing) {
        existing.push(email.message_id);
      } else {
        subject_groups.set(norm, [email.message_id]);
      }
    }
  }

  for (const [, ids] of subject_groups) {
    if (ids.length < 2) continue;
    for (let i = 1; i < ids.length; i++) {
      merge(ids[0], ids[i]);
    }
  }

  const token_cache = new Map<string, string>();

  for (const email of emails) {
    const root = find_root(email.message_id);
    const members = group_members.get(root);

    if (!members || members.size < 2) continue;

    let token = token_cache.get(root);

    if (!token) {
      const material = new TextEncoder().encode("astermail-thread:" + root);
      const hash = await crypto.subtle.digest("SHA-256", material);

      token = uint8_to_base64(new Uint8Array(hash));
      token_cache.set(root, token);
    }

    thread_tokens.set(email.message_id, token);
  }

  return thread_tokens;
}

function detect_item_type(
  email: ParsedEmail,
  user_addresses: Set<string>,
): "sent" | "received" {
  const from_addr = extract_email_address(email.from).toLowerCase();

  if (user_addresses.has(from_addr)) return "sent";

  return "received";
}

export function ImportModal({ is_open, on_close, provider }: ImportModalProps) {
  const { t } = use_i18n();
  const { vault, user } = use_auth();
  const reduce_motion = use_should_reduce_motion();
  const [step, set_step] = useState<ImportStep>("upload");
  const [is_processing, set_is_processing] = useState(false);
  const [progress, set_progress] = useState<ParseProgress | null>(null);
  const [import_result, set_import_result] = useState<{
    imported: number;
    skipped: number;
    failed: number;
    quota_exceeded?: boolean;
    warnings?: string[];
  } | null>(null);
  const [parse_warnings, set_parse_warnings] = useState<string[]>([]);
  const [error, set_error] = useState<string | null>(null);
  const [is_dragging, set_is_dragging] = useState(false);
  const file_input_ref = useRef<HTMLInputElement>(null);
  const cancel_ref = useRef(false);

  const reset_state = useCallback(() => {
    set_step("upload");
    set_is_processing(false);
    set_progress(null);
    set_import_result(null);
    set_error(null);
    set_is_dragging(false);
    set_parse_warnings([]);
    cancel_ref.current = false;
  }, []);

  const handle_close = useCallback(() => {
    if (is_processing) return;
    reset_state();
    on_close();
  }, [is_processing, on_close, reset_state]);

  const handle_cancel = useCallback(() => {
    cancel_ref.current = true;
  }, []);

  const process_emails = useCallback(
    async (emails: ParsedEmail[], source: ImportSource) => {
      if (!vault) {
        set_error(t("common.encryption_vault_not_available"));

        return;
      }

      set_step("progress");
      set_is_processing(true);
      set_error(null);

      const user_addresses = new Set<string>();

      if (user?.email) {
        user_addresses.add(user.email.toLowerCase());
        const domain = user.email.split("@")[1];

        if (domain) {
          const local = user.email.split("@")[0];

          if (domain === "astermail.org" || domain === "aster.cx") {
            user_addresses.add(`${local}@astermail.org`);
            user_addresses.add(`${local}@aster.cx`);
          }
        }
      }

      try {
        const alias_response = await list_aliases({ limit: 100 });

        if (alias_response.data?.aliases) {
          const decrypted = await decrypt_aliases(alias_response.data.aliases);

          for (const alias of decrypted) {
            if (alias.is_enabled && alias.full_address) {
              user_addresses.add(alias.full_address.toLowerCase());
            }
          }
        }
      } catch {
        // proceed with primary address only
      }

      let job_id: string | null = null;

      try {
        const job_response = await create_import_job({
          source,
          total_emails: emails.length,
        });

        if (job_response.error || !job_response.data) {
          throw new Error(job_response.error || t("settings.failed_create_import_job"));
        }

        job_id = job_response.data.id;

        await update_import_job(job_id!, { status: "processing" });

        const message_id_hashes = new Map<string, string>();

        for (const email of emails) {
          const hash = await compute_message_id_hash(email.message_id);

          message_id_hashes.set(email.message_id, hash);
        }

        const all_hashes = Array.from(message_id_hashes.values());
        const DUPLICATE_CHECK_BATCH_SIZE = 1000;
        const existing_hashes = new Set<string>();

        for (
          let i = 0;
          i < all_hashes.length;
          i += DUPLICATE_CHECK_BATCH_SIZE
        ) {
          const hash_batch = all_hashes.slice(
            i,
            i + DUPLICATE_CHECK_BATCH_SIZE,
          );
          const duplicates_response = await check_duplicates(
            job_id!,
            hash_batch,
          );

          if (duplicates_response.data?.duplicates) {
            for (const hash of duplicates_response.data.duplicates) {
              existing_hashes.add(hash);
            }
          }
        }

        const emails_to_import = emails.filter((email) => {
          const hash = message_id_hashes.get(email.message_id);

          return hash && !existing_hashes.has(hash);
        });

        const thread_map = await build_thread_map(emails_to_import);

        let imported_count = 0;
        let failed_count = 0;
        const skipped_count = emails.length - emails_to_import.length;

        if (emails_to_import.length === 0) {
          await update_import_job(job_id!, {
            status: "completed",
            processed_emails: 0,
            skipped_emails: skipped_count,
            failed_emails: 0,
          });

          set_import_result({
            imported: 0,
            skipped: skipped_count,
            failed: 0,
          });
          set_step("complete");

          return;
        }

        const BATCH_SIZE = 10;
        let quota_exceeded = false;

        for (let i = 0; i < emails_to_import.length; i += BATCH_SIZE) {
          if (cancel_ref.current || quota_exceeded) {
            failed_count += Math.min(BATCH_SIZE, emails_to_import.length - i);
            continue;
          }

          const batch = emails_to_import.slice(i, i + BATCH_SIZE);
          const encrypted_batch: EncryptedImportEmail[] = [];

          for (const email of batch) {
            const hash = message_id_hashes.get(email.message_id);

            if (!hash) {
              failed_count++;
              continue;
            }

            try {
              const encrypted = await encrypt_imported_email(
                email,
                vault,
                source,
                hash,
              );

              const token = thread_map.get(email.message_id);

              if (token) {
                encrypted.thread_token = token;
              }

              const type = detect_item_type(email, user_addresses);

              if (type === "sent") {
                encrypted.item_type = "sent";
              }

              encrypted_batch.push(encrypted);
            } catch (error) {
              if (import.meta.env.DEV) console.error(error);
              failed_count++;
            }
          }

          if (encrypted_batch.length > 0) {
            const store_response = await store_imported_emails(
              job_id!,
              encrypted_batch,
            );

            if (store_response.data) {
              imported_count += store_response.data.stored_count;
              failed_count +=
                encrypted_batch.length - store_response.data.stored_count;

              if (store_response.data.quota_exceeded) {
                quota_exceeded = true;
              }
            } else {
              failed_count += encrypted_batch.length;
            }
          }

          const current = Math.min(i + BATCH_SIZE, emails_to_import.length);

          set_progress({
            current,
            total: emails_to_import.length,
            percentage: Math.round((current / emails_to_import.length) * 100),
          });
        }

        const final_status = cancel_ref.current ? "cancelled" : "completed";

        await update_import_job(job_id!, {
          status: final_status,
          processed_emails: imported_count,
          skipped_emails: skipped_count,
          failed_emails: failed_count,
        });

        set_import_result({
          imported: imported_count,
          skipped: skipped_count,
          failed: failed_count,
          quota_exceeded,
        });
        set_step("complete");

        if (imported_count > 0) {
          invalidate_mail_cache();
          emit_mail_changed();
          thread_imported_emails()
            .then((count) => {
              if (count > 0) {
                invalidate_mail_cache();
                emit_mail_changed();
              }
            })
            .catch(() => {});
        }
      } catch (err) {
        if (job_id) {
          try {
            await update_import_job(job_id, {
              status: "failed",
              error_message:
                err instanceof Error
                  ? err.message
                  : t("settings.import_failed"),
            });
          } catch (error) {
            if (import.meta.env.DEV) console.error(error);
          }
        }
        set_error(
          err instanceof Error ? err.message : t("settings.import_failed"),
        );
        set_step("upload");
      } finally {
        set_is_processing(false);
      }
    },
    [vault, user],
  );

  const handle_file_select = useCallback(
    async (files: FileList | null) => {
      if (!files || files.length === 0) return;

      set_is_processing(true);
      set_error(null);

      try {
        const all_emails: ParsedEmail[] = [];
        const all_errors: string[] = [];
        const all_warnings: string[] = [];

        for (let i = 0; i < files.length; i++) {
          const file = files[i];
          const result = await parse_import_file(file, (progress) => {
            set_progress(progress);
          });

          all_emails.push(...result.emails);
          all_errors.push(...result.errors);
          all_warnings.push(...result.warnings);
        }

        if (all_emails.length === 0) {
          const error_message =
            all_errors.length > 0
              ? all_errors[0]
              : t("settings.no_emails_in_file");

          throw new Error(error_message);
        }

        if (all_warnings.length > 0) {
          set_parse_warnings(all_warnings.slice(0, 10));
        }

        await process_emails(all_emails, provider);
      } catch (err) {
        set_error(
          err instanceof Error
            ? err.message
            : t("settings.failed_to_parse_file"),
        );
        set_is_processing(false);
      }
    },
    [provider, process_emails],
  );

  const handle_drag_over = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    set_is_dragging(true);
  }, []);

  const handle_drag_leave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    set_is_dragging(false);
  }, []);

  const handle_drop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      set_is_dragging(false);
      handle_file_select(e.dataTransfer.files);
    },
    [handle_file_select],
  );

  const handle_file_input_change = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      handle_file_select(e.target.files);
    },
    [handle_file_select],
  );

  const handle_browse_click = useCallback(() => {
    file_input_ref.current?.click();
  }, []);

  const render_step_content = () => {
    switch (step) {
      case "upload":
        return (
          <div className="space-y-4">
            <div
              className={`relative border-2 border-dashed rounded-xl p-8 text-center ${is_dragging ? "bg-surf-tertiary border-brand" : "bg-surf-secondary border-edge-secondary"}`}
              onDragLeave={handle_drag_leave}
              onDragOver={handle_drag_over}
              onDrop={handle_drop}
            >
              <input
                ref={file_input_ref}
                multiple
                accept=".mbox,.mbx,.eml,.csv,.pst,.ost"
                className="hidden"
                type="file"
                onChange={handle_file_input_change}
              />

              <DocumentArrowUpIcon className="w-12 h-12 mx-auto mb-3 text-txt-muted" />

              <p className="text-sm mb-2 text-txt-primary">
                {is_dragging
                  ? t("settings.drop_files_here")
                  : t("settings.drag_drop_files")}
              </p>
              <p className="text-xs mb-4 text-txt-muted">
                {t("settings.supported_import_formats")}
              </p>

              <Button
                disabled={is_processing}
                size="md"
                variant="outline"
                onClick={handle_browse_click}
              >
                {is_processing ? (
                  <>
                    <Spinner className="mr-2" size="md" />
                    {t("common.processing")}
                  </>
                ) : (
                  t("settings.browse_files")
                )}
              </Button>
            </div>

            {error && (
              <p className="text-sm text-red-500 text-center">{error}</p>
            )}
          </div>
        );

      case "progress":
        return (
          <div className="py-8 text-center">
            <Spinner className="w-12 h-12 mx-auto mb-4 text-brand" size="lg" />
            <p className="text-sm mb-2 text-txt-primary">
              {t("settings.importing_emails_progress")}
            </p>
            {progress && (
              <>
                <p className="text-xs mb-3 text-txt-muted">
                  {t("settings.emails_of_total", {
                    current: String(progress.current),
                    total: String(progress.total),
                  })}
                </p>
                <div className="w-full h-2 rounded-full overflow-hidden bg-surf-tertiary">
                  <div
                    className="h-full rounded-full transition-all duration-300 bg-brand"
                    style={{
                      width: `${progress.percentage}%`,
                    }}
                  />
                </div>
              </>
            )}
            <Button
              className="mt-4"
              disabled={cancel_ref.current}
              size="md"
              variant="outline"
              onClick={handle_cancel}
            >
              {t("settings.cancel_import")}
            </Button>
          </div>
        );

      case "complete":
        return (
          <div className="py-8 text-center">
            <CheckCircleIcon
              className="w-16 h-16 mx-auto mb-4"
              style={{ color: "var(--color-success)" }}
            />
            <h3 className="text-lg font-semibold mb-2 text-txt-primary">
              {t("common.import_complete")}
            </h3>
            {import_result && (
              <div className="space-y-1">
                <p className="text-sm text-txt-secondary">
                  {t("settings.emails_imported_count", {
                    count: String(import_result.imported),
                  })}
                </p>
                {import_result.skipped > 0 && (
                  <p className="text-xs text-txt-muted">
                    {t("settings.duplicates_skipped", {
                      count: String(import_result.skipped),
                    })}
                  </p>
                )}
                {import_result.failed > 0 && (
                  <p className="text-xs text-red-500">
                    {t("settings.n_failed_count", {
                      count: String(import_result.failed),
                    })}
                  </p>
                )}
                {import_result.quota_exceeded && (
                  <p className="text-xs text-amber-500 mt-2">
                    {t("settings.storage_quota_reached")}
                  </p>
                )}
                {import_result.imported > 0 && (
                  <p className="text-xs text-txt-muted mt-2">
                    {t("settings.import_folder_hint")}
                  </p>
                )}
                {parse_warnings.length > 0 && (
                  <div className="mt-3 text-left max-h-24 overflow-y-auto rounded-md bg-bg-tertiary p-2">
                    {parse_warnings.map((w, i) => (
                      <p key={i} className="text-xs text-txt-muted truncate">
                        {w}
                      </p>
                    ))}
                  </div>
                )}
              </div>
            )}
            <Button
              className="mt-6"
              size="xl"
              variant="depth"
              onClick={handle_close}
            >
              {t("common.done")}
            </Button>
          </div>
        );
    }
  };

  return (
    <AnimatePresence>
      {is_open && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center"
          role="presentation"
          onClick={(e) => e.target === e.currentTarget && handle_close()}
          onKeyDown={(e) => e["key"] === "Escape" && handle_close()}
        >
          <motion.div
            animate={{ opacity: 1 }}
            aria-hidden="true"
            className="absolute inset-0 backdrop-blur-md"
            exit={{ opacity: 0 }}
            initial={reduce_motion ? false : { opacity: 0 }}
            style={{ backgroundColor: "var(--modal-overlay)" }}
            transition={{ duration: reduce_motion ? 0 : 0.2 }}
            onClick={handle_close}
          />
          <motion.div
            animate={{ opacity: 1, scale: 1, y: 0 }}
            aria-modal="true"
            className="relative w-full max-w-md rounded-xl border overflow-hidden bg-modal-bg border-edge-primary"
            exit={{ opacity: 0, scale: 0.97, y: 4 }}
            initial={reduce_motion ? false : { opacity: 0, scale: 0.97, y: 4 }}
            role="dialog"
            style={{
              boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.35)",
            }}
            transition={{
              duration: reduce_motion ? 0 : 0.2,
              ease: [0.16, 1, 0.3, 1],
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-6 pt-5 pb-4">
              <h2 className="text-[16px] font-semibold text-txt-primary">
                {t("settings.import_emails_title")}
              </h2>
              {step !== "progress" && (
                <button
                  className="p-1 rounded-lg transition-colors hover:bg-white/10"
                  onClick={handle_close}
                >
                  <XMarkIcon className="w-5 h-5 text-txt-muted" />
                </button>
              )}
            </div>

            <div className="px-6 pb-6 min-h-[280px]">
              {render_step_content()}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
