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
import { serialize_vcards, type VCardContact } from "@/utils/export";
import {
  list_contacts,
  decrypt_contacts,
} from "@/services/api/contacts";
import type { DecryptedContact } from "@/types/contacts";
import { list_aliases, decrypt_aliases } from "@/services/api/aliases";
import {
  list_ghost_aliases,
  decrypt_ghost_aliases,
} from "@/services/api/ghost_aliases";
import { list_rules } from "@/services/api/mail_rules";
import { list_signatures } from "@/services/api/signatures";
import { list_templates } from "@/services/api/templates";
import { get_vacation_reply } from "@/services/api/vacation_reply";
import { list_blocked_senders } from "@/services/api/blocked_senders";
import { list_allowed_senders } from "@/services/api/allowed_senders";
import { list_forwarding_rules } from "@/services/api/auto_forward";
import { list_external_accounts } from "@/services/api/external_accounts";
import { get_cached_folders } from "@/hooks/use_folders";

export interface AccountDataSelection {
  contacts: boolean;
  settings: boolean;
}

export interface AccountDataFile {
  name: string;
  bytes: Uint8Array;
}

function to_json_bytes(obj: unknown): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(obj, null, 2));
}

function contact_to_vcard(c: DecryptedContact): VCardContact {
  const addr = c.address;
  const address_text = addr
    ? [addr.street, addr.city, addr.state, addr.postal_code, addr.country]
        .filter(Boolean)
        .join(", ")
    : undefined;
  const social_links =
    c.social_links &&
    Object.entries(c.social_links).map(([k, v]) => ({
      service: k,
      url: v,
    }));
  return {
    first_name: c.first_name,
    last_name: c.last_name,
    display_name: `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim(),
    emails: c.emails,
    phone: c.phone,
    company: c.company,
    job_title: c.job_title,
    address: address_text,
    birthday: c.birthday,
    notes: c.notes,
    social_links,
    avatar_url: c.avatar_url,
    created_at: c.created_at,
    updated_at: c.updated_at,
  };
}

async function safe<T>(
  label: string,
  fn: () => Promise<T>,
): Promise<T | null> {
  try {
    return await fn();
  } catch (err) {
    if (import.meta.env.DEV) {
      console.warn(`[export] ${label} failed`, err);
    }
    return null;
  }
}

async function fetch_all_contacts(): Promise<DecryptedContact[]> {
  const all: DecryptedContact[] = [];
  let cursor: string | undefined = undefined;
  for (let i = 0; i < 200; i++) {
    const res = await list_contacts({ limit: 200, cursor });
    const page = res.data;
    if (!page?.items?.length) break;
    const decrypted = await decrypt_contacts(page.items);
    all.push(...decrypted);
    if (!page.has_more || !page.next_cursor) break;
    cursor = page.next_cursor;
  }
  return all;
}

export async function build_account_data_files(
  selection: AccountDataSelection,
): Promise<AccountDataFile[]> {
  const files: AccountDataFile[] = [];

  if (selection.contacts) {
    const contacts =
      (await safe("contacts", fetch_all_contacts)) ?? [];
    if (contacts.length > 0) {
      const vcards = serialize_vcards(contacts.map(contact_to_vcard));
      files.push({ name: "contacts.vcf", bytes: vcards });
      files.push({
        name: "contacts.json",
        bytes: to_json_bytes(contacts),
      });
    }
  }

  if (!selection.settings) return files;

  const aliases = await safe("aliases", async () => {
    const res = await list_aliases({ limit: 500 });
    return decrypt_aliases(res.data?.aliases ?? []);
  });
  if (aliases?.length) {
    files.push({ name: "aliases.json", bytes: to_json_bytes(aliases) });
  }

  const ghost = await safe("ghost_aliases", async () => {
    const res = await list_ghost_aliases();
    return decrypt_ghost_aliases(res.data?.aliases ?? []);
  });
  if (ghost?.length) {
    files.push({ name: "ghost_aliases.json", bytes: to_json_bytes(ghost) });
  }

  const rules = await safe("mail_rules", async () => {
    const res = await list_rules();
    return res.data?.rules ?? [];
  });
  if (rules?.length) {
    files.push({ name: "mail_rules.json", bytes: to_json_bytes(rules) });
  }

  const forwarding = await safe("auto_forward", async () => {
    const res = await list_forwarding_rules();
    return res.data ?? [];
  });
  if (forwarding?.length) {
    files.push({
      name: "auto_forward_rules.json",
      bytes: to_json_bytes(forwarding),
    });
  }

  const signatures = await safe("signatures", async () => {
    const res = await list_signatures();
    return res.data?.signatures ?? [];
  });
  if (signatures?.length) {
    files.push({
      name: "signatures.json",
      bytes: to_json_bytes(signatures),
    });
  }

  const templates = await safe("templates", async () => {
    const res = await list_templates();
    return res.data?.templates ?? [];
  });
  if (templates?.length) {
    files.push({
      name: "templates.json",
      bytes: to_json_bytes(templates),
    });
  }

  const vacation = await safe("vacation_reply", async () => {
    const res = await get_vacation_reply();
    return res.data ?? null;
  });
  if (vacation) {
    files.push({
      name: "vacation_reply.json",
      bytes: to_json_bytes(vacation),
    });
  }

  const blocked = await safe("blocked_senders", async () => {
    const res = await list_blocked_senders();
    return res.data ?? [];
  });
  if (blocked?.length) {
    files.push({
      name: "blocked_senders.json",
      bytes: to_json_bytes(blocked),
    });
  }

  const allowed = await safe("allowed_senders", async () => {
    const res = await list_allowed_senders(500, 0);
    return res.data ?? [];
  });
  if (allowed?.length) {
    files.push({
      name: "allowed_senders.json",
      bytes: to_json_bytes(allowed),
    });
  }

  const external = await safe("external_accounts", async () => {
    const res = await list_external_accounts();
    return res.data ?? [];
  });
  if (external?.length) {
    files.push({
      name: "external_accounts.json",
      bytes: to_json_bytes(external),
    });
  }

  const folders = get_cached_folders();
  if (folders.length > 0) {
    files.push({
      name: "folders.json",
      bytes: to_json_bytes(folders),
    });
  }

  files.push({
    name: "README.txt",
    bytes: new TextEncoder().encode(
      [
        "Aster Mail Account Export",
        "",
        "This bundle contains your account data exported from Aster Mail.",
        "",
        "Files included:",
        "  - mailbox.mbox or eml/   Your messages in RFC5322 format",
        "  - contacts.vcf           Standard vCard 4.0, importable into",
        "                           any mail/contacts app (Apple, Google,",
        "                           Thunderbird, Outlook, etc.)",
        "  - contacts.json          Full contact data including extended",
        "                           fields not covered by vCard",
        "  - aliases.json           Email aliases",
        "  - ghost_aliases.json     Temporary ghost aliases",
        "  - mail_rules.json        Inbox automation rules",
        "  - auto_forward_rules.json Forwarding rules",
        "  - signatures.json        Email signatures",
        "  - templates.json         Saved templates",
        "  - vacation_reply.json    Out-of-office reply",
        "  - blocked_senders.json   Blocklist",
        "  - allowed_senders.json   Allowlist",
        "  - external_accounts.json Connected external accounts",
        "                           (credentials are not included)",
        "  - folders.json           Folder/label structure",
        "",
        "Privacy note: this export contains your decrypted data in plain",
        "text. Treat it as sensitive and store it accordingly.",
        "",
        "Generated by Aster Mail.",
        "",
      ].join("\n"),
    ),
  });

  return files;
}
