export const MAIL_EVENTS = {
  MAIL_CHANGED: "astermail:mail-changed",
  MAIL_ITEM_UPDATED: "astermail:mail-item-updated",
  MAIL_ITEMS_REMOVED: "astermail:mail-items-removed",
  EMAIL_SENT: "astermail:email-sent",
  EMAIL_RECEIVED: "astermail:email-received",
  DRAFTS_CHANGED: "astermail:drafts-changed",
  DRAFT_UPDATED: "astermail:draft-updated",
  FOLDERS_CHANGED: "astermail:folders-changed",
  UNDO_SEND: "astermail:undo-send",
  MAIL_ACTION: "astermail:mail-action",
  SCHEDULED_CHANGED: "astermail:scheduled-changed",
  SCHEDULED_CANCELLED: "astermail:scheduled-cancelled",
  CONTACTS_CHANGED: "astermail:contacts-changed",
  SNOOZED_CHANGED: "astermail:snoozed-changed",
  THREAD_REPLY_SENT: "astermail:thread-reply-sent",
  AUTH_READY: "astermail:auth-ready",
} as const;

export type MailEventType = (typeof MAIL_EVENTS)[keyof typeof MAIL_EVENTS];

export interface MailActionEventDetail {
  action: "delete" | "archive" | "spam" | "star" | "read";
  ids: string[];
  success: boolean;
}

export interface DraftUpdatedEventDetail {
  id: string;
  version: number;
  to_recipients: string[];
  cc_recipients: string[];
  bcc_recipients: string[];
  subject: string;
  message: string;
}

export interface UndoSendEventDetail {
  message_id: string;
  action: "cancel" | "send";
}

export interface ScheduledChangedEventDetail {
  action: "created" | "cancelled" | "sent" | "updated";
  email_id?: string;
}

export interface ScheduledCancelledEventDetail {
  email_id: string;
  reason?: string;
}

export interface EmailReceivedEventDetail {
  email_id: string;
  sender: string;
  subject: string;
  is_reply?: boolean;
  has_mention?: boolean;
}

export interface ThreadReplySentEventDetail {
  thread_token: string;
  original_email_id?: string;
}

export interface MailItemUpdatedEventDetail {
  id: string;
  is_starred?: boolean;
  is_read?: boolean;
  is_pinned?: boolean;
  is_archived?: boolean;
  is_trashed?: boolean;
  is_spam?: boolean;
  folders?: { folder_token: string; name: string; color?: string }[];
}

export interface MailItemsRemovedEventDetail {
  ids: string[];
}

type EventDetailMap = {
  [MAIL_EVENTS.MAIL_CHANGED]: undefined;
  [MAIL_EVENTS.MAIL_ITEM_UPDATED]: MailItemUpdatedEventDetail;
  [MAIL_EVENTS.MAIL_ITEMS_REMOVED]: MailItemsRemovedEventDetail;
  [MAIL_EVENTS.EMAIL_SENT]: undefined;
  [MAIL_EVENTS.EMAIL_RECEIVED]: EmailReceivedEventDetail;
  [MAIL_EVENTS.DRAFTS_CHANGED]: undefined;
  [MAIL_EVENTS.DRAFT_UPDATED]: DraftUpdatedEventDetail;
  [MAIL_EVENTS.FOLDERS_CHANGED]: undefined;
  [MAIL_EVENTS.MAIL_ACTION]: MailActionEventDetail;
  [MAIL_EVENTS.UNDO_SEND]: UndoSendEventDetail;
  [MAIL_EVENTS.SCHEDULED_CHANGED]: ScheduledChangedEventDetail;
  [MAIL_EVENTS.SCHEDULED_CANCELLED]: ScheduledCancelledEventDetail;
  [MAIL_EVENTS.CONTACTS_CHANGED]: undefined;
  [MAIL_EVENTS.SNOOZED_CHANGED]: undefined;
  [MAIL_EVENTS.THREAD_REPLY_SENT]: ThreadReplySentEventDetail;
  [MAIL_EVENTS.AUTH_READY]: undefined;
};

type EventSubscription = () => void;

class MailEventBus {
  private listeners: Map<MailEventType, Set<EventSubscription>> = new Map();
  private debounce_timers: Map<MailEventType, ReturnType<typeof setTimeout>> =
    new Map();

