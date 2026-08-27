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

import { copy_text_or_throw } from "@/utils/copy_text";
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
import {
  contact_to_form_data,
  reconcile_entry_fields,
} from "@/components/common/hooks/contacts_state_helpers";
import { ignore_error } from "@/lib/ignore_error";

const MASS_EMAIL_LIMIT = 10;

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
  const base = contact_to_form_data(contact);

  return {
    ...base,
    emails: base.emails.length > 0 ? [...base.emails] : [""],
    phone: base.phone ?? "",
    company: base.company ?? "",
    job_title: base.job_title ?? "",
    birthday: base.birthday ?? "",
    notes: base.notes ?? "",
    address: base.address ?? {
      street: "",
      city: "",
      state: "",
      postal_code: "",
      country: "",
    },
    social_links: base.social_links ?? {
      website: "",
      linkedin: "",
      twitter: "",
      github: "",
    },
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
  const [show_discard_confirm, set_show_discard_confirm] = useState(false);
  const opened_form_ref = useRef("");
  const [is_saving, set_is_saving] = useState(false);
  const [is_syncing, set_is_syncing] = useState(false);
  const [show_sync_confirm, set_show_sync_confirm] = useState(false);
  const [is_select_mode, set_is_select_mode] = useState(false);
  const [selected_ids, set_selected_ids] = useState<Set<string>>(new Set());
  const [show_delete_confirm, set_show_delete_confirm] = useState(false);
  const [pending_delete_contact, set_pending_delete_contact] =
    useState<DecryptedContact | null>(null);
  const [is_mass_deleting, set_is_mass_deleting] = useState(false);
  const [load_failed, set_load_failed] = useState(false);
  const [load_tick, set_load_tick] = useState(0);
  const long_press_timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const long_press_fired_ref = useRef(false);
  const mass_delete_ref = useRef(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const response = await list_contacts({ limit: 500 });

        if (cancelled) return;

        if (response.error || !response.data?.items) {
          set_load_failed(true);

          return;
        }

        const decrypted = await decrypt_contacts(response.data.items);

        if (!cancelled) {
          set_load_failed(false);
          set_contacts(decrypted);
        }
      } catch (caught) {
        ignore_error("pages/mobile/use_mobile_contacts_state:load", caught);
        if (!cancelled) set_load_failed(true);
      } finally {
        if (!cancelled) set_is_loading(false);
      }
    }

    set_is_loading(true);
    load();

    return () => {
      cancelled = true;
    };
  }, [load_tick]);

  const retry_load_contacts = useCallback(() => {
    set_load_tick((value) => value + 1);
  }, []);

  const reload_contacts = useCallback(async (): Promise<boolean> => {
    try {
      request_cache.invalidate("contacts");
      const response = await list_contacts({ limit: 500 });

      if (!response.data?.items) return false;

      const decrypted = await decrypt_contacts(response.data.items);

      set_contacts(decrypted);

      return true;
    } catch (caught) {
      ignore_error(
        "pages/mobile/use_mobile_contacts_state:use_mobile_contacts_state",
        caught,
      );

      return false;
    }
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
        show_toast(t("common.permission_denied"), "error");

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
      const reloaded = await reload_contacts();

      if (imported === 0) {
        show_toast(t("common.no_new_contacts_imported"), "info");
      } else {
        show_toast(
          t("common.n_contacts_imported", { count: imported }),
          "success",
        );
      }

      if (!reloaded) {
        show_toast(t("errors.connection_failed"), "warning");
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
      copy_text_or_throw(text)
        .then(() => {
          show_toast(t("common.copied_to_clipboard"), "success");
        })
        .catch(() => show_toast(t("common.failed_to_copy"), "error"));
    },
    [t],
  );

  const handle_toggle_favorite = useCallback(
    async (contact: DecryptedContact) => {
      const updated_form = contact_to_form(contact);

      updated_form.is_favorite = !contact.is_favorite;
      try {
        const response = await update_contact_encrypted(
          contact.id,
          updated_form,
        );

        if (response.error) {
          show_toast(t("common.failed_to_update_favorites"), "error");

          return;
        }
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
      } catch (caught) {
        ignore_error(
          "pages/mobile/use_mobile_contacts_state:handle_toggle_favorite",
          caught,
        );
        show_toast(t("common.failed_to_update_favorites"), "error");
      }
    },
    [t],
  );

  const handle_delete_contact = useCallback(
    async (contact: DecryptedContact) => {
      try {
        const response = await delete_contact(contact.id);

        if (response.error) {
          show_toast(t("common.failed_to_delete_contact"), "error");

          return;
        }
        set_contacts((prev) => prev.filter((c) => c.id !== contact.id));
        set_selected_contact(null);
        show_toast(t("common.contact_deleted"), "success");
      } catch (caught) {
        ignore_error(
          "pages/mobile/use_mobile_contacts_state:handle_delete_contact",
          caught,
        );
        show_toast(t("common.failed_to_delete_contact"), "error");
      }
    },
    [t],
  );

  const request_delete_contact = useCallback((contact: DecryptedContact) => {
    set_pending_delete_contact(contact);
    set_show_delete_confirm(true);
  }, []);

  const cancel_delete_confirm = useCallback(() => {
    if (mass_delete_ref.current) return;
    set_pending_delete_contact(null);
    set_show_delete_confirm(false);
  }, []);

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
    const all_emails = selected.flatMap((c) => c.emails).filter(Boolean);
    const emails = all_emails.slice(0, MASS_EMAIL_LIMIT);

    if (emails.length === 0) return;
    exit_select_mode();
    if (all_emails.length > emails.length) {
      show_toast(
        t("common.mass_email_limited", { count: MASS_EMAIL_LIMIT }),
        "info",
      );
    }
    on_compose(emails.join(", "));
  }, [contacts, selected_ids, on_compose, exit_select_mode, t]);

  const handle_mass_delete = useCallback(async () => {
    if (mass_delete_ref.current) return;

    const ids = Array.from(selected_ids);

    if (ids.length === 0) {
      set_show_delete_confirm(false);

      return;
    }

    mass_delete_ref.current = true;
    set_is_mass_deleting(true);
    const deleted_ids = new Set<string>();

    for (const id of ids) {
      try {
        const response = await delete_contact(id);

        if (!response.error) {
          deleted_ids.add(id);
        }
      } catch {
        continue;
      }
    }
    set_contacts((prev) => prev.filter((c) => !deleted_ids.has(c.id)));
    mass_delete_ref.current = false;
    set_is_mass_deleting(false);
    exit_select_mode();
    set_show_delete_confirm(false);
    if (deleted_ids.size < ids.length) {
      show_toast(t("common.failed_to_delete_contacts"), "error");

      return;
    }
    show_toast(
      t("common.contacts_deleted", { count: deleted_ids.size }),
      "success",
    );
  }, [selected_ids, exit_select_mode, t]);

  const confirm_delete = useCallback(async () => {
    if (mass_delete_ref.current) return;

    if (pending_delete_contact) {
      const contact = pending_delete_contact;

      set_pending_delete_contact(null);
      set_show_delete_confirm(false);
      await handle_delete_contact(contact);

      return;
    }

    await handle_mass_delete();
  }, [pending_delete_contact, handle_delete_contact, handle_mass_delete]);

  const mass_favorite_ref = useRef(false);

  const handle_mass_favorite = useCallback(async () => {
    if (mass_favorite_ref.current) return;

    mass_favorite_ref.current = true;

    const selected = contacts.filter((c) => selected_ids.has(c.id));
    const all_favorited = selected.every((c) => c.is_favorite);

    const updated_ids = new Set<string>();

    for (const contact of selected) {
      const updated_form = contact_to_form(contact);

      updated_form.is_favorite = !all_favorited;
      try {
        const response = await update_contact_encrypted(
          contact.id,
          updated_form,
        );

        if (!response.error) {
          updated_ids.add(contact.id);
        }
      } catch {
        continue;
      }
    }
    set_contacts((prev) =>
      prev.map((c) =>
        updated_ids.has(c.id) ? { ...c, is_favorite: !all_favorited } : c,
      ),
    );
    exit_select_mode();
    if (updated_ids.size < selected.length) {
      show_toast(t("common.failed_to_update_favorites"), "error");
    }
    mass_favorite_ref.current = false;
  }, [contacts, selected_ids, exit_select_mode, t]);

  const handle_mass_copy_emails = useCallback(() => {
    const selected = contacts.filter((c) => selected_ids.has(c.id));
    const emails = selected.flatMap((c) => c.emails).filter(Boolean);

    if (emails.length === 0) return;
    copy_text_or_throw(emails.join(", "))
      .then(() => {
        show_toast(t("common.copied_to_clipboard"), "success");
      })
      .catch(() => show_toast(t("common.failed_to_copy"), "error"));
    exit_select_mode();
  }, [contacts, selected_ids, t, exit_select_mode]);

  const handle_long_press_start = useCallback(
    (contact_id: string) => {
      if (is_select_mode) return;
      long_press_fired_ref.current = false;
      long_press_timer.current = setTimeout(() => {
        long_press_fired_ref.current = true;
        set_is_select_mode(true);
        set_selected_ids(new Set([contact_id]));
      }, 500);
    },
    [is_select_mode],
  );

  const consume_long_press = useCallback(() => {
    const fired = long_press_fired_ref.current;

    long_press_fired_ref.current = false;

    return fired;
  }, []);

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
    const next = { ...INITIAL_FORM, emails: [""] };

    set_editing_contact(null);
    set_form_data(next);
    opened_form_ref.current = JSON.stringify(next);
    set_create_tab("basic");
    set_show_create(true);
  }, []);

  const handle_open_edit = useCallback((contact: DecryptedContact) => {
    const next = contact_to_form(contact);

    set_editing_contact(contact);
    set_form_data(next);
    opened_form_ref.current = JSON.stringify(next);
    set_create_tab("basic");
    set_show_create(true);
  }, []);

  const close_form = useCallback(() => {
    set_show_discard_confirm(false);
    set_show_create(false);
    set_editing_contact(null);
  }, []);

  const request_close_form = useCallback(() => {
    if (JSON.stringify(form_data) !== opened_form_ref.current) {
      set_show_discard_confirm(true);

      return;
    }

    close_form();
  }, [close_form, form_data]);

  useEffect(() => {
    const handle_back = (e: Event) => {
      if (mass_delete_ref.current) {
        e.preventDefault();

        return;
      }

      if (show_discard_confirm) {
        e.preventDefault();
        set_show_discard_confirm(false);
      } else if (show_create) {
        e.preventDefault();
        request_close_form();
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
  }, [
    selected_contact,
    show_create,
    is_select_mode,
    show_discard_confirm,
    request_close_form,
  ]);
  const handle_save = useCallback(async () => {
    const valid_emails = form_data.emails.filter((e) => e.trim());

    if (valid_emails.length === 0) return;
    set_is_saving(true);
    try {
      const saved_form = reconcile_entry_fields({
        ...form_data,
        emails: valid_emails,
      });

      if (editing_contact) {
        const result = await update_contact_encrypted(
          editing_contact.id,
          saved_form,
        );

        if (result.error || !result.data?.success) {
          show_toast(t("common.failed_to_save_contact"), "error");

          return;
        }

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
                  email_entries: saved_form.email_entries,
                  phone_entries: saved_form.phone_entries,
                  address_entries: saved_form.address_entries,
                  is_favorite: saved_form.is_favorite ?? c.is_favorite,
                }
              : c,
          ),
        );
      } else {
        const result = await create_contact_encrypted(saved_form);

        if (result.error || !result.data?.id) {
          show_toast(t("common.failed_to_create_contact"), "error");

          return;
        }

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
        set_show_create(false);
        set_selected_contact(new_contact);

        return;
      }
      set_show_create(false);
      set_selected_contact(null);
    } catch (caught) {
      ignore_error(
        "pages/mobile/use_mobile_contacts_state:use_mobile_contacts_state",
        caught,
      );
      show_toast(
        t(
          editing_contact
            ? "common.failed_to_save_contact"
            : "common.failed_to_create_contact",
        ),
        "error",
      );
    } finally {
      set_is_saving(false);
    }
  }, [form_data, editing_contact, t]);

  const favorites_count = useMemo(
    () => contacts.filter((c) => c.is_favorite).length,
    [contacts],
  );

  const create_tabs: { id: CreateTab; label: string }[] = [
    { id: "basic", label: t("common.basic") },
    { id: "details", label: t("common.details") },
    { id: "address", label: t("common.address") },
    { id: "social", label: t("common.social") },
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
    show_discard_confirm,
    set_show_discard_confirm,
    close_form,
    request_close_form,
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
    request_delete_contact,
    cancel_delete_confirm,
    confirm_delete,
    pending_delete_contact,
    is_mass_deleting,
    load_failed,
    retry_load_contacts,
    consume_long_press,
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
