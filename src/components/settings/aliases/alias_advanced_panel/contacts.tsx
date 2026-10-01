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
import type {} from "@/services/api/aliases";
import type {} from "@/lib/i18n/types";

import { useCallback, useEffect, useState } from "react";
import { TrashIcon, PlusIcon, NoSymbolIcon } from "@heroicons/react/24/outline";
import {
  Badge,
  Button,
  Input,
  Island,
  IslandEmpty,
  IslandRow,
} from "@aster/ui";

import { INPUT_CLASS, ROW_DELETE_BUTTON_CLASS } from "./shared";

import { LoadFailedNotice } from "@/components/settings/load_failed_notice";
import { use_i18n } from "@/lib/i18n/context";
import { show_toast } from "@/components/toast/simple_toast";
import { Spinner } from "@/components/ui/spinner";
import { get_alias_preferences } from "@/services/api/aliases";
import {
  list_alias_contacts,
  add_alias_contact,
  delete_alias_contact,
  set_alias_contact_blocked,
  list_domain_address_contacts,
  add_domain_address_contact,
  delete_domain_address_contact,
  set_domain_address_contact_blocked,
  decrypt_alias_contact,
  type DecryptedAliasContact,
} from "@/services/api/alias_contacts";
import { ignore_error } from "@/lib/ignore_error";
import { is_composing } from "@/utils/ime";

export function ContactsPanel({
  alias_id,
  domain_address_id,
  alias_local_part,
  alias_domain,
  locked,
}: {
  alias_id?: string;
  domain_address_id?: string;
  alias_local_part?: string;
  alias_domain?: string;
  locked?: boolean;
}) {
  const { t } = use_i18n();
  const [contacts, set_contacts] = useState<DecryptedAliasContact[]>([]);
  const [loading, set_loading] = useState(true);
  const [load_error, set_load_error] = useState(false);
  const [email, set_email] = useState("");
  const [busy, set_busy] = useState(false);
  const [readable_reverse, set_readable_reverse] = useState(false);

  useEffect(() => {
    if (locked) return;
    get_alias_preferences()
      .then((r) => {
        if (r.data?.readable_reverse_aliases) set_readable_reverse(true);
      })
      .catch((caught) =>
        ignore_error(
          "components/settings/aliases/alias_advanced_panel/contacts:ContactsPanel",
          caught,
        ),
      );
  }, [locked]);

  const load = useCallback(async () => {
    if (locked) {
      set_loading(false);

      return;
    }
    set_loading(true);
    set_load_error(false);
    try {
      const response = domain_address_id
        ? await list_domain_address_contacts(domain_address_id)
        : await list_alias_contacts(alias_id!);

      if (response.data) {
        const decrypted = await Promise.all(
          (response.data.contacts ?? []).map((c) =>
            decrypt_alias_contact(c, t("settings.alias_contact_unknown")),
          ),
        );

        set_contacts(decrypted);
      } else {
        set_load_error(true);
      }
    } catch {
      set_load_error(true);
      set_contacts([]);
    } finally {
      set_loading(false);
    }
  }, [alias_id, domain_address_id, locked, t]);

  useEffect(() => {
    load();
  }, [load]);

  const handle_add = async () => {
    const value = email.trim();

    if (!value || busy) return;

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      show_toast(t("settings.alias_sender_invalid"), "error");

      return;
    }

    set_busy(true);
    try {
      const response = domain_address_id
        ? await add_domain_address_contact(
            domain_address_id,
            value,
            alias_local_part ?? "",
            alias_domain ?? "",
          )
        : await add_alias_contact(alias_id!, value, readable_reverse);

      if (response.error) {
        show_toast(t("settings.alias_contact_add_failed"), "error");
      } else {
        set_email("");
        show_toast(t("settings.alias_contact_added"), "success");
        await load();
      }
    } finally {
      set_busy(false);
    }
  };

  const handle_block = async (contact: DecryptedAliasContact) => {
    const next = !contact.is_blocked;

    set_contacts((prev) =>
      prev.map((c) => (c.id === contact.id ? { ...c, is_blocked: next } : c)),
    );
    const response = domain_address_id
      ? await set_domain_address_contact_blocked(
          domain_address_id,
          contact.id,
          next,
        )
      : await set_alias_contact_blocked(alias_id!, contact.id, next);

    if (response.error) {
      set_contacts((prev) =>
        prev.map((c) =>
          c.id === contact.id ? { ...c, is_blocked: contact.is_blocked } : c,
        ),
      );
      show_toast(response.error, "error");
    }
  };

  const handle_delete = async (contact_id: string) => {
    const response = domain_address_id
      ? await delete_domain_address_contact(domain_address_id, contact_id)
      : await delete_alias_contact(alias_id!, contact_id);

    if (response.error) {
      show_toast(response.error, "error");
    } else {
      show_toast(t("settings.alias_contact_removed"), "success");
      set_contacts((prev) => prev.filter((c) => c.id !== contact_id));
    }
  };

  return (
    <>
      <Island className="flex flex-wrap items-center gap-2" padding="md">
        <Input
          className={INPUT_CLASS}
          placeholder={t("settings.alias_contact_email_placeholder")}
          size="md"
          type="email"
          value={email}
          onChange={(e) => set_email(e.target.value)}
          onKeyDown={(e) =>
            e["key"] === "Enter" && !is_composing(e) && handle_add()
          }
        />
        <Button
          disabled={busy || !email.trim()}
          size="lg"
          variant="primary"
          onClick={handle_add}
        >
          <PlusIcon className="w-4 h-4" />
          {t("settings.alias_contact_add")}
        </Button>
      </Island>

      {loading ? (
        <Island className="flex justify-center" padding="md">
          <Spinner size="md" />
        </Island>
      ) : load_error ? (
        <LoadFailedNotice on_retry={() => load()} />
      ) : contacts.length === 0 ? (
        <IslandEmpty title={t("settings.alias_contacts_empty")} />
      ) : (
        <Island divided>
          {contacts.map((contact) => (
            <IslandRow
              key={contact.id}
              label={<span className="block truncate">{contact.contact}</span>}
              layout="stacked"
              trailing={
                <div className="flex items-center gap-2 flex-shrink-0">
                  {contact.is_blocked && (
                    <Badge color="red">
                      {t("settings.alias_contact_blocked")}
                    </Badge>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handle_block(contact)}
                  >
                    <NoSymbolIcon className="w-4 h-4" />
                    {contact.is_blocked
                      ? t("settings.alias_contact_unblock")
                      : t("settings.alias_contact_block")}
                  </Button>
                  <Button
                    aria-label={t("common.delete")}
                    className={ROW_DELETE_BUTTON_CLASS}
                    size="icon"
                    variant="ghost"
                    onClick={() => handle_delete(contact.id)}
                  >
                    <TrashIcon className="w-4 h-4" />
                  </Button>
                </div>
              }
            />
          ))}
        </Island>
      )}
    </>
  );
}
