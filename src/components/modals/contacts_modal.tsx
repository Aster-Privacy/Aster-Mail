import type { DecryptedContact, ContactFormData } from "@/types/contacts";

import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  XMarkIcon,
  MagnifyingGlassIcon,
  PlusIcon,
  ChevronRightIcon,
  ArrowLeftIcon,
  EnvelopeIcon,
  PhoneIcon,
  BuildingOffice2Icon,
  DocumentTextIcon,
  PencilIcon,
  TrashIcon,
  StarIcon,
  ClipboardDocumentIcon,
  CheckIcon,
  UserPlusIcon,
  PaperAirplaneIcon,
  BriefcaseIcon,
  CalendarIcon,
  MapPinIcon,
  GlobeAltIcon,
  ArrowDownTrayIcon,
  FunnelIcon,
  BarsArrowDownIcon,
  BarsArrowUpIcon,
} from "@heroicons/react/24/outline";
import { StarIcon as StarIconSolid } from "@heroicons/react/24/solid";

import { RELATIONSHIP_LABELS } from "@/types/contacts";
import { ContactForm } from "@/components/contacts";
import { ConfirmationModal } from "@/components/modals/confirmation_modal";
import { ProfileAvatar } from "@/components/ui/profile_avatar";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  list_contacts,
  create_contact_encrypted,
  update_contact_encrypted,
  delete_contact as api_delete_contact,
  decrypt_contacts,
} from "@/services/api/contacts";
import { emit_contacts_changed } from "@/hooks/mail_events";
import { use_auth } from "@/contexts/auth_context";
import { EmailProfileTrigger } from "@/components/email/email_profile_trigger";

interface ContactsModalProps {
  is_open: boolean;
  on_close: () => void;
  on_compose_to?: (email: string) => void;
}

