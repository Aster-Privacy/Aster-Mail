import type {
  ContactAttachment,
  ContactAttachmentMeta,
  ContactAttachmentListItem,
  DecryptedContactAttachment,
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

export async function upload_contact_attachment(
  contact_id: string,
  file: File,
  description?: string,
): Promise<ApiResponse<ContactAttachment>> {
  const key = await get_contacts_encryption_key();
  const array_buffer = await file.arrayBuffer();
  const file_data = new Uint8Array(array_buffer);

  const data_nonce = crypto.getRandomValues(new Uint8Array(12));
  const encrypted_data = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: data_nonce },
    key,
    file_data,
  );

  const meta: ContactAttachmentMeta = {
    filename: file.name,
    mime_type: file.type,
    description,
  };

  const meta_nonce = crypto.getRandomValues(new Uint8Array(12));
  const encrypted_meta = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: meta_nonce },
    key,
    new TextEncoder().encode(JSON.stringify(meta)),
  );

  return api_client.post<ContactAttachment>(
    `/contacts/${contact_id}/attachments`,
    {
      encrypted_data: array_to_base64(new Uint8Array(encrypted_data)),
      data_nonce: array_to_base64(data_nonce),
      encrypted_meta: array_to_base64(new Uint8Array(encrypted_meta)),
      meta_nonce: array_to_base64(meta_nonce),
      size_bytes: file.size,
    },
  );
}

interface ListAttachmentsResponse {
  items: ContactAttachmentListItem[];
  total: number;
}

export async function list_contact_attachments(contact_id: string): Promise<
  ApiResponse<{
    items: (ContactAttachmentListItem & { meta: ContactAttachmentMeta })[];
    total: number;
  }>
> {
  const response = await api_client.get<ListAttachmentsResponse>(
    `/contacts/${contact_id}/attachments`,
  );

  if (response.error || !response.data) {
    return { error: response.error || "Failed to fetch attachments" };
  }

  try {
    const key = await get_contacts_encryption_key();
    const items = await Promise.all(
      response.data.items.map(async (item) => {
        const decrypted_meta = await crypto.subtle.decrypt(
          { name: "AES-GCM", iv: base64_to_array(item.meta_nonce) },
          key,
          base64_to_array(item.encrypted_meta),
        );

        const meta: ContactAttachmentMeta = JSON.parse(
          new TextDecoder().decode(decrypted_meta),
        );

        return { ...item, meta };
      }),
    );

    return { data: { items, total: response.data.total } };
  } catch (err) {
    return {
      error:
        err instanceof Error ? err.message : "Failed to decrypt attachments",
    };
  }
}

export async function get_contact_attachment(
  contact_id: string,
  attachment_id: string,
): Promise<ApiResponse<DecryptedContactAttachment>> {
  const response = await api_client.get<ContactAttachment>(
    `/contacts/${contact_id}/attachments/${attachment_id}`,
  );

  if (response.error || !response.data) {
    return { error: response.error || "Failed to fetch attachment" };
  }

  try {
    const key = await get_contacts_encryption_key();

    const decrypted_data = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: base64_to_array(response.data.data_nonce) },
      key,
      base64_to_array(response.data.encrypted_data),
    );

    const decrypted_meta = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: base64_to_array(response.data.meta_nonce) },
      key,
      base64_to_array(response.data.encrypted_meta),
    );

    const meta: ContactAttachmentMeta = JSON.parse(
      new TextDecoder().decode(decrypted_meta),
    );

    return {
      data: {
        id: response.data.id,
        contact_id: response.data.contact_id,
        data: new Uint8Array(decrypted_data),
        meta,
        size_bytes: response.data.size_bytes,
        seq_num: response.data.seq_num,
        created_at: response.data.created_at,
      },
    };
  } catch (err) {
    return {
      error:
        err instanceof Error ? err.message : "Failed to decrypt attachment",
    };
  }
}

export async function delete_contact_attachment(
  contact_id: string,
  attachment_id: string,
): Promise<ApiResponse<{ success: boolean }>> {
  return api_client.delete<{ success: boolean }>(
    `/contacts/${contact_id}/attachments/${attachment_id}`,
  );
}

export function download_attachment(
  data: Uint8Array,
  meta: ContactAttachmentMeta,
): void {
  const blob = new Blob([data], { type: meta.mime_type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");

  a.href = url;
  a.download = meta.filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
