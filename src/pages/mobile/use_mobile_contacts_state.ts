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
import type { DecryptedContact, ContactFormData } from "@/types/contacts";
import type { CreateTab } from "./mobile_contact_form_view";

import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { Capacitor } from "@capacitor/core";

import {
  list_contacts,
  decrypt_contacts,
  create_contact_encrypted,
  update_contact_encrypted,
  delete_contact,
} from "@/services/api/contacts";
import { request_cache } from "@/services/api/request_cache";
import { use_i18n } from "@/lib/i18n/context";
import { use_should_reduce_motion } from "@/provider";
import { show_toast } from "@/components/toast/simple_toast";

const INITIAL_FORM: ContactFormData = {
  first_name: "",
  last_name: "",
  emails: [""],
  phone: "",
  company: "",
  job_title: "",
  birthday: "",
  notes: "",
  address: { street: "", city: "", state: "", postal_code: "", country: "" },
  social_links: { website: "", linkedin: "", twitter: "", github: "" },
};

function contact_to_form(contact: DecryptedContact): ContactFormData {
  return {
    first_name: contact.first_name,
    last_name: contact.last_name,
    emails: contact.emails.length > 0 ? [...contact.emails] : [""],
    phone: contact.phone ?? "",
    company: contact.company ?? "",
    job_title: contact.job_title ?? "",
    birthday: contact.birthday ?? "",
    notes: contact.notes ?? "",
    address: contact.address ?? {
      street: "",
      city: "",
      state: "",
      postal_code: "",
      country: "",
    },
    social_links: contact.social_links ?? {
      website: "",
      linkedin: "",
      twitter: "",
      github: "",
    },
    is_favorite: contact.is_favorite,
  };
}

