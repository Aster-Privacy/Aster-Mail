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
import { } from "@/services/crypto/constants";
import type { } from "../key_manager";
import { } from "../key_manager";
import { } from "../memory_key_store";
import { } from "../secure_memory";
import { } from "../legacy_keks";
import { } from "@/services/api/client";
import type { } from "@/services/api/signatures";
import type { } from "@/services/api/templates";
import type { } from "@/services/api/blocked_senders";
import type { } from "@/services/api/allowed_senders";
import { list_aliases } from "@/services/api/aliases";
import { list_contacts } from "@/services/api/contacts";
import { list_alias_pins } from "@/services/api/alias_pins";
import { list_alias_contacts } from "@/services/api/alias_contacts";
import { list_alias_destinations } from "@/services/api/alias_destinations";
import { list_alias_directories } from "@/services/api/alias_directories";
import { list_domains, list_domain_addresses } from "@/services/api/domains";
import { rekey_user_data } from "@/services/api/auth";
import { } from "@/services/crypto/envelope";
import { array_to_base64, base64_to_array } from "../base64";
import {
  
  type ReEncryptedAlias,
  type ReEncryptedContact,
  type ReEncryptedPin,
  type ReEncryptedAliasContact,
  type ReEncryptedDestination,
  type ReEncryptedDirectory,
  type ReEncryptedDomainAddress,
} from "../reencrypt_shared";


import { derive_hmac_key, import_aes_key, re_encrypt_field } from "./key_helpers";
export async function re_encrypt_aliases_contacts(
  old_raw: Uint8Array,
  new_raw: Uint8Array,
): Promise<void> {
  const [old_aes, new_aes, new_alias_hmac, new_contacts_hmac] =
    await Promise.all([
      import_aes_key(old_raw, ["decrypt"]),
      import_aes_key(new_raw, ["encrypt"]),
      derive_hmac_key(new_raw, "astermail-alias-hmac-v1"),
      derive_hmac_key(new_raw, "contacts-hmac-v2"),
    ]);

  const re_encrypted_aliases: ReEncryptedAlias[] = [];
  let alias_offset = 0;

  while (true) {
    const resp = await list_aliases({ limit: 100, offset: alias_offset });

    if (resp.error || !resp.data) break;

    for (const alias of resp.data.aliases) {
      if (alias.is_random) continue;

      try {
        const lp_ct = base64_to_array(alias.encrypted_local_part);
        const lp_iv = base64_to_array(alias.local_part_nonce);
        const lp_pt = await crypto.subtle.decrypt(
          { name: "AES-GCM", iv: lp_iv },
          old_aes,
          lp_ct,
        );
        const local_part = new TextDecoder().decode(lp_pt);

        const new_lp_iv = crypto.getRandomValues(new Uint8Array(12));
        const new_lp_ct = await crypto.subtle.encrypt(
          { name: "AES-GCM", iv: new_lp_iv },
          new_aes,
          lp_pt,
        );

        const full_address = `${local_part.toLowerCase().replace(/\./g, "")}@${alias.domain}`;
        const addr_sig = await crypto.subtle.sign(
          "HMAC",
          new_alias_hmac,
          new TextEncoder().encode(full_address),
        );

        const entry: ReEncryptedAlias = {
          id: alias.id,
          encrypted_local_part: array_to_base64(new Uint8Array(new_lp_ct)),
          local_part_nonce: array_to_base64(new_lp_iv),
          alias_address_hash: array_to_base64(new Uint8Array(addr_sig)),
        };

        if (alias.encrypted_display_name && alias.display_name_nonce) {
          const { encrypted, nonce } = await re_encrypt_field(
            alias.encrypted_display_name,
            alias.display_name_nonce,
            old_aes,
            new_aes,
          );

          entry.encrypted_display_name = encrypted;
          entry.display_name_nonce = nonce;
        }

        if (alias.encrypted_note && alias.note_nonce) {
          const { encrypted, nonce } = await re_encrypt_field(
            alias.encrypted_note,
            alias.note_nonce,
            old_aes,
            new_aes,
          );

          entry.encrypted_note = encrypted;
          entry.note_nonce = nonce;
        }

        if (alias.encrypted_websites && alias.websites_nonce) {
          const { encrypted, nonce } = await re_encrypt_field(
            alias.encrypted_websites,
            alias.websites_nonce,
            old_aes,
            new_aes,
          );

          entry.encrypted_websites = encrypted;
          entry.websites_nonce = nonce;
        }

        re_encrypted_aliases.push(entry);
      } catch {
        continue;
      }
    }

    if (!resp.data.has_more) break;

    alias_offset += resp.data.aliases.length;
  }

  const re_encrypted_contacts: ReEncryptedContact[] = [];
  let contact_cursor: string | undefined;

  while (true) {
    const params: { limit: number; cursor?: string } = { limit: 100 };

    if (contact_cursor) params.cursor = contact_cursor;

    const resp = await list_contacts(params);

    if (resp.error || !resp.data) break;

    for (const contact of resp.data.items) {
      try {
        const ct = base64_to_array(contact.encrypted_data);
        const iv = base64_to_array(contact.data_nonce);
        const pt = await crypto.subtle.decrypt(
          { name: "AES-GCM", iv },
          old_aes,
          ct,
        );

        const new_ct_iv = crypto.getRandomValues(new Uint8Array(12));
        const new_ct = await crypto.subtle.encrypt(
          { name: "AES-GCM", iv: new_ct_iv },
          new_aes,
          pt,
        );

        const parsed = JSON.parse(new TextDecoder().decode(pt));
        const first_name: string = parsed.first_name ?? "";
        const last_name: string = parsed.last_name ?? "";
        const emails: string[] = Array.isArray(parsed.emails)
          ? parsed.emails
          : [];
        const searchable =
          `${first_name} ${last_name} ${emails.join(" ")}`.toLowerCase();
        const token_sig = await crypto.subtle.sign(
          "HMAC",
          new_contacts_hmac,
          new TextEncoder().encode(searchable),
        );

        re_encrypted_contacts.push({
          id: contact.id,
          encrypted_data: array_to_base64(new Uint8Array(new_ct)),
          data_nonce: array_to_base64(new_ct_iv),
          contact_token: array_to_base64(new Uint8Array(token_sig)),
        });
      } catch {
        continue;
      }
    }

    if (!resp.data.has_more || !resp.data.next_cursor) break;

    contact_cursor = resp.data.next_cursor;
  }

  if (re_encrypted_aliases.length > 0 || re_encrypted_contacts.length > 0) {
    await rekey_user_data({
      re_encrypted_aliases,
      re_encrypted_contacts,
    }).catch(() => {});
  }
}

