export type SearchOperatorType =
  | "from"
  | "to"
  | "subject"
  | "has"
  | "is"
  | "in"
  | "before"
  | "after"
  | "label"
  | "date"
  | "filename"
  | "attachment"
  | "larger"
  | "smaller"
  | "size"
  | "id";

export type HasOperatorValue =
  | "attachment"
  | "attachments"
  | "pdf"
  | "image"
  | "document"
  | "spreadsheet"
  | "video"
  | "audio"
  | "archive";

export type IsOperatorValue = "unread" | "read" | "starred" | "unstarred";
export type InOperatorValue =
  | "inbox"
  | "sent"
  | "trash"
  | "drafts"
  | "spam"
  | "archive"
  | "all";

export type DateShortcut =
  | "today"
  | "yesterday"
  | "this_week"
  | "last_week"
  | "this_month"
  | "last_month";

export interface ParsedOperator {
  type: SearchOperatorType;
  value: string;
  raw: string;
  negated: boolean;
}

export interface ParsedSearchQuery {
  text_query: string;
  operators: ParsedOperator[];
}

export interface ActiveFilter {
  id: string;
  type: SearchOperatorType | "quick";
  label: string;
  value: string;
  removable: boolean;
}

export type SortOption = "relevance" | "date_newest" | "date_oldest" | "sender";

export interface SearchScope {
  type: "all" | "current_folder";
  folder?: string;
}

const OPERATOR_REGEX =
  /(?:^|\s)(-)?(?:NOT\s+)?(from|to|subject|has|is|in|before|after|label|date|filename|attachment|larger|smaller|size|id):("([^"]+)"|(\S+))/gi;

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

const SIZE_REGEX = /^(\d+(?:\.\d+)?)(b|kb|mb|gb)?$/i;

const SIZE_RANGE_REGEX =
  /^(\d+(?:\.\d+)?)(b|kb|mb|gb)?-(\d+(?:\.\d+)?)(b|kb|mb|gb)?$/i;

const ATTACHMENT_MIME_MAP: Record<string, string[]> = {
  pdf: ["application/pdf"],
  image: [
    "image/jpeg",
    "image/png",
    "image/gif",
    "image/webp",
    "image/svg+xml",
    "image/bmp",
  ],
  document: [
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.oasis.opendocument.text",
    "text/plain",
    "text/rtf",
    "application/rtf",
  ],
  spreadsheet: [
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.oasis.opendocument.spreadsheet",
    "text/csv",
  ],
  video: [
    "video/mp4",
    "video/webm",
    "video/avi",
    "video/quicktime",
    "video/x-msvideo",
  ],
  audio: [
    "audio/mpeg",
    "audio/wav",
    "audio/ogg",
    "audio/mp3",
    "audio/aac",
    "audio/flac",
  ],
  archive: [
    "application/zip",
    "application/x-rar-compressed",
    "application/x-7z-compressed",
    "application/gzip",
    "application/x-tar",
  ],
};

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

