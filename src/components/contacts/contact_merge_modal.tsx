import type { DecryptedContact, ContactFormData } from "@/types/contacts";

import { useState, useCallback, useMemo } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  XMarkIcon,
  ArrowsRightLeftIcon,
  CheckIcon,
  UserIcon,
} from "@heroicons/react/24/outline";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  merge_contacts,
  merge_contact_fields,
} from "@/services/api/contact_duplicates";

interface ContactMergeModalProps {
  contact_1: DecryptedContact;
  contact_2: DecryptedContact;
  on_close: () => void;
  on_merged: (merged_contact_id: string) => void;
}

type FieldPreference = "contact_1" | "contact_2";
type EmailPreference = "merge" | "contact_1" | "contact_2";

interface MergePreferences {
  name: FieldPreference;
  emails: EmailPreference;
  phone: FieldPreference;
  company: FieldPreference;
  address: FieldPreference;
}

function get_full_name(contact: DecryptedContact): string {
  return `${contact.first_name} ${contact.last_name}`.trim() || "No name";
}

function get_initials(contact: DecryptedContact): string {
  const first = contact.first_name?.[0] || "";
  const last = contact.last_name?.[0] || "";
  return (first + last).toUpperCase() || "?";
}

export function ContactMergeModal({
  contact_1,
  contact_2,
  on_close,
  on_merged,
}: ContactMergeModalProps) {
  const [preferences, set_preferences] = useState<MergePreferences>({
    name: "contact_1",
    emails: "merge",
    phone: "contact_1",
    company: "contact_1",
    address: "contact_1",
  });
  const [is_merging, set_is_merging] = useState(false);
  const [error, set_error] = useState<string | null>(null);

  const merged_preview = useMemo(() => {
    return merge_contact_fields(contact_1, contact_2, preferences);
  }, [contact_1, contact_2, preferences]);

  const handle_merge = useCallback(async () => {
    set_is_merging(true);
    set_error(null);

    try {
      const merged_data = merge_contact_fields(contact_1, contact_2, preferences);
      const response = await merge_contacts(
        contact_1.id,
        contact_2.id,
        merged_data,
      );

      if (response.error || !response.data) {
        set_error(response.error || "Failed to merge contacts");
        return;
      }

      on_merged(response.data.merged_contact_id);
    } catch (err) {
      set_error(err instanceof Error ? err.message : "Merge failed");
    } finally {
      set_is_merging(false);
    }
  }, [contact_1, contact_2, preferences, on_merged]);

  const update_preference = useCallback(
    <K extends keyof MergePreferences>(key: K, value: MergePreferences[K]) => {
      set_preferences((prev) => ({ ...prev, [key]: value }));
    },
    [],
  );

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
        className="bg-background rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b border-divider">
          <div className="flex items-center gap-2">
            <ArrowsRightLeftIcon className="w-5 h-5 text-primary" />
            <h2 className="text-lg font-semibold">Merge Contacts</h2>
          </div>
          <Button variant="ghost" size="sm" onClick={on_close} className="p-1.5">
            <XMarkIcon className="w-5 h-5" />
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="text-center p-3 rounded-xl bg-default-100">
              <div className="w-12 h-12 mx-auto rounded-full bg-primary/20 flex items-center justify-center text-primary font-semibold mb-2">
                {contact_1.avatar_url ? (
                  <img
                    src={contact_1.avatar_url}
                    alt=""
                    className="w-full h-full rounded-full object-cover"
                  />
                ) : (
                  get_initials(contact_1)
                )}
              </div>
              <p className="font-medium text-sm">{get_full_name(contact_1)}</p>
              {contact_1.emails[0] && (
                <p className="text-xs text-foreground-500 truncate">
                  {contact_1.emails[0]}
                </p>
              )}
            </div>

            <div className="text-center p-3 rounded-xl bg-default-100">
              <div className="w-12 h-12 mx-auto rounded-full bg-secondary/20 flex items-center justify-center text-secondary font-semibold mb-2">
                {contact_2.avatar_url ? (
                  <img
                    src={contact_2.avatar_url}
                    alt=""
                    className="w-full h-full rounded-full object-cover"
                  />
                ) : (
                  get_initials(contact_2)
                )}
              </div>
              <p className="font-medium text-sm">{get_full_name(contact_2)}</p>
              {contact_2.emails[0] && (
                <p className="text-xs text-foreground-500 truncate">
                  {contact_2.emails[0]}
                </p>
              )}
            </div>
          </div>

          <div className="space-y-3">
            <h3 className="text-sm font-medium text-foreground-600">
              Choose values to keep
            </h3>

            <FieldSelector
              label="Name"
              value_1={get_full_name(contact_1)}
              value_2={get_full_name(contact_2)}
              selected={preferences.name}
              on_select={(v) => update_preference("name", v as FieldPreference)}
            />

            <EmailFieldSelector
              emails_1={contact_1.emails}
              emails_2={contact_2.emails}
              selected={preferences.emails}
              merged_emails={merged_preview.emails}
              on_select={(v) => update_preference("emails", v)}
            />

            {(contact_1.phone || contact_2.phone) && (
              <FieldSelector
                label="Phone"
                value_1={contact_1.phone}
                value_2={contact_2.phone}
                selected={preferences.phone}
                on_select={(v) => update_preference("phone", v as FieldPreference)}
              />
            )}

            {(contact_1.company || contact_2.company) && (
              <FieldSelector
                label="Company"
                value_1={contact_1.company}
                value_2={contact_2.company}
                selected={preferences.company}
                on_select={(v) => update_preference("company", v as FieldPreference)}
              />
            )}

            {(contact_1.address || contact_2.address) && (
              <FieldSelector
                label="Address"
                value_1={contact_1.address}
                value_2={contact_2.address}
                selected={preferences.address}
                on_select={(v) => update_preference("address", v as FieldPreference)}
              />
            )}
          </div>

          <div className="p-4 rounded-xl bg-primary/5 border border-primary/20">
            <div className="flex items-center gap-2 mb-3">
              <UserIcon className="w-4 h-4 text-primary" />
              <span className="text-sm font-medium">Merged Result Preview</span>
            </div>
            <div className="space-y-1 text-sm">
              <p>
                <span className="text-foreground-500">Name:</span>{" "}
                {merged_preview.first_name} {merged_preview.last_name}
              </p>
              <p>
                <span className="text-foreground-500">Emails:</span>{" "}
                {merged_preview.emails.join(", ") || "None"}
              </p>
              {merged_preview.phone && (
                <p>
                  <span className="text-foreground-500">Phone:</span>{" "}
                  {merged_preview.phone}
                </p>
              )}
              {merged_preview.company && (
                <p>
                  <span className="text-foreground-500">Company:</span>{" "}
                  {merged_preview.company}
                </p>
              )}
              {merged_preview.address && (
                <p>
                  <span className="text-foreground-500">Address:</span>{" "}
                  {merged_preview.address}
                </p>
              )}
            </div>
          </div>

          <AnimatePresence>
            {error && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="p-3 rounded-lg bg-danger/10 text-danger text-sm"
              >
                {error}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="flex items-center justify-end gap-3 p-4 border-t border-divider">
          <Button variant="ghost" onClick={on_close} disabled={is_merging}>
            Cancel
          </Button>
          <Button
            variant="solid"
            color="primary"
            onClick={handle_merge}
            disabled={is_merging}
            className="gap-1.5"
          >
            {is_merging ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Merging...
              </>
            ) : (
              <>
                <ArrowsRightLeftIcon className="w-4 h-4" />
                Merge Contacts
              </>
            )}
          </Button>
        </div>
      </motion.div>
    </motion.div>
  );
}

