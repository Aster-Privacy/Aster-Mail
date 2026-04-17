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
import type {
  DuplicateCandidate,
  DuplicateCandidateWithContacts,
  DecryptedContact,
  ContactFormData,
} from "@/types/contacts";

import { api_client, type ApiResponse } from "./client";
import { decrypt_contact, get_contact, encrypt_contact_data } from "./contacts";

interface ListDuplicatesResponse {
  items: DuplicateCandidate[];
  total: number;
}

export async function list_duplicate_candidates(): Promise<
  ApiResponse<{ items: DuplicateCandidateWithContacts[]; total: number }>
> {
  const response = await api_client.get<ListDuplicatesResponse>(
    "/contacts/v1/duplicates",
  );

  if (response.error || !response.data) {
    return { error: response.error || "Failed to fetch duplicates" };
  }

  try {
    const items = await Promise.all(
      response.data.items.map(async (item) => {
        const [contact1_response, contact2_response] = await Promise.all([
          get_contact(item.contact_id_1),
          get_contact(item.contact_id_2),
        ]);

        if (
          contact1_response.error ||
          !contact1_response.data ||
          contact2_response.error ||
          !contact2_response.data
        ) {
          throw new Error("Failed to fetch contact data for duplicates");
        }

        const [contact_1, contact_2] = await Promise.all([
          decrypt_contact(contact1_response.data),
          decrypt_contact(contact2_response.data),
        ]);

        return {
          id: item.id,
          contact_1,
          contact_2,
          similarity_score: item.similarity_score,
          match_reason: item.match_reason,
          created_at: item.created_at,
        };
      }),
    );

    return { data: { items, total: response.data.total } };
  } catch (err) {
    return {
      error:
        err instanceof Error ? err.message : "Failed to process duplicates",
    };
  }
}

export async function merge_contacts(
  primary_contact_id: string,
  secondary_contact_id: string,
  merged_data: ContactFormData,
): Promise<ApiResponse<{ success: boolean; merged_contact_id: string }>> {
  const { encrypted_data, data_nonce } =
    await encrypt_contact_data(merged_data);

  return api_client.post<{ success: boolean; merged_contact_id: string }>(
    "/contacts/v1/merge",
    {
      primary_contact_id,
      secondary_contact_id,
      merged_encrypted_data: encrypted_data,
      merged_data_nonce: data_nonce,
    },
  );
}

export async function dismiss_duplicate(
  duplicate_id: string,
): Promise<ApiResponse<{ success: boolean }>> {
  return api_client.post<{ success: boolean }>(
    `/contacts/v1/duplicates/${duplicate_id}/dismiss`,
    {},
  );
}

export async function scan_for_duplicates(): Promise<
  ApiResponse<{ success: boolean }>
> {
  return api_client.post<{ success: boolean }>(
    "/contacts/v1/duplicates/scan",
    {},
  );
}

export function merge_contact_fields(
  contact_1: DecryptedContact,
  contact_2: DecryptedContact,
  preferences: {
    name: "contact_1" | "contact_2";
    emails: "merge" | "contact_1" | "contact_2";
    phone: "contact_1" | "contact_2";
    company: "contact_1" | "contact_2";
    address: "contact_1" | "contact_2";
  },
): ContactFormData {
  const name_source = preferences.name === "contact_1" ? contact_1 : contact_2;

  let emails: string[];

  if (preferences.emails === "merge") {
    const combined = [...contact_1.emails, ...contact_2.emails];

    emails = [...new Set(combined)];
  } else {
    emails =
      preferences.emails === "contact_1" ? contact_1.emails : contact_2.emails;
  }

  const phone_source =
    preferences.phone === "contact_1" ? contact_1 : contact_2;
  const company_source =
    preferences.company === "contact_1" ? contact_1 : contact_2;
  const address_source =
    preferences.address === "contact_1" ? contact_1 : contact_2;

  return {
    first_name: name_source.first_name,
    last_name: name_source.last_name,
    emails,
    phone:
      phone_source.phone ||
      (preferences.phone === "contact_1" ? contact_2.phone : contact_1.phone),
    company:
      company_source.company ||
      (preferences.company === "contact_1"
        ? contact_2.company
        : contact_1.company),
    job_title:
      company_source.job_title ||
      (preferences.company === "contact_1"
        ? contact_2.job_title
        : contact_1.job_title),
    address:
      address_source.address ||
      (preferences.address === "contact_1"
        ? contact_2.address
        : contact_1.address),
    birthday: contact_1.birthday || contact_2.birthday,
    social_links: {
      ...contact_2.social_links,
      ...contact_1.social_links,
    },
    relationship: contact_1.relationship || contact_2.relationship,
    notes:
      [contact_1.notes, contact_2.notes].filter(Boolean).join("\n\n") ||
      undefined,
    avatar_url: contact_1.avatar_url || contact_2.avatar_url,
    is_favorite: contact_1.is_favorite || contact_2.is_favorite,
    groups: [
      ...new Set([...(contact_1.groups || []), ...(contact_2.groups || [])]),
    ],
  };
}
