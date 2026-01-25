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