export function use_mobile_contacts_state(on_compose: (to?: string) => void) {
  const { t } = use_i18n();
  const reduce_motion = use_should_reduce_motion();
  const [contacts, set_contacts] = useState<DecryptedContact[]>([]);
  const [is_loading, set_is_loading] = useState(true);
  const [search_query, set_search_query] = useState("");
  const [filter, set_filter] = useState<"all" | "favorites">("all");
  const [selected_contact, set_selected_contact] =
    useState<DecryptedContact | null>(null);
  const [show_create, set_show_create] = useState(false);
  const [editing_contact, set_editing_contact] =
    useState<DecryptedContact | null>(null);
  const [create_tab, set_create_tab] = useState<CreateTab>("basic");
  const [form_data, set_form_data] = useState<ContactFormData>({
    ...INITIAL_FORM,
    emails: [""],
  });
  const [is_saving, set_is_saving] = useState(false);
  const [is_syncing, set_is_syncing] = useState(false);
  const [show_sync_confirm, set_show_sync_confirm] = useState(false);
  const [is_select_mode, set_is_select_mode] = useState(false);
  const [selected_ids, set_selected_ids] = useState<Set<string>>(new Set());
  const [show_delete_confirm, set_show_delete_confirm] = useState(false);
  const long_press_timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const response = await list_contacts({ limit: 500 });

        if (cancelled || !response.data?.items) return;
        const decrypted = await decrypt_contacts(response.data.items);

        if (!cancelled) {
          set_contacts(decrypted);
        }
      } catch {
      } finally {
        if (!cancelled) set_is_loading(false);
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const handle_back = (e: Event) => {
      if (show_create) {
        e.preventDefault();
        set_show_create(false);
        set_editing_contact(null);
      } else if (is_select_mode) {
        e.preventDefault();
        set_is_select_mode(false);
        set_selected_ids(new Set());
      } else if (selected_contact) {
        e.preventDefault();
        set_selected_contact(null);
      }
    };

    window.addEventListener("capacitor:backbutton", handle_back);

    return () => {
      window.removeEventListener("capacitor:backbutton", handle_back);
    };
  }, [selected_contact, show_create, is_select_mode]);

  const reload_contacts = useCallback(async () => {
    try {
      request_cache.invalidate("contacts");
      const response = await list_contacts({ limit: 500 });

      if (response.data?.items) {
        const decrypted = await decrypt_contacts(response.data.items);

        set_contacts(decrypted);
      }
    } catch {}
  }, []);

  const handle_sync_contacts = useCallback(async () => {
    if (!Capacitor.isNativePlatform() || is_syncing) return;
    set_is_syncing(true);
    try {
      const { Contacts } = await import("@capacitor-community/contacts");

      let status = await Contacts.checkPermissions();

      if (status.contacts !== "granted") {
        status = await Contacts.requestPermissions();
      }
      if (status.contacts !== "granted") {
        show_toast(
          t("common.permission_denied" as never) || "Permission denied",
          "error",
        );

        return;
      }

      const result = await Contacts.getContacts({
        projection: {
          name: true,
          emails: true,
          phones: true,
          organization: true,
          birthday: true,
          note: true,
          postalAddresses: true,
          urls: true,
        },
      });
      const device_contacts = result.contacts || [];

      if (device_contacts.length === 0) {
        show_toast(t("common.no_contacts_found_device"), "info");

        return;
      }

      const existing_emails = new Set(
        contacts.flatMap((c) => c.emails.map((e) => e.toLowerCase())),
      );
      const existing_names = new Set(
        contacts
          .map((c) => `${c.first_name} ${c.last_name}`.toLowerCase().trim())
          .filter(Boolean),
      );
      let imported = 0;

      for (const dc of device_contacts) {
        const emails = (dc.emails || [])
          .map((e) => e.address)
          .filter((a): a is string => !!a && a.trim().length > 0);
        const first_name =
          dc.name?.given || dc.name?.display?.split(" ")[0] || "";
        const last_name = dc.name?.family || "";
        const phone = dc.phones?.[0]?.number || "";

        if (!first_name && !last_name && emails.length === 0 && !phone)
          continue;

        if (
          emails.length > 0 &&
          emails.every((e) => existing_emails.has(e.toLowerCase()))
        )
          continue;

        const full_name = `${first_name} ${last_name}`.toLowerCase().trim();

        if (emails.length === 0 && full_name && existing_names.has(full_name))
          continue;

        const company = dc.organization?.company || "";
        const job_title = dc.organization?.jobTitle || "";
        const birthday_obj = dc.birthday;
        const birthday = birthday_obj
          ? `${birthday_obj.year || "0000"}-${String(birthday_obj.month || 1).padStart(2, "0")}-${String(birthday_obj.day || 1).padStart(2, "0")}`
          : "";
        const notes = dc.note || "";
        const addr = dc.postalAddresses?.[0];
        const address = addr
          ? {
              street: addr.street || "",
              city: addr.city || "",
              state: addr.region || "",
              postal_code: addr.postcode || "",
              country: addr.country || "",
            }
          : { street: "", city: "", state: "", postal_code: "", country: "" };
        const website = dc.urls?.[0]?.url || "";

        try {
          const res = await create_contact_encrypted({
            first_name,
            last_name,
            emails,
            phone,
            company,
            job_title,
            birthday: birthday !== "0000-01-01" ? birthday : "",
            notes,
            address,
            social_links: { website, linkedin: "", twitter: "", github: "" },
          });

          if (res.error) continue;
          imported++;
          for (const e of emails) existing_emails.add(e.toLowerCase());
          if (full_name) existing_names.add(full_name);
        } catch {
          continue;
        }
      }
      await reload_contacts();
      if (imported === 0) {
        show_toast(t("common.no_new_contacts_imported"), "info");
      } else {
        show_toast(
          `${imported} ${t("common.contacts" as never).toLowerCase()} imported`,
          "success",
        );
      }
    } catch (err) {
      if (import.meta.env.DEV) console.error("Contact sync failed:", err);
      show_toast(t("errors.generic"), "error");
    } finally {
      set_is_syncing(false);
    }
  }, [contacts, is_syncing, reload_contacts, t]);

  const filtered_contacts = useMemo(() => {
    let result = contacts;

    if (filter === "favorites") {
      result = result.filter((c) => c.is_favorite);
    }

    if (!search_query.trim()) return result;
    const q = search_query.toLowerCase();

    return result.filter(
      (c) =>
        c.first_name.toLowerCase().includes(q) ||
        c.last_name.toLowerCase().includes(q) ||
        c.emails.some((e) => e.toLowerCase().includes(q)) ||
        (c.company && c.company.toLowerCase().includes(q)) ||
        (c.phone && c.phone.includes(q)),
    );
  }, [contacts, search_query, filter]);

  const grouped = useMemo(() => {
    const groups: Record<string, DecryptedContact[]> = {};

    for (const contact of filtered_contacts) {
      const letter = (contact.first_name || contact.last_name || "#")
        .charAt(0)
        .toUpperCase();
      const key = /[A-Z]/.test(letter) ? letter : "#";

      if (!groups[key]) groups[key] = [];
      groups[key].push(contact);
    }

    return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b));
  }, [filtered_contacts]);

  const handle_contact_press = useCallback((contact: DecryptedContact) => {
    set_selected_contact(contact);
  }, []);

  const handle_send_email = useCallback(
    (email: string) => {
      set_selected_contact(null);
      on_compose(email);
    },
    [on_compose],
  );

  const handle_copy = useCallback(
    (text: string) => {
      navigator.clipboard
        .writeText(text)
        .then(() => {
          show_toast(t("common.copied_to_clipboard"), "success");
        })
        .catch(() => {});
    },
    [t],
  );

  const handle_toggle_favorite = useCallback(
    async (contact: DecryptedContact) => {
      const updated_form = contact_to_form(contact);

      updated_form.is_favorite = !contact.is_favorite;
      try {
        await update_contact_encrypted(contact.id, updated_form);
        set_contacts((prev) =>
          prev.map((c) =>
            c.id === contact.id ? { ...c, is_favorite: !c.is_favorite } : c,
          ),
        );
        set_selected_contact((prev) =>
          prev && prev.id === contact.id
            ? { ...prev, is_favorite: !prev.is_favorite }
            : prev,
        );
      } catch {}
    },
    [],
  );

  const handle_delete_contact = useCallback(
    async (contact: DecryptedContact) => {
      try {
        await delete_contact(contact.id);
        set_contacts((prev) => prev.filter((c) => c.id !== contact.id));
        set_selected_contact(null);
        show_toast(t("common.delete") + " \u2713", "success");
      } catch {}
    },
    [t],
  );

  const exit_select_mode = useCallback(() => {
    set_is_select_mode(false);
    set_selected_ids(new Set());
  }, []);

  const toggle_select = useCallback((id: string) => {
    set_selected_ids((prev) => {
      const next = new Set(prev);

      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      if (next.size === 0) {
        set_is_select_mode(false);
      }

      return next;
    });
  }, []);

  const select_all = useCallback(() => {
    set_selected_ids(new Set(filtered_contacts.map((c) => c.id)));
  }, [filtered_contacts]);

  const deselect_all = useCallback(() => {
    set_selected_ids(new Set());
  }, []);

  const handle_mass_email = useCallback(() => {
    const selected = contacts.filter((c) => selected_ids.has(c.id));
    const emails = selected
      .flatMap((c) => c.emails)
      .filter(Boolean)
      .slice(0, 10);

    if (emails.length === 0) return;
    exit_select_mode();
    on_compose(emails.join(", "));
  }, [contacts, selected_ids, on_compose, exit_select_mode]);

  const handle_mass_delete = useCallback(async () => {
    const ids = Array.from(selected_ids);

    for (const id of ids) {
      try {
        await delete_contact(id);
      } catch {
        continue;
      }
    }
    set_contacts((prev) => prev.filter((c) => !selected_ids.has(c.id)));
    exit_select_mode();
    set_show_delete_confirm(false);
    show_toast(t("common.delete") + " \u2713", "success");
  }, [selected_ids, exit_select_mode, t]);

  const handle_mass_favorite = useCallback(async () => {
    const selected = contacts.filter((c) => selected_ids.has(c.id));
    const all_favorited = selected.every((c) => c.is_favorite);

    for (const contact of selected) {
      const updated_form = contact_to_form(contact);

      updated_form.is_favorite = !all_favorited;
      try {
        await update_contact_encrypted(contact.id, updated_form);
      } catch {
        continue;
      }
    }
    set_contacts((prev) =>
      prev.map((c) =>
        selected_ids.has(c.id) ? { ...c, is_favorite: !all_favorited } : c,
      ),
    );
    exit_select_mode();
  }, [contacts, selected_ids, exit_select_mode]);

  const handle_mass_copy_emails = useCallback(() => {
    const selected = contacts.filter((c) => selected_ids.has(c.id));
    const emails = selected.flatMap((c) => c.emails).filter(Boolean);

    if (emails.length === 0) return;
    navigator.clipboard
      .writeText(emails.join(", "))
      .then(() => {
        show_toast(t("common.copied_to_clipboard"), "success");
      })
      .catch(() => {});
    exit_select_mode();
  }, [contacts, selected_ids, t, exit_select_mode]);

  const handle_long_press_start = useCallback(
    (contact_id: string) => {
      if (is_select_mode) return;
      long_press_timer.current = setTimeout(() => {
        set_is_select_mode(true);
        set_selected_ids(new Set([contact_id]));
      }, 500);
    },
    [is_select_mode],
  );

  const handle_long_press_end = useCallback(() => {
    if (long_press_timer.current) {
      clearTimeout(long_press_timer.current);
      long_press_timer.current = null;
    }
  }, []);

  const update_form = useCallback((key: string, value: string) => {
    set_form_data((prev) => ({ ...prev, [key]: value }));
  }, []);

  const update_address = useCallback((key: string, value: string) => {
    set_form_data((prev) => ({
      ...prev,
      address: { ...prev.address!, [key]: value },
    }));
  }, []);

  const update_social = useCallback((key: string, value: string) => {
    set_form_data((prev) => ({
      ...prev,
      social_links: { ...prev.social_links!, [key]: value },
    }));
  }, []);

  const add_email_field = useCallback(() => {
    set_form_data((prev) => ({
      ...prev,
      emails: [...prev.emails, ""],
    }));
  }, []);

  const update_email_field = useCallback((index: number, value: string) => {
    set_form_data((prev) => ({
      ...prev,
      emails: prev.emails.map((e, i) => (i === index ? value : e)),
    }));
  }, []);

  const remove_email_field = useCallback((index: number) => {
    set_form_data((prev) => ({
      ...prev,
      emails: prev.emails.filter((_, i) => i !== index),
    }));
  }, []);

  const handle_open_create = useCallback(() => {
    set_editing_contact(null);
    set_form_data({ ...INITIAL_FORM, emails: [""] });
    set_create_tab("basic");
    set_show_create(true);
  }, []);

  const handle_open_edit = useCallback((contact: DecryptedContact) => {
    set_editing_contact(contact);
    set_form_data(contact_to_form(contact));
    set_create_tab("basic");
    set_show_create(true);
  }, []);

  const handle_save = useCallback(async () => {
    const valid_emails = form_data.emails.filter((e) => e.trim());

    if (valid_emails.length === 0) return;
    set_is_saving(true);
    try {
      const saved_form = { ...form_data, emails: valid_emails };

      if (editing_contact) {
        const result = await update_contact_encrypted(
          editing_contact.id,
          saved_form,
        );

        if (result.data?.success) {
          set_contacts((prev) =>
            prev.map((c) =>
              c.id === editing_contact.id
                ? {
                    ...c,
                    first_name: saved_form.first_name,
                    last_name: saved_form.last_name,
                    emails: saved_form.emails,
                    phone: saved_form.phone || undefined,
                    company: saved_form.company || undefined,
                    job_title: saved_form.job_title || undefined,
                    birthday: saved_form.birthday || undefined,
                    notes: saved_form.notes || undefined,
                    address: saved_form.address,
                    social_links: saved_form.social_links,
                    is_favorite: saved_form.is_favorite ?? c.is_favorite,
                  }
                : c,
            ),
          );
        }
      } else {
        const result = await create_contact_encrypted(saved_form);

        if (result.data?.success && result.data.id) {
          const new_contact: DecryptedContact = {
            id: result.data.id,
            first_name: saved_form.first_name,
            last_name: saved_form.last_name,
            emails: saved_form.emails,
            phone: saved_form.phone || undefined,
            company: saved_form.company || undefined,
            job_title: saved_form.job_title || undefined,
            birthday: saved_form.birthday || undefined,
            notes: saved_form.notes || undefined,
            address: saved_form.address,
            social_links: saved_form.social_links,
            is_favorite: saved_form.is_favorite ?? false,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          };

          set_contacts((prev) => [new_contact, ...prev]);
        }
      }
      set_show_create(false);
      set_selected_contact(null);
    } catch {
    } finally {
      set_is_saving(false);
    }
  }, [form_data, editing_contact]);

  const favorites_count = useMemo(
    () => contacts.filter((c) => c.is_favorite).length,
    [contacts],
  );

  const create_tabs: { id: CreateTab; label: string }[] = [
    { id: "basic", label: "Basic" },
    { id: "details", label: "Details" },
    { id: "address", label: "Address" },
    { id: "social", label: "Social" },
  ];

  return {
    t,
    reduce_motion,
    contacts,
    is_loading,
    search_query,
    set_search_query,
    filter,
    set_filter,
    selected_contact,
    set_selected_contact,
    show_create,
    set_show_create,
    editing_contact,
    set_editing_contact,
    create_tab,
    set_create_tab,
    form_data,
    is_saving,
    is_syncing,
    show_sync_confirm,
    set_show_sync_confirm,
    is_select_mode,
    set_is_select_mode,
    selected_ids,
    show_delete_confirm,
    set_show_delete_confirm,
    filtered_contacts,
    grouped,
    favorites_count,
    create_tabs,
    handle_contact_press,
    handle_send_email,
    handle_copy,
    handle_toggle_favorite,
    handle_delete_contact,
    handle_sync_contacts,
    exit_select_mode,
    toggle_select,
    select_all,
    deselect_all,
    handle_mass_email,
    handle_mass_delete,
    handle_mass_favorite,
    handle_mass_copy_emails,
    handle_long_press_start,
    handle_long_press_end,
    handle_open_create,
    handle_open_edit,
    handle_save,
    update_form,
    update_address,
    update_social,
    add_email_field,
    update_email_field,
    remove_email_field,
  };
}
