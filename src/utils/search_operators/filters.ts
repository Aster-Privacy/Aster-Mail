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
import type {} from "@/lib/i18n/types";
import { expand_date_shortcut, is_valid_date_shortcut } from "./dates";
import { parse_size_range, parse_size_value } from "./size";
import {
  ATTACHMENT_MIME_MAP,
  ActiveFilter,
  DATE_REGEX,
  ParsedOperator,
  TranslateFn,
} from "./types";

export interface ExtendedSearchFilters {
  from?: string;
  to?: string;
  subject?: string;
  has_attachments?: boolean;
  is_read?: boolean;
  is_starred?: boolean;
  folder?: string;
  date_from?: string;
  date_to?: string;
  labels?: string[];
  attachment_type?: string;
  attachment_mimes?: string[];
  filename?: string;
  size_min?: number;
  size_max?: number;
  message_id?: string;
  negated_from?: string[];
  negated_subject?: string[];
  negated_has_attachments?: boolean;
  negated_attachment_types?: string[];
}

export function operators_to_filters(
  operators: ParsedOperator[],
): ExtendedSearchFilters {
  const filters: ExtendedSearchFilters = {};

  for (const op of operators) {
    if (op.negated) {
      handle_negated_operator(op, filters);
      continue;
    }

    switch (op.type) {
      case "from":
        filters.from = op.value;
        break;
      case "to":
        filters.to = op.value;
        break;
      case "subject":
        filters.subject = op.value;
        break;
      case "has": {
        const has_value = op.value.toLowerCase();

        if (["attachment", "attachments"].includes(has_value)) {
          filters.has_attachments = true;
        } else if (ATTACHMENT_MIME_MAP[has_value]) {
          filters.has_attachments = true;
          filters.attachment_type = has_value;
          filters.attachment_mimes = ATTACHMENT_MIME_MAP[has_value];
        }
        break;
      }
      case "is":
        switch (op.value.toLowerCase()) {
          case "unread":
            filters.is_read = false;
            break;
          case "read":
            filters.is_read = true;
            break;
          case "starred":
            filters.is_starred = true;
            break;
          case "unstarred":
            filters.is_starred = false;
            break;
        }
        break;
      case "in":
        filters.folder = op.value.toLowerCase();
        break;
      case "before":
        filters.date_to = op.value;
        break;
      case "after":
        filters.date_from = op.value;
        break;
      case "date": {
        const date_range = expand_date_shortcut(op.value);

        if (date_range) {
          filters.date_from = date_range.date_from;
          filters.date_to = date_range.date_to;
        } else if (DATE_REGEX.test(op.value)) {
          filters.date_from = op.value;
          filters.date_to = op.value;
        }
        break;
      }
      case "label":
      case "folder":
        if (!filters.labels) {
          filters.labels = [];
        }
        filters.labels.push(op.value);
        break;
      case "filename":
      case "attachment":
        filters.filename = op.value;
        break;
      case "id":
        filters.message_id = op.value;
        break;
      case "larger": {
        const size = parse_size_value(op.value);

        if (size !== null) {
          filters.size_min = size;
        }
        break;
      }
      case "smaller": {
        const size = parse_size_value(op.value);

        if (size !== null) {
          filters.size_max = size;
        }
        break;
      }
      case "size": {
        const range = parse_size_range(op.value);

        if (range) {
          filters.size_min = range.min;
          filters.size_max = range.max;
        } else {
          const size = parse_size_value(op.value);

          if (size !== null) {
            filters.size_min = size;
            filters.size_max = size;
          }
        }
        break;
      }
    }
  }

  return filters;
}

export function handle_negated_operator(
  op: ParsedOperator,
  filters: ExtendedSearchFilters,
): void {
  switch (op.type) {
    case "from":
      if (!filters.negated_from) {
        filters.negated_from = [];
      }
      filters.negated_from.push(op.value);
      break;
    case "subject":
      if (!filters.negated_subject) {
        filters.negated_subject = [];
      }
      filters.negated_subject.push(op.value);
      break;
    case "has": {
      const has_value = op.value.toLowerCase();

      if (["attachment", "attachments"].includes(has_value)) {
        filters.negated_has_attachments = true;
      } else if (ATTACHMENT_MIME_MAP[has_value]) {
        if (!filters.negated_attachment_types) {
          filters.negated_attachment_types = [];
        }
        filters.negated_attachment_types.push(has_value);
      }
      break;
    }
  }
}

