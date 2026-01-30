import type {
  DecryptedContact,
  ContactFormData,
  DecryptedContactPhoto,
  DecryptedContactAttachment,
  DecryptedCustomFieldValue,
} from "@/types/contacts";

import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import {
  MagnifyingGlassIcon,
  PlusIcon,
  EnvelopeIcon,
  PhoneIcon,
  BuildingOffice2Icon,
  DocumentTextIcon,
  PencilIcon,
  TrashIcon,
  ChevronRightIcon,
  XMarkIcon,
  StarIcon,
  ArrowDownTrayIcon,
  ArrowUpTrayIcon,
  FunnelIcon,
  BarsArrowDownIcon,
  BarsArrowUpIcon,
  ClipboardDocumentIcon,
  CheckIcon,
  UserPlusIcon,
  PaperAirplaneIcon,
  BriefcaseIcon,
  CalendarIcon,
  MapPinIcon,
  GlobeAltIcon,
  Squares2X2Icon,
  ListBulletIcon,
  CakeIcon,
} from "@heroicons/react/24/outline";
import { StarIcon as StarIconSolid } from "@heroicons/react/24/solid";

import { ContactForm } from "@/components/contacts";
import { ContactHistoryPanel } from "@/components/contacts/contact_history_panel";
import { ContactImportModal } from "@/components/contacts/contact_import_modal";
import { ContactDuplicatesList } from "@/components/contacts/contact_duplicates_list";
import { ContactSyncSettings } from "@/components/contacts/contact_sync_settings";
import { ConfirmationModal } from "@/components/modals/confirmation_modal";
import { ComposeModal } from "@/components/compose/compose_modal";
import { ProfileAvatar } from "@/components/ui/profile_avatar";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { MobileMenuButton } from "@/components/layout/sidebar";
import { RELATIONSHIP_LABELS } from "@/types/contacts";
import {
  list_contacts,
  create_contact_encrypted,
  update_contact_encrypted,
  delete_contact as api_delete_contact,
  decrypt_contacts,
} from "@/services/api/contacts";
import { use_auth } from "@/contexts/auth_context";
import { parse_csv_line, get_days_until_birthday } from "@/utils/contact_utils";

type SortOption = "name_asc" | "name_desc" | "company" | "recent";
type FilterOption =
  | "all"
  | "favorites"
  | "has_email"
  | "has_phone"
  | "has_company"
  | "upcoming_birthdays";
type ViewMode = "list" | "compact";

interface ContactsContentProps {
  on_mobile_menu_toggle: () => void;
}

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ#".split("");

