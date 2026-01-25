import { useState, useCallback, useRef } from "react";
import {
  ArrowPathIcon,
  CheckCircleIcon,
  DocumentArrowUpIcon,
  EnvelopeIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { SiGmail, SiProtonmail } from "react-icons/si";

import { Button } from "@/components/ui/button";
import { use_auth } from "@/contexts/auth_context";
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

interface ImportModalProps {
  is_open: boolean;
  on_close: () => void;
}

type ImportStep = "select" | "upload" | "progress" | "complete";

interface ProviderOption {
  id: ImportSource;
  label: string;
  description: string;
  type: "oauth" | "file";
}

const PROVIDER_OPTIONS: ProviderOption[] = [
  {
    id: "gmail",
    label: "Gmail",
    description: "MBOX from Google Takeout",
    type: "file",
  },
  {
    id: "outlook",
    label: "Outlook",
    description: "PST, MBOX, or EML files",
    type: "file",
  },
  {
    id: "protonmail",
    label: "ProtonMail",
    description: "MBOX or EML export",
    type: "file",
  },
  {
    id: "mbox",
    label: "Any Email",
    description: "MBOX, EML, CSV, PST files",
    type: "file",
  },
];

function get_provider_icon(id: ImportSource) {
  switch (id) {
    case "gmail":
      return <SiGmail className="w-7 h-7" color="#EA4335" />;
    case "outlook":
      return <EnvelopeIcon className="w-7 h-7 text-[#0078D4]" />;
    case "protonmail":
      return <SiProtonmail className="w-7 h-7" color="#6D4AFF" />;
    default:
      return (
        <DocumentArrowUpIcon
          className="w-7 h-7"
          style={{ color: "var(--text-secondary)" }}
        />
      );
  }
}

export function ImportModal({ is_open, on_close }: ImportModalProps) {
  const { vault } = use_auth();
  const [step, set_step] = useState<ImportStep>("select");
  const [selected_provider, set_selected_provider] =
    useState<ImportSource | null>(null);
  const [is_processing, set_is_processing] = useState(false);
  const [progress, set_progress] = useState<ParseProgress | null>(null);
  const [import_result, set_import_result] = useState<{
    imported: number;
    skipped: number;
    failed: number;
  } | null>(null);
  const [error, set_error] = useState<string | null>(null);
  const [is_dragging, set_is_dragging] = useState(false);
  const file_input_ref = useRef<HTMLInputElement>(null);

  const reset_state = useCallback(() => {
    set_step("select");
    set_selected_provider(null);
    set_is_processing(false);
    set_progress(null);
    set_import_result(null);
    set_error(null);
    set_is_dragging(false);
  }, []);

  const handle_close = useCallback(() => {
    if (is_processing) return;
    reset_state();
    on_close();
  }, [is_processing, on_close, reset_state]);

  const handle_provider_select = useCallback((provider: ImportSource) => {
    set_selected_provider(provider);
    set_step("upload");
    set_error(null);
  }, []);

  const process_emails = useCallback(
    async (emails: ParsedEmail[], source: ImportSource) => {
      if (!vault) {
        set_error("Encryption vault not available. Please re-authenticate.");

        return;
      }

      set_step("progress");
      set_is_processing(true);
      set_error(null);

      let job_id: string | null = null;

      try {
        const job_response = await create_import_job({
          source,
          total_emails: emails.length,
        });

        if (job_response.error || !job_response.data) {
          throw new Error(job_response.error || "Failed to create import job");
        }

        job_id = job_response.data.id;

        await update_import_job(job_id!, { status: "processing" });

        const message_id_hashes = new Map<string, string>();

        for (const email of emails) {
          const hash = await compute_message_id_hash(email.message_id);

          message_id_hashes.set(email.message_id, hash);
        }

        const all_hashes = Array.from(message_id_hashes.values());
        const duplicates_response = await check_duplicates(job_id!, all_hashes);
        const existing_hashes = new Set(
          duplicates_response.data?.duplicates || [],
        );

        const emails_to_import = emails.filter((email) => {
          const hash = message_id_hashes.get(email.message_id);

          return hash && !existing_hashes.has(hash);
        });

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

        for (let i = 0; i < emails_to_import.length; i += BATCH_SIZE) {
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

              encrypted_batch.push(encrypted);
            } catch {
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

        await update_import_job(job_id!, {
          status: "completed",
          processed_emails: imported_count,
          skipped_emails: skipped_count,
          failed_emails: failed_count,
        });

        set_import_result({
          imported: imported_count,
          skipped: skipped_count,
          failed: failed_count,
        });
        set_step("complete");
      } catch (err) {
        if (job_id) {
          try {
            await update_import_job(job_id, {
              status: "failed",
              error_message:
                err instanceof Error ? err.message : "Import failed",
            });
          } catch {}
        }
        set_error(err instanceof Error ? err.message : "Import failed");
        set_step("upload");
      } finally {
        set_is_processing(false);
      }
    },
    [vault],
  );

  const handle_file_select = useCallback(
    async (files: FileList | null) => {
      if (!files || files.length === 0 || !selected_provider) return;

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
              : "No emails found in the selected file(s). Make sure the file is in a supported format (MBOX, EML, CSV, or PST).";

          throw new Error(error_message);
        }

        if (all_warnings.length > 0 && all_warnings.length <= 5) {
        }

        await process_emails(all_emails, selected_provider);
      } catch (err) {
        set_error(err instanceof Error ? err.message : "Failed to parse file");
        set_is_processing(false);
      }
    },
    [selected_provider, process_emails],
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
      case "select":
        return (
          <div className="space-y-4">
            <p className="text-sm" style={{ color: "var(--text-muted)" }}>
              Select where your emails are coming from
            </p>
            <div className="grid grid-cols-2 gap-3">
              {PROVIDER_OPTIONS.map((provider) => (
                <button
                  key={provider.id}
                  className="flex flex-col items-center p-4 rounded-xl border transition-all hover:scale-[1.02]"
                  style={{
                    backgroundColor: "var(--bg-secondary)",
                    borderColor: "var(--border-secondary)",
                  }}
                  onClick={() => handle_provider_select(provider.id)}
                >
                  <div className="mb-2">{get_provider_icon(provider.id)}</div>
                  <span
                    className="text-sm font-medium"
                    style={{ color: "var(--text-primary)" }}
                  >
                    {provider.label}
                  </span>
                  <span
                    className="text-xs mt-1 text-center"
                    style={{ color: "var(--text-muted)" }}
                  >
                    {provider.description}
                  </span>
                </button>
              ))}
            </div>
          </div>
        );

      case "upload":
        return (
          <div className="space-y-4">
            <button
              className="text-sm flex items-center gap-1 hover:underline"
              style={{ color: "var(--text-muted)" }}
              onClick={() => set_step("select")}
            >
              ← Back to providers
            </button>

            <div
              className="relative border-2 border-dashed rounded-xl p-8 text-center"
              style={{
                backgroundColor: is_dragging
                  ? "var(--bg-tertiary)"
                  : "var(--bg-secondary)",
                borderColor: is_dragging
                  ? "var(--accent-color)"
                  : "var(--border-secondary)",
              }}
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

              <DocumentArrowUpIcon
                className="w-12 h-12 mx-auto mb-3"
                style={{ color: "var(--text-muted)" }}
              />

              <p
                className="text-sm mb-2"
                style={{ color: "var(--text-primary)" }}
              >
                {is_dragging
                  ? "Drop files here"
                  : "Drag and drop your files here"}
              </p>
              <p
                className="text-xs mb-4"
                style={{ color: "var(--text-muted)" }}
              >
                Supports MBOX, EML, CSV, and PST files
              </p>

              <Button
                disabled={is_processing}
                size="sm"
                variant="outline"
                onClick={handle_browse_click}
              >
                {is_processing ? (
                  <>
                    <ArrowPathIcon className="w-4 h-4 animate-spin mr-2" />
                    Processing...
                  </>
                ) : (
                  "Browse Files"
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
            <ArrowPathIcon
              className="w-12 h-12 mx-auto mb-4 animate-spin"
              style={{ color: "var(--accent-color)" }}
            />
            <p
              className="text-sm mb-2"
              style={{ color: "var(--text-primary)" }}
            >
              Importing emails...
            </p>
            {progress && (
              <>
                <p
                  className="text-xs mb-3"
                  style={{ color: "var(--text-muted)" }}
                >
                  {progress.current} of {progress.total} emails
                </p>
                <div
                  className="w-full h-2 rounded-full overflow-hidden"
                  style={{ backgroundColor: "var(--bg-tertiary)" }}
                >
                  <div
                    className="h-full rounded-full transition-all duration-300"
                    style={{
                      width: `${progress.percentage}%`,
                      backgroundColor: "var(--accent-color)",
                    }}
                  />
                </div>
              </>
            )}
          </div>
        );

      case "complete":
        return (
          <div className="py-8 text-center">
            <CheckCircleIcon
              className="w-16 h-16 mx-auto mb-4"
              style={{ color: "#22c55e" }}
            />
            <h3
              className="text-lg font-semibold mb-2"
              style={{ color: "var(--text-primary)" }}
            >
              Import Complete
            </h3>
            {import_result && (
              <div className="space-y-1">
                <p
                  className="text-sm"
                  style={{ color: "var(--text-secondary)" }}
                >
                  {import_result.imported} emails imported
                </p>
                {import_result.skipped > 0 && (
                  <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                    {import_result.skipped} duplicates skipped
                  </p>
                )}
                {import_result.failed > 0 && (
                  <p className="text-xs text-red-500">
                    {import_result.failed} failed
                  </p>
                )}
              </div>
            )}
            <Button
              className="mt-6"
              size="lg"
              variant="primary"
              onClick={handle_close}
            >
              Done
            </Button>
          </div>
        );
    }
  };

  if (!is_open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      role="presentation"
      onClick={(e) => e.target === e.currentTarget && handle_close()}
      onKeyDown={(e) => e.key === "Escape" && handle_close()}
    >
      <div
        aria-hidden="true"
        className="absolute inset-0 backdrop-blur-md"
        style={{ backgroundColor: "var(--modal-overlay)" }}
        onClick={handle_close}
      />
      <div
        aria-modal="true"
        className="relative w-full max-w-md rounded-xl border overflow-hidden"
        role="dialog"
        style={{
          backgroundColor: "var(--modal-bg)",
          borderColor: "var(--border-primary)",
          boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.35)",
        }}
      >
        <div className="flex items-center justify-between px-6 pt-5 pb-4">
          <h2
            className="text-[16px] font-semibold"
            style={{ color: "var(--text-primary)" }}
          >
            Import Emails
          </h2>
          {step !== "progress" && (
            <button
              className="p-1 rounded-lg transition-colors hover:bg-white/10"
              onClick={handle_close}
            >
              <XMarkIcon
                className="w-5 h-5"
                style={{ color: "var(--text-muted)" }}
              />
            </button>
          )}
        </div>

        <div className="px-6 pb-6 min-h-[280px]">{render_step_content()}</div>
      </div>
    </div>
  );
}