interface FieldSelectorProps {
  label: string;
  value_1?: string;
  value_2?: string;
  selected: FieldPreference;
  on_select: (value: string) => void;
}

function FieldSelector({
  label,
  value_1,
  value_2,
  selected,
  on_select,
}: FieldSelectorProps) {
  return (
    <div className="space-y-1.5">
      <span className="text-xs text-foreground-500">{label}</span>
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          className={cn(
            "p-2 rounded-lg border text-left text-sm transition-all",
            selected === "contact_1"
              ? "border-primary bg-primary/10"
              : "border-divider hover:border-primary/50",
          )}
          onClick={() => on_select("contact_1")}
        >
          <div className="flex items-center justify-between">
            <span className={cn(!value_1 && "text-foreground-400 italic")}>
              {value_1 || "Empty"}
            </span>
            {selected === "contact_1" && (
              <CheckIcon className="w-4 h-4 text-primary" />
            )}
          </div>
        </button>
        <button
          type="button"
          className={cn(
            "p-2 rounded-lg border text-left text-sm transition-all",
            selected === "contact_2"
              ? "border-primary bg-primary/10"
              : "border-divider hover:border-primary/50",
          )}
          onClick={() => on_select("contact_2")}
        >
          <div className="flex items-center justify-between">
            <span className={cn(!value_2 && "text-foreground-400 italic")}>
              {value_2 || "Empty"}
            </span>
            {selected === "contact_2" && (
              <CheckIcon className="w-4 h-4 text-primary" />
            )}
          </div>
        </button>
      </div>
    </div>
  );
}