export function create_active_filters(
  operators: ParsedOperator[],
  t?: TranslateFn,
): ActiveFilter[] {
  return operators.map((op, index) => {
    let label = "";
    const negation_prefix = op.negated
      ? t
        ? t("mail.filter_not_prefix")
        : "Not "
      : "";

    switch (op.type) {
      case "from":
        label =
          negation_prefix +
          (t
            ? t("mail.filter_from", { value: op.value })
            : `From: ${op.value}`);
        break;
      case "to":
        label =
          negation_prefix +
          (t ? t("mail.filter_to", { value: op.value }) : `To: ${op.value}`);
        break;
      case "contact":
        label =
          negation_prefix +
          (t
            ? t("mail.filter_contact", { value: op.value })
            : `Contact: ${op.value}`);
        break;
      case "subject":
        label =
          negation_prefix +
          (t
            ? t("mail.filter_subject", { value: op.value })
            : `Subject: ${op.value}`);
        break;
      case "has": {
        const has_value = op.value.toLowerCase();

        if (["attachment", "attachments"].includes(has_value)) {
          label = op.negated
            ? t
              ? t("mail.filter_no_attachments")
              : "No attachments"
            : t
              ? t("mail.filter_has_attachment")
              : "Has attachment";
        } else {
          const type_labels: Record<string, string> = {
            pdf: t ? t("mail.filter_type_pdf") : "PDF",
            image: t ? t("mail.filter_type_image") : "Image",
            document: t ? t("mail.filter_type_document") : "Document",
            spreadsheet: t ? t("mail.filter_type_spreadsheet") : "Spreadsheet",
            video: t ? t("mail.filter_type_video") : "Video",
            audio: t ? t("mail.filter_type_audio") : "Audio",
            archive: t ? t("mail.filter_type_archive") : "Archive",
          };
          const type_label = type_labels[has_value] || has_value;

          label = op.negated
            ? t
              ? t("mail.filter_no_type", { type: type_label })
              : `No ${type_label}`
            : t
              ? t("mail.filter_has_type", { type: type_label })
              : `Has ${type_label}`;
        }
        break;
      }
      case "is":
        switch (op.value.toLowerCase()) {
          case "unread":
            label = t ? t("mail.filter_unread") : "Unread";
            break;
          case "read":
            label = t ? t("mail.filter_read") : "Read";
            break;
          case "starred":
            label = t ? t("mail.filter_starred") : "Starred";
            break;
          case "unstarred":
            label = t ? t("mail.filter_not_starred") : "Not starred";
            break;
          default:
            label = op.value;
        }
        break;
      case "in":
        label = t
          ? t("mail.filter_in", { value: op.value })
          : `In: ${op.value}`;
        break;
      case "before":
        label = t
          ? t("mail.filter_before", { value: op.value })
          : `Before: ${op.value}`;
        break;
      case "after":
        label = t
          ? t("mail.filter_after", { value: op.value })
          : `After: ${op.value}`;
        break;
      case "date": {
        if (is_valid_date_shortcut(op.value)) {
          const shortcut_labels: Record<string, string> = {
            today: t ? t("mail.filter_today") : "Today",
            yesterday: t ? t("mail.filter_yesterday") : "Yesterday",
            this_week: t ? t("mail.filter_this_week") : "This week",
            last_week: t ? t("mail.filter_last_week") : "Last week",
            this_month: t ? t("mail.filter_this_month") : "This month",
            last_month: t ? t("mail.filter_last_month") : "Last month",
          };

          label = shortcut_labels[op.value.toLowerCase()] || op.value;
        } else {
          label = t
            ? t("mail.filter_date", { value: op.value })
            : `Date: ${op.value}`;
        }
        break;
      }
      case "label":
        label = t
          ? t("mail.filter_label", { value: op.value })
          : `Label: ${op.value}`;
        break;
      case "folder":
        label = t
          ? t("mail.filter_folder", { value: op.value })
          : `Folder: ${op.value}`;
        break;
      case "filename":
      case "attachment":
        label = t
          ? t("mail.filter_filename", { value: op.value })
          : `Filename: ${op.value}`;
        break;
      case "id":
        label = t
          ? t("mail.filter_id", { value: op.value })
          : `ID: ${op.value}`;
        break;
      case "larger":
        label = t
          ? t("mail.filter_larger", { value: op.value })
          : `Larger: ${op.value}`;
        break;
      case "smaller":
        label = t
          ? t("mail.filter_smaller", { value: op.value })
          : `Smaller: ${op.value}`;
        break;
      case "size":
        label = t
          ? t("mail.filter_size", { value: op.value })
          : `Size: ${op.value}`;
        break;
      default:
        label = `${op.type}: ${op.value}`;
    }

    return {
      id: `${op.type}-${index}-${op.value}${op.negated ? "-neg" : ""}`,
      type: op.type,
      label,
      value: op.value,
      removable: true,
    };
  });
}
