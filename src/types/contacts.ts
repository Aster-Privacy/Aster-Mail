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
export interface Contact {
  id: string;
  contact_token: string;
  encrypted_data: string;
  data_nonce: string;
  integrity_hash?: string;
  data_version: number;
  created_at: string;
  updated_at: string;
}

export interface SocialLinks {
  linkedin?: string;
  twitter?: string;
  github?: string;
  website?: string;
}

export interface Address {
  street?: string;
  city?: string;
  state?: string;
  postal_code?: string;
  country?: string;
}

export interface DecryptedContact {
  id: string;
  first_name: string;
  last_name: string;
  emails: string[];
  phone?: string;
  company?: string;
  job_title?: string;
  address?: Address;
  birthday?: string;
  social_links?: SocialLinks;
  relationship?: "work" | "personal" | "family" | "other";
  notes?: string;
  avatar_url?: string;
  is_favorite: boolean;
  groups?: string[];
  last_contacted?: string;
  email_count?: number;
  created_at: string;
  updated_at: string;
}

export interface ContactFormData {
  first_name: string;
  last_name: string;
  emails: string[];
  phone?: string;
  company?: string;
  job_title?: string;
  address?: Address;
  birthday?: string;
  social_links?: SocialLinks;
  relationship?: "work" | "personal" | "family" | "other";
  notes?: string;
  avatar_url?: string;
  is_favorite?: boolean;
  groups?: string[];
}

export interface ContactGroupEncrypted {
  id: string;
  encrypted_name: string;
  name_nonce: string;
  color: string;
  contact_count: number;
  created_at: string;
}

export interface ContactGroup {
  id: string;
  name: string;
  color: string;
  contact_count: number;
  created_at: string;
}

export interface ContactGroupFormData {
  name: string;
  color: string;
}

export interface ListContactsParams {
  limit?: number;
  cursor?: string;
  group_id?: string;
  search?: string;
}

export interface ContactsListResponse {
  items: Contact[];
  next_cursor: string | null;
  has_more: boolean;
}

export interface CreateContactRequest {
  contact_token: string;
  name_search_token?: string;
  email_search_token?: string;
  company_search_token?: string;
  encrypted_data: string;
  data_nonce: string;
  integrity_hash: string;
  data_version: number;
}

export interface CreateContactResponse {
  id: string;
  success: boolean;
}

export interface UpdateContactRequest {
  encrypted_data: string;
  data_nonce: string;
  integrity_hash: string;
  name_search_token?: string;
  email_search_token?: string;
  company_search_token?: string;
}

export interface UpdateContactResponse {
  success: boolean;
}

export interface DeleteContactResponse {
  success: boolean;
  deleted_count: number;
}

export interface BulkDeleteContactsRequest {
  contact_ids: string[];
}

export interface BulkDeleteContactsResponse {
  deleted: number;
  failed: string[];
}

export interface SearchContactsQuery {
  q: string;
  field?: "name" | "email" | "company" | "all";
  limit?: number;
}

export interface SearchContactsResponse {
  items: Contact[];
  total: number;
}

export interface ContactActivity {
  id: string;
  type: "email_sent" | "email_received" | "created" | "updated";
  details?: string;
  created_at: string;
}

export interface ContactActivityResponse {
  activities: ContactActivity[];
  has_more: boolean;
}

export const CONTACT_DATA_VERSION = 2;

export const RELATIONSHIP_LABELS: Record<string, string> = {
  work: "Work",
  personal: "Personal",
  family: "Family",
  other: "Other",
};

export const GROUP_COLORS = [
  "#ef4444",
  "#f97316",
  "#eab308",
  "#22c55e",
  "#14b8a6",
  "#3b82f6",
  "#8b5cf6",
  "#ec4899",
];

export interface ContactPhoto {
  id: string;
  contact_id: string;
  encrypted_data: string;
  data_nonce: string;
  encrypted_meta: string;
  meta_nonce: string;
  size_bytes: number;
  created_at: string;
}

export interface ContactPhotoMeta {
  filename: string;
  mime_type: string;
  width?: number;
  height?: number;
}

export interface DecryptedContactPhoto {
  id: string;
  contact_id: string;
  data: Uint8Array;
  meta: ContactPhotoMeta;
  blob_url?: string;
  created_at: string;
}

export interface ContactAttachment {
  id: string;
  contact_id: string;
  encrypted_data: string;
  data_nonce: string;
  encrypted_meta: string;
  meta_nonce: string;
  size_bytes: number;
  seq_num: number;
  created_at: string;
}