interface EmailFieldSelectorProps {
  emails_1: string[];
  emails_2: string[];
  selected: EmailPreference;
  merged_emails: string[];
  on_select: (value: EmailPreference) => void;
}

function EmailFieldSelector({
  emails_1,
  emails_2,
  selected,
  merged_emails,
  on_select,
}: EmailFieldSelectorProps) {
  return (
    <div className="space-y-1.5">
      <span className="text-xs text-foreground-500">Emails</span>
      <div className="grid grid-cols-3 gap-2">
        <button
          type="button"
          className={cn(
            "p-2 rounded-lg border text-left text-sm transition-all",
            selected === "merge"
              ? "border-primary bg-primary/10"
              : "border-divider hover:border-primary/50",
          )}
          onClick={() => on_select("merge")}
        >
          <div className="flex items-center justify-between mb-1">
            <span className="font-medium">Merge All</span>
            {selected === "merge" && (
              <CheckIcon className="w-4 h-4 text-primary" />
            )}
          </div>
          <span className="text-xs text-foreground-500">
            {merged_emails.length} email{merged_emails.length !== 1 ? "s" : ""}
          </span>
        </button>
        <button
          type="button"
          className={cn(
            "p-2 rounded-lg border text-left text-sm transition-all",
            selected === "contact_1"
              ? "border-primary bg-primary/10"
              : "border-divider hover:border-primary/50",
          )}
          onClick={() => on_select("contact_1")}
        >
          <div className="flex items-center justify-between mb-1">
            <span className="font-medium">Contact 1</span>
            {selected === "contact_1" && (
              <CheckIcon className="w-4 h-4 text-primary" />
            )}
          </div>
          <span className="text-xs text-foreground-500">
            {emails_1.length} email{emails_1.length !== 1 ? "s" : ""}
          </span>
        </button>
        <button
          type="button"
          className={cn(
            "p-2 rounded-lg border text-left text-sm transition-all",
            selected === "contact_2"
              ? "border-primary bg-primary/10"
              : "border-divider hover:border-primary/50",
          )}
          onClick={() => on_select("contact_2")}
        >
          <div className="flex items-center justify-between mb-1">
            <span className="font-medium">Contact 2</span>
            {selected === "contact_2" && (
              <CheckIcon className="w-4 h-4 text-primary" />
            )}
          </div>
          <span className="text-xs text-foreground-500">
            {emails_2.length} email{emails_2.length !== 1 ? "s" : ""}
          </span>
        </button>
      </div>
    </div>
  );
}
