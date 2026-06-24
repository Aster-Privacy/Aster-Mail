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
import { useState, useCallback, useRef, useEffect } from "react";
import {
  CheckCircleIcon,
  DocumentArrowUpIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { AnimatePresence, motion } from "framer-motion";
import { Button } from "@aster/ui";

import { Spinner } from "@/components/ui/spinner";
import { use_auth } from "@/contexts/auth_context";
import { use_folders } from "@/hooks/use_folders";
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
  collect_files_from_data_transfer,
  filter_supported_files,
} from "@/services/import/file_collection";
import {
  list_aliases,
  decrypt_aliases,
} from "@/services/api/aliases";

interface ImportModalProps {
  is_open: boolean;
  on_close: () => void;
  provider: ImportSource | null;
}

type ImportStep = "upload" | "progress" | "complete";

const CANONICAL_FOLDER_TOKENS = new Set([
  "inbox",
  "sent",
  "sent mail",
  "sent items",
  "sent messages",
  "outbox",
  "drafts",
  "draft",
  "trash",
  "deleted",
  "deleted items",
  "deleted messages",
  "bin",
  "spam",
  "junk",
  "junk email",
  "junk e-mail",
  "bulk mail",
  "archive",
  "archives",
  "all mail",
  "all",
  "starred",
  "flagged",
  "important",
]);

function is_canonical_folder(name: string): boolean {
  const trimmed = name.trim().toLowerCase();
  const leaf = trimmed.split("/").pop() ?? trimmed;

  return CANONICAL_FOLDER_TOKENS.has(leaf);
}

export function derive_manual_import_source(files: File[]): ImportSource {
  let has_mbox = false;
  let has_eml = false;

  for (const file of files) {
    const name = file.name.toLowerCase();

    if (name.endsWith(".mbox") || name.endsWith(".mbx")) has_mbox = true;
    else if (name.endsWith(".eml") || name.endsWith(".emlx")) has_eml = true;
  }

  if (has_mbox) return "mbox";
  if (has_eml) return "eml";

  return "mbox";
}

function extract_source_folders(emails: ParsedEmail[]): string[] {
  const out = new Set<string>();

  for (const email of emails) {
    const raw = email.raw_headers["x-gmail-labels"];

    if (!raw) continue;
    for (const piece of raw.split(",")) {
      const name = piece.trim();

      if (!name) continue;
      if (is_canonical_folder(name)) continue;
      out.add(name);
    }
  }

  return Array.from(out);
}

function folder_for_email(
  email: ParsedEmail,
  label_map: Map<string, string>,
): string | undefined {
  const raw = email.raw_headers["x-gmail-labels"];

  if (!raw) return undefined;
  for (const piece of raw.split(",")) {
    const name = piece.trim();
    const token = label_map.get(name);

    if (token) return token;
  }

  return undefined;
}

const NO_SUBJECT_SENTINELS = new Set(["(no subject)", "no subject"]);