export function ContactsContent({
  on_mobile_menu_toggle,
}: ContactsContentProps) {
  const { has_keys } = use_auth();
  const [search_params, set_search_params] = useSearchParams();
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
  const [selected_ids, set_selected_ids] = useState<Set<string>>(new Set());
  const [is_bulk_deleting, set_is_bulk_deleting] = useState(false);
  const [sort_by, set_sort_by] = useState<SortOption>("name_asc");
  const [filter_by, set_filter_by] = useState<FilterOption>("all");
  const [copied_field, set_copied_field] = useState<string | null>(null);
  const [view_mode, set_view_mode] = useState<ViewMode>("list");
  const [focused_index, set_focused_index] = useState<number>(-1);
  const [is_importing, set_is_importing] = useState(false);
  const [import_progress, set_import_progress] = useState<{
    current: number;
    total: number;
  } | null>(null);
  const [is_compose_open, set_is_compose_open] = useState(false);
  const [compose_recipients, set_compose_recipients] = useState<string>("");
  const [is_import_modal_open, set_is_import_modal_open] = useState(false);
  const [show_history, set_show_history] = useState(false);
  const copy_timeout_ref = useRef<NodeJS.Timeout | null>(null);
  const search_input_ref = useRef<HTMLInputElement>(null);
  const file_input_ref = useRef<HTMLInputElement>(null);
  const list_container_ref = useRef<HTMLDivElement>(null);
  const contact_refs = useRef<Map<string, HTMLDivElement>>(new Map());

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
          case "upcoming_birthdays":
            if (!contact.birthday) return false;
            const days = get_days_until_birthday(contact.birthday);

            return days <= 30;
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
      case "upcoming_birthdays":
        return "Birthdays";
      default:
        return "All";
    }
  }, [filter_by]);

  const alphabetical_index = useMemo(() => {
    const index: Map<string, number> = new Map();

    filtered_contacts.forEach((contact, i) => {
      const first_char = (contact.first_name || contact.last_name || "")
        .charAt(0)
        .toUpperCase();
      const letter = /[A-Z]/.test(first_char) ? first_char : "#";

      if (!index.has(letter)) {
        index.set(letter, i);
      }
    });

    return index;
  }, [filtered_contacts]);

  const upcoming_birthdays_count = useMemo(() => {
    return contacts.filter((c) => {
      if (!c.birthday) return false;

      return get_days_until_birthday(c.birthday) <= 30;
    }).length;
  }, [contacts]);

  const sort_label = useMemo(() => {
    switch (sort_by) {
      case "name_asc":
        return "Name A-Z";
      case "name_desc":
        return "Name Z-A";
      case "company":
        return "Company";
      case "recent":
        return "Recent";
      default:
        return "Sort";
    }
  }, [sort_by]);

  const fetch_contacts = useCallback(async () => {
    if (!has_keys) {
      set_is_loading(false);

      return;
    }

    try {
      set_error(null);
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
  }, [has_keys]);

  useEffect(() => {
    fetch_contacts();
  }, [fetch_contacts]);

  useEffect(() => {
    const contact_id = search_params.get("contact_id");

    if (contact_id && contacts.length > 0 && !selected_contact) {
      const contact = contacts.find((c) => c.id === contact_id);

      if (contact) {
        set_selected_contact(contact);
        set_search_params({}, { replace: true });
      }
    }
  }, [contacts, search_params, set_search_params, selected_contact]);

  useEffect(() => {
    return () => {
      if (copy_timeout_ref.current) {
        clearTimeout(copy_timeout_ref.current);
      }
    };
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

  useEffect(() => {
    const handle_keydown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const is_input =
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable;

      if (e.key === "/" && !is_input) {
        e.preventDefault();
        search_input_ref.current?.focus();

        return;
      }

      if (e.key === "Escape") {
        if (search_query) {
          set_search_query("");
          search_input_ref.current?.blur();
        } else if (selected_contact) {
          set_selected_contact(null);
        } else if (selected_ids.size > 0) {
          set_selected_ids(new Set());
        }
        set_focused_index(-1);

        return;
      }

      if (is_input) return;

      if (e.key === "j" || e.key === "ArrowDown") {
        e.preventDefault();
        set_focused_index((prev) => {
          const next = Math.min(prev + 1, filtered_contacts.length - 1);
          const contact = filtered_contacts[next];

          if (contact) {
            const el = contact_refs.current.get(contact.id);

            el?.scrollIntoView({ block: "nearest" });
          }

          return next;
        });

        return;
      }

      if (e.key === "k" || e.key === "ArrowUp") {
        e.preventDefault();
        set_focused_index((prev) => {
          const next = Math.max(prev - 1, 0);
          const contact = filtered_contacts[next];

          if (contact) {
            const el = contact_refs.current.get(contact.id);

            el?.scrollIntoView({ block: "nearest" });
          }

          return next;
        });

        return;
      }

      if (e.key === "Enter" && focused_index >= 0) {
        e.preventDefault();
        const contact = filtered_contacts[focused_index];

        if (contact) {
          set_selected_contact(contact);
        }

        return;
      }

      if (e.key === "e" && focused_index >= 0) {
        e.preventDefault();
        const contact = filtered_contacts[focused_index];

        if (contact?.emails[0]) {
          set_compose_recipients(contact.emails[0]);
          set_is_compose_open(true);
        }

        return;
      }

      if (e.key === "x" && focused_index >= 0) {
        e.preventDefault();
        const contact = filtered_contacts[focused_index];

        if (contact) {
          handle_toggle_select(contact.id);
        }

        return;
      }

      if (e.key === "n" && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        set_editing_contact(null);
        set_is_form_open(true);

        return;
      }
    };

    window.addEventListener("keydown", handle_keydown);

    return () => window.removeEventListener("keydown", handle_keydown);
  }, [
    filtered_contacts,
    focused_index,
    search_query,
    selected_contact,
    selected_ids,
    handle_toggle_select,
  ]);

  const scroll_to_letter = useCallback(
    (letter: string) => {
      const index = alphabetical_index.get(letter);

      if (index !== undefined) {
        const contact = filtered_contacts[index];

        if (contact) {
          const el = contact_refs.current.get(contact.id);

          el?.scrollIntoView({ block: "start", behavior: "smooth" });
          set_focused_index(index);
        }
      }
    },
    [alphabetical_index, filtered_contacts],
  );

  const handle_import_csv = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];

      if (!file) return;

      set_is_importing(true);
      set_error(null);

      try {
        const text = await file.text();
        const lines = text.split(/\r?\n/).filter((line) => line.trim());

        if (lines.length < 2) {
          set_error("CSV file appears to be empty");
          set_is_importing(false);

          return;
        }

        const headers = parse_csv_line(lines[0]).map((h) =>
          h.toLowerCase().trim(),
        );
        const first_name_idx = headers.findIndex(
          (h) => h.includes("first") && h.includes("name"),
        );
        const last_name_idx = headers.findIndex(
          (h) => h.includes("last") && h.includes("name"),
        );
        const name_idx = headers.findIndex(
          (h) => h === "name" || h === "full name",
        );
        const email_idx = headers.findIndex(
          (h) => h.includes("email") || h.includes("e-mail"),
        );
        const phone_idx = headers.findIndex(
          (h) =>
            h.includes("phone") || h.includes("mobile") || h.includes("cell"),
        );
        const company_idx = headers.findIndex(
          (h) =>
            h.includes("company") ||
            h.includes("organization") ||
            h.includes("org"),
        );
        const job_idx = headers.findIndex(
          (h) =>
            h.includes("job") || h.includes("title") || h.includes("position"),
        );
        const birthday_idx = headers.findIndex(
          (h) => h.includes("birthday") || h.includes("birth"),
        );
        const notes_idx = headers.findIndex((h) => h.includes("note"));

        const contacts_to_import: ContactFormData[] = [];

        for (let i = 1; i < lines.length; i++) {
          const values = parse_csv_line(lines[i]);

          if (values.every((v) => !v)) continue;

          let first_name = "";
          let last_name = "";

          if (first_name_idx >= 0) {
            first_name = values[first_name_idx] || "";
          }
          if (last_name_idx >= 0) {
            last_name = values[last_name_idx] || "";
          }
          if (!first_name && !last_name && name_idx >= 0) {
            const full_name = values[name_idx] || "";
            const parts = full_name.split(" ");

            first_name = parts[0] || "";
            last_name = parts.slice(1).join(" ");
          }

          if (!first_name && !last_name) continue;

          const email = email_idx >= 0 ? values[email_idx] : "";
          const emails = email
            ? email
                .split(";")
                .map((e) => e.trim())
                .filter(Boolean)
            : [];

          contacts_to_import.push({
            first_name,
            last_name,
            emails,
            phone: phone_idx >= 0 ? values[phone_idx] : undefined,
            company: company_idx >= 0 ? values[company_idx] : undefined,
            job_title: job_idx >= 0 ? values[job_idx] : undefined,
            birthday: birthday_idx >= 0 ? values[birthday_idx] : undefined,
            notes: notes_idx >= 0 ? values[notes_idx] : undefined,
            is_favorite: false,
          });
        }

        if (contacts_to_import.length === 0) {
          set_error("No valid contacts found in CSV");
          set_is_importing(false);

          return;
        }

        set_import_progress({ current: 0, total: contacts_to_import.length });

        const imported_contacts: DecryptedContact[] = [];

        for (let i = 0; i < contacts_to_import.length; i++) {
          const contact_data = contacts_to_import[i];

          set_import_progress({
            current: i + 1,
            total: contacts_to_import.length,
          });

          const response = await create_contact_encrypted(contact_data);

          if (response.data) {
            imported_contacts.push({
              id: response.data.id,
              ...contact_data,
              is_favorite: false,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            });
          }
        }

        set_contacts((prev) => [...prev, ...imported_contacts]);
        set_import_progress(null);
      } catch (err) {
        set_error(
          err instanceof Error ? err.message : "Failed to import contacts",
        );
      } finally {
        set_is_importing(false);
        if (file_input_ref.current) {
          file_input_ref.current.value = "";
        }
      }
    },
    [],
  );

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
      if (is_compose_open) {
        set_compose_recipients((prev) => {
          const existing = prev
            .split(",")
            .map((e) => e.trim())
            .filter(Boolean);

          if (existing.includes(email)) return prev;

          return [...existing, email].join(", ");
        });
      } else {
        set_compose_recipients(email);
        set_is_compose_open(true);
      }
    },
    [is_compose_open],
  );

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
      set_compose_recipients(emails.join(", "));
      set_is_compose_open(true);
    }
  }, [contacts, selected_ids]);

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

  const full_name = selected_contact
    ? `${selected_contact.first_name} ${selected_contact.last_name}`.trim()
    : "";

  return (
    <>
      <input
        ref={file_input_ref}
        accept=".csv"
        className="hidden"
        type="file"
        onChange={handle_import_csv}
      />
      <div className="flex h-full">
        <div
          className="w-full md:w-1/2 flex-shrink-0 flex flex-col border-r"
          style={{ borderColor: "var(--border-primary)" }}
        >
          <div
            className="flex items-center gap-2 px-4 py-3 border-b"
            style={{ borderColor: "var(--border-primary)" }}
          >
            <div className="md:hidden">
              <MobileMenuButton on_click={on_mobile_menu_toggle} />
            </div>
            <h1
              className="text-[15px] font-semibold flex-1"
              style={{ color: "var(--text-primary)" }}
            >
              Contacts
            </h1>
            {is_loading ? (
              <Skeleton className="w-4 h-4 rounded" />
            ) : (
              <span
                className="text-[12px] tabular-nums"
                style={{ color: "var(--text-muted)" }}
              >
                {contacts.length}
              </span>
            )}
            <Button
              className="h-8 w-8"
              disabled={is_importing}
              size="icon"
              variant="ghost"
              onClick={() => set_is_import_modal_open(true)}
            >
              <ArrowUpTrayIcon
                className="w-4 h-4"
                style={{ color: "var(--text-secondary)" }}
              />
            </Button>
            <div
              className="hidden sm:flex items-center rounded-md p-0.5"
              style={{ backgroundColor: "var(--bg-secondary)" }}
            >
              <button
                className="p-1.5 rounded transition-colors"
                style={{
                  backgroundColor:
                    view_mode === "list" ? "var(--bg-primary)" : "transparent",
                  color:
                    view_mode === "list"
                      ? "var(--text-primary)"
                      : "var(--text-muted)",
                }}
                onClick={() => set_view_mode("list")}
              >
                <ListBulletIcon className="w-3.5 h-3.5" />
              </button>
              <button
                className="p-1.5 rounded transition-colors"
                style={{
                  backgroundColor:
                    view_mode === "compact"
                      ? "var(--bg-primary)"
                      : "transparent",
                  color:
                    view_mode === "compact"
                      ? "var(--text-primary)"
                      : "var(--text-muted)",
                }}
                onClick={() => set_view_mode("compact")}
              >
                <Squares2X2Icon className="w-3.5 h-3.5" />
              </button>
            </div>
            <button
              className="h-8 px-3 text-[13px] font-semibold rounded-lg flex items-center gap-1.5 transition-all duration-150 hover:brightness-110"
              style={{
                background:
                  "linear-gradient(to bottom, #6b8aff 0%, #4f6ef7 50%, #3b5ae8 100%)",
                color: "#ffffff",
                border: "1px solid rgba(255, 255, 255, 0.15)",
                borderBottom: "1px solid rgba(0, 0, 0, 0.15)",
              }}
              onClick={handle_add_click}
            >
              <PlusIcon className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Add</span>
            </button>
          </div>

          {import_progress && (
            <div
              className="px-4 py-2 border-b"
              style={{
                borderColor: "var(--border-primary)",
                backgroundColor: "var(--bg-secondary)",
              }}
            >
              <div className="flex items-center justify-between mb-1">
                <span
                  className="text-[12px]"
                  style={{ color: "var(--text-secondary)" }}
                >
                  Importing contacts...
                </span>
                <span
                  className="text-[12px] tabular-nums"
                  style={{ color: "var(--text-muted)" }}
                >
                  {import_progress.current}/{import_progress.total}
                </span>
              </div>
              <div
                className="h-1.5 rounded-full overflow-hidden"
                style={{ backgroundColor: "var(--border-secondary)" }}
              >
                <div
                  className="h-full bg-blue-500 transition-all duration-300"
                  style={{
                    width: `${(import_progress.current / import_progress.total) * 100}%`,
                  }}
                />
              </div>
            </div>
          )}

          <div className="px-3 py-2">
            <div className="relative">
              <MagnifyingGlassIcon
                className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4"
                style={{ color: "var(--text-muted)" }}
              />
              <Input
                ref={search_input_ref}
                className="pl-9 h-9 text-[13px]"
                placeholder="Search contacts..."
                style={{ backgroundColor: "var(--bg-secondary)" }}
                value={search_query}
                onChange={(e) => set_search_query(e.target.value)}
              />
              {search_query && (
                <button
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-black/5 dark:hover:bg-white/5"
                  onClick={() => set_search_query("")}
                >
                  <XMarkIcon
                    className="w-3.5 h-3.5"
                    style={{ color: "var(--text-muted)" }}
                  />
                </button>
              )}
            </div>
          </div>

          <div
            className="flex items-center gap-2 px-3 py-2 border-b"
            style={{ borderColor: "var(--border-primary)" }}
          >
            <div className="flex-shrink-0">
              <Checkbox
                checked={selection_state.all_selected}
                indeterminate={selection_state.some_selected}
                onCheckedChange={handle_toggle_select_all}
              />
            </div>

            {has_selection ? (
              <div className="flex items-center gap-1 flex-1">
                <span
                  className="text-[12px] font-medium mr-1"
                  style={{ color: "var(--text-primary)" }}
                >
                  {selection_state.selected_count}
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
                      style={{ color: "var(--text-secondary)" }}
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
                      style={{ color: "var(--text-secondary)" }}
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
                  className="text-[12px]"
                  style={{ color: "var(--text-muted)" }}
                >
                  {filtered_contacts.length === contacts.length
                    ? `${contacts.length}`
                    : `${filtered_contacts.length}/${contacts.length}`}
                </span>

                <div className="flex items-center gap-0.5">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        className="h-7 px-2 gap-1 text-[11px]"
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
                    <DropdownMenuContent align="end" className="w-40">
                      <DropdownMenuItem onClick={() => set_filter_by("all")}>
                        All
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => set_filter_by("favorites")}
                      >
                        <StarIconSolid className="h-3.5 w-3.5 mr-2 text-amber-400" />
                        Favorites
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => set_filter_by("upcoming_birthdays")}
                      >
                        <CakeIcon
                          className="h-3.5 w-3.5 mr-2"
                          style={{ color: "var(--text-muted)" }}
                        />
                        Birthdays
                        {upcoming_birthdays_count > 0 && (
                          <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded-full bg-blue-500/10 text-blue-500">
                            {upcoming_birthdays_count}
                          </span>
                        )}
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={() => set_filter_by("has_email")}
                      >
                        Has email
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => set_filter_by("has_phone")}
                      >
                        Has phone
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => set_filter_by("has_company")}
                      >
                        Has company
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        className="h-7 px-2 gap-1 text-[11px]"
                        size="sm"
                        variant="ghost"
                      >
                        {sort_by === "name_desc" ? (
                          <BarsArrowUpIcon
                            className="h-3.5 w-3.5"
                            style={{ color: "var(--text-muted)" }}
                          />
                        ) : (
                          <BarsArrowDownIcon
                            className="h-3.5 w-3.5"
                            style={{ color: "var(--text-muted)" }}
                          />
                        )}
                        <span style={{ color: "var(--text-muted)" }}>
                          {sort_label}
                        </span>
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-36">
                      <DropdownMenuItem onClick={() => set_sort_by("name_asc")}>
                        Name A-Z
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => set_sort_by("name_desc")}
                      >
                        Name Z-A
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => set_sort_by("company")}>
                        Company
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => set_sort_by("recent")}>
                        Recent
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button className="h-7 w-7" size="icon" variant="ghost">
                        <ArrowDownTrayIcon
                          className="h-3.5 w-3.5"
                          style={{ color: "var(--text-muted)" }}
                        />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-40">
                      <DropdownMenuItem
                        onClick={() => handle_export_contacts(false)}
                      >
                        Export all
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            )}
          </div>

          {error && (
            <div className="mx-3 mt-2 p-2 rounded-lg bg-red-500/10 border border-red-500/20">
              <p className="text-[12px] text-red-500">{error}</p>
            </div>
          )}

          <div className="flex-1 flex overflow-hidden">
            <div ref={list_container_ref} className="flex-1 overflow-y-auto">
              {is_loading ? (
                <div>
                  {Array.from({ length: 8 }).map((_, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-3 px-3 py-2 border-b"
                      style={{ borderColor: "var(--border-secondary)" }}
                    >
                      <Skeleton className="w-4 h-4 rounded" />
                      <Skeleton className="w-8 h-8 rounded-full" />
                      <div className="flex-1 min-w-0">
                        <Skeleton className="h-4 w-32 mb-1" />
                        <Skeleton className="h-3 w-44" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : contacts.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 px-6">
                  <UserPlusIcon
                    className="w-8 h-8 mb-3"
                    style={{ color: "var(--text-muted)" }}
                  />
                  <p
                    className="text-[14px] font-medium mb-1"
                    style={{ color: "var(--text-primary)" }}
                  >
                    No contacts
                  </p>
                  <p
                    className="text-[12px] text-center mb-4"
                    style={{ color: "var(--text-muted)" }}
                  >
                    Add contacts to get started
                  </p>
                  <button
                    className="h-8 px-3 text-[12px] font-semibold rounded-lg flex items-center gap-1.5 transition-all duration-150 hover:brightness-110"
                    style={{
                      background:
                        "linear-gradient(to bottom, #6b8aff 0%, #4f6ef7 50%, #3b5ae8 100%)",
                      color: "#ffffff",
                      border: "1px solid rgba(255, 255, 255, 0.15)",
                      borderBottom: "1px solid rgba(0, 0, 0, 0.15)",
                    }}
                    onClick={handle_add_click}
                  >
                    <PlusIcon className="w-3.5 h-3.5" />
                    Add contact
                  </button>
                </div>
              ) : filtered_contacts.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16">
                  <MagnifyingGlassIcon
                    className="w-8 h-8 mb-3"
                    style={{ color: "var(--text-muted)" }}
                  />
                  <p
                    className="text-[14px] font-medium"
                    style={{ color: "var(--text-primary)" }}
                  >
                    No results
                  </p>
                </div>
              ) : (
                filtered_contacts.map((contact, index) => {
                  const name =
                    `${contact.first_name} ${contact.last_name}`.trim();
                  const primary_email = contact.emails[0];
                  const is_selected_item = selected_ids.has(contact.id);
                  const is_active = selected_contact?.id === contact.id;
                  const is_focused = focused_index === index;
                  const days_until_birthday = contact.birthday
                    ? get_days_until_birthday(contact.birthday)
                    : null;

                  return (
                    <div
                      key={contact.id}
                      ref={(el) => {
                        if (el) contact_refs.current.set(contact.id, el);
                        else contact_refs.current.delete(contact.id);
                      }}
                      className={`group flex items-center gap-3 px-3 cursor-pointer transition-colors border-b ${view_mode === "compact" ? "py-1.5" : "py-2"}`}
                      role="button"
                      style={{
                        backgroundColor:
                          is_active || is_focused
                            ? "var(--bg-secondary)"
                            : is_selected_item
                              ? "rgba(59, 130, 246, 0.06)"
                              : "transparent",
                        borderColor: "var(--border-secondary)",
                        outline:
                          is_focused && !is_active
                            ? "2px solid rgba(59, 130, 246, 0.5)"
                            : "none",
                        outlineOffset: "-2px",
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
                        if (!is_active && !is_selected_item && !is_focused) {
                          e.currentTarget.style.backgroundColor =
                            "var(--bg-hover)";
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (!is_active && !is_selected_item && !is_focused) {
                          e.currentTarget.style.backgroundColor = "transparent";
                        }
                      }}
                    >
                      <div
                        className="flex-shrink-0"
                        role="button"
                        tabIndex={0}
                        onClick={(e) => e.stopPropagation()}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.stopPropagation();
                          }
                        }}
                      >
                        <Checkbox
                          checked={is_selected_item}
                          onCheckedChange={() =>
                            handle_toggle_select(contact.id)
                          }
                        />
                      </div>
                      <ProfileAvatar
                        className="flex-shrink-0"
                        email={primary_email}
                        image_url={contact.avatar_url}
                        name={name}
                        size={view_mode === "compact" ? "xs" : "sm"}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span
                            className={`font-medium truncate ${view_mode === "compact" ? "text-[12px]" : "text-[13px]"}`}
                            style={{ color: "var(--text-primary)" }}
                          >
                            {name || "Unnamed"}
                          </span>
                          {contact.is_favorite && (
                            <StarIconSolid className="w-3 h-3 text-amber-400 flex-shrink-0" />
                          )}
                          {days_until_birthday !== null &&
                            days_until_birthday <= 7 && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-pink-500/10 text-pink-500 flex-shrink-0">
                                {days_until_birthday === 0
                                  ? "Today!"
                                  : days_until_birthday === 1
                                    ? "Tomorrow"
                                    : `${days_until_birthday}d`}
                              </span>
                            )}
                        </div>
                        {primary_email && view_mode !== "compact" && (
                          <p
                            className="text-[11px] truncate"
                            style={{ color: "var(--text-muted)" }}
                          >
                            {primary_email}
                          </p>
                        )}
                      </div>
                      <div
                        className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                        role="button"
                        tabIndex={0}
                        onClick={(e) => e.stopPropagation()}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.stopPropagation();
                          }
                        }}
                      >
                        {primary_email && (
                          <button
                            className="p-1.5 rounded hover:bg-black/5 dark:hover:bg-white/5"
                            onClick={() => handle_compose_email(primary_email)}
                          >
                            <EnvelopeIcon
                              className="w-3.5 h-3.5"
                              style={{ color: "var(--text-muted)" }}
                            />
                          </button>
                        )}
                        <button
                          className="p-1.5 rounded hover:bg-black/5 dark:hover:bg-white/5"
                          onClick={() =>
                            primary_email &&
                            handle_copy(primary_email, `quick-${contact.id}`)
                          }
                        >
                          {copied_field === `quick-${contact.id}` ? (
                            <CheckIcon className="w-3.5 h-3.5 text-green-500" />
                          ) : (
                            <ClipboardDocumentIcon
                              className="w-3.5 h-3.5"
                              style={{ color: "var(--text-muted)" }}
                            />
                          )}
                        </button>
                      </div>
                      <ChevronRightIcon
                        className="w-4 h-4 flex-shrink-0 opacity-30 group-hover:opacity-0"
                        style={{ color: "var(--text-muted)" }}
                      />
                    </div>
                  );
                })
              )}
            </div>

            {!is_loading &&
              filtered_contacts.length > 10 &&
              sort_by === "name_asc" && (
                <div
                  className="hidden sm:flex flex-col items-center justify-center w-5 py-2 border-l"
                  style={{ borderColor: "var(--border-secondary)" }}
                >
                  {ALPHABET.map((letter) => {
                    const has_contacts = alphabetical_index.has(letter);

                    return (
                      <button
                        key={letter}
                        className={`text-[9px] leading-tight py-0.5 w-full text-center transition-colors ${has_contacts ? "hover:bg-black/5 dark:hover:bg-white/5" : ""}`}
                        disabled={!has_contacts}
                        style={{
                          color: has_contacts
                            ? "var(--text-secondary)"
                            : "var(--text-muted)",
                          opacity: has_contacts ? 1 : 0.3,
                        }}
                        onClick={() => scroll_to_letter(letter)}
                      >
                        {letter}
                      </button>
                    );
                  })}
                </div>
              )}
          </div>
        </div>

        <div className="hidden md:flex md:w-1/2 flex-col min-w-0">
          <AnimatePresence mode="wait">
            {selected_contact ? (
              <motion.div
                key={selected_contact.id}
                animate={{ opacity: 1 }}
                className="flex-1 flex flex-col"
                exit={{ opacity: 0 }}
                initial={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
              >
                <div
                  className="flex items-center justify-between px-6 py-3 border-b"
                  style={{ borderColor: "var(--border-primary)" }}
                >
                  <h2
                    className="text-[14px] font-medium"
                    style={{ color: "var(--text-primary)" }}
                  >
                    Contact Details
                  </h2>
                  <div className="flex items-center gap-1">
                    <Button
                      className="h-8 px-3 text-[12px] gap-1.5"
                      size="sm"
                      variant={show_history ? "default" : "outline"}
                      onClick={() => set_show_history(!show_history)}
                    >
                      <DocumentTextIcon className="w-3.5 h-3.5" />
                      History
                    </Button>
                    <Button
                      className="h-8 px-3 text-[12px] gap-1.5"
                      size="sm"
                      variant="outline"
                      onClick={() => handle_edit(selected_contact)}
                    >
                      <PencilIcon className="w-3.5 h-3.5" />
                      Edit
                    </Button>
                    <Button
                      className="h-8 px-3 text-[12px] gap-1.5 text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10"
                      size="sm"
                      variant="outline"
                      onClick={() => handle_delete_request(selected_contact)}
                    >
                      <TrashIcon className="w-3.5 h-3.5" />
                      Delete
                    </Button>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto p-6">
                  <AnimatePresence mode="wait">
                    {show_history ? (
                      <motion.div
                        key="history"
                        animate={{ opacity: 1 }}
                        className="max-w-lg mx-auto"
                        exit={{ opacity: 0 }}
                        initial={{ opacity: 0 }}
                        transition={{ duration: 0.15 }}
                      >
                        <ContactHistoryPanel contact_id={selected_contact.id} />
                      </motion.div>
                    ) : (
                  <motion.div
                    key="details"
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    initial={{ opacity: 0 }}
                    transition={{ duration: 0.15 }}
                  >
                    <div className="flex items-center gap-4 mb-6">
                      <ProfileAvatar
                        email={selected_contact.emails[0]}
                        image_url={selected_contact.avatar_url}
                        name={full_name}
                        size="xl"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <h3
                            className="text-lg font-semibold truncate"
                            style={{ color: "var(--text-primary)" }}
                          >
                            {full_name || "Unnamed Contact"}
                          </h3>
                          {selected_contact.is_favorite && (
                            <StarIconSolid className="w-4 h-4 text-amber-400 flex-shrink-0" />
                          )}
                        </div>
                        {(selected_contact.job_title || selected_contact.company) && (
                          <p
                            className="text-[13px] truncate"
                            style={{ color: "var(--text-secondary)" }}
                          >
                            {selected_contact.job_title && selected_contact.company
                              ? `${selected_contact.job_title} at ${selected_contact.company}`
                              : selected_contact.job_title || selected_contact.company}
                          </p>
                        )}
                      </div>
                      {selected_contact.emails[0] && (
                        <Button
                          className="h-9 px-4 text-[13px] gap-2 flex-shrink-0"
                          onClick={() => handle_compose_email(selected_contact.emails[0])}
                        >
                          <PaperAirplaneIcon className="w-3.5 h-3.5" />
                          Email
                        </Button>
                      )}
                    </div>

                    <div
                      className="rounded-xl border divide-y"
                      style={{
                        borderColor: "var(--border-secondary)",
                        backgroundColor: "var(--bg-secondary)",
                      }}
                    >
                      {selected_contact.emails.map((email, index) => (
                        <div
                          key={`email-${index}`}
                          className="flex items-center gap-3 px-4 py-3 group cursor-pointer hover:bg-black/[0.02] dark:hover:bg-white/[0.02]"
                          role="button"
                          tabIndex={0}
                          onClick={() => handle_compose_email(email)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              handle_compose_email(email);
                            }
                          }}
                        >
                          <EnvelopeIcon
                            className="w-4 h-4 flex-shrink-0"
                            style={{ color: "var(--text-muted)" }}
                          />
                          <span
                            className="text-[13px] flex-1 truncate"
                            style={{ color: "var(--text-primary)" }}
                          >
                            {email}
                          </span>
                          <button
                            className="p-1.5 rounded opacity-0 group-hover:opacity-100 hover:bg-black/5 dark:hover:bg-white/5"
                            onClick={(e) => {
                              e.stopPropagation();
                              handle_copy(email, `email-${index}`);
                            }}
                          >
                            {copied_field === `email-${index}` ? (
                              <CheckIcon className="w-3.5 h-3.5 text-green-500" />
                            ) : (
                              <ClipboardDocumentIcon
                                className="w-3.5 h-3.5"
                                style={{ color: "var(--text-muted)" }}
                              />
                            )}
                          </button>
                        </div>
                      ))}

                      {selected_contact.phone && (
                        <div className="flex items-center gap-3 px-4 py-3 group">
                          <PhoneIcon
                            className="w-4 h-4 flex-shrink-0"
                            style={{ color: "var(--text-muted)" }}
                          />
                          <span
                            className="text-[13px] flex-1"
                            style={{ color: "var(--text-primary)" }}
                          >
                            {selected_contact.phone}
                          </span>
                          <button
                            className="p-1.5 rounded opacity-0 group-hover:opacity-100 hover:bg-black/5 dark:hover:bg-white/5"
                            onClick={() => handle_copy(selected_contact.phone!, "phone")}
                          >
                            {copied_field === "phone" ? (
                              <CheckIcon className="w-3.5 h-3.5 text-green-500" />
                            ) : (
                              <ClipboardDocumentIcon
                                className="w-3.5 h-3.5"
                                style={{ color: "var(--text-muted)" }}
                              />
                            )}
                          </button>
                        </div>
                      )}
                    </div>

                    {(selected_contact.company ||
                      selected_contact.relationship ||
                      selected_contact.birthday) && (
                      <div
                        className="mt-4 rounded-xl border"
                        style={{
                          borderColor: "var(--border-secondary)",
                          backgroundColor: "var(--bg-secondary)",
                        }}
                      >
                        <div className="grid grid-cols-2 gap-px" style={{ backgroundColor: "var(--border-secondary)" }}>
                          {selected_contact.company && (
                            <div className="px-4 py-3" style={{ backgroundColor: "var(--bg-secondary)" }}>
                              <p className="text-[11px] uppercase tracking-wider mb-0.5" style={{ color: "var(--text-muted)" }}>
                                Company
                              </p>
                              <p className="text-[13px] truncate" style={{ color: "var(--text-primary)" }}>
                                {selected_contact.company}
                              </p>
                            </div>
                          )}
                          {selected_contact.relationship && (
                            <div className="px-4 py-3" style={{ backgroundColor: "var(--bg-secondary)" }}>
                              <p className="text-[11px] uppercase tracking-wider mb-0.5" style={{ color: "var(--text-muted)" }}>
                                Relationship
                              </p>
                              <p className="text-[13px]" style={{ color: "var(--text-primary)" }}>
                                {RELATIONSHIP_LABELS[selected_contact.relationship] || selected_contact.relationship}
                              </p>
                            </div>
                          )}
                          {selected_contact.birthday && (
                            <div className="px-4 py-3" style={{ backgroundColor: "var(--bg-secondary)" }}>
                              <p className="text-[11px] uppercase tracking-wider mb-0.5" style={{ color: "var(--text-muted)" }}>
                                Birthday
                              </p>
                              <p className="text-[13px]" style={{ color: "var(--text-primary)" }}>
                                {new Date(selected_contact.birthday).toLocaleDateString(undefined, {
                                  month: "short",
                                  day: "numeric",
                                })}
                              </p>
                            </div>
                          )}
                          {selected_contact.job_title && !selected_contact.company && (
                            <div className="px-4 py-3" style={{ backgroundColor: "var(--bg-secondary)" }}>
                              <p className="text-[11px] uppercase tracking-wider mb-0.5" style={{ color: "var(--text-muted)" }}>
                                Title
                              </p>
                              <p className="text-[13px] truncate" style={{ color: "var(--text-primary)" }}>
                                {selected_contact.job_title}
                              </p>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {selected_contact.address &&
                      (selected_contact.address.street ||
                        selected_contact.address.city ||
                        selected_contact.address.country) && (
                        <div
                          className="mt-4 rounded-xl border px-4 py-3"
                          style={{
                            borderColor: "var(--border-secondary)",
                            backgroundColor: "var(--bg-secondary)",
                          }}
                        >
                          <div className="flex items-start gap-3">
                            <MapPinIcon
                              className="w-4 h-4 flex-shrink-0 mt-0.5"
                              style={{ color: "var(--text-muted)" }}
                            />
                            <p className="text-[13px]" style={{ color: "var(--text-primary)" }}>
                              {[
                                selected_contact.address.street,
                                [
                                  selected_contact.address.city,
                                  selected_contact.address.state,
                                  selected_contact.address.postal_code,
                                ]
                                  .filter(Boolean)
                                  .join(", "),
                                selected_contact.address.country?.toUpperCase(),
                              ]
                                .filter(Boolean)
                                .join(" · ")}
                            </p>
                          </div>
                        </div>
                      )}

                    {selected_contact.social_links &&
                      (selected_contact.social_links.website ||
                        selected_contact.social_links.linkedin ||
                        selected_contact.social_links.twitter ||
                        selected_contact.social_links.github) && (
                        <div className="mt-4 flex flex-wrap gap-2">
                          {selected_contact.social_links.website && (
                            <a
                              className="inline-flex items-center gap-1.5 text-[12px] px-3 py-1.5 rounded-full border transition-colors hover:bg-black/[0.02] dark:hover:bg-white/[0.02]"
                              href={
                                selected_contact.social_links.website.startsWith("http")
                                  ? selected_contact.social_links.website
                                  : `https://${selected_contact.social_links.website}`
                              }
                              rel="noopener noreferrer"
                              style={{
                                borderColor: "var(--border-secondary)",
                                color: "var(--text-secondary)",
                              }}
                              target="_blank"
                            >
                              <GlobeAltIcon className="w-3.5 h-3.5" />
                              Website
                            </a>
                          )}
                          {selected_contact.social_links.linkedin && (
                            <a
                              className="inline-flex items-center gap-1.5 text-[12px] px-3 py-1.5 rounded-full border transition-colors hover:bg-black/[0.02] dark:hover:bg-white/[0.02]"
                              href={
                                selected_contact.social_links.linkedin.includes("linkedin.com")
                                  ? selected_contact.social_links.linkedin
                                  : `https://linkedin.com/in/${selected_contact.social_links.linkedin}`
                              }
                              rel="noopener noreferrer"
                              style={{
                                borderColor: "var(--border-secondary)",
                                color: "var(--text-secondary)",
                              }}
                              target="_blank"
                            >
                              LinkedIn
                            </a>
                          )}
                          {selected_contact.social_links.twitter && (
                            <a
                              className="inline-flex items-center gap-1.5 text-[12px] px-3 py-1.5 rounded-full border transition-colors hover:bg-black/[0.02] dark:hover:bg-white/[0.02]"
                              href={
                                selected_contact.social_links.twitter.includes("twitter.com") ||
                                selected_contact.social_links.twitter.includes("x.com")
                                  ? selected_contact.social_links.twitter
                                  : `https://x.com/${selected_contact.social_links.twitter.replace("@", "")}`
                              }
                              rel="noopener noreferrer"
                              style={{
                                borderColor: "var(--border-secondary)",
                                color: "var(--text-secondary)",
                              }}
                              target="_blank"
                            >
                              X
                            </a>
                          )}
                          {selected_contact.social_links.github && (
                            <a
                              className="inline-flex items-center gap-1.5 text-[12px] px-3 py-1.5 rounded-full border transition-colors hover:bg-black/[0.02] dark:hover:bg-white/[0.02]"
                              href={
                                selected_contact.social_links.github.includes("github.com")
                                  ? selected_contact.social_links.github
                                  : `https://github.com/${selected_contact.social_links.github}`
                              }
                              rel="noopener noreferrer"
                              style={{
                                borderColor: "var(--border-secondary)",
                                color: "var(--text-secondary)",
                              }}
                              target="_blank"
                            >
                              GitHub
                            </a>
                          )}
                        </div>
                      )}

                    {selected_contact.notes && (
                      <div
                        className="mt-4 rounded-xl border px-4 py-3"
                        style={{
                          borderColor: "var(--border-secondary)",
                          backgroundColor: "var(--bg-secondary)",
                        }}
                      >
                        <p className="text-[11px] uppercase tracking-wider mb-1" style={{ color: "var(--text-muted)" }}>
                          Notes
                        </p>
                        <p
                          className="text-[13px] whitespace-pre-wrap"
                          style={{ color: "var(--text-primary)" }}
                        >
                          {selected_contact.notes}
                        </p>
                      </div>
                    )}
                  </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="empty"
                animate={{ opacity: 1 }}
                className="flex-1 flex flex-col items-center justify-center px-8"
                exit={{ opacity: 0 }}
                initial={{ opacity: 0 }}
              >
                <UserPlusIcon
                  className="w-10 h-10 mb-4"
                  style={{ color: "var(--text-muted)" }}
                />
                <p
                  className="text-[15px] font-medium mb-1"
                  style={{ color: "var(--text-primary)" }}
                >
                  No contact selected
                </p>
                <p
                  className="text-[13px] text-center max-w-[240px]"
                  style={{ color: "var(--text-muted)" }}
                >
                  Select a contact from the list to view their details
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

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
        message={`Are you sure you want to delete ${contact_to_delete ? `${contact_to_delete.first_name} ${contact_to_delete.last_name}`.trim() : "this contact"}? This action cannot be undone.`}
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

      <ComposeModal
        initial_to={compose_recipients}
        is_open={is_compose_open}
        on_close={() => {
          set_is_compose_open(false);
          set_compose_recipients("");
        }}
      />

      <AnimatePresence>
        {is_import_modal_open && (
          <ContactImportModal
            on_close={() => set_is_import_modal_open(false)}
            on_import_complete={(count) => {
              set_is_import_modal_open(false);
              if (count > 0) {
                fetch_contacts();
              }
            }}
          />
        )}
      </AnimatePresence>
    </>
  );
}