  emit<K extends MailEventType>(
    event: K,
    detail?: EventDetailMap[K],
    debounce_ms?: number,
  ): void {
    if (debounce_ms) {
      const existing_timer = this.debounce_timers.get(event);

      if (existing_timer) {
        clearTimeout(existing_timer);
      }

      const timer = setTimeout(() => {
        this.dispatch_event(event, detail);
        this.debounce_timers.delete(event);
      }, debounce_ms);

      this.debounce_timers.set(event, timer);
    } else {
      this.dispatch_event(event, detail);
    }
  }

  private dispatch_event<K extends MailEventType>(
    event: K,
    detail?: EventDetailMap[K],
  ): void {
    window.dispatchEvent(
      detail !== undefined
        ? new CustomEvent(event, { detail })
        : new CustomEvent(event),
    );

    const handlers = this.listeners.get(event);

    if (handlers) {
      handlers.forEach((handler) => {
        try {
          handler();
        } catch {
          return;
        }
      });
    }
  }

  subscribe(event: MailEventType, handler: EventSubscription): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }

    this.listeners.get(event)!.add(handler);

    return () => {
      this.listeners.get(event)?.delete(handler);
    };
  }

  subscribe_multiple(
    events: MailEventType[],
    handler: EventSubscription,
  ): () => void {
    const unsubscribers = events.map((event) => this.subscribe(event, handler));

    return () => {
      unsubscribers.forEach((unsub) => unsub());
    };
  }

  clear(): void {
    this.listeners.clear();
    this.debounce_timers.forEach((timer) => clearTimeout(timer));
    this.debounce_timers.clear();
  }
}

export const mail_event_bus = new MailEventBus();

export function emit_mail_changed(): void {
  mail_event_bus.emit(MAIL_EVENTS.MAIL_CHANGED);
}

export function emit_mail_item_updated(
  detail: MailItemUpdatedEventDetail,
): void {
  mail_event_bus.emit(MAIL_EVENTS.MAIL_ITEM_UPDATED, detail);
}

export function emit_email_sent(): void {
  mail_event_bus.emit(MAIL_EVENTS.EMAIL_SENT);
}

export function emit_drafts_changed(): void {
  mail_event_bus.emit(MAIL_EVENTS.DRAFTS_CHANGED);
}

export function emit_folders_changed(): void {
  mail_event_bus.emit(MAIL_EVENTS.FOLDERS_CHANGED);
}

export function emit_mail_action(detail: MailActionEventDetail): void {
  mail_event_bus.emit(MAIL_EVENTS.MAIL_ACTION, detail);
}

export function emit_draft_updated(detail: DraftUpdatedEventDetail): void {
  mail_event_bus.emit(MAIL_EVENTS.DRAFT_UPDATED, detail);
}

export function emit_scheduled_changed(
  detail: ScheduledChangedEventDetail,
): void {
  mail_event_bus.emit(MAIL_EVENTS.SCHEDULED_CHANGED, detail);
}

export function emit_scheduled_cancelled(
  detail: ScheduledCancelledEventDetail,
): void {
  mail_event_bus.emit(MAIL_EVENTS.SCHEDULED_CANCELLED, detail);
}

export function emit_email_received(detail: EmailReceivedEventDetail): void {
  mail_event_bus.emit(MAIL_EVENTS.EMAIL_RECEIVED, detail);
}

export function emit_contacts_changed(): void {
  mail_event_bus.emit(MAIL_EVENTS.CONTACTS_CHANGED);
}

export function emit_snoozed_changed(): void {
  mail_event_bus.emit(MAIL_EVENTS.SNOOZED_CHANGED);
}

export function emit_thread_reply_sent(
  detail: ThreadReplySentEventDetail,
): void {
  mail_event_bus.emit(MAIL_EVENTS.THREAD_REPLY_SENT, detail);
}

export function emit_mail_items_removed(
  detail: MailItemsRemovedEventDetail,
): void {
  mail_event_bus.emit(MAIL_EVENTS.MAIL_ITEMS_REMOVED, detail);
}

export function emit_auth_ready(): void {
  mail_event_bus.emit(MAIL_EVENTS.AUTH_READY);
}
