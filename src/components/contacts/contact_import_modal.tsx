import type { ContactFormData } from "@/types/contacts";

import { useState, useCallback, useRef, useMemo } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  XMarkIcon,
  ArrowUpTrayIcon,
  DocumentTextIcon,
  TableCellsIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  ArrowRightIcon,
  ArrowLeftIcon,
} from "@heroicons/react/24/outline";

import { Button } from "@/components/ui/button";
import {
  import_vcard,
  import_csv,
  parse_vcard,
  parse_csv,
} from "@/services/api/contact_sync";

interface ContactImportModalProps {
  on_close: () => void;
  on_import_complete: (imported_count: number) => void;
}

type ImportStep = "select" | "preview" | "mapping" | "importing" | "complete";
type FileType = "vcard" | "csv";

const CSV_FIELD_OPTIONS: { value: keyof ContactFormData | null; label: string }[] = [
  { value: null, label: "Skip" },
  { value: "first_name", label: "First Name" },
  { value: "last_name", label: "Last Name" },
  { value: "emails", label: "Email" },
  { value: "phone", label: "Phone" },
  { value: "company", label: "Company" },
  { value: "job_title", label: "Job Title" },
  { value: "birthday", label: "Birthday" },
  { value: "notes", label: "Notes" },
];

export function ContactImportModal({
  on_close,
  on_import_complete,
}: ContactImportModalProps) {
  const [step, set_step] = useState<ImportStep>("select");
  const [file_type, set_file_type] = useState<FileType | null>(null);
  const [raw_content, set_raw_content] = useState<string>("");
  const [parsed_contacts, set_parsed_contacts] = useState<ContactFormData[]>([]);
  const [csv_headers, set_csv_headers] = useState<string[]>([]);
  const [csv_mapping, set_csv_mapping] = useState<
    Record<string, keyof ContactFormData | null>
  >({});
  const [is_importing, set_is_importing] = useState(false);
  const [import_result, set_import_result] = useState<{
    imported: number;
    skipped: number;
    failed: number;
  } | null>(null);
  const [error, set_error] = useState<string | null>(null);
  const input_ref = useRef<HTMLInputElement>(null);

  const handle_file_select = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      set_error(null);

      try {
        const content = await file.text();
        set_raw_content(content);

        const is_vcard =
          file.name.endsWith(".vcf") ||
          file.name.endsWith(".vcard") ||
          content.includes("BEGIN:VCARD");

        if (is_vcard) {
          set_file_type("vcard");
          const contacts = parse_vcard(content);
          set_parsed_contacts(contacts);
          set_step("preview");
        } else {
          set_file_type("csv");
          const lines = content.split(/\r?\n/).filter(Boolean);
          if (lines.length > 0) {
            const headers = lines[0]
              .split(",")
              .map((h) => h.trim().replace(/^"|"$/g, ""));
            set_csv_headers(headers);

            const auto_mapping: Record<string, keyof ContactFormData | null> = {};
            headers.forEach((header) => {
              const lower = header.toLowerCase();
              if (lower.includes("first") && lower.includes("name"))
                auto_mapping[header] = "first_name";
              else if (lower.includes("last") && lower.includes("name"))
                auto_mapping[header] = "last_name";
              else if (lower === "name" || lower === "full name")
                auto_mapping[header] = "first_name";
              else if (lower.includes("email")) auto_mapping[header] = "emails";
              else if (lower.includes("phone") || lower.includes("tel"))
                auto_mapping[header] = "phone";
              else if (lower.includes("company") || lower.includes("org"))
                auto_mapping[header] = "company";
              else if (lower.includes("title") || lower.includes("job"))
                auto_mapping[header] = "job_title";
              else if (lower.includes("birthday") || lower.includes("birth"))
                auto_mapping[header] = "birthday";
              else if (lower.includes("note")) auto_mapping[header] = "notes";
              else auto_mapping[header] = null;
            });

            set_csv_mapping(auto_mapping);
            set_step("mapping");
          }
        }
      } catch (err) {
        set_error(
          err instanceof Error ? err.message : "Failed to read file",
        );
      }

      if (input_ref.current) {
        input_ref.current.value = "";
      }
    },
    [],
  );

  const handle_apply_csv_mapping = useCallback(() => {
    const contacts = parse_csv(raw_content, csv_mapping);
    set_parsed_contacts(contacts);
    set_step("preview");
  }, [raw_content, csv_mapping]);

  const handle_import = useCallback(async () => {
    set_is_importing(true);
    set_error(null);

    try {
      const response =
        file_type === "vcard"
          ? await import_vcard(raw_content, parsed_contacts)
          : await import_csv(parsed_contacts);

      if (response.error || !response.data) {
        set_error(response.error || "Import failed");
        return;
      }

      set_import_result({
        imported: response.data.imported,
        skipped: response.data.skipped,
        failed: response.data.failed,
      });
      set_step("complete");
    } catch (err) {
      set_error(err instanceof Error ? err.message : "Import failed");
    } finally {
      set_is_importing(false);
    }
  }, [file_type, raw_content, parsed_contacts]);

  const handle_done = useCallback(() => {
    on_import_complete(import_result?.imported || 0);
    on_close();
  }, [import_result, on_import_complete, on_close]);

  const preview_contacts = useMemo(() => {
    return parsed_contacts.slice(0, 5);
  }, [parsed_contacts]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={on_close}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        className="bg-background rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b border-divider">
          <div className="flex items-center gap-2">
            <ArrowUpTrayIcon className="w-5 h-5 text-primary" />
            <h2 className="text-lg font-semibold">Import Contacts</h2>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={on_close}
            className="p-1.5"
          >
            <XMarkIcon className="w-5 h-5" />
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          <AnimatePresence mode="wait">
            {step === "select" && (
              <motion.div
                key="select"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-4"
              >
                <p className="text-sm text-foreground-500">
                  Choose a file to import contacts from. Supported formats:
                  vCard (.vcf) and CSV.
                </p>

                <div
                  className="p-8 border-2 border-dashed border-divider rounded-xl hover:border-primary/50 transition-colors cursor-pointer text-center"
                  onClick={() => input_ref.current?.click()}
                >
                  <ArrowUpTrayIcon className="w-10 h-10 mx-auto text-foreground-400 mb-3" />
                  <p className="text-sm font-medium">
                    Click to select file
                  </p>
                  <p className="text-xs text-foreground-500 mt-1">
                    or drag and drop
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="flex items-center gap-2 p-3 rounded-lg bg-default-100">
                    <DocumentTextIcon className="w-5 h-5 text-primary" />
                    <div>
                      <p className="text-sm font-medium">vCard</p>
                      <p className="text-xs text-foreground-500">.vcf files</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 p-3 rounded-lg bg-default-100">
                    <TableCellsIcon className="w-5 h-5 text-success" />
                    <div>
                      <p className="text-sm font-medium">CSV</p>
                      <p className="text-xs text-foreground-500">
                        Spreadsheet export
                      </p>
                    </div>
                  </div>
                </div>

                <input
                  ref={input_ref}
                  type="file"
                  accept=".vcf,.vcard,.csv"
                  className="hidden"
                  onChange={handle_file_select}
                />
              </motion.div>
            )}

            {step === "mapping" && (
              <motion.div
                key="mapping"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-4"
              >
                <p className="text-sm text-foreground-500">
                  Map CSV columns to contact fields:
                </p>

                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {csv_headers.map((header) => (
                    <div
                      key={header}
                      className="flex items-center gap-3 p-2 rounded-lg bg-default-50"
                    >
                      <span className="text-sm font-medium flex-1 truncate">
                        {header}
                      </span>
                      <ArrowRightIcon className="w-4 h-4 text-foreground-400" />
                      <select
                        value={csv_mapping[header] || ""}
                        onChange={(e) =>
                          set_csv_mapping((prev) => ({
                            ...prev,
                            [header]: (e.target.value ||
                              null) as keyof ContactFormData | null,
                          }))
                        }
                        className="h-8 px-2 rounded border border-divider bg-background text-sm min-w-32"
                      >
                        {CSV_FIELD_OPTIONS.map((opt) => (
                          <option key={opt.label} value={opt.value || ""}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>

                <div className="flex items-center justify-end gap-2">
                  <Button
                    variant="ghost"
                    onClick={() => set_step("select")}
                  >
                    <ArrowLeftIcon className="w-4 h-4 mr-1" />
                    Back
                  </Button>
                  <Button
                    variant="primary"
                    onClick={handle_apply_csv_mapping}
                  >
                    Continue
                    <ArrowRightIcon className="w-4 h-4 ml-1" />
                  </Button>
                </div>
              </motion.div>
            )}

            {step === "preview" && (
              <motion.div
                key="preview"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-4"
              >
                <div className="flex items-center justify-between">
                  <p className="text-sm text-foreground-500">
                    Found {parsed_contacts.length} contact
                    {parsed_contacts.length !== 1 ? "s" : ""}
                  </p>
                  {file_type === "vcard" && (
                    <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded">
                      vCard
                    </span>
                  )}
                  {file_type === "csv" && (
                    <span className="text-xs bg-success/10 text-success px-2 py-0.5 rounded">
                      CSV
                    </span>
                  )}
                </div>

                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {preview_contacts.map((contact, idx) => (
                    <div
                      key={idx}
                      className="p-3 rounded-lg bg-default-50 border border-divider"
                    >
                      <p className="text-sm font-medium">
                        {contact.first_name} {contact.last_name}
                      </p>
                      {contact.emails[0] && (
                        <p className="text-xs text-foreground-500">
                          {contact.emails[0]}
                        </p>
                      )}
                      {contact.phone && (
                        <p className="text-xs text-foreground-500">
                          {contact.phone}
                        </p>
                      )}
                    </div>
                  ))}
                  {parsed_contacts.length > 5 && (
                    <p className="text-xs text-foreground-400 text-center py-2">
                      And {parsed_contacts.length - 5} more...
                    </p>
                  )}
                </div>

                <div className="flex items-center justify-end gap-2">
                  <Button
                    variant="ghost"
                    onClick={() =>
                      set_step(file_type === "csv" ? "mapping" : "select")
                    }
                  >
                    <ArrowLeftIcon className="w-4 h-4 mr-1" />
                    Back
                  </Button>
                  <Button
                    variant="primary"
                    onClick={handle_import}
                    disabled={is_importing || parsed_contacts.length === 0}
                  >
                    {is_importing ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-1" />
                        Importing...
                      </>
                    ) : (
                      <>
                        Import {parsed_contacts.length} Contact
                        {parsed_contacts.length !== 1 ? "s" : ""}
                      </>
                    )}
                  </Button>
                </div>
              </motion.div>
            )}

            {step === "complete" && import_result && (
              <motion.div
                key="complete"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-4 text-center py-4"
              >
                <CheckCircleIcon className="w-16 h-16 mx-auto text-success" />
                <div>
                  <p className="text-lg font-semibold">Import Complete</p>
                  <p className="text-sm text-foreground-500 mt-1">
                    Your contacts have been imported
                  </p>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div className="p-3 rounded-lg bg-success/10">
                    <p className="text-2xl font-semibold text-success">
                      {import_result.imported}
                    </p>
                    <p className="text-xs text-foreground-500">Imported</p>
                  </div>
                  <div className="p-3 rounded-lg bg-warning/10">
                    <p className="text-2xl font-semibold text-warning">
                      {import_result.skipped}
                    </p>
                    <p className="text-xs text-foreground-500">Skipped</p>
                  </div>
                  <div className="p-3 rounded-lg bg-danger/10">
                    <p className="text-2xl font-semibold text-danger">
                      {import_result.failed}
                    </p>
                    <p className="text-xs text-foreground-500">Failed</p>
                  </div>
                </div>

                <Button
                  variant="primary"
                  onClick={handle_done}
                  className="w-full"
                >
                  Done
                </Button>
              </motion.div>
            )}
          </AnimatePresence>

          <AnimatePresence>
            {error && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="mt-4 p-3 rounded-lg bg-danger/10 text-danger text-sm flex items-center gap-2"
              >
                <ExclamationTriangleIcon className="w-4 h-4" />
                {error}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </motion.div>
  );
}