export async function re_encrypt_alias_sub_items_recovery(
  old_raw: Uint8Array,
  new_raw: Uint8Array,
): Promise<void> {
  const [old_aes, new_aes, new_domain_hmac] = await Promise.all([
    import_aes_key(old_raw, ["decrypt"]),
    import_aes_key(new_raw, ["encrypt"]),
    derive_hmac_key(new_raw, "astermail-domain-address-hmac-v1"),
  ]);

  const re_encrypted_pins: ReEncryptedPin[] = [];
  const re_encrypted_alias_contacts: ReEncryptedAliasContact[] = [];
  const re_encrypted_destinations: ReEncryptedDestination[] = [];
  const re_encrypted_directories: ReEncryptedDirectory[] = [];
  const re_encrypted_domain_addresses: ReEncryptedDomainAddress[] = [];

  let alias_offset = 0;

  while (true) {
    const resp = await list_aliases({ limit: 100, offset: alias_offset });

    if (resp.error || !resp.data) break;

    for (const alias of resp.data.aliases) {
      if (alias.is_random) continue;

      const [pins_resp, contacts_resp, destinations_resp] = await Promise.all([
        list_alias_pins(alias.id),
        list_alias_contacts(alias.id),
        list_alias_destinations(alias.id),
      ]);

      if (!pins_resp.error && pins_resp.data) {
        for (const pin of pins_resp.data.pins) {
          if (!pin.encrypted_sender || !pin.sender_nonce) continue;

          try {
            const { encrypted, nonce } = await re_encrypt_field(
              pin.encrypted_sender,
              pin.sender_nonce,
              old_aes,
              new_aes,
            );

            re_encrypted_pins.push({
              id: pin.id,
              encrypted_sender: encrypted,
              sender_nonce: nonce,
            });
          } catch {
            continue;
          }
        }
      }

      if (!contacts_resp.error && contacts_resp.data) {
        for (const c of contacts_resp.data.contacts) {
          if (!c.encrypted_contact || !c.contact_nonce) continue;

          try {
            const { encrypted, nonce } = await re_encrypt_field(
              c.encrypted_contact,
              c.contact_nonce,
              old_aes,
              new_aes,
            );

            re_encrypted_alias_contacts.push({
              id: c.id,
              encrypted_contact: encrypted,
              contact_nonce: nonce,
            });
          } catch {
            continue;
          }
        }
      }

      if (!destinations_resp.error && destinations_resp.data) {
        for (const dest of destinations_resp.data.destinations) {
          if (!dest.encrypted_destination || !dest.destination_nonce) continue;

          try {
            const { encrypted, nonce } = await re_encrypt_field(
              dest.encrypted_destination,
              dest.destination_nonce,
              old_aes,
              new_aes,
            );

            re_encrypted_destinations.push({
              id: dest.id,
              encrypted_destination: encrypted,
              destination_nonce: nonce,
            });
          } catch {
            continue;
          }
        }
      }
    }

    if (!resp.data.has_more) break;

    alias_offset += resp.data.aliases.length;
  }

  const dirs_resp = await list_alias_directories();

  if (!dirs_resp.error && dirs_resp.data) {
    for (const dir of dirs_resp.data.directories) {
      if (!dir.encrypted_label || !dir.label_nonce) continue;

      try {
        const { encrypted, nonce } = await re_encrypt_field(
          dir.encrypted_label,
          dir.label_nonce,
          old_aes,
          new_aes,
        );

        re_encrypted_directories.push({
          id: dir.id,
          encrypted_label: encrypted,
          label_nonce: nonce,
        });
      } catch {
        continue;
      }
    }
  }

  const domains_resp = await list_domains();

  if (!domains_resp.error && domains_resp.data) {
    for (const domain of domains_resp.data.domains) {
      const addrs_resp = await list_domain_addresses(domain.id);

      if (addrs_resp.error || !addrs_resp.data) continue;

      for (const address of addrs_resp.data.addresses) {
        try {
          const lp_pt = await crypto.subtle.decrypt(
            { name: "AES-GCM", iv: base64_to_array(address.local_part_nonce) },
            old_aes,
            base64_to_array(address.encrypted_local_part),
          );
          const local_part = new TextDecoder().decode(lp_pt);
          const new_lp_iv = crypto.getRandomValues(new Uint8Array(12));
          const new_lp_ct = await crypto.subtle.encrypt(
            { name: "AES-GCM", iv: new_lp_iv },
            new_aes,
            lp_pt,
          );
          const full_address = `${local_part.toLowerCase().replace(/\./g, "")}@${domain.domain_name.toLowerCase()}`;
          const hash_sig = await crypto.subtle.sign(
            "HMAC",
            new_domain_hmac,
            new TextEncoder().encode(full_address),
          );

          const entry: ReEncryptedDomainAddress = {
            id: address.id,
            encrypted_local_part: array_to_base64(new Uint8Array(new_lp_ct)),
            local_part_nonce: array_to_base64(new_lp_iv),
            local_part_hash: array_to_base64(new Uint8Array(hash_sig)),
          };

          if (address.encrypted_display_name && address.display_name_nonce) {
            const { encrypted, nonce } = await re_encrypt_field(
              address.encrypted_display_name,
              address.display_name_nonce,
              old_aes,
              new_aes,
            );

            entry.encrypted_display_name = encrypted;
            entry.display_name_nonce = nonce;
          }

          re_encrypted_domain_addresses.push(entry);
        } catch {
          continue;
        }
      }
    }
  }

  const payload: {
    re_encrypted_pins?: ReEncryptedPin[];
    re_encrypted_alias_contacts?: ReEncryptedAliasContact[];
    re_encrypted_destinations?: ReEncryptedDestination[];
    re_encrypted_directories?: ReEncryptedDirectory[];
    re_encrypted_domain_addresses?: ReEncryptedDomainAddress[];
  } = {};

  if (re_encrypted_pins.length > 0) payload.re_encrypted_pins = re_encrypted_pins;
  if (re_encrypted_alias_contacts.length > 0) payload.re_encrypted_alias_contacts = re_encrypted_alias_contacts;
  if (re_encrypted_destinations.length > 0) payload.re_encrypted_destinations = re_encrypted_destinations;
  if (re_encrypted_directories.length > 0) payload.re_encrypted_directories = re_encrypted_directories;
  if (re_encrypted_domain_addresses.length > 0) payload.re_encrypted_domain_addresses = re_encrypted_domain_addresses;

  if (Object.keys(payload).length > 0) {
    await rekey_user_data(payload).catch(() => {});
  }
}

