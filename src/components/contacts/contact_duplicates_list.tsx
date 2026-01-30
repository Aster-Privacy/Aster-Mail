import type { DuplicateCandidateWithContacts } from "@/types/contacts";

import { useState, useCallback, useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  UsersIcon,
  ArrowsRightLeftIcon,
  XMarkIcon,
  ArrowPathIcon,
  ExclamationTriangleIcon,
} from "@heroicons/react/24/outline";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  list_duplicate_candidates,
  dismiss_duplicate,
  scan_for_duplicates,
} from "@/services/api/contact_duplicates";
import { ContactMergeModal } from "./contact_merge_modal";

interface ContactDuplicatesListProps {
  on_merge_complete?: () => void;
}

function get_full_name(contact: { first_name: string; last_name: string }): string {
  return `${contact.first_name} ${contact.last_name}`.trim() || "No name";
}

function get_initials(contact: { first_name: string; last_name: string }): string {
  const first = contact.first_name?.[0] || "";
  const last = contact.last_name?.[0] || "";
  return (first + last).toUpperCase() || "?";
}

function get_match_reason_label(reason: string): string {
  switch (reason) {
    case "email":
      return "Same email";
    case "name":
      return "Similar name";
    case "phone":
      return "Same phone";
    default:
      return "Possible duplicate";
  }
}

function get_similarity_color(score: number): string {
  if (score >= 0.9) return "text-danger";
  if (score >= 0.7) return "text-warning";
  return "text-foreground-500";
}