function normalize_subject(subject: string): string {
  const normalized = subject
    .replace(/^(\s*(re|fwd?|aw|sv|vs|ref|rif|r)\s*:\s*)+/i, "")
    .trim()
    .toLowerCase();

  if (NO_SUBJECT_SENTINELS.has(normalized)) return "";

  return normalized;
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
  const { create_new_folder, state: folders_state } = use_folders();
  const reduce_motion = use_should_reduce_motion();
  // Retain the last selected provider so the content stays stable while the
  // modal plays its exit animation (when `provider` is cleared to null).
  const [active_provider, set_active_provider] = useState<ImportSource>(
    provider ?? "mbox",
  );
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
  const [folder_prep_status, set_folder_prep_status] = useState<
    { folder_count: number; new_labels: number } | null
  >(null);
  const [error, set_error] = useState<string | null>(null);
  const [is_dragging, set_is_dragging] = useState(false);
  const [is_cancelling, set_is_cancelling] = useState(false);
  const file_input_ref = useRef<HTMLInputElement>(null);
  const folder_input_ref = useRef<HTMLInputElement>(null);
  const cancel_ref = useRef(false);

  const reset_state = useCallback(() => {
    set_step("upload");
    set_is_processing(false);
    set_progress(null);
    set_import_result(null);
    set_error(null);
    set_is_dragging(false);
    set_is_cancelling(false);
    set_parse_warnings([]);
    set_folder_prep_status(null);
    cancel_ref.current = false;
  }, []);

  const handle_close = useCallback(() => {
    if (is_processing) return;
    // Reset happens on the next open (see effect below), so the current content
    // stays put while the modal animates out instead of flashing the upload view.
    on_close();
  }, [is_processing, on_close]);

  useEffect(() => {
    if (provider) set_active_provider(provider);
  }, [provider]);

  const handle_cancel = useCallback(() => {
    cancel_ref.current = true;
    set_is_cancelling(true);
  }, []);

  const process_emails = useCallback(
    async (emails: ParsedEmail[], source: ImportSource) => {
      if (!vault) {
        set_error(t("common.encryption_vault_not_available"));
        set_is_processing(false);

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

      const folder_token_map = new Map<string, string>();

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

        const update_response = await update_import_job(job_id!, { status: "processing" });
        if (update_response.error) {
          throw new Error(update_response.error);
        }

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

        const seen_hashes = new Set<string>();
        const emails_to_import = emails.filter((email) => {
          const hash = message_id_hashes.get(email.message_id);

          if (!hash || existing_hashes.has(hash) || seen_hashes.has(hash)) {
            return false;
          }

          seen_hashes.add(hash);

          return true;
        });

        const thread_map = await build_thread_map(emails_to_import);

        let imported_count = 0;
        let failed_count = 0;
        let store_duplicate_count = 0;
        const pre_skipped_count = emails.length - emails_to_import.length;

        if (emails_to_import.length === 0) {
          await update_import_job(job_id!, {
            status: "completed",
            processed_emails: 0,
            skipped_emails: pre_skipped_count,
            failed_emails: 0,
          });

          set_import_result({
            imported: 0,
            skipped: pre_skipped_count,
            failed: 0,
          });
          set_step("complete");

          return;
        }

        // Create destination folders only for emails that will actually be
        // imported, so a fully-duplicate re-import leaves no empty folders.
        const source_folders = extract_source_folders(emails_to_import);
        let new_label_count = 0;

        for (const folder_name of source_folders) {
          const existing = folders_state.folders.find(
            (f) => f.name.toLowerCase() === folder_name.toLowerCase(),
          );

          if (existing) {
            folder_token_map.set(folder_name, existing.folder_token);
            continue;
          }

          const result = await create_new_folder(folder_name);

          if (result.folder) {
            folder_token_map.set(folder_name, result.folder.folder_token);
            new_label_count += 1;
          }
        }

        if (folder_token_map.size > 0) {
          set_folder_prep_status({
            folder_count: folder_token_map.size,
            new_labels: new_label_count,
          });
        }

        const BATCH_SIZE = 10;
        let quota_exceeded = false;

        for (let i = 0; i < emails_to_import.length; i += BATCH_SIZE) {
          // Remaining emails were never attempted, so they are not failures.
          if (cancel_ref.current || quota_exceeded) break;

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

              const target_folder = folder_for_email(email, folder_token_map);

              if (target_folder) {
                encrypted.folder_token = target_folder;
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
              const {
                stored_count,
                duplicate_count,
                skipped_quota_count,
              } = store_response.data;

              imported_count += stored_count;
              store_duplicate_count += duplicate_count;
              failed_count +=
                encrypted_batch.length -
                stored_count -
                duplicate_count -
                skipped_quota_count;

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
        const skipped_count = pre_skipped_count + store_duplicate_count;

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
    [vault, user, create_new_folder, folders_state, t],
  );

  const handle_file_select = useCallback(
    async (input: FileList | File[] | null, from_folder = false) => {
      if (!input) return;

      let files = Array.from(input);

      // A folder selection sweeps in unrelated files (.DS_Store, images, etc.);
      // keep only the ones we can actually parse so a single folder of EMLs
      // does not fail on the first junk entry.
      if (from_folder) files = filter_supported_files(files);

      if (files.length === 0) {
        if (from_folder) {
          set_error(t("settings.no_emails_in_file"));
        }

        return;
      }

      set_is_processing(true);
      set_error(null);

      try {
        const all_emails: ParsedEmail[] = [];
        const all_errors: string[] = [];
        const all_warnings: string[] = [];

        const multiple_files = files.length > 1;

        for (let i = 0; i < files.length; i++) {
          const file = files[i];
          const result = await parse_import_file(file, (progress) => {
            if (!multiple_files) set_progress(progress);
          });

          all_emails.push(...result.emails);
          all_errors.push(...result.errors);
          all_warnings.push(...result.warnings);

          if (multiple_files) {
            const current = i + 1;

            set_progress({
              current,
              total: files.length,
              percentage: Math.round((current / files.length) * 100),
            });
          }
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

        const effective_source: ImportSource =
          active_provider === "mbox"
            ? derive_manual_import_source(files)
            : active_provider;

        await process_emails(all_emails, effective_source);
      } catch (err) {
        set_error(
          err instanceof Error
            ? err.message
            : t("settings.failed_to_parse_file"),
        );
        set_is_processing(false);
      }
    },
    [active_provider, process_emails, t],
  );

  const handle_drag_over = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      if (!is_processing) set_is_dragging(true);
    },
    [is_processing],
  );

  const handle_drag_leave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    // Only clear the highlight when leaving the drop zone entirely, not when
    // the cursor moves over a child element (which would otherwise flicker).
    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
      set_is_dragging(false);
    }
  }, []);

  const handle_drop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      set_is_dragging(false);
      if (is_processing) return;

      const data_transfer = e.dataTransfer;
      const dropped_files = Array.from(data_transfer.files ?? []);

      collect_files_from_data_transfer(data_transfer)
        .then(({ files, from_directory }) =>
          handle_file_select(files, from_directory),
        )
        .catch(() => handle_file_select(dropped_files));
    },
    [handle_file_select, is_processing],
  );

  const handle_file_input_change = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      handle_file_select(e.target.files);
      e.target.value = "";
    },
    [handle_file_select],
  );

  const handle_folder_input_change = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      handle_file_select(e.target.files, true);
      e.target.value = "";
    },
    [handle_file_select],
  );

  const handle_browse_click = useCallback(() => {
    if (is_processing) return;
    file_input_ref.current?.click();
  }, [is_processing]);

  const handle_browse_folder_click = useCallback(() => {
    if (is_processing) return;
    folder_input_ref.current?.click();
  }, [is_processing]);

  const render_step_content = () => {
    switch (step) {
      case "upload":
        return (
          <div className="space-y-4">
            <div
              role="button"
              tabIndex={is_processing ? -1 : 0}
              aria-disabled={is_processing}
              className={`relative border-2 border-dashed rounded-xl p-8 text-center transition-colors outline-none ${
                is_processing
                  ? "cursor-default bg-surf-secondary border-edge-secondary opacity-70"
                  : is_dragging
                    ? "cursor-pointer bg-surf-tertiary border-brand"
                    : "cursor-pointer bg-surf-secondary border-edge-secondary hover:border-brand/60 hover:bg-surf-tertiary/40 focus-visible:border-brand"
              }`}
              onClick={handle_browse_click}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  handle_browse_click();
                }
              }}
              onDragLeave={handle_drag_leave}
              onDragOver={handle_drag_over}
              onDrop={handle_drop}
            >
              <input
                ref={file_input_ref}
                multiple
                accept=".mbox,.mbx,.eml,.csv,.tsv,.pst,.ost,.txt"
                className="hidden"
                type="file"
                onChange={handle_file_input_change}
              />

              <input
                ref={folder_input_ref}
                multiple
                className="hidden"
                type="file"
                {...({ webkitdirectory: "", directory: "" } as Record<
                  string,
                  string
                >)}
                onChange={handle_folder_input_change}
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

              <div className="flex items-center justify-center gap-2">
                <Button
                  disabled={is_processing}
                  size="md"
                  variant="outline"
                  onClick={(e) => {
                    e.stopPropagation();
                    handle_browse_click();
                  }}
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

                <Button
                  disabled={is_processing}
                  size="md"
                  variant="outline"
                  onClick={(e) => {
                    e.stopPropagation();
                    handle_browse_folder_click();
                  }}
                >
                  {t("settings.browse_folder")}
                </Button>
              </div>
            </div>

            {is_processing && progress && (
              <div className="space-y-1.5">
                <p className="text-xs text-center text-txt-muted">
                  {t("settings.emails_of_total", {
                    current: String(progress.current),
                    total: String(progress.total),
                  })}
                </p>
                <div className="w-full h-1.5 rounded-full overflow-hidden bg-surf-tertiary">
                  <div
                    className="h-full rounded-full bg-brand transition-all duration-300"
                    style={{ width: `${progress.percentage}%` }}
                  />
                </div>
              </div>
            )}

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
            {folder_prep_status && (
              <p className="text-xs mb-2 text-txt-muted">
                {t("settings.import_folder_prep_status", {
                  folder_count: String(folder_prep_status.folder_count),
                  new_labels: String(folder_prep_status.new_labels),
                })}
              </p>
            )}
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
              disabled={is_cancelling}
              size="md"
              variant="outline"
              onClick={handle_cancel}
            >
              {is_cancelling ? (
                <span className="flex items-center gap-1.5">
                  <Spinner className="text-current" size="sm" />
                  {t("settings.cancelling")}
                </span>
              ) : (
                t("settings.cancel_import")
              )}
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
                  <div className="mt-3 text-left max-h-24 overflow-y-auto rounded-md bg-surf-tertiary p-2">
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
    <AnimatePresence onExitComplete={reset_state}>
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
                  className="p-1 rounded-[14px] transition-colors hover:bg-white/10"
                  onClick={handle_close}
                >
                  <XMarkIcon className="w-5 h-5 text-txt-muted" />
                </button>
              )}
            </div>

            <div className="px-6 pb-6">
              {render_step_content()}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
