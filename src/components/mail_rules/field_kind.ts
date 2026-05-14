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
  ConditionField,
  LeafCondition,
} from "@/services/api/mail_rules";

export type FieldKind =
  | "address"
  | "text"
  | "header"
  | "attachment_name"
  | "boolean"
  | "numeric_size"
  | "numeric_plain"
  | "date"
  | "auth";

export function field_kind(field: ConditionField): FieldKind {
  switch (field) {
    case "from":
    case "reply_to":
    case "to":
    case "cc":
    case "bcc":
    case "any_recipient":
      return "address";
    case "subject":
    case "body":
    case "list_id":
      return "text";
    case "header":
      return "header";
    case "attachment_name":
      return "attachment_name";
    case "has_attachment":
    case "is_reply":
    case "is_forward":
    case "is_auto_submitted":
    case "has_calendar_invite":
    case "has_list_id":
      return "boolean";
    case "attachment_size":
    case "total_size":
      return "numeric_size";
    case "recipient_count":
    case "spam_score":
      return "numeric_plain";
    case "date_received":
      return "date";
    case "dkim_result":
    case "spf_result":
    case "dmarc_result":
      return "auth";
  }
}

export function default_condition_for_field(field: ConditionField): LeafCondition {
  const kind = field_kind(field);

  switch (kind) {
    case "address":
      return {
        type: field as Extract<LeafCondition, { type: "from" }>["type"],
        operator: "contains",
        value: "",
      } as LeafCondition;
    case "text":
      return {
        type: field as "subject" | "body" | "list_id",
        operator: "contains",
        value: "",
      };
    case "header":
      return {
        type: "header",
        name: "",
        operator: "contains",
        value: "",
      };
    case "attachment_name":
      return {
        type: "attachment_name",
        operator: "contains",
        value: "",
      };
    case "boolean":
      return {
        type: field as "has_attachment",
        value: true,
      };
    case "numeric_size":
    case "numeric_plain":
      return {
        type: field as "attachment_size",
        operator: "greater_than",
        value: 0,
      };
    case "date":
      return {
        type: "date_received",
        operator: "older_than_days",
        value: 7,
      };
    case "auth":
      return {
        type: field as "dkim_result",
        value: "pass",
      };
  }
}

export function is_text_like_field(field: ConditionField): boolean {
  const k = field_kind(field);

  return k === "address" || k === "text" || k === "header" || k === "attachment_name";
}
