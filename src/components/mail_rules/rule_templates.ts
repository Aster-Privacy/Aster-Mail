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
import type { TranslationKey } from "@/lib/i18n/types";
import type { Action, Condition, MatchMode } from "@/services/api/mail_rules";

export type RuleTemplateCategory =
  | "organize"
  | "cleanup"
  | "priority"
  | "security";

export interface RuleTemplate {
  id: string;
  category: RuleTemplateCategory;
  name_key: TranslationKey;
  description_key: TranslationKey;
  color: string;
  match_mode: MatchMode;
  conditions: Condition[];
  actions: Action[];
  needs_config?: boolean;
}

const TEN_MEGABYTES = 10 * 1024 * 1024;

export const RULE_TEMPLATE_CATEGORIES: RuleTemplateCategory[] = [
  "organize",
  "cleanup",
  "priority",
  "security",
];

export const RULE_TEMPLATES: RuleTemplate[] = [
  {
    id: "newsletters",
    category: "organize",
    name_key: "mail_rules.tpl_newsletters_name",
    description_key: "mail_rules.tpl_newsletters_desc",
    color: "#3b82f6",
    match_mode: "all",
    conditions: [{ type: "has_list_id", value: true }],
    actions: [{ type: "categorize", category: "updates" }],
  },
  {
    id: "social",
    category: "organize",
    name_key: "mail_rules.tpl_social_name",
    description_key: "mail_rules.tpl_social_desc",
    color: "#6366f1",
    match_mode: "any",
    conditions: [
      { type: "from", operator: "contains", value: "facebook.com" },
      { type: "from", operator: "contains", value: "linkedin.com" },
      { type: "from", operator: "contains", value: "twitter.com" },
      { type: "from", operator: "contains", value: "instagram.com" },
    ],
    actions: [{ type: "categorize", category: "social" }],
  },
  {
    id: "promotions",
    category: "organize",
    name_key: "mail_rules.tpl_promotions_name",
    description_key: "mail_rules.tpl_promotions_desc",
    color: "#ec4899",
    match_mode: "any",
    conditions: [
      { type: "subject", operator: "contains", value: "sale" },
      { type: "subject", operator: "contains", value: "% off" },
      { type: "subject", operator: "contains", value: "discount" },
      { type: "subject", operator: "contains", value: "coupon" },
    ],
    actions: [{ type: "categorize", category: "promotions" }],
  },
  {
    id: "calendar",
    category: "organize",
    name_key: "mail_rules.tpl_calendar_name",
    description_key: "mail_rules.tpl_calendar_desc",
    color: "#a855f7",
    match_mode: "all",
    conditions: [{ type: "has_calendar_invite", value: true }],
    actions: [{ type: "categorize", category: "updates" }],
  },
  {
    id: "no_reply",
    category: "organize",
    name_key: "mail_rules.tpl_no_reply_name",
    description_key: "mail_rules.tpl_no_reply_desc",
    color: "#06b6d4",
    match_mode: "all",
    conditions: [{ type: "is_auto_submitted", value: true }],
    actions: [{ type: "categorize", category: "updates" }],
  },
  {
    id: "large_attachments",
    category: "organize",
    name_key: "mail_rules.tpl_large_attachments_name",
    description_key: "mail_rules.tpl_large_attachments_desc",
    color: "#f97316",
    match_mode: "all",
    conditions: [
      { type: "attachment_size", operator: "greater_than", value: TEN_MEGABYTES },
    ],
    actions: [{ type: "move_to", folder_token: null }],
    needs_config: true,
  },
  {
    id: "forward_copy",
    category: "organize",
    name_key: "mail_rules.tpl_forward_copy_name",
    description_key: "mail_rules.tpl_forward_copy_desc",
    color: "#22c55e",
    match_mode: "all",
    conditions: [{ type: "from", operator: "contains", value: "" }],
    actions: [{ type: "forward", to: "" }],
    needs_config: true,
  },
  {
    id: "receipts",
    category: "cleanup",
    name_key: "mail_rules.tpl_receipts_name",
    description_key: "mail_rules.tpl_receipts_desc",
    color: "#14b8a6",
    match_mode: "any",
    conditions: [
      { type: "subject", operator: "contains", value: "receipt" },
      { type: "subject", operator: "contains", value: "invoice" },
      { type: "subject", operator: "contains", value: "order confirmation" },
      { type: "subject", operator: "contains", value: "your order" },
    ],
    actions: [
      { type: "skip_inbox", value: true },
      { type: "categorize", category: "updates" },
    ],
  },
  {
    id: "vip_sender",
    category: "priority",
    name_key: "mail_rules.tpl_vip_sender_name",
    description_key: "mail_rules.tpl_vip_sender_desc",
    color: "#facc15",
    match_mode: "all",
    conditions: [{ type: "from", operator: "contains", value: "" }],
    actions: [
      { type: "star", value: true },
      { type: "notify", enabled: true },
    ],
    needs_config: true,
  },
  {
    id: "keyword_star",
    category: "priority",
    name_key: "mail_rules.tpl_keyword_star_name",
    description_key: "mail_rules.tpl_keyword_star_desc",
    color: "#d946ef",
    match_mode: "all",
    conditions: [{ type: "subject", operator: "contains", value: "" }],
    actions: [{ type: "star", value: true }],
    needs_config: true,
  },
  {
    id: "auth_failures",
    category: "security",
    name_key: "mail_rules.tpl_auth_failures_name",
    description_key: "mail_rules.tpl_auth_failures_desc",
    color: "#ef4444",
    match_mode: "any",
    conditions: [
      { type: "dkim_result", value: "fail" },
      { type: "spf_result", value: "fail" },
      { type: "dmarc_result", value: "fail" },
    ],
    actions: [
      { type: "skip_inbox", value: true },
      { type: "mark_as", state: "read" },
    ],
  },
];

export interface RuleEditorSeed {
  name: string;
  color: string;
  match_mode: MatchMode;
  conditions: Condition[];
  actions: Action[];
}

export function template_to_seed(
  template: RuleTemplate,
  name: string,
): RuleEditorSeed {
  return {
    name,
    color: template.color,
    match_mode: template.match_mode,
    conditions: structuredClone(template.conditions),
    actions: structuredClone(template.actions),
  };
}
