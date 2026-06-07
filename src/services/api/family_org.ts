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
import { api_client } from "./client";

export interface OrgGroup {
  id: string;
  name: string;
  description: string | null;
  email_local_part: string | null;
  domain_name: string | null;
  can_members_send: boolean;
  member_count: number;
  created_at: string;
}

export interface OrgGroupMember {
  user_id: string;
  username: string;
  email_domain: string;
  added_at: string;
}

export interface ActivityLogEntry {
  id: string;
  event_type: string;
  actor_username: string | null;
  target_username: string | null;
  details: Record<string, unknown>;
  created_at: string;
}

export interface ActivityLogResponse {
  entries: ActivityLogEntry[];
  total: number;
  page: number;
  per_page: number;
}

export interface OrgFilter {
  id: string;
  name: string;
  description: string | null;
  filter_type: string;
  field: string;
  operator: string;
  value: string;
  action: string;
  applies_to: string;
  priority: number;
  is_enabled: boolean;
  created_at: string;
}

export interface DataRetentionPolicy {
  trash_retention_days: number | null;
  spam_retention_days: number | null;
  sent_retention_days: number | null;
  all_mail_retention_days: number | null;
  enforce_on_members: boolean;
}

export interface SecurityPolicy {
  require_2fa: boolean;
  require_2fa_grace_days: number;
  allow_imap_smtp: boolean;
  max_sessions_per_member: number | null;
  session_timeout_hours: number | null;
  block_external_forwarding: boolean;
}

export interface FamilyDomain {
  domain_name: string;
  owner_username: string;
  owner_user_id: string;
  status: string;
  dkim_verified: boolean;
  shared_with_count: number;
  shared_with_user_ids: string[];
}

export interface MemberComplianceInfo {
  user_id: string;
  username: string;
  email_domain: string;
  has_2fa: boolean;
  imap_enabled: boolean;
}

const BASE = "/payments/v1/family/org";

export const list_org_groups = () => api_client.get<OrgGroup[]>(`${BASE}/groups`);
export const create_org_group = (data: { name: string; description?: string; email_local_part?: string; domain_name?: string; can_members_send?: boolean }) =>
  api_client.post<OrgGroup>(`${BASE}/groups`, data);
export const delete_org_group = (id: string) => api_client.delete<unknown>(`${BASE}/groups/${id}`);
export const list_group_members = (id: string) => api_client.get<OrgGroupMember[]>(`${BASE}/groups/${id}/members`);
export const add_group_member = (group_id: string, user_id: string) =>
  api_client.post<unknown>(`${BASE}/groups/${group_id}/members`, { user_id });
export const remove_group_member = (group_id: string, user_id: string) =>
  api_client.delete<unknown>(`${BASE}/groups/${group_id}/members/${user_id}`);

export const get_activity_log = (page = 1, per_page = 50, event_type?: string) =>
  api_client.get<ActivityLogResponse>(`${BASE}/activity?page=${page}&per_page=${per_page}${event_type ? `&event_type=${encodeURIComponent(event_type)}` : ""}`);

export const list_org_filters = () => api_client.get<OrgFilter[]>(`${BASE}/filters`);
export const create_org_filter = (data: { name: string; filter_type: string; field: string; value: string; action: string; description?: string; operator?: string; applies_to?: string; priority?: number }) =>
  api_client.post<OrgFilter>(`${BASE}/filters`, data);
export const update_org_filter = (id: string, data: { name?: string; is_enabled?: boolean; priority?: number }) =>
  api_client.patch<OrgFilter>(`${BASE}/filters/${id}`, data);
export const delete_org_filter = (id: string) => api_client.delete<unknown>(`${BASE}/filters/${id}`);

export const get_data_retention = () => api_client.get<DataRetentionPolicy>(`${BASE}/retention`);
export const update_data_retention = (policy: DataRetentionPolicy) =>
  api_client.put<DataRetentionPolicy>(`${BASE}/retention`, policy);

export const get_security_policy = () => api_client.get<SecurityPolicy>(`${BASE}/security`);
export const update_security_policy = (policy: Partial<SecurityPolicy>) =>
  api_client.patch<SecurityPolicy>(`${BASE}/security`, policy);

export const list_family_domains = () => api_client.get<FamilyDomain[]>(`${BASE}/domains`);
export const share_domain = (domain: string, user_id: string, can_create_aliases = true) =>
  api_client.post<unknown>(`${BASE}/domains/${encodeURIComponent(domain)}/share`, { user_id, can_create_aliases });
export const revoke_domain_share = (domain: string, user_id: string) =>
  api_client.delete<unknown>(`${BASE}/domains/${encodeURIComponent(domain)}/share/${user_id}`);

export const get_member_compliance = () => api_client.get<MemberComplianceInfo[]>(`${BASE}/compliance`);

export const notify_non_compliant_2fa = () =>
  api_client.post<{ notified: number }>('/payments/v1/family/org/notify-2fa', {});

export type ConsentKind = 'retention_policy' | 'filter_create' | 'filter_enable' | 'security_policy';

export interface PendingConsentRequest {
  id: string;
  kind: ConsentKind;
  description: string;
  status: 'pending' | 'all_accepted' | 'any_declined' | 'expired';
  total_members: number;
  accepted_count: number;
  declined_count: number;
  created_at: string;
}

export interface MemberConsentRequest {
  id: string;
  kind: ConsentKind;
  description: string;
  admin_username: string;
  responded: boolean;
  accepted: boolean | null;
  created_at: string;
}

export const create_consent_request = (kind: ConsentKind, description: string, payload: unknown) =>
  api_client.post<PendingConsentRequest>(`${BASE}/consent-requests`, { kind, description, payload });

export const list_member_consent_requests = () =>
  api_client.get<MemberConsentRequest[]>('/payments/v1/family/member/consent-requests');

export const respond_consent_request = (id: string, accepted: boolean) =>
  api_client.post<void>(`/payments/v1/family/member/consent-requests/${id}/respond`, { accepted });

export interface MemberGroup {
  id: string;
  name: string;
  email_local_part: string | null;
  domain_name: string | null;
}

export const list_my_groups = () =>
  api_client.get<MemberGroup[]>('/payments/v1/family/member/groups');

export interface MemberRetentionPolicy {
  trash_retention_days: number | null;
  spam_retention_days: number | null;
  sent_retention_days: number | null;
  all_mail_retention_days: number | null;
  enforce_on_members: boolean;
}

export const get_member_retention_policy = () =>
  api_client.get<MemberRetentionPolicy>('/payments/v1/family/member/retention-policy');