export function ContactDuplicatesList({
  on_merge_complete,
}: ContactDuplicatesListProps) {
  const [duplicates, set_duplicates] = useState<DuplicateCandidateWithContacts[]>(
    [],
  );
  const [total, set_total] = useState(0);
  const [is_loading, set_is_loading] = useState(true);
  const [is_scanning, set_is_scanning] = useState(false);
  const [dismissing_id, set_dismissing_id] = useState<string | null>(null);
  const [error, set_error] = useState<string | null>(null);
  const [merge_candidate, set_merge_candidate] =
    useState<DuplicateCandidateWithContacts | null>(null);

  const load_duplicates = useCallback(async () => {
    set_is_loading(true);
    set_error(null);

    try {
      const response = await list_duplicate_candidates();

      if (response.error || !response.data) {
        set_error(response.error || "Failed to load duplicates");
        return;
      }

      set_duplicates(response.data.items);
      set_total(response.data.total);
    } catch (err) {
      set_error(err instanceof Error ? err.message : "Failed to load duplicates");
    } finally {
      set_is_loading(false);
    }
  }, []);

  useEffect(() => {
    load_duplicates();
  }, [load_duplicates]);

  const handle_scan = useCallback(async () => {
    set_is_scanning(true);
    set_error(null);

    try {
      const response = await scan_for_duplicates();

      if (response.error) {
        set_error(response.error);
        return;
      }

      await load_duplicates();
    } catch (err) {
      set_error(err instanceof Error ? err.message : "Scan failed");
    } finally {
      set_is_scanning(false);
    }
  }, [load_duplicates]);

  const handle_dismiss = useCallback(
    async (duplicate_id: string) => {
      set_dismissing_id(duplicate_id);
      set_error(null);

      try {
        const response = await dismiss_duplicate(duplicate_id);

        if (response.error) {
          set_error(response.error);
          return;
        }

        set_duplicates((prev) => prev.filter((d) => d.id !== duplicate_id));
        set_total((prev) => prev - 1);
      } catch (err) {
        set_error(err instanceof Error ? err.message : "Dismiss failed");
      } finally {
        set_dismissing_id(null);
      }
    },
    [],
  );

  const handle_merge_complete = useCallback(
    (_merged_contact_id: string) => {
      if (merge_candidate) {
        set_duplicates((prev) => prev.filter((d) => d.id !== merge_candidate.id));
        set_total((prev) => prev - 1);
      }
      set_merge_candidate(null);
      on_merge_complete?.();
    },
    [merge_candidate, on_merge_complete],
  );

  if (is_loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <UsersIcon className="w-5 h-5 text-foreground-500" />
          <h3 className="text-sm font-medium">Duplicate Contacts</h3>
          {total > 0 && (
            <span className="text-xs bg-warning/20 text-warning px-2 py-0.5 rounded-full">
              {total} found
            </span>
          )}
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={handle_scan}
          disabled={is_scanning}
          className="gap-1.5"
        >
          {is_scanning ? (
            <>
              <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              Scanning...
            </>
          ) : (
            <>
              <ArrowPathIcon className="w-4 h-4" />
              Scan
            </>
          )}
        </Button>
      </div>

      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="p-3 rounded-lg bg-danger/10 text-danger text-sm flex items-center gap-2"
          >
            <ExclamationTriangleIcon className="w-4 h-4" />
            {error}
          </motion.div>
        )}
      </AnimatePresence>

      {duplicates.length === 0 ? (
        <div className="text-center py-8 bg-default-50 rounded-xl">
          <UsersIcon className="w-10 h-10 mx-auto text-foreground-300 mb-3" />
          <p className="text-sm text-foreground-500">No duplicate contacts found</p>
          <p className="text-xs text-foreground-400 mt-1">
            Click "Scan" to check for duplicates
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          <AnimatePresence mode="popLayout">
            {duplicates.map((duplicate) => (
              <motion.div
                key={duplicate.id}
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="p-4 rounded-xl border border-divider bg-background hover:bg-default-50 transition-colors"
              >
                <div className="flex items-start gap-4">
                  <div className="flex-1 grid grid-cols-2 gap-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-medium text-sm">
                        {duplicate.contact_1.avatar_url ? (
                          <img
                            src={duplicate.contact_1.avatar_url}
                            alt=""
                            className="w-full h-full rounded-full object-cover"
                          />
                        ) : (
                          get_initials(duplicate.contact_1)
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">
                          {get_full_name(duplicate.contact_1)}
                        </p>
                        {duplicate.contact_1.emails[0] && (
                          <p className="text-xs text-foreground-500 truncate">
                            {duplicate.contact_1.emails[0]}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-secondary/10 flex items-center justify-center text-secondary font-medium text-sm">
                        {duplicate.contact_2.avatar_url ? (
                          <img
                            src={duplicate.contact_2.avatar_url}
                            alt=""
                            className="w-full h-full rounded-full object-cover"
                          />
                        ) : (
                          get_initials(duplicate.contact_2)
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">
                          {get_full_name(duplicate.contact_2)}
                        </p>
                        {duplicate.contact_2.emails[0] && (
                          <p className="text-xs text-foreground-500 truncate">
                            {duplicate.contact_2.emails[0]}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between mt-3 pt-3 border-t border-divider">
                  <div className="flex items-center gap-3">
                    <span className="text-xs bg-default-100 px-2 py-1 rounded">
                      {get_match_reason_label(duplicate.match_reason)}
                    </span>
                    <span
                      className={cn(
                        "text-xs font-medium",
                        get_similarity_color(duplicate.similarity_score),
                      )}
                    >
                      {Math.round(duplicate.similarity_score * 100)}% match
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handle_dismiss(duplicate.id)}
                      disabled={dismissing_id === duplicate.id}
                      className="text-foreground-500"
                    >
                      {dismissing_id === duplicate.id ? (
                        <div className="w-4 h-4 border-2 border-foreground-500 border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <XMarkIcon className="w-4 h-4" />
                      )}
                      <span className="ml-1">Dismiss</span>
                    </Button>
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => set_merge_candidate(duplicate)}
                      className="gap-1.5"
                    >
                      <ArrowsRightLeftIcon className="w-4 h-4" />
                      Merge
                    </Button>
                  </div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}

      <AnimatePresence>
        {merge_candidate && (
          <ContactMergeModal
            contact_1={merge_candidate.contact_1}
            contact_2={merge_candidate.contact_2}
            on_close={() => set_merge_candidate(null)}
            on_merged={handle_merge_complete}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
