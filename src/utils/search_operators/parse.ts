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
import { is_valid_date_shortcut } from "./dates";
import { parse_size_range, parse_size_value } from "./size";
import { DATE_REGEX, OPERATOR_REGEX, ParsedOperator, ParsedSearchQuery, SearchOperatorType, TranslateFn } from "./types";

export function parse_search_query(query: string): ParsedSearchQuery {
  const operators: ParsedOperator[] = [];
  let remaining_query = query;

  let match: RegExpExecArray | null;
  const regex = new RegExp(OPERATOR_REGEX.source, "gi");

  while ((match = regex.exec(query)) !== null) {
    const negation_prefix = match[1] === "-";
    const operator_type = match[2].toLowerCase() as SearchOperatorType;
    const raw_value = match[4] || match[5];
    const value = raw_value.trim();

    operators.push({
      type: operator_type,
      value,
      raw: match[0].trim(),
      negated: negation_prefix,
    });

    remaining_query = remaining_query.replace(match[0], " ");
  }

  const not_keyword_regex = /(?:^|\s)NOT\s+(\S+)/gi;
  let not_match;

  while ((not_match = not_keyword_regex.exec(remaining_query)) !== null) {
    const term = not_match[1].trim();

    if (!term.includes(":")) {
      operators.push({
        type: "subject" as SearchOperatorType,
        value: term,
        raw: not_match[0].trim(),
        negated: true,
      });
      remaining_query = remaining_query.replace(not_match[0], " ");
    }
  }

  const text_query = remaining_query.replace(/\s+/g, " ").trim();

  return {
    text_query,
    operators,
  };
}

export function validate_operator(operator: ParsedOperator): boolean {
  switch (operator.type) {
    case "from":
    case "to":
    case "subject":
    case "label":
    case "folder":
    case "filename":
    case "attachment":
    case "id":
      return operator.value.length > 0;

    case "has":
      return [
        "attachment",
        "attachments",
        "pdf",
        "image",
        "document",
        "spreadsheet",
        "video",
        "audio",
        "archive",
      ].includes(operator.value.toLowerCase());

    case "is":
      return ["unread", "read", "starred", "unstarred"].includes(
        operator.value.toLowerCase(),
      );

    case "in":
      return [
        "inbox",
        "sent",
        "trash",
        "drafts",
        "spam",
        "archive",
        "all",
        "anywhere",
      ].includes(operator.value.toLowerCase());

    case "before":
    case "after":
      return DATE_REGEX.test(operator.value);

    case "date":
      return (
        DATE_REGEX.test(operator.value) ||
        is_valid_date_shortcut(operator.value)
      );

    case "larger":
    case "smaller":
      return parse_size_value(operator.value) !== null;

    case "size":
      return (
        parse_size_value(operator.value) !== null ||
        parse_size_range(operator.value) !== null
      );

    default:
      return false;
  }
}

export interface OperatorSuggestion {
  operator: string;
  description: string;
}

export function get_operator_suggestions(
  partial: string,
  t?: TranslateFn,
): OperatorSuggestion[] {
  const tr = (key: TranslationKey, fallback: string) =>
    t ? t(key) : fallback;

  const operators: OperatorSuggestion[] = [
    { operator: "from:", description: tr("mail.op_search_by_sender", "Search by sender") },
    { operator: "to:", description: tr("mail.op_search_by_recipient", "Search by recipient") },
    { operator: "subject:", description: tr("mail.op_search_in_subject", "Search in subject") },
    { operator: "has:attachment", description: tr("mail.op_has_attachments", "Has attachments") },
    { operator: "has:pdf", description: tr("mail.op_has_pdf", "Has PDF attachments") },
    { operator: "has:image", description: tr("mail.op_has_image", "Has image attachments") },
    { operator: "has:document", description: tr("mail.op_has_document", "Has document attachments") },
    { operator: "has:spreadsheet", description: tr("mail.op_has_spreadsheet", "Has spreadsheet attachments") },
    { operator: "has:video", description: tr("mail.op_has_video", "Has video attachments") },
    { operator: "has:audio", description: tr("mail.op_has_audio", "Has audio attachments") },
    { operator: "has:archive", description: tr("mail.op_has_archive", "Has archive attachments") },
    { operator: "is:unread", description: tr("mail.op_unread_emails", "Unread emails") },
    { operator: "is:starred", description: tr("mail.op_starred_emails", "Starred emails") },
    { operator: "is:read", description: tr("mail.op_read_emails", "Read emails") },
    { operator: "in:inbox", description: tr("mail.op_in_inbox", "In inbox") },
    { operator: "in:sent", description: tr("mail.op_in_sent", "In sent folder") },
    { operator: "in:trash", description: tr("mail.op_in_trash", "In trash") },
    { operator: "in:drafts", description: tr("mail.op_in_drafts", "In drafts") },
    { operator: "in:anywhere", description: tr("mail.op_in_anywhere", "Everywhere, including spam and trash") },
    { operator: "before:", description: tr("mail.op_before_date", "Before date (YYYY-MM-DD)") },
    { operator: "after:", description: tr("mail.op_after_date", "After date (YYYY-MM-DD)") },
    { operator: "date:today", description: tr("mail.op_from_today", "From today") },
    { operator: "date:yesterday", description: tr("mail.op_from_yesterday", "From yesterday") },
    { operator: "date:this_week", description: tr("mail.op_from_this_week", "From this week") },
    { operator: "date:last_week", description: tr("mail.op_from_last_week", "From last week") },
    { operator: "date:this_month", description: tr("mail.op_from_this_month", "From this month") },
    { operator: "date:last_month", description: tr("mail.op_from_last_month", "From last month") },
    { operator: "larger:", description: tr("mail.op_larger_than", "Larger than size (e.g., 5mb)") },
    { operator: "smaller:", description: tr("mail.op_smaller_than", "Smaller than size (e.g., 1mb)") },
    { operator: "size:", description: tr("mail.op_size_range", "Size range (e.g., 1mb-10mb)") },
    { operator: "filename:", description: tr("mail.op_search_filename", "Search attachment filename") },
    { operator: "label:", description: tr("mail.op_search_by_label", "Search by label") },
    { operator: "folder:", description: tr("mail.op_search_by_folder", "Search by folder") },
    { operator: "id:", description: tr("mail.op_search_by_message_id", "Search by message ID") },
    { operator: "-from:", description: tr("mail.op_exclude_sender", "Exclude sender") },
    { operator: "-has:attachment", description: tr("mail.op_without_attachments", "Without attachments") },
  ];

  if (!partial) {
    return operators;
  }

  const lower_partial = partial.toLowerCase();

  return operators.filter(
    (op) =>
      op.operator.toLowerCase().startsWith(lower_partial) ||
      op.description.toLowerCase().includes(lower_partial),
  );
}

