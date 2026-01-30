import type {
  RecentContact,
  DecryptedRecentContact,
  ContactFormData,
} from "@/types/contacts";

import { api_client, type ApiResponse } from "./client";
import {
  get_contacts_encryption_key,
  decrypt_contact_data,
  generate_contact_token,
  encrypt_contact_data,
} from "./contacts";

function array_to_base64(array: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < array.length; i++) {
    binary += String.fromCharCode(array[i]);
  }
  return btoa(binary);
}

interface ListRecentResponse {
  items: RecentContact[];
}

async function generate_search_token(value: string): Promise<string> {
  const key = await get_contacts_encryption_key();
  const encoder = new TextEncoder();
  const info = encoder.encode("contacts-search-v2");

  const raw_key = await crypto.subtle.exportKey("raw", key);
  const combined = new Uint8Array(
    new Uint8Array(raw_key).byteLength + info.length,
  );
  combined.set(new Uint8Array(raw_key), 0);
  combined.set(info, new Uint8Array(raw_key).byteLength);

  const hash = await crypto.subtle.digest("SHA-256", combined);
  const search_key = await crypto.subtle.importKey(
    "raw",
    hash,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const normalized = value.toLowerCase().trim();
  const data = encoder.encode(normalized);
  const signature = await crypto.subtle.sign("HMAC", search_key, data);

  return array_to_base64(new Uint8Array(signature));
}

export async function get_contact_suggestions(
  query: string,
  limit?: number,
): Promise<ApiResponse<DecryptedRecentContact[]>> {
  const search_token = await generate_search_token(query);
  const params = new URLSearchParams();
  params.set("q", search_token);
  if (limit) params.set("limit", limit.toString());

  const response = await api_client.get<ListRecentResponse>(
    `/contacts/suggestions?${params}`,
  );

  if (response.error || !response.data) {
    return { error: response.error || "Failed to fetch suggestions" };
  }

  try {
    const items = await Promise.all(
      response.data.items.map(async (item) => {
        const data = await decrypt_contact_data(
          item.encrypted_data,
          item.data_nonce,
        );

        return {
          id: item.id,
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
          created_at: item.created_at,
          updated_at: item.updated_at,
          last_contacted_at: item.last_contacted_at,
          email_count: item.email_count,
        };
      }),
    );

    return { data: items };
  } catch (err) {
    return {
      error:
        err instanceof Error ? err.message : "Failed to decrypt suggestions",
    };
  }
}

export async function get_recent_contacts(
  limit?: number,
): Promise<ApiResponse<DecryptedRecentContact[]>> {
  const params = new URLSearchParams();
  params.set("q", "");
  if (limit) params.set("limit", limit.toString());

  const response = await api_client.get<ListRecentResponse>(
    `/contacts/recent?${params}`,
  );

  if (response.error || !response.data) {
    return { error: response.error || "Failed to fetch recent contacts" };
  }

  try {
    const items = await Promise.all(
      response.data.items.map(async (item) => {
        const data = await decrypt_contact_data(
          item.encrypted_data,
          item.data_nonce,
        );

        return {
          id: item.id,
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
          created_at: item.created_at,
          updated_at: item.updated_at,
          last_contacted_at: item.last_contacted_at,
          email_count: item.email_count,
        };
      }),
    );

    return { data: items };
  } catch (err) {
    return {
      error:
        err instanceof Error
          ? err.message
          : "Failed to decrypt recent contacts",
    };
  }
}

export async function create_contact_from_email(
  email: string,
  display_name?: string,
): Promise<ApiResponse<{ id: string; success: boolean }>> {
  const [first_name, ...rest] = (display_name || email.split("@")[0]).split(
    " ",
  );
  const last_name = rest.join(" ");

  const form_data: ContactFormData = {
    first_name: first_name || "",
    last_name: last_name || "",
    emails: [email],
    is_favorite: false,
  };

  const contact_token = await generate_contact_token(form_data);
  const { encrypted_data, data_nonce } = await encrypt_contact_data(form_data);
  const email_search_token = await generate_search_token(email);

  return api_client.post<{ id: string; success: boolean }>(
    "/contacts/from-email",
    {
      contact_token,
      encrypted_data,
      data_nonce,
      email_search_token,
    },
  );
}
