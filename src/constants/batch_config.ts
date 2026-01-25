export const BATCH_LIMITS = {
  MAIL_BULK: 100,
  ARCHIVE: 500,
  LABELS: 100,
  DRAFTS: 50,
} as const;

export const BATCH_DELAYS = {
  DEFAULT_MS: 0,
} as const;

export const PROGRESS_THRESHOLDS = {
  SHOW_TOAST_PROGRESS: 50,
  SHOW_MODAL: 200,
} as const;