export interface ContactAttachmentMeta {
  filename: string;
  mime_type: string;
  description?: string;
}

export interface DecryptedContactAttachment {
  id: string;
  contact_id: string;
  data: Uint8Array;
  meta: ContactAttachmentMeta;
  size_bytes: number;
  seq_num?: number;
  created_at: string;
  blob_url?: string;
}

export interface ContactAttachmentListItem {
  id: string;
  contact_id: string;
  encrypted_meta: string;
  meta_nonce: string;
  size_bytes: number;
  seq_num: number;
  created_at: string;
}

export interface CustomFieldDefinition {
  id: string;
  encrypted_name: string;
  name_nonce: string;
  field_type: CustomFieldType;
  sort_order: number;
  created_at: string;
}

export type CustomFieldType =
  | "text"
  | "date"
  | "url"
  | "phone"
  | "email"
  | "number";

export interface DecryptedCustomFieldDefinition {
  id: string;
  name: string;
  field_type: CustomFieldType;
  sort_order: number;
  created_at: string;
}

export interface CustomFieldValue {
  id: string;
  contact_id: string;
  field_definition_id: string;
  encrypted_value: string;
  value_nonce: string;
  created_at: string;
}

export interface DecryptedCustomFieldValue {
  id: string;
  contact_id: string;
  field_definition_id: string;
  field_name: string;
  field_type: CustomFieldType;
  value: string;
  created_at: string;
}

export interface ContactActivityEntry {
  id: string;
  contact_id: string;
  activity_type: ContactActivityType;
  mail_item_id?: string;
  direction?: "sent" | "received";
  encrypted_subject?: string;
  subject_nonce?: string;
  created_at: string;
}

export type ContactActivityType =
  | "email_sent"
  | "email_received"
  | "created"
  | "updated"
  | "merged"
  | "imported";

export interface DecryptedContactActivityEntry {
  id: string;
  contact_id: string;
  activity_type: ContactActivityType;
  mail_item_id?: string;
  direction?: "sent" | "received";
  subject?: string;
  created_at: string;
}

export interface ContactEmailStats {
  total_sent: number;
  total_received: number;
  last_sent_at?: string;
  last_received_at?: string;
  first_contact_at?: string;
}

export interface ContactHistoryResponse {
  items: ContactActivityEntry[];
  next_cursor: string | null;
  has_more: boolean;
}

export interface DuplicateCandidate {
  id: string;
  contact_id_1: string;
  contact_id_2: string;
  similarity_score: number;
  match_reason: "email" | "name" | "phone" | "combined";
  created_at: string;
}

export interface DuplicateCandidateWithContacts {
  id: string;
  contact_1: DecryptedContact;
  contact_2: DecryptedContact;
  similarity_score: number;
  match_reason: "email" | "name" | "phone" | "combined";
  created_at: string;
}

export interface SyncSource {
  id: string;
  source_type: "carddav";
  encrypted_config: string;
  config_nonce: string;
  last_sync_at?: string;
  last_sync_status?: string;
  contacts_synced: number;
  is_enabled: boolean;
  created_at: string;
}

export interface CardDAVConfig {
  server_url: string;
  username: string;
  password: string;
  display_name?: string;
}

export interface DecryptedSyncSource {
  id: string;
  source_type: "carddav";
  config: CardDAVConfig;
  last_sync_at?: string;
  last_sync_status?: string;
  contacts_synced: number;
  is_enabled: boolean;
  created_at: string;
}

export interface ImportResult {
  imported: number;
  updated: number;
  skipped: number;
  failed: number;
  errors: string[];
}

export interface ImportVCardContact {
  contact_token: string;
  encrypted_data: string;
  data_nonce: string;
  name_search_token?: string;
  email_search_token?: string;
}

export interface RecentContact {
  id: string;
  contact_token: string;
  encrypted_data: string;
  data_nonce: string;
  last_contacted_at?: string;
  email_count: number;
  created_at: string;
  updated_at: string;
}

export interface DecryptedRecentContact extends DecryptedContact {
  last_contacted_at?: string;
  email_count: number;
}

export interface ExtendedDecryptedContact extends DecryptedContact {
  has_photo?: boolean;
  attachment_count?: number;
  custom_field_count?: number;
  contact_source?: string;
  photo_blob_url?: string;
  custom_fields?: DecryptedCustomFieldValue[];
  stats?: ContactEmailStats;
}
