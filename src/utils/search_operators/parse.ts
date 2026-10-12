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
import {
  DATE_REGEX,
  NOT_TERM_REGEX,
  OPERATOR_REGEX,
  ParsedOperator,
  ParsedSearchQuery,
  SearchOperatorType,
  TranslateFn,
} from "./types";

export interface LocatedOperator {
  operator: ParsedOperator;
  start: number;
  end: number;
}

function is_calendar_date(value: string): boolean {
  if (!DATE_REGEX.test(value)) return false;

  const [year, month, day] = value.split("-").map(Number);
  const picked = new Date(Date.UTC(year, month - 1, day));

  return (
    picked.getUTCFullYear() === year &&
    picked.getUTCMonth() === month - 1 &&
    picked.getUTCDate() === day
  );
}

export function locate_operators(query: string): LocatedOperator[] {
  const located: LocatedOperator[] = [];
  const regex = new RegExp(OPERATOR_REGEX.source, "gi");
  let match: RegExpExecArray | null;

  while ((match = regex.exec(query)) !== null) {
    const lead = match[1] ?? "";
    const dash = match[2] ?? "";
    const keyword = match[3] ?? "";
    const keyword_negates = keyword.startsWith("NOT");
    const keyword_is_word = keyword.length > 0 && !keyword_negates;
    const start = keyword_is_word
      ? match.index + lead.length + dash.length + keyword.length
      : match.index + lead.length;
    const end = match.index + match[0].length;
    const operator: ParsedOperator = {
      type: match[4].toLowerCase() as SearchOperatorType,
      value: (match[6] || match[7]).trim(),
      raw: query.slice(start, end),
      negated: keyword_is_word ? false : dash === "-" || keyword_negates,
    };

    if (!validate_operator(operator)) continue;

    located.push({ operator, start, end });
  }

  const not_regex = new RegExp(NOT_TERM_REGEX.source, "g");

  while ((match = not_regex.exec(query)) !== null) {
    const start = match.index + (match[1] ?? "").length;
    const end = match.index + match[0].length;
    const value = (match[3] || match[4]).replace(/"/g, "").trim();

    if (!value) continue;
    if (located.some((entry) => start < entry.end && entry.start < end)) {
      continue;
    }

    located.push({
      operator: {
        type: "text",
        value,
        raw: query.slice(start, end),
        negated: true,
      },
      start,
      end,
    });
  }

  return located.sort((a, b) => a.start - b.start);
}

export function parse_search_query(query: string): ParsedSearchQuery {
  const located = locate_operators(query);
  const kept: string[] = [];
  let position = 0;

  for (const entry of located) {
    kept.push(query.slice(position, entry.start));
    position = entry.end;
  }
  kept.push(query.slice(position));

  return {
    text_query: kept.join(" ").replace(/\s+/g, " ").trim(),
    operators: located.map((entry) => entry.operator),
  };
}

export function validate_operator(operator: ParsedOperator): boolean {
  switch (operator.type) {
    case "from":
    case "to":
    case "contact":
    case "subject":
    case "label":
    case "folder":
    case "filename":
    case "attachment":
    case "id":
    case "text":
    case "in":
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

    case "before":
    case "after":
      return is_calendar_date(operator.value);

    case "date":
      return (
        is_calendar_date(operator.value) ||
        is_valid_date_shortcut(operator.value)
      );

    case "larger":
    case "smaller":
      return parse_size_value(operator.value) !== null;

    case "size":
      return parse_size_range(operator.value) !== null;

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
  const tr = (key: TranslationKey, fallback: string) => (t ? t(key) : fallback);

  const operators: OperatorSuggestion[] = [
    {
      operator: "from:",
      description: tr("mail.op_search_by_sender", "Search by sender"),
    },
    {
      operator: "to:",
      description: tr("mail.op_search_by_recipient", "Search by recipient"),
    },
    {
      operator: "subject:",
      description: tr("mail.op_search_in_subject", "Search in subject"),
    },
    {
      operator: "has:attachment",
      description: tr("mail.op_has_attachments", "Has attachments"),
    },
    {
      operator: "has:pdf",
      description: tr("mail.op_has_pdf", "Has PDF attachments"),
    },
    {
      operator: "has:image",
      description: tr("mail.op_has_image", "Has image attachments"),
    },
    {
      operator: "has:document",
      description: tr("mail.op_has_document", "Has document attachments"),
    },
    {
      operator: "has:spreadsheet",
      description: tr("mail.op_has_spreadsheet", "Has spreadsheet attachments"),
    },
    {
      operator: "has:video",
      description: tr("mail.op_has_video", "Has video attachments"),
    },
    {
      operator: "has:audio",
      description: tr("mail.op_has_audio", "Has audio attachments"),
    },
    {
      operator: "has:archive",
      description: tr("mail.op_has_archive", "Has archive attachments"),
    },
    {
      operator: "is:unread",
      description: tr("mail.op_unread_emails", "Unread emails"),
    },
    {
      operator: "is:starred",
      description: tr("mail.op_starred_emails", "Starred emails"),
    },
    {
      operator: "is:read",
      description: tr("mail.op_read_emails", "Read emails"),
    },
    { operator: "in:inbox", description: tr("mail.op_in_inbox", "In inbox") },
    {
      operator: "in:sent",
      description: tr("mail.op_in_sent", "In sent folder"),
    },
    { operator: "in:trash", description: tr("mail.op_in_trash", "In trash") },
    {
      operator: "in:drafts",
      description: tr("mail.op_in_drafts", "In drafts"),
    },
    {
      operator: "in:anywhere",
      description: tr(
        "mail.op_in_anywhere",
        "Everywhere, including spam and trash",
      ),
    },
    {
      operator: "before:",
      description: tr("mail.op_before_date", "Before date (YYYY-MM-DD)"),
    },
    {
      operator: "after:",
      description: tr("mail.op_after_date", "After date (YYYY-MM-DD)"),
    },
    {
      operator: "date:today",
      description: tr("mail.op_from_today", "From today"),
    },
    {
      operator: "date:yesterday",
      description: tr("mail.op_from_yesterday", "From yesterday"),
    },
    {
      operator: "date:this_week",
      description: tr("mail.op_from_this_week", "From this week"),
    },
    {
      operator: "date:last_week",
      description: tr("mail.op_from_last_week", "From last week"),
    },
    {
      operator: "date:this_month",
      description: tr("mail.op_from_this_month", "From this month"),
    },
    {
      operator: "date:last_month",
      description: tr("mail.op_from_last_month", "From last month"),
    },
    {
      operator: "larger:",
      description: tr("mail.op_larger_than", "Larger than size (e.g., 5mb)"),
    },
    {
      operator: "smaller:",
      description: tr("mail.op_smaller_than", "Smaller than size (e.g., 1mb)"),
    },
    {
      operator: "size:",
      description: tr("mail.op_size_range", "Size range (e.g., 1mb-10mb)"),
    },
    {
      operator: "filename:",
      description: tr("mail.op_search_filename", "Search attachment filename"),
    },
    {
      operator: "label:",
      description: tr("mail.op_search_by_label", "Search by label"),
    },
    {
      operator: "folder:",
      description: tr("mail.op_search_by_folder", "Search by folder"),
    },
    {
      operator: "id:",
      description: tr("mail.op_search_by_message_id", "Search by message ID"),
    },
    {
      operator: "-from:",
      description: tr("mail.op_exclude_sender", "Exclude sender"),
    },
    {
      operator: "-has:attachment",
      description: tr("mail.op_without_attachments", "Without attachments"),
    },
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
