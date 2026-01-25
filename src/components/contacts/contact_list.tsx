import type { DecryptedContact } from "@/types/contacts";

import { useMemo } from "react";
import { UsersIcon } from "@heroicons/react/24/outline";

import { ContactListItem } from "./contact_list_item";

interface ContactListProps {
  contacts: DecryptedContact[];
  search_query: string;
  on_click: (contact: DecryptedContact) => void;
  is_loading?: boolean;
  selected_ids: Set<string>;
  on_toggle_select: (id: string) => void;
}

export function ContactList({
  contacts,
  search_query,
  on_click,
  is_loading = false,
  selected_ids,
  on_toggle_select,
}: ContactListProps) {
  const filtered_contacts = useMemo(() => {
    let result = contacts;

    if (search_query.trim()) {
      const query = search_query.toLowerCase();

      result = contacts.filter((contact) => {
        const full_name =
          `${contact.first_name} ${contact.last_name}`.toLowerCase();
        const emails = contact.emails.join(" ").toLowerCase();
        const company = (contact.company || "").toLowerCase();
        const phone = (contact.phone || "").toLowerCase();

        return (
          full_name.includes(query) ||
          emails.includes(query) ||
          company.includes(query) ||
          phone.includes(query)
        );
      });
    }

    return [...result].sort((a, b) => {
      const name_a = `${a.first_name} ${a.last_name}`.trim().toLowerCase();
      const name_b = `${b.first_name} ${b.last_name}`.trim().toLowerCase();

      return name_a.localeCompare(name_b);
    });
  }, [contacts, search_query]);

  if (is_loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div
          className="w-8 h-8 border-2 rounded-full animate-spin"
          style={{
            borderColor: "var(--border-secondary)",
            borderTopColor: "var(--accent-blue)",
          }}
        />
      </div>
    );
  }

  if (contacts.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center py-12">
        <div
          className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4"
          style={{ backgroundColor: "var(--bg-secondary)" }}
        >
          <UsersIcon
            className="w-8 h-8"
            style={{ color: "var(--text-muted)" }}
          />
        </div>
        <h3
          className="text-lg font-medium mb-2"
          style={{ color: "var(--text-primary)" }}
        >
          No contacts yet
        </h3>
        <p
          className="text-[14px] text-center max-w-sm"
          style={{ color: "var(--text-muted)" }}
        >
          Add your first contact to start building your address book
        </p>
      </div>
    );
  }

  if (filtered_contacts.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center py-12">
        <div
          className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4"
          style={{ backgroundColor: "var(--bg-secondary)" }}
        >
          <UsersIcon
            className="w-8 h-8"
            style={{ color: "var(--text-muted)" }}
          />
        </div>
        <h3
          className="text-lg font-medium mb-2"
          style={{ color: "var(--text-primary)" }}
        >
          No results found
        </h3>
        <p
          className="text-[14px] text-center max-w-sm"
          style={{ color: "var(--text-muted)" }}
        >
          No contacts match &quot;{search_query}&quot;
        </p>
      </div>
    );
  }

  return (
    <div
      className="flex-1 overflow-y-auto"
      style={{ scrollbarGutter: "stable" }}
    >
      {filtered_contacts.map((contact) => (
        <ContactListItem
          key={contact.id}
          contact={contact}
          is_selected={selected_ids.has(contact.id)}
          on_click={on_click}
          on_toggle_select={on_toggle_select}
        />
      ))}
    </div>
  );
}

export function get_filtered_contacts(
  contacts: DecryptedContact[],
  search_query: string,
): DecryptedContact[] {
  let result = contacts;

  if (search_query.trim()) {
    const query = search_query.toLowerCase();

    result = contacts.filter((contact) => {
      const full_name =
        `${contact.first_name} ${contact.last_name}`.toLowerCase();
      const emails = contact.emails.join(" ").toLowerCase();
      const company = (contact.company || "").toLowerCase();
      const phone = (contact.phone || "").toLowerCase();

      return (
        full_name.includes(query) ||
        emails.includes(query) ||
        company.includes(query) ||
        phone.includes(query)
      );
    });
  }

  return [...result].sort((a, b) => {
    const name_a = `${a.first_name} ${a.last_name}`.trim().toLowerCase();
    const name_b = `${b.first_name} ${b.last_name}`.trim().toLowerCase();

    return name_a.localeCompare(name_b);
  });
}