export function get_operator_suggestions(
  partial: string,
): { operator: string; description: string }[] {
  const operators = [
    { operator: "from:", description: "Search by sender" },
    { operator: "to:", description: "Search by recipient" },
    { operator: "subject:", description: "Search in subject" },
    { operator: "has:attachment", description: "Has attachments" },
    { operator: "has:pdf", description: "Has PDF attachments" },
    { operator: "has:image", description: "Has image attachments" },
    { operator: "has:document", description: "Has document attachments" },
    { operator: "has:spreadsheet", description: "Has spreadsheet attachments" },
    { operator: "has:video", description: "Has video attachments" },
    { operator: "has:audio", description: "Has audio attachments" },
    { operator: "has:archive", description: "Has archive attachments" },
    { operator: "is:unread", description: "Unread emails" },
    { operator: "is:starred", description: "Starred emails" },
    { operator: "is:read", description: "Read emails" },
    { operator: "in:inbox", description: "In inbox" },
    { operator: "in:sent", description: "In sent folder" },
    { operator: "in:trash", description: "In trash" },
    { operator: "in:drafts", description: "In drafts" },
    { operator: "before:", description: "Before date (YYYY-MM-DD)" },
    { operator: "after:", description: "After date (YYYY-MM-DD)" },
    { operator: "date:today", description: "From today" },
    { operator: "date:yesterday", description: "From yesterday" },
    { operator: "date:this_week", description: "From this week" },
    { operator: "date:last_week", description: "From last week" },
    { operator: "date:this_month", description: "From this month" },
    { operator: "date:last_month", description: "From last month" },
    { operator: "larger:", description: "Larger than size (e.g., 5mb)" },
    { operator: "smaller:", description: "Smaller than size (e.g., 1mb)" },
    { operator: "size:", description: "Size range (e.g., 1mb-10mb)" },
    { operator: "filename:", description: "Search attachment filename" },
    { operator: "label:", description: "Search by label" },
    { operator: "id:", description: "Search by message ID" },
    { operator: "-from:", description: "Exclude sender" },
    { operator: "-has:attachment", description: "Without attachments" },
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

function handle_negated_operator(
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
): ActiveFilter[] {
  return operators.map((op, index) => {
    let label = "";
    const negation_prefix = op.negated ? "Not " : "";

    switch (op.type) {
      case "from":
        label = `${negation_prefix}From: ${op.value}`;
        break;
      case "to":
        label = `${negation_prefix}To: ${op.value}`;
        break;
      case "subject":
        label = `${negation_prefix}Subject: ${op.value}`;
        break;
      case "has": {
        const has_value = op.value.toLowerCase();

        if (["attachment", "attachments"].includes(has_value)) {
          label = op.negated ? "No attachments" : "Has attachment";
        } else {
          const type_labels: Record<string, string> = {
            pdf: "PDF",
            image: "Image",
            document: "Document",
            spreadsheet: "Spreadsheet",
            video: "Video",
            audio: "Audio",
            archive: "Archive",
          };
          const type_label = type_labels[has_value] || has_value;

          label = op.negated ? `No ${type_label}` : `Has ${type_label}`;
        }
        break;
      }
      case "is":
        switch (op.value.toLowerCase()) {
          case "unread":
            label = "Unread";
            break;
          case "read":
            label = "Read";
            break;
          case "starred":
            label = "Starred";
            break;
          case "unstarred":
            label = "Not starred";
            break;
          default:
            label = op.value;
        }
        break;
      case "in":
        label = `In: ${op.value}`;
        break;
      case "before":
        label = `Before: ${op.value}`;
        break;
      case "after":
        label = `After: ${op.value}`;
        break;
      case "date": {
        if (is_valid_date_shortcut(op.value)) {
          const shortcut_labels: Record<string, string> = {
            today: "Today",
            yesterday: "Yesterday",
            this_week: "This week",
            last_week: "Last week",
            this_month: "This month",
            last_month: "Last month",
          };

          label = shortcut_labels[op.value.toLowerCase()] || op.value;
        } else {
          label = `Date: ${op.value}`;
        }
        break;
      }
      case "label":
        label = `Label: ${op.value}`;
        break;
      case "filename":
      case "attachment":
        label = `Filename: ${op.value}`;
        break;
      case "id":
        label = `ID: ${op.value}`;
        break;
      case "larger":
        label = `Larger: ${op.value}`;
        break;
      case "smaller":
        label = `Smaller: ${op.value}`;
        break;
      case "size":
        label = `Size: ${op.value}`;
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

export function remove_operator_from_query(
  query: string,
  operator_raw: string,
): string {
  return query.replace(operator_raw, "").replace(/\s+/g, " ").trim();
}

export function add_operator_to_query(
  query: string,
  operator: string,
  value: string,
): string {
  const formatted_value = value.includes(" ") ? `"${value}"` : value;
  const operator_string = `${operator}:${formatted_value}`;

  if (query.trim()) {
    return `${query.trim()} ${operator_string}`;
  }

  return operator_string;
}

export function format_date_for_operator(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

export function parse_operator_date(date_string: string): Date | null {
  if (!DATE_REGEX.test(date_string)) {
    return null;
  }

  const [year, month, day] = date_string.split("-").map(Number);
  const date = new Date(year, month - 1, day);

  if (isNaN(date.getTime())) {
    return null;
  }

  return date;
}

export function get_quick_filters(): {
  id: string;
  label: string;
  operator: string;
}[] {
  return [
    { id: "unread", label: "Unread", operator: "is:unread" },
    { id: "starred", label: "Starred", operator: "is:starred" },
    { id: "attachment", label: "Has attachment", operator: "has:attachment" },
    {
      id: "today",
      label: "Today",
      operator: `after:${format_date_for_operator(get_today_start())}`,
    },
    {
      id: "this_week",
      label: "This week",
      operator: `after:${format_date_for_operator(get_week_start())}`,
    },
  ];
}

function get_today_start(): Date {
  const today = new Date();

  today.setHours(0, 0, 0, 0);

  return today;
}

function get_today_end(): Date {
  const today = new Date();

  today.setHours(23, 59, 59, 999);

  return today;
}

function get_week_start(): Date {
  const today = new Date();
  const day_of_week = today.getDay();
  const diff = today.getDate() - day_of_week + (day_of_week === 0 ? -6 : 1);
  const monday = new Date(today.setDate(diff));

  monday.setHours(0, 0, 0, 0);

  return monday;
}

function get_week_end(): Date {
  const week_start = get_week_start();
  const sunday = new Date(week_start);

  sunday.setDate(sunday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);

  return sunday;
}

function get_month_start(): Date {
  const today = new Date();

  return new Date(today.getFullYear(), today.getMonth(), 1);
}

function get_month_end(): Date {
  const today = new Date();
  const end = new Date(today.getFullYear(), today.getMonth() + 1, 0);

  end.setHours(23, 59, 59, 999);

  return end;
}

function get_last_week_start(): Date {
  const week_start = get_week_start();
  const last_week = new Date(week_start);

  last_week.setDate(last_week.getDate() - 7);

  return last_week;
}

function get_last_week_end(): Date {
  const week_start = get_week_start();
  const last_week_end = new Date(week_start);

  last_week_end.setDate(last_week_end.getDate() - 1);
  last_week_end.setHours(23, 59, 59, 999);

  return last_week_end;
}

function get_last_month_start(): Date {
  const today = new Date();

  return new Date(today.getFullYear(), today.getMonth() - 1, 1);
}

function get_last_month_end(): Date {
  const today = new Date();
  const end = new Date(today.getFullYear(), today.getMonth(), 0);

  end.setHours(23, 59, 59, 999);

  return end;
}

function get_yesterday_start(): Date {
  const yesterday = new Date();

  yesterday.setDate(yesterday.getDate() - 1);
  yesterday.setHours(0, 0, 0, 0);

  return yesterday;
}

function get_yesterday_end(): Date {
  const yesterday = new Date();

  yesterday.setDate(yesterday.getDate() - 1);
  yesterday.setHours(23, 59, 59, 999);

  return yesterday;
}

export function is_valid_date_shortcut(value: string): boolean {
  const shortcuts: DateShortcut[] = [
    "today",
    "yesterday",
    "this_week",
    "last_week",
    "this_month",
    "last_month",
  ];

  return shortcuts.includes(value.toLowerCase() as DateShortcut);
}

export function expand_date_shortcut(
  shortcut: string,
): { date_from: string; date_to: string } | null {
  const lower = shortcut.toLowerCase() as DateShortcut;

  switch (lower) {
    case "today":
      return {
        date_from: format_date_for_operator(get_today_start()),
        date_to: format_date_for_operator(get_today_end()),
      };
    case "yesterday":
      return {
        date_from: format_date_for_operator(get_yesterday_start()),
        date_to: format_date_for_operator(get_yesterday_end()),
      };
    case "this_week":
      return {
        date_from: format_date_for_operator(get_week_start()),
        date_to: format_date_for_operator(get_week_end()),
      };
    case "last_week":
      return {
        date_from: format_date_for_operator(get_last_week_start()),
        date_to: format_date_for_operator(get_last_week_end()),
      };
    case "this_month":
      return {
        date_from: format_date_for_operator(get_month_start()),
        date_to: format_date_for_operator(get_month_end()),
      };
    case "last_month":
      return {
        date_from: format_date_for_operator(get_last_month_start()),
        date_to: format_date_for_operator(get_last_month_end()),
      };
    default:
      return null;
  }
}

export function parse_size_value(value: string): number | null {
  const match = value.toLowerCase().match(SIZE_REGEX);

  if (!match) {
    return null;
  }

  const num = parseFloat(match[1]);

  if (isNaN(num) || num < 0) {
    return null;
  }

  const unit = (match[2] || "b").toLowerCase();
  const multipliers: Record<string, number> = {
    b: 1,
    kb: 1024,
    mb: 1024 * 1024,
    gb: 1024 * 1024 * 1024,
  };

  const multiplier = multipliers[unit] || 1;

  const result = Math.floor(num * multiplier);

  if (result > Number.MAX_SAFE_INTEGER) {
    return Number.MAX_SAFE_INTEGER;
  }

  return result;
}

export function parse_size_range(
  value: string,
): { min: number; max: number } | null {
  const match = value.toLowerCase().match(SIZE_RANGE_REGEX);

  if (!match) {
    return null;
  }

  const min_num = parseFloat(match[1]);
  const min_unit = (match[2] || "b").toLowerCase();
  const max_num = parseFloat(match[3]);
  const max_unit = (match[4] || "b").toLowerCase();

  if (isNaN(min_num) || isNaN(max_num) || min_num < 0 || max_num < 0) {
    return null;
  }

  const multipliers: Record<string, number> = {
    b: 1,
    kb: 1024,
    mb: 1024 * 1024,
    gb: 1024 * 1024 * 1024,
  };

  const min = Math.floor(min_num * (multipliers[min_unit] || 1));
  const max = Math.floor(max_num * (multipliers[max_unit] || 1));

  if (min > max) {
    return { min: max, max: min };
  }

  return { min, max };
}

export function format_size_for_display(bytes: number): string {
  if (bytes === 0) {
    return "0 B";
  }

  const units = ["B", "KB", "MB", "GB"];
  const k = 1024;
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const value = bytes / Math.pow(k, i);

  return `${value.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

export function get_attachment_mimes(type: string): string[] {
  return ATTACHMENT_MIME_MAP[type.toLowerCase()] || [];
}

export function build_query_from_filters(filters: {
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
}): string {
  const parts: string[] = [];

  if (filters.from) {
    parts.push(
      `from:${filters.from.includes(" ") ? `"${filters.from}"` : filters.from}`,
    );
  }

  if (filters.to) {
    parts.push(
      `to:${filters.to.includes(" ") ? `"${filters.to}"` : filters.to}`,
    );
  }

  if (filters.subject) {
    parts.push(
      `subject:${filters.subject.includes(" ") ? `"${filters.subject}"` : filters.subject}`,
    );
  }

  if (filters.has_attachments) {
    parts.push("has:attachment");
  }

  if (filters.is_read === false) {
    parts.push("is:unread");
  } else if (filters.is_read === true) {
    parts.push("is:read");
  }

  if (filters.is_starred === true) {
    parts.push("is:starred");
  } else if (filters.is_starred === false) {
    parts.push("is:unstarred");
  }

  if (filters.folder) {
    parts.push(`in:${filters.folder}`);
  }

  if (filters.date_from) {
    parts.push(`after:${filters.date_from}`);
  }

  if (filters.date_to) {
    parts.push(`before:${filters.date_to}`);
  }

  if (filters.labels) {
    for (const label of filters.labels) {
      parts.push(`label:${label.includes(" ") ? `"${label}"` : label}`);
    }
  }

  return parts.join(" ");
}
