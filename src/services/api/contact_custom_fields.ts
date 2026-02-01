import type {
  CustomFieldDefinition,
  CustomFieldValue,
  DecryptedCustomFieldDefinition,
  DecryptedCustomFieldValue,
  CustomFieldType,
} from "@/types/contacts";

import { api_client, type ApiResponse } from "./client";
import { get_contacts_encryption_key } from "./contacts";

function array_to_base64(array: Uint8Array): string {
  let binary = "";

  for (let i = 0; i < array.length; i++) {
    binary += String.fromCharCode(array[i]);
  }

  return btoa(binary);
}

function base64_to_array(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }

  return bytes;
}

interface ListFieldDefinitionsResponse {
  items: CustomFieldDefinition[];
}

export async function list_custom_field_definitions(): Promise<
  ApiResponse<DecryptedCustomFieldDefinition[]>
> {
  const response =
    await api_client.get<ListFieldDefinitionsResponse>("/contacts/fields");

  if (response.error || !response.data) {
    return { error: response.error || "Failed to fetch field definitions" };
  }

  try {
    const key = await get_contacts_encryption_key();
    const items = await Promise.all(
      response.data.items.map(async (item) => {
        const decrypted_name = await crypto.subtle.decrypt(
          { name: "AES-GCM", iv: base64_to_array(item.name_nonce) },
          key,
          base64_to_array(item.encrypted_name),
        );

        return {
          id: item.id,
          name: new TextDecoder().decode(decrypted_name),
          field_type: item.field_type,
          sort_order: item.sort_order,
          created_at: item.created_at,
        };
      }),
    );

    return { data: items };
  } catch (err) {
    return {
      error:
        err instanceof Error
          ? err.message
          : "Failed to decrypt field definitions",
    };
  }
}

export async function create_custom_field_definition(
  name: string,
  field_type: CustomFieldType,
): Promise<ApiResponse<DecryptedCustomFieldDefinition>> {
  const key = await get_contacts_encryption_key();
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const encrypted_name = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: nonce },
    key,
    new TextEncoder().encode(name),
  );

  const response = await api_client.post<CustomFieldDefinition>(
    "/contacts/fields",
    {
      encrypted_name: array_to_base64(new Uint8Array(encrypted_name)),
      name_nonce: array_to_base64(nonce),
      field_type,
    },
  );

  if (response.error || !response.data) {
    return { error: response.error || "Failed to create field definition" };
  }

  return {
    data: {
      id: response.data.id,
      name,
      field_type: response.data.field_type,
      sort_order: response.data.sort_order,
      created_at: response.data.created_at,
    },
  };
}

export async function delete_custom_field_definition(
  field_id: string,
): Promise<ApiResponse<{ success: boolean }>> {
  return api_client.delete<{ success: boolean }>(
    `/contacts/fields/${field_id}`,
  );
}

interface ListFieldValuesResponse {
  items: CustomFieldValue[];
}

export async function list_contact_custom_field_values(
  contact_id: string,
  field_definitions: DecryptedCustomFieldDefinition[],
): Promise<ApiResponse<DecryptedCustomFieldValue[]>> {
  const response = await api_client.get<ListFieldValuesResponse>(
    `/contacts/${contact_id}/fields`,
  );

  if (response.error || !response.data) {
    return { error: response.error || "Failed to fetch field values" };
  }

  try {
    const key = await get_contacts_encryption_key();
    const field_map = new Map(field_definitions.map((f) => [f.id, f]));

    const items = await Promise.all(
      response.data.items.map(async (item) => {
        const decrypted_value = await crypto.subtle.decrypt(
          { name: "AES-GCM", iv: base64_to_array(item.value_nonce) },
          key,
          base64_to_array(item.encrypted_value),
        );

        const definition = field_map.get(item.field_definition_id);

        return {
          id: item.id,
          contact_id: item.contact_id,
          field_definition_id: item.field_definition_id,
          field_name: definition?.name || "Unknown",
          field_type: definition?.field_type || "text",
          value: new TextDecoder().decode(decrypted_value),
          created_at: item.created_at,
        };
      }),
    );

    return { data: items };
  } catch (err) {
    return {
      error:
        err instanceof Error ? err.message : "Failed to decrypt field values",
    };
  }
}

export async function set_contact_custom_field_value(
  contact_id: string,
  field_id: string,
  value: string,
): Promise<ApiResponse<{ success: boolean }>> {
  const key = await get_contacts_encryption_key();
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const encrypted_value = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: nonce },
    key,
    new TextEncoder().encode(value),
  );

  return api_client.put<{ success: boolean }>(
    `/contacts/${contact_id}/fields/${field_id}`,
    {
      encrypted_value: array_to_base64(new Uint8Array(encrypted_value)),
      value_nonce: array_to_base64(nonce),
    },
  );
}

export async function delete_contact_custom_field_value(
  contact_id: string,
  field_id: string,
): Promise<ApiResponse<{ success: boolean }>> {
  return api_client.delete<{ success: boolean }>(
    `/contacts/${contact_id}/fields/${field_id}`,
  );
}