export function ContactsModal({
  is_open,
  on_close,
  on_compose_to,
}: ContactsModalProps) {
  const { has_keys } = use_auth();
  const [contacts, set_contacts] = useState<DecryptedContact[]>([]);
  const [search_query, set_search_query] = useState("");
  const [is_form_open, set_is_form_open] = useState(false);
  const [editing_contact, set_editing_contact] =
    useState<DecryptedContact | null>(null);
  const [selected_contact, set_selected_contact] =
    useState<DecryptedContact | null>(null);
  const [contact_to_delete, set_contact_to_delete] =
    useState<DecryptedContact | null>(null);
  const [is_submitting, set_is_submitting] = useState(false);
  const [is_loading, set_is_loading] = useState(true);
  const [error, set_error] = useState<string | null>(null);
  const [copied_field, set_copied_field] = useState<string | null>(null);
  const [selected_ids, set_selected_ids] = useState<Set<string>>(new Set());
  const [is_bulk_deleting, set_is_bulk_deleting] = useState(false);
  const [sort_by, set_sort_by] = useState<
    "name_asc" | "name_desc" | "company" | "recent"
  >("name_asc");
  const [filter_by, set_filter_by] = useState<
    "all" | "favorites" | "has_email" | "has_phone" | "has_company"
  >("all");
  const copy_timeout_ref = useRef<NodeJS.Timeout | null>(null);
  const search_input_ref = useRef<HTMLInputElement>(null);

  const filtered_contacts = useMemo(() => {
    let result = [...contacts];

    if (filter_by !== "all") {
      result = result.filter((contact) => {
        switch (filter_by) {
          case "favorites":
            return contact.is_favorite;
          case "has_email":
            return contact.emails.length > 0 && contact.emails[0];
          case "has_phone":
            return !!contact.phone;
          case "has_company":
            return !!contact.company;
          default:
            return true;
        }
      });
    }

    if (search_query.trim()) {
      const query = search_query.toLowerCase();

      result = result.filter((contact) => {
        const full_name =
          `${contact.first_name} ${contact.last_name}`.toLowerCase();
        const emails = contact.emails.join(" ").toLowerCase();
        const company = (contact.company || "").toLowerCase();

        return (
          full_name.includes(query) ||
          emails.includes(query) ||
          company.includes(query)
        );
      });
    }

    result.sort((a, b) => {
      if (sort_by !== "recent") {
        if (a.is_favorite !== b.is_favorite) return a.is_favorite ? -1 : 1;
      }

      switch (sort_by) {
        case "name_asc": {
          const name_a = `${a.first_name} ${a.last_name}`.toLowerCase();
          const name_b = `${b.first_name} ${b.last_name}`.toLowerCase();

          return name_a.localeCompare(name_b);
        }
        case "name_desc": {
          const name_a = `${a.first_name} ${a.last_name}`.toLowerCase();
          const name_b = `${b.first_name} ${b.last_name}`.toLowerCase();

          return name_b.localeCompare(name_a);
        }
        case "company": {
          const comp_a = (a.company || "").toLowerCase();
          const comp_b = (b.company || "").toLowerCase();

          if (!comp_a && comp_b) return 1;
          if (comp_a && !comp_b) return -1;

          return comp_a.localeCompare(comp_b);
        }
        case "recent": {
          const date_a = new Date(a.created_at).getTime();
          const date_b = new Date(b.created_at).getTime();

          return date_b - date_a;
        }
        default:
          return 0;
      }
    });

    return result;
  }, [contacts, search_query, sort_by, filter_by]);

  const selection_state = useMemo(() => {
    const filtered_ids = new Set(filtered_contacts.map((c) => c.id));
    const selected_in_view = [...selected_ids].filter((id) =>
      filtered_ids.has(id),
    );
    const selected_count = selected_in_view.length;
    const all_selected =
      filtered_contacts.length > 0 &&
      selected_count === filtered_contacts.length;
    const some_selected =
      selected_count > 0 && selected_count < filtered_contacts.length;

    return { selected_count, all_selected, some_selected };
  }, [filtered_contacts, selected_ids]);

  const has_selection =
    selection_state.all_selected || selection_state.some_selected;

  const fetch_contacts = useCallback(async () => {
    if (!has_keys || !is_open) {
      set_is_loading(false);

      return;
    }

    try {
      set_error(null);
      set_is_loading(true);
      const response = await list_contacts({ limit: 100 });

      if (response.error || !response.data) {
        set_error(response.error || "Failed to fetch contacts");
        set_is_loading(false);

        return;
      }
      const decrypted = await decrypt_contacts(response.data.items);

      set_contacts(decrypted);
    } catch (err) {
      set_error(
        err instanceof Error ? err.message : "Failed to fetch contacts",
      );
    } finally {
      set_is_loading(false);
    }
  }, [has_keys, is_open]);

  useEffect(() => {
    if (is_open) {
      fetch_contacts();
      set_selected_contact(null);
      set_search_query("");
      set_selected_ids(new Set());
      setTimeout(() => search_input_ref.current?.focus(), 100);
    }
  }, [is_open, fetch_contacts]);

  useEffect(() => {
    return () => {
      if (copy_timeout_ref.current) {
        clearTimeout(copy_timeout_ref.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!is_open) return;
    const handle_keydown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !is_form_open && !contact_to_delete) {
        if (selected_contact) {
          set_selected_contact(null);
        } else {
          on_close();
        }
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "n" && !is_form_open) {
        e.preventDefault();
        handle_add_click();
      }
    };

    window.addEventListener("keydown", handle_keydown);

    return () => window.removeEventListener("keydown", handle_keydown);
  }, [is_open, is_form_open, contact_to_delete, selected_contact, on_close]);

  const handle_add_click = useCallback(() => {
    set_editing_contact(null);
    set_is_form_open(true);
  }, []);

  const handle_edit = useCallback((contact: DecryptedContact) => {
    set_editing_contact(contact);
    set_is_form_open(true);
  }, []);

  const handle_delete_request = useCallback((contact: DecryptedContact) => {
    set_contact_to_delete(contact);
  }, []);

  const handle_confirm_delete = useCallback(async () => {
    if (!contact_to_delete) return;

    try {
      const response = await api_delete_contact(contact_to_delete.id);

      if (response.error) {
        set_error(response.error);

        return;
      }
      set_contacts((prev) => prev.filter((c) => c.id !== contact_to_delete.id));
      set_selected_ids((prev) => {
        const new_set = new Set(prev);

        new_set.delete(contact_to_delete.id);

        return new_set;
      });
      if (selected_contact?.id === contact_to_delete.id) {
        set_selected_contact(null);
      }
      emit_contacts_changed();
    } catch (err) {
      set_error(
        err instanceof Error ? err.message : "Failed to delete contact",
      );
    } finally {
      set_contact_to_delete(null);
    }
  }, [contact_to_delete, selected_contact]);

  const handle_form_submit = useCallback(
    async (data: ContactFormData) => {
      set_is_submitting(true);
      set_error(null);

      try {
        if (editing_contact) {
          const response = await update_contact_encrypted(
            editing_contact.id,
            data,
          );

          if (response.error) {
            set_error(response.error);
            set_is_submitting(false);

            return;
          }
          const updated_contact: DecryptedContact = {
            ...editing_contact,
            ...data,
            is_favorite: data.is_favorite ?? editing_contact.is_favorite,
            updated_at: new Date().toISOString(),
          };

          set_contacts((prev) =>
            prev.map((c) =>
              c.id === editing_contact.id ? updated_contact : c,
            ),
          );
          if (selected_contact?.id === editing_contact.id) {
            set_selected_contact(updated_contact);
          }
        } else {
          const response = await create_contact_encrypted(data);

          if (response.error || !response.data) {
            set_error(response.error || "Failed to create contact");
            set_is_submitting(false);

            return;
          }
          const new_contact: DecryptedContact = {
            id: response.data.id,
            first_name: data.first_name,
            last_name: data.last_name,
            emails: data.emails,
            phone: data.phone,
            company: data.company,
            job_title: data.job_title,
            address: data.address,
            birthday: data.birthday,
            social_links: data.social_links,
            relationship: data.relationship,
            notes: data.notes,
            avatar_url: data.avatar_url,
            is_favorite: data.is_favorite ?? false,
            groups: data.groups,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          };

          set_contacts((prev) => [...prev, new_contact]);
          emit_contacts_changed();
        }

        set_is_form_open(false);
        set_editing_contact(null);
      } catch (err) {
        set_error(
          err instanceof Error ? err.message : "Failed to save contact",
        );
      } finally {
        set_is_submitting(false);
      }
    },
    [editing_contact, selected_contact],
  );

  const handle_form_close = useCallback(() => {
    set_is_form_open(false);
    set_editing_contact(null);
  }, []);

  const handle_compose_email = useCallback(
    (email: string) => {
      on_compose_to?.(email);
      on_close();
    },
    [on_compose_to, on_close],
  );

  const handle_copy = useCallback(async (text: string, field: string) => {
    try {
      await navigator.clipboard.writeText(text);
      set_copied_field(field);
      if (copy_timeout_ref.current) {
        clearTimeout(copy_timeout_ref.current);
      }
      copy_timeout_ref.current = setTimeout(() => {
        set_copied_field(null);
      }, 2000);
    } catch {
      return;
    }
  }, []);

  const handle_toggle_select = useCallback((id: string) => {
    set_selected_ids((prev) => {
      const new_set = new Set(prev);

      if (new_set.has(id)) {
        new_set.delete(id);
      } else {
        new_set.add(id);
      }

      return new_set;
    });
  }, []);

  const handle_toggle_select_all = useCallback(() => {
    const filtered_ids = filtered_contacts.map((c) => c.id);
    const all_filtered_selected = filtered_ids.every((id) =>
      selected_ids.has(id),
    );

    if (all_filtered_selected) {
      set_selected_ids((prev) => {
        const new_set = new Set(prev);

        for (const id of filtered_ids) {
          new_set.delete(id);
        }

        return new_set;
      });
    } else {
      set_selected_ids((prev) => {
        const new_set = new Set(prev);

        for (const id of filtered_ids) {
          new_set.add(id);
        }

        return new_set;
      });
    }
  }, [filtered_contacts, selected_ids]);

  const handle_delete_selected = useCallback(() => {
    if (selected_ids.size === 0) return;
    set_is_bulk_deleting(true);
  }, [selected_ids]);

  const handle_confirm_bulk_delete = useCallback(async () => {
    if (selected_ids.size === 0) return;

    try {
      const ids_to_delete = Array.from(selected_ids);

      for (const id of ids_to_delete) {
        await api_delete_contact(id);
      }
      set_contacts((prev) => prev.filter((c) => !selected_ids.has(c.id)));
      set_selected_ids(new Set());
      if (selected_contact && selected_ids.has(selected_contact.id)) {
        set_selected_contact(null);
      }
      emit_contacts_changed();
    } catch (err) {
      set_error(
        err instanceof Error ? err.message : "Failed to delete contacts",
      );
    } finally {
      set_is_bulk_deleting(false);
    }
  }, [selected_ids, selected_contact]);

  const handle_compose_to_selected = useCallback(() => {
    const selected_contacts = contacts.filter((c) => selected_ids.has(c.id));
    const emails = selected_contacts
      .flatMap((c) => c.emails)
      .filter((e) => e)
      .slice(0, 10);

    if (emails.length > 0) {
      on_compose_to?.(emails.join(", "));
      on_close();
    }
  }, [contacts, selected_ids, on_compose_to, on_close]);

  const handle_toggle_favorite_selected = useCallback(async () => {
    if (selected_ids.size === 0) return;

    const selected_contacts = contacts.filter((c) => selected_ids.has(c.id));
    const all_favorited = selected_contacts.every((c) => c.is_favorite);
    const new_favorite_state = !all_favorited;

    try {
      for (const contact of selected_contacts) {
        if (contact.is_favorite !== new_favorite_state) {
          await update_contact_encrypted(contact.id, {
            first_name: contact.first_name,
            last_name: contact.last_name,
            emails: contact.emails,
            phone: contact.phone,
            company: contact.company,
            job_title: contact.job_title,
            address: contact.address,
            birthday: contact.birthday,
            social_links: contact.social_links,
            relationship: contact.relationship,
            notes: contact.notes,
            avatar_url: contact.avatar_url,
            is_favorite: new_favorite_state,
            groups: contact.groups,
          });
        }
      }

      set_contacts((prev) =>
        prev.map((c) =>
          selected_ids.has(c.id)
            ? { ...c, is_favorite: new_favorite_state }
            : c,
        ),
      );
    } catch (err) {
      set_error(
        err instanceof Error ? err.message : "Failed to update favorites",
      );
    }
  }, [contacts, selected_ids]);

  const handle_export_contacts = useCallback(
    (export_selected: boolean) => {
      const contacts_to_export = export_selected
        ? contacts.filter((c) => selected_ids.has(c.id))
        : contacts;

      if (contacts_to_export.length === 0) return;

      const csv_headers = [
        "First Name",
        "Last Name",
        "Email",
        "Phone",
        "Company",
        "Job Title",
        "Street",
        "City",
        "State",
        "Postal Code",
        "Country",
        "Birthday",
        "Notes",
        "Favorite",
      ];

      const csv_rows = contacts_to_export.map((contact) => [
        contact.first_name,
        contact.last_name,
        contact.emails.join("; "),
        contact.phone || "",
        contact.company || "",
        contact.job_title || "",
        contact.address?.street || "",
        contact.address?.city || "",
        contact.address?.state || "",
        contact.address?.postal_code || "",
        contact.address?.country || "",
        contact.birthday || "",
        (contact.notes || "").replace(/"/g, '""'),
        contact.is_favorite ? "Yes" : "No",
      ]);

      const csv_content = [
        csv_headers.join(","),
        ...csv_rows.map((row) => row.map((cell) => `"${cell}"`).join(",")),
      ].join("\n");

      const blob = new Blob([csv_content], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");

      link.href = url;
      link.download = `contacts_${new Date().toISOString().split("T")[0]}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    },
    [contacts, selected_ids],
  );

  const handle_copy_emails = useCallback(() => {
    const selected_contacts = contacts.filter((c) => selected_ids.has(c.id));
    const emails = selected_contacts.flatMap((c) => c.emails).filter((e) => e);

    if (emails.length > 0) {
      navigator.clipboard.writeText(emails.join(", "));
      set_copied_field("bulk-emails");
      if (copy_timeout_ref.current) {
        clearTimeout(copy_timeout_ref.current);
      }
      copy_timeout_ref.current = setTimeout(() => {
        set_copied_field(null);
      }, 2000);
    }
  }, [contacts, selected_ids]);

  const selected_all_favorited = useMemo(() => {
    if (selected_ids.size === 0) return false;
    const selected_contacts = contacts.filter((c) => selected_ids.has(c.id));

    return selected_contacts.every((c) => c.is_favorite);
  }, [contacts, selected_ids]);

  const filter_label = useMemo(() => {
    switch (filter_by) {
      case "favorites":
        return "Favorites";
      case "has_email":
        return "Has email";
      case "has_phone":
        return "Has phone";
      case "has_company":
        return "Has company";
      default:
        return "All";
    }
  }, [filter_by]);

  const sort_label = useMemo(() => {
    switch (sort_by) {
      case "name_asc":
        return "Name A-Z";
      case "name_desc":
        return "Name Z-A";
      case "company":
        return "Company";
      case "recent":
        return "Recently added";
      default:
        return "Sort";
    }
  }, [sort_by]);

  const full_name = selected_contact
    ? `${selected_contact.first_name} ${selected_contact.last_name}`.trim()
    : "";

  return (
    <AnimatePresence>
      {is_open && (
        <motion.div
          animate={{ opacity: 1 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6"
          exit={{ opacity: 0 }}
          initial={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          onClick={on_close}
        >
          <motion.div
            animate={{ opacity: 1 }}
            className="absolute inset-0 bg-black/60 backdrop-blur-md"
            exit={{ opacity: 0 }}
            initial={{ opacity: 0 }}
          />
          <motion.div
            animate={{ scale: 1, opacity: 1, y: 0 }}
            className="relative w-full max-w-[580px] rounded-xl border overflow-hidden"
            exit={{ scale: 0.96, opacity: 0, y: 0 }}
            initial={{ scale: 0.96, opacity: 0, y: 0 }}
            style={{
              backgroundColor: "var(--modal-bg)",
              borderColor: "var(--border-primary)",
              boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.35)",
            }}
            transition={{ duration: 0.15, ease: [0.19, 1, 0.22, 1] }}
            onClick={(e) => e.stopPropagation()}
          >
            {!has_keys ? (
              <div className="flex flex-col items-center justify-center py-20 px-8">
                <UserPlusIcon
                  className="w-10 h-10 mb-4"
                  style={{ color: "var(--text-muted)" }}
                />
                <p
                  className="text-[15px] font-medium mb-1"
                  style={{ color: "var(--text-primary)" }}
                >
                  Vault Locked
                </p>
                <p
                  className="text-[13px]"
                  style={{ color: "var(--text-muted)" }}
                >
                  Unlock your vault to view contacts
                </p>
              </div>
            ) : (
              <AnimatePresence initial={false} mode="wait">
                {selected_contact ? (
                  <motion.div
                    key="detail"
                    animate={{ opacity: 1, x: 0 }}
                    className="flex flex-col"
                    exit={{ opacity: 0, x: -10 }}
                    initial={{ opacity: 0, x: 10 }}
                    transition={{ duration: 0.15 }}
                  >
                    <div
                      className="flex items-center justify-between px-5 py-3.5 border-b"
                      style={{ borderColor: "var(--border-secondary)" }}
                    >
                      <motion.button
                        className="flex items-center gap-1 text-[14px] font-medium py-1.5 px-2 -ml-2 rounded-lg transition-colors"
                        style={{ color: "var(--text-secondary)" }}
                        whileHover={{
                          x: -2,
                          backgroundColor: "rgba(0,0,0,0.03)",
                        }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => set_selected_contact(null)}
                      >
                        <ArrowLeftIcon className="w-4 h-4" />
                        <span>Back</span>
                      </motion.button>
                      <motion.button
                        className="p-2 rounded-lg"
                        style={{ color: "var(--text-muted)" }}
                        whileHover={{ backgroundColor: "rgba(0,0,0,0.05)" }}
                        whileTap={{ scale: 0.95 }}
                        onClick={on_close}
                      >
                        <XMarkIcon className="w-5 h-5" />
                      </motion.button>
                    </div>

                    <div className="p-6">
                      <div className="flex flex-col items-center text-center mb-6">
                        <motion.div
                          animate={{ scale: 1, opacity: 1 }}
                          initial={{ scale: 0.9, opacity: 0 }}
                          transition={{ delay: 0.05 }}
                        >
                          <ProfileAvatar
                            className="mb-4 ring-4 ring-white dark:ring-zinc-900 shadow-lg"
                            name={full_name}
                            size="xl"
                          />
                        </motion.div>
                        <div className="flex items-center gap-2">
                          <h2
                            className="text-[20px] font-semibold"
                            style={{ color: "var(--text-primary)" }}
                          >
                            {full_name || "Unnamed Contact"}
                          </h2>
                          {selected_contact.is_favorite && (
                            <StarIcon className="w-5 h-5 fill-amber-400 text-amber-400" />
                          )}
                        </div>
                        {(selected_contact.job_title ||
                          selected_contact.company) && (
                          <p
                            className="text-[14px] mt-0.5"
                            style={{ color: "var(--text-secondary)" }}
                          >
                            {selected_contact.job_title &&
                            selected_contact.company
                              ? `${selected_contact.job_title} at ${selected_contact.company}`
                              : selected_contact.job_title ||
                                selected_contact.company}
                          </p>
                        )}

                        <div className="flex gap-2 mt-5">
                          {selected_contact.emails[0] && (
                            <Button
                              size="lg"
                              variant="primary"
                              onClick={() =>
                                handle_compose_email(selected_contact.emails[0])
                              }
                            >
                              <PaperAirplaneIcon className="w-3.5 h-3.5" />
                              Send email
                            </Button>
                          )}
                          <Button
                            className="h-10 px-5 text-[14px] font-normal gap-1.5"
                            style={{
                              backgroundColor: "var(--bg-secondary)",
                              borderColor: "var(--border-primary)",
                              color: "var(--text-primary)",
                            }}
                            variant="outline"
                            onClick={() => handle_edit(selected_contact)}
                          >
                            <PencilIcon className="w-3.5 h-3.5" />
                            Edit
                          </Button>
                          <Button
                            className="h-10 w-10 p-0 text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10 border-transparent hover:border-red-200 dark:hover:border-red-500/30"
                            variant="outline"
                            onClick={() =>
                              handle_delete_request(selected_contact)
                            }
                          >
                            <TrashIcon className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>

                      <div className="space-y-2">
                        {selected_contact.emails.map((email, index) => (
                          <div
                            key={index}
                            className="flex items-center gap-3 p-3.5 rounded-xl group"
                            style={{ backgroundColor: "var(--bg-secondary)" }}
                          >
                            <div
                              className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
                              style={{ backgroundColor: "var(--bg-primary)" }}
                            >
                              <EnvelopeIcon
                                className="w-4 h-4"
                                style={{ color: "var(--text-muted)" }}
                              />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p
                                className="text-[11px] font-medium uppercase tracking-wider"
                                style={{ color: "var(--text-muted)" }}
                              >
                                Email
                              </p>
                              <EmailProfileTrigger
                                email={email}
                                name={full_name}
                                on_compose={handle_compose_email}
                              >
                                <p
                                  className="text-[14px] truncate -mt-0.5"
                                  style={{ color: "var(--text-primary)" }}
                                >
                                  {email}
                                </p>
                              </EmailProfileTrigger>
                            </div>
                            <motion.button
                              className="p-2 rounded-lg opacity-0 group-hover:opacity-100"
                              whileHover={{
                                backgroundColor: "rgba(0,0,0,0.05)",
                              }}
                              whileTap={{ scale: 0.9 }}
                              onClick={(e) => {
                                e.stopPropagation();
                                handle_copy(email, `email-${index}`);
                              }}
                            >
                              {copied_field === `email-${index}` ? (
                                <CheckIcon className="w-4 h-4 text-green-500" />
                              ) : (
                                <ClipboardDocumentIcon
                                  className="w-4 h-4"
                                  style={{ color: "var(--text-muted)" }}
                                />
                              )}
                            </motion.button>
                          </div>
                        ))}

                        {selected_contact.phone && (
                          <div
                            className="flex items-center gap-3 p-3.5 rounded-xl group"
                            style={{ backgroundColor: "var(--bg-secondary)" }}
                          >
                            <div
                              className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
                              style={{ backgroundColor: "var(--bg-primary)" }}
                            >
                              <PhoneIcon
                                className="w-4 h-4"
                                style={{ color: "var(--text-muted)" }}
                              />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p
                                className="text-[11px] font-medium uppercase tracking-wider"
                                style={{ color: "var(--text-muted)" }}
                              >
                                Phone
                              </p>
                              <p
                                className="text-[14px] -mt-0.5"
                                style={{ color: "var(--text-primary)" }}
                              >
                                {selected_contact.phone}
                              </p>
                            </div>
                            <motion.button
                              className="p-2 rounded-lg opacity-0 group-hover:opacity-100"
                              whileHover={{
                                backgroundColor: "rgba(0,0,0,0.05)",
                              }}
                              whileTap={{ scale: 0.9 }}
                              onClick={() =>
                                handle_copy(selected_contact.phone!, "phone")
                              }
                            >
                              {copied_field === "phone" ? (
                                <CheckIcon className="w-4 h-4 text-green-500" />
                              ) : (
                                <ClipboardDocumentIcon
                                  className="w-4 h-4"
                                  style={{ color: "var(--text-muted)" }}
                                />
                              )}
                            </motion.button>
                          </div>
                        )}

                        {selected_contact.company && (
                          <div
                            className="flex items-center gap-3 p-3.5 rounded-xl"
                            style={{ backgroundColor: "var(--bg-secondary)" }}
                          >
                            <div
                              className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
                              style={{ backgroundColor: "var(--bg-primary)" }}
                            >
                              <BuildingOffice2Icon
                                className="w-4 h-4"
                                style={{ color: "var(--text-muted)" }}
                              />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p
                                className="text-[11px] font-medium uppercase tracking-wider"
                                style={{ color: "var(--text-muted)" }}
                              >
                                Company
                              </p>
                              <p
                                className="text-[14px] -mt-0.5"
                                style={{ color: "var(--text-primary)" }}
                              >
                                {selected_contact.company}
                              </p>
                            </div>
                          </div>
                        )}

                        {selected_contact.job_title && (
                          <div
                            className="flex items-center gap-3 p-3.5 rounded-xl"
                            style={{ backgroundColor: "var(--bg-secondary)" }}
                          >
                            <div
                              className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
                              style={{ backgroundColor: "var(--bg-primary)" }}
                            >
                              <BriefcaseIcon
                                className="w-4 h-4"
                                style={{ color: "var(--text-muted)" }}
                              />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p
                                className="text-[11px] font-medium uppercase tracking-wider"
                                style={{ color: "var(--text-muted)" }}
                              >
                                Job Title
                              </p>
                              <p
                                className="text-[14px] -mt-0.5"
                                style={{ color: "var(--text-primary)" }}
                              >
                                {selected_contact.job_title}
                              </p>
                            </div>
                          </div>
                        )}

                        {selected_contact.relationship && (
                          <div
                            className="flex items-center gap-3 p-3.5 rounded-xl"
                            style={{ backgroundColor: "var(--bg-secondary)" }}
                          >
                            <div
                              className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
                              style={{ backgroundColor: "var(--bg-primary)" }}
                            >
                              <UserPlusIcon
                                className="w-4 h-4"
                                style={{ color: "var(--text-muted)" }}
                              />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p
                                className="text-[11px] font-medium uppercase tracking-wider"
                                style={{ color: "var(--text-muted)" }}
                              >
                                Relationship
                              </p>
                              <p
                                className="text-[14px] -mt-0.5"
                                style={{ color: "var(--text-primary)" }}
                              >
                                {RELATIONSHIP_LABELS[
                                  selected_contact.relationship
                                ] || selected_contact.relationship}
                              </p>
                            </div>
                          </div>
                        )}

                        {selected_contact.birthday && (
                          <div
                            className="flex items-center gap-3 p-3.5 rounded-xl"
                            style={{ backgroundColor: "var(--bg-secondary)" }}
                          >
                            <div
                              className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
                              style={{ backgroundColor: "var(--bg-primary)" }}
                            >
                              <CalendarIcon
                                className="w-4 h-4"
                                style={{ color: "var(--text-muted)" }}
                              />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p
                                className="text-[11px] font-medium uppercase tracking-wider"
                                style={{ color: "var(--text-muted)" }}
                              >
                                Birthday
                              </p>
                              <p
                                className="text-[14px] -mt-0.5"
                                style={{ color: "var(--text-primary)" }}
                              >
                                {new Date(
                                  selected_contact.birthday,
                                ).toLocaleDateString(undefined, {
                                  month: "long",
                                  day: "numeric",
                                  year: "numeric",
                                })}
                              </p>
                            </div>
                          </div>
                        )}

                        {selected_contact.address &&
                          (selected_contact.address.street ||
                            selected_contact.address.city ||
                            selected_contact.address.country) && (
                            <div
                              className="flex items-center gap-3 p-3.5 rounded-xl"
                              style={{ backgroundColor: "var(--bg-secondary)" }}
                            >
                              <div
                                className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
                                style={{ backgroundColor: "var(--bg-primary)" }}
                              >
                                <MapPinIcon
                                  className="w-4 h-4"
                                  style={{ color: "var(--text-muted)" }}
                                />
                              </div>
                              <div className="flex-1 min-w-0">
                                <p
                                  className="text-[11px] font-medium uppercase tracking-wider"
                                  style={{ color: "var(--text-muted)" }}
                                >
                                  Address
                                </p>
                                <p
                                  className="text-[14px] -mt-0.5 leading-relaxed"
                                  style={{ color: "var(--text-primary)" }}
                                >
                                  {[
                                    selected_contact.address.street,
                                    [
                                      selected_contact.address.city,
                                      selected_contact.address.state,
                                      selected_contact.address.postal_code,
                                    ]
                                      .filter(Boolean)
                                      .join(", "),
                                    selected_contact.address.country,
                                  ]
                                    .filter(Boolean)
                                    .join("\n")}
                                </p>
                              </div>
                            </div>
                          )}

                        {selected_contact.social_links &&
                          (selected_contact.social_links.website ||
                            selected_contact.social_links.linkedin ||
                            selected_contact.social_links.twitter ||
                            selected_contact.social_links.github) && (
                            <div
                              className="flex items-center gap-3 p-3.5 rounded-xl"
                              style={{ backgroundColor: "var(--bg-secondary)" }}
                            >
                              <div
                                className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
                                style={{ backgroundColor: "var(--bg-primary)" }}
                              >
                                <GlobeAltIcon
                                  className="w-4 h-4"
                                  style={{ color: "var(--text-muted)" }}
                                />
                              </div>
                              <div className="flex-1 min-w-0">
                                <p
                                  className="text-[11px] font-medium uppercase tracking-wider mb-1"
                                  style={{ color: "var(--text-muted)" }}
                                >
                                  Social Links
                                </p>
                                <div className="flex flex-wrap gap-2">
                                  {selected_contact.social_links.website && (
                                    <a
                                      className="text-[13px] px-2.5 py-1 rounded-md transition-colors"
                                      href={
                                        selected_contact.social_links.website.startsWith(
                                          "http",
                                        )
                                          ? selected_contact.social_links
                                              .website
                                          : `https://${selected_contact.social_links.website}`
                                      }
                                      rel="noopener noreferrer"
                                      style={{
                                        backgroundColor: "var(--bg-primary)",
                                        color: "var(--text-secondary)",
                                      }}
                                      target="_blank"
                                    >
                                      Website
                                    </a>
                                  )}
                                  {selected_contact.social_links.linkedin && (
                                    <a
                                      className="text-[13px] px-2.5 py-1 rounded-md transition-colors"
                                      href={
                                        selected_contact.social_links.linkedin.includes(
                                          "linkedin.com",
                                        )
                                          ? selected_contact.social_links
                                              .linkedin
                                          : `https://linkedin.com/in/${selected_contact.social_links.linkedin}`
                                      }
                                      rel="noopener noreferrer"
                                      style={{
                                        backgroundColor: "var(--bg-primary)",
                                        color: "var(--text-secondary)",
                                      }}
                                      target="_blank"
                                    >
                                      LinkedIn
                                    </a>
                                  )}
                                  {selected_contact.social_links.twitter && (
                                    <a
                                      className="text-[13px] px-2.5 py-1 rounded-md transition-colors"
                                      href={
                                        selected_contact.social_links.twitter.includes(
                                          "twitter.com",
                                        ) ||
                                        selected_contact.social_links.twitter.includes(
                                          "x.com",
                                        )
                                          ? selected_contact.social_links
                                              .twitter
                                          : `https://x.com/${selected_contact.social_links.twitter.replace("@", "")}`
                                      }
                                      rel="noopener noreferrer"
                                      style={{
                                        backgroundColor: "var(--bg-primary)",
                                        color: "var(--text-secondary)",
                                      }}
                                      target="_blank"
                                    >
                                      Twitter/X
                                    </a>
                                  )}
                                  {selected_contact.social_links.github && (
                                    <a
                                      className="text-[13px] px-2.5 py-1 rounded-md transition-colors"
                                      href={
                                        selected_contact.social_links.github.includes(
                                          "github.com",
                                        )
                                          ? selected_contact.social_links.github
                                          : `https://github.com/${selected_contact.social_links.github}`
                                      }
                                      rel="noopener noreferrer"
                                      style={{
                                        backgroundColor: "var(--bg-primary)",
                                        color: "var(--text-secondary)",
                                      }}
                                      target="_blank"
                                    >
                                      GitHub
                                    </a>
                                  )}
                                </div>
                              </div>
                            </div>
                          )}

                        {selected_contact.notes && (
                          <div
                            className="flex gap-3 p-3.5 rounded-xl"
                            style={{ backgroundColor: "var(--bg-secondary)" }}
                          >
                            <div
                              className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
                              style={{ backgroundColor: "var(--bg-primary)" }}
                            >
                              <DocumentTextIcon
                                className="w-4 h-4"
                                style={{ color: "var(--text-muted)" }}
                              />
                            </div>
                            <div className="flex-1 min-w-0 pt-0.5">
                              <p
                                className="text-[11px] font-medium uppercase tracking-wider"
                                style={{ color: "var(--text-muted)" }}
                              >
                                Notes
                              </p>
                              <p
                                className="text-[14px] leading-relaxed whitespace-pre-wrap -mt-0.5"
                                style={{ color: "var(--text-primary)" }}
                              >
                                {selected_contact.notes}
                              </p>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </motion.div>
                ) : (
                  <motion.div
                    key="list"
                    animate={{ opacity: 1, x: 0 }}
                    className="flex flex-col max-h-[75vh]"
                    exit={{ opacity: 0, x: 10 }}
                    initial={{ opacity: 0, x: -10 }}
                    transition={{ duration: 0.15 }}
                  >
                    <div
                      className="px-5 pt-5 pb-4 border-b"
                      style={{ borderColor: "var(--border-secondary)" }}
                    >
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-baseline gap-2.5">
                          <h2
                            className="text-[17px] font-semibold"
                            style={{ color: "var(--text-primary)" }}
                          >
                            Contacts
                          </h2>
                          {contacts.length > 0 && (
                            <span
                              className="text-[13px] px-2 py-0.5 rounded-full"
                              style={{
                                backgroundColor: "var(--bg-secondary)",
                                color: "var(--text-muted)",
                              }}
                            >
                              {contacts.length}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            className="h-10"
                            size="default"
                            variant="primary"
                            onClick={handle_add_click}
                          >
                            <PlusIcon className="w-4 h-4" />
                            Add
                          </Button>
                          <motion.button
                            className="p-2 rounded-lg"
                            style={{ color: "var(--text-muted)" }}
                            whileHover={{
                              backgroundColor: "rgba(0,0,0,0.05)",
                            }}
                            whileTap={{ scale: 0.95 }}
                            onClick={on_close}
                          >
                            <XMarkIcon className="w-5 h-5" />
                          </motion.button>
                        </div>
                      </div>

                      <div className="relative">
                        <MagnifyingGlassIcon
                          className="absolute left-3 top-1/2 -translate-y-1/2 w-[16px] h-[16px] pointer-events-none"
                          style={{ color: "var(--text-muted)" }}
                        />
                        <input
                          ref={search_input_ref}
                          className="w-full h-10 pl-9 pr-4 text-[14px] rounded-lg outline-none transition-all placeholder:text-[var(--text-muted)]"
                          placeholder="Search contacts..."
                          style={{
                            backgroundColor: "var(--bg-secondary)",
                            color: "var(--text-primary)",
                          }}
                          value={search_query}
                          onChange={(e) => set_search_query(e.target.value)}
                        />
                        {search_query && (
                          <motion.button
                            animate={{ opacity: 1, scale: 1 }}
                            className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-md"
                            initial={{ opacity: 0, scale: 0.8 }}
                            whileHover={{ backgroundColor: "rgba(0,0,0,0.05)" }}
                            onClick={() => set_search_query("")}
                          >
                            <XMarkIcon
                              className="w-3.5 h-3.5"
                              style={{ color: "var(--text-muted)" }}
                            />
                          </motion.button>
                        )}
                      </div>
                    </div>

                    {contacts.length > 0 && (
                      <div
                        className="flex items-center gap-2 px-5 py-2 border-b"
                        style={{ borderColor: "var(--border-secondary)" }}
                      >
                        <div className="flex-shrink-0">
                          <Checkbox
                            checked={selection_state.all_selected}
                            indeterminate={selection_state.some_selected}
                            onCheckedChange={handle_toggle_select_all}
                          />
                        </div>

                        {has_selection ? (
                          <div className="flex items-center gap-1 ml-1 flex-1">
                            <span
                              className="text-[13px] font-medium mr-2"
                              style={{ color: "var(--text-primary)" }}
                            >
                              {selection_state.selected_count} selected
                            </span>

                            <Button
                              className="h-7 w-7"
                              size="icon"
                              variant="ghost"
                              onClick={handle_compose_to_selected}
                            >
                              <EnvelopeIcon
                                className="h-3.5 w-3.5"
                                style={{ color: "var(--text-secondary)" }}
                              />
                            </Button>

                            <Button
                              className="h-7 w-7"
                              size="icon"
                              variant="ghost"
                              onClick={handle_toggle_favorite_selected}
                            >
                              {selected_all_favorited ? (
                                <StarIconSolid className="h-3.5 w-3.5 text-amber-400" />
                              ) : (
                                <StarIcon
                                  className="h-3.5 w-3.5"
                                  style={{
                                    color: "var(--text-secondary)",
                                  }}
                                />
                              )}
                            </Button>

                            <Button
                              className="h-7 w-7"
                              size="icon"
                              variant="ghost"
                              onClick={handle_copy_emails}
                            >
                              {copied_field === "bulk-emails" ? (
                                <CheckIcon className="h-3.5 w-3.5 text-green-500" />
                              ) : (
                                <ClipboardDocumentIcon
                                  className="h-3.5 w-3.5"
                                  style={{
                                    color: "var(--text-secondary)",
                                  }}
                                />
                              )}
                            </Button>

                            <Button
                              className="h-7 w-7"
                              size="icon"
                              variant="ghost"
                              onClick={() => handle_export_contacts(true)}
                            >
                              <ArrowDownTrayIcon
                                className="h-3.5 w-3.5"
                                style={{ color: "var(--text-secondary)" }}
                              />
                            </Button>

                            <Button
                              className="h-7 w-7 text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10"
                              size="icon"
                              variant="ghost"
                              onClick={handle_delete_selected}
                            >
                              <TrashIcon className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        ) : (
                          <div className="flex items-center justify-between flex-1">
                            <span
                              className="text-[13px] ml-1"
                              style={{ color: "var(--text-muted)" }}
                            >
                              {filtered_contacts.length === contacts.length
                                ? `${contacts.length} ${contacts.length === 1 ? "contact" : "contacts"}`
                                : `${filtered_contacts.length} of ${contacts.length}`}
                            </span>

                            <div className="flex items-center gap-1">
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button
                                    className="h-7 px-2 gap-1 text-[12px]"
                                    size="sm"
                                    variant="ghost"
                                  >
                                    <FunnelIcon
                                      className="h-3.5 w-3.5"
                                      style={{
                                        color:
                                          filter_by !== "all"
                                            ? "var(--text-primary)"
                                            : "var(--text-muted)",
                                      }}
                                    />
                                    <span
                                      className="hidden sm:inline"
                                      style={{
                                        color:
                                          filter_by !== "all"
                                            ? "var(--text-primary)"
                                            : "var(--text-muted)",
                                      }}
                                    >
                                      {filter_label}
                                    </span>
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent
                                  align="end"
                                  className="w-40"
                                >
                                  <DropdownMenuItem
                                    className={
                                      filter_by === "all" ? "font-medium" : ""
                                    }
                                    onClick={() => set_filter_by("all")}
                                  >
                                    All contacts
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    className={
                                      filter_by === "favorites"
                                        ? "font-medium"
                                        : ""
                                    }
                                    onClick={() => set_filter_by("favorites")}
                                  >
                                    <StarIconSolid className="h-3.5 w-3.5 mr-2 text-amber-400" />
                                    Favorites
                                  </DropdownMenuItem>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem
                                    className={
                                      filter_by === "has_email"
                                        ? "font-medium"
                                        : ""
                                    }
                                    onClick={() => set_filter_by("has_email")}
                                  >
                                    <EnvelopeIcon className="h-3.5 w-3.5 mr-2" />
                                    Has email
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    className={
                                      filter_by === "has_phone"
                                        ? "font-medium"
                                        : ""
                                    }
                                    onClick={() => set_filter_by("has_phone")}
                                  >
                                    <PhoneIcon className="h-3.5 w-3.5 mr-2" />
                                    Has phone
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    className={
                                      filter_by === "has_company"
                                        ? "font-medium"
                                        : ""
                                    }
                                    onClick={() => set_filter_by("has_company")}
                                  >
                                    <BuildingOffice2Icon className="h-3.5 w-3.5 mr-2" />
                                    Has company
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>

                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button
                                    className="h-7 px-2 gap-1 text-[12px]"
                                    size="sm"
                                    variant="ghost"
                                  >
                                    {sort_by === "name_desc" ? (
                                      <BarsArrowUpIcon
                                        className="h-3.5 w-3.5"
                                        style={{
                                          color: "var(--text-muted)",
                                        }}
                                      />
                                    ) : (
                                      <BarsArrowDownIcon
                                        className="h-3.5 w-3.5"
                                        style={{
                                          color: "var(--text-muted)",
                                        }}
                                      />
                                    )}
                                    <span
                                      className="hidden sm:inline"
                                      style={{
                                        color: "var(--text-muted)",
                                      }}
                                    >
                                      {sort_label}
                                    </span>
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent
                                  align="end"
                                  className="w-40"
                                >
                                  <DropdownMenuItem
                                    className={
                                      sort_by === "name_asc"
                                        ? "font-medium"
                                        : ""
                                    }
                                    onClick={() => set_sort_by("name_asc")}
                                  >
                                    Name A-Z
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    className={
                                      sort_by === "name_desc"
                                        ? "font-medium"
                                        : ""
                                    }
                                    onClick={() => set_sort_by("name_desc")}
                                  >
                                    Name Z-A
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    className={
                                      sort_by === "company" ? "font-medium" : ""
                                    }
                                    onClick={() => set_sort_by("company")}
                                  >
                                    Company
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    className={
                                      sort_by === "recent" ? "font-medium" : ""
                                    }
                                    onClick={() => set_sort_by("recent")}
                                  >
                                    Recently added
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>

                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button
                                    className="h-7 w-7"
                                    size="icon"
                                    variant="ghost"
                                  >
                                    <ArrowDownTrayIcon
                                      className="h-3.5 w-3.5"
                                      style={{
                                        color: "var(--text-muted)",
                                      }}
                                    />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent
                                  align="end"
                                  className="w-44"
                                >
                                  <DropdownMenuItem
                                    onClick={() =>
                                      handle_export_contacts(false)
                                    }
                                  >
                                    Export all contacts
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    disabled={
                                      filtered_contacts.length ===
                                      contacts.length
                                    }
                                    onClick={() => {
                                      const filtered_ids = new Set(
                                        filtered_contacts.map((c) => c.id),
                                      );

                                      set_selected_ids(filtered_ids);
                                      handle_export_contacts(true);
                                    }}
                                  >
                                    Export filtered ({filtered_contacts.length})
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {error && (
                      <motion.div
                        animate={{ opacity: 1, y: 0 }}
                        className="mx-5 mt-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20"
                        initial={{ opacity: 0, y: -10 }}
                      >
                        <p className="text-[13px] text-red-500">{error}</p>
                      </motion.div>
                    )}

                    <div className="flex-1 overflow-y-auto min-h-0">
                      {is_loading ? (
                        <div className="flex items-center justify-center py-20">
                          <motion.div
                            animate={{ rotate: 360 }}
                            className="w-6 h-6 border-2 rounded-full"
                            style={{
                              borderColor: "var(--border-secondary)",
                              borderTopColor: "var(--text-muted)",
                            }}
                            transition={{
                              duration: 1,
                              repeat: Infinity,
                              ease: "linear",
                            }}
                          />
                        </div>
                      ) : contacts.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-20 px-8">
                          <UserPlusIcon
                            className="w-10 h-10 mb-4"
                            style={{ color: "var(--text-muted)" }}
                          />
                          <h3
                            className="text-[15px] font-medium mb-1"
                            style={{ color: "var(--text-primary)" }}
                          >
                            No contacts yet
                          </h3>
                          <p
                            className="text-[13px] text-center mb-5 max-w-[240px]"
                            style={{ color: "var(--text-muted)" }}
                          >
                            Add contacts to quickly email people you message
                            often
                          </p>
                          <Button
                            className="h-10"
                            size="default"
                            variant="primary"
                            onClick={handle_add_click}
                          >
                            <PlusIcon className="w-3.5 h-3.5" />
                            Add contact
                          </Button>
                        </div>
                      ) : filtered_contacts.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-16">
                          <MagnifyingGlassIcon
                            className="w-8 h-8 mb-3"
                            style={{ color: "var(--text-muted)" }}
                          />
                          <p
                            className="text-[14px] font-medium mb-0.5"
                            style={{ color: "var(--text-primary)" }}
                          >
                            No results
                          </p>
                          <p
                            className="text-[13px]"
                            style={{ color: "var(--text-muted)" }}
                          >
                            No contacts match &quot;{search_query}&quot;
                          </p>
                        </div>
                      ) : (
                        <div>
                          {filtered_contacts.map((contact) => {
                            const name =
                              `${contact.first_name} ${contact.last_name}`.trim();
                            const primary_email = contact.emails[0];
                            const is_selected = selected_ids.has(contact.id);

                            return (
                              <div
                                key={contact.id}
                                className="flex items-center gap-3 px-5 py-2.5 cursor-pointer transition-colors border-b"
                                role="button"
                                style={{
                                  backgroundColor: is_selected
                                    ? "rgba(59, 130, 246, 0.08)"
                                    : "transparent",
                                  borderColor: "var(--border-secondary)",
                                }}
                                tabIndex={0}
                                onClick={() => set_selected_contact(contact)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter" || e.key === " ") {
                                    e.preventDefault();
                                    set_selected_contact(contact);
                                  }
                                }}
                                onMouseEnter={(e) => {
                                  if (!is_selected) {
                                    e.currentTarget.style.backgroundColor =
                                      "var(--bg-secondary)";
                                  }
                                }}
                                onMouseLeave={(e) => {
                                  if (!is_selected) {
                                    e.currentTarget.style.backgroundColor =
                                      "transparent";
                                  }
                                }}
                              >
                                <div
                                  className="flex-shrink-0"
                                  role="button"
                                  tabIndex={0}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handle_toggle_select(contact.id);
                                  }}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter" || e.key === " ") {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      handle_toggle_select(contact.id);
                                    }
                                  }}
                                >
                                  <Checkbox
                                    checked={is_selected}
                                    onCheckedChange={() =>
                                      handle_toggle_select(contact.id)
                                    }
                                  />
                                </div>
                                <ProfileAvatar name={name} size="sm" />
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-1.5">
                                    <span
                                      className="text-[14px] font-medium truncate"
                                      style={{ color: "var(--text-primary)" }}
                                    >
                                      {name || "Unnamed"}
                                    </span>
                                    {contact.is_favorite && (
                                      <StarIcon className="w-3.5 h-3.5 fill-amber-400 text-amber-400 flex-shrink-0" />
                                    )}
                                  </div>
                                  {primary_email && (
                                    <p
                                      className="text-[12px] truncate"
                                      style={{ color: "var(--text-muted)" }}
                                    >
                                      {primary_email}
                                    </p>
                                  )}
                                </div>
                                <span
                                  className="text-[13px] truncate max-w-[100px] hidden sm:block"
                                  style={{ color: "var(--text-secondary)" }}
                                >
                                  {contact.company}
                                </span>
                                <ChevronRightIcon
                                  className="w-4 h-4 flex-shrink-0 opacity-40"
                                  style={{ color: "var(--text-muted)" }}
                                />
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            )}
          </motion.div>

          <ContactForm
            contact={editing_contact}
            is_loading={is_submitting}
            is_open={is_form_open}
            on_close={handle_form_close}
            on_submit={handle_form_submit}
          />

          <ConfirmationModal
            cancel_text="Cancel"
            confirm_text="Delete"
            is_open={!!contact_to_delete}
            message={`Are you sure you want to delete ${
              contact_to_delete
                ? `${contact_to_delete.first_name} ${contact_to_delete.last_name}`.trim()
                : "this contact"
            }? This action cannot be undone.`}
            on_cancel={() => set_contact_to_delete(null)}
            on_confirm={handle_confirm_delete}
            title="Delete Contact"
            variant="danger"
          />

          <ConfirmationModal
            cancel_text="Cancel"
            confirm_text={`Delete ${selected_ids.size} contact${selected_ids.size === 1 ? "" : "s"}`}
            is_open={is_bulk_deleting}
            message={`Are you sure you want to delete ${selected_ids.size} contact${selected_ids.size === 1 ? "" : "s"}? This action cannot be undone.`}
            on_cancel={() => set_is_bulk_deleting(false)}
            on_confirm={handle_confirm_bulk_delete}
            title="Delete Selected Contacts"
            variant="danger"
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
