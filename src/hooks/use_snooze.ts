import { useState, useCallback } from "react";

import { emit_snoozed_changed } from "./mail_events";

import {
  snooze_email,
  bulk_snooze_emails,
  unsnooze_email,
  unsnooze_by_mail_item,
  list_snoozed_emails,
  type SnoozedItem,
  type BulkSnoozeResponse,
} from "@/services/api/snooze";

interface UseSnoozeReturn {
  snooze: (mail_item_id: string, snoozed_until: Date) => Promise<void>;
  bulk_snooze: (
    mail_item_ids: string[],
    snoozed_until: Date,
  ) => Promise<BulkSnoozeResponse>;
  unsnooze: (snooze_id: string) => Promise<void>;
  unsnooze_mail: (mail_item_id: string) => Promise<void>;
  list_snoozed: () => Promise<SnoozedItem[]>;
  is_loading: boolean;
  error: string | null;
}

export function use_snooze(): UseSnoozeReturn {
  const [is_loading, set_is_loading] = useState(false);
  const [error, set_error] = useState<string | null>(null);

  const snooze = useCallback(
    async (mail_item_id: string, snoozed_until: Date) => {
      set_is_loading(true);
      set_error(null);

      try {
        const response = await snooze_email(mail_item_id, snoozed_until);

        if (response.error) {
          throw new Error(response.error || "failed to snooze email");
        }

        window.dispatchEvent(
          new CustomEvent("astermail:mail-snoozed", {
            detail: {
              mail_item_id,
              snoozed_until: snoozed_until.toISOString(),
            },
          }),
        );
        emit_snoozed_changed();
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "failed to snooze email";

        set_error(message);
        throw err;
      } finally {
        set_is_loading(false);
      }
    },
    [],
  );

  const bulk_snooze = useCallback(
    async (
      mail_item_ids: string[],
      snoozed_until: Date,
    ): Promise<BulkSnoozeResponse> => {
      set_is_loading(true);
      set_error(null);

      try {
        const response = await bulk_snooze_emails(mail_item_ids, snoozed_until);

        if (response.error) {
          throw new Error(response.error || "failed to snooze emails");
        }

        window.dispatchEvent(
          new CustomEvent("astermail:mail-bulk-snoozed", {
            detail: {
              mail_item_ids,
              snoozed_until: snoozed_until.toISOString(),
            },
          }),
        );
        emit_snoozed_changed();

        return (
          response.data || {
            snoozed_count: 0,
            failed_count: mail_item_ids.length,
          }
        );
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "failed to snooze emails";

        set_error(message);
        throw err;
      } finally {
        set_is_loading(false);
      }
    },
    [],
  );

  const unsnooze = useCallback(async (snooze_id: string) => {
    set_is_loading(true);
    set_error(null);

    try {
      const response = await unsnooze_email(snooze_id);

      if (response.error) {
        throw new Error(response.error || "failed to unsnooze email");
      }

      window.dispatchEvent(
        new CustomEvent("astermail:mail-unsnoozed", {
          detail: { snooze_id },
        }),
      );
      emit_snoozed_changed();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "failed to unsnooze email";

      set_error(message);
      throw err;
    } finally {
      set_is_loading(false);
    }
  }, []);

  const unsnooze_mail = useCallback(async (mail_item_id: string) => {
    set_is_loading(true);
    set_error(null);

    try {
      const response = await unsnooze_by_mail_item(mail_item_id);

      if (response.error) {
        throw new Error(response.error || "failed to unsnooze email");
      }

      window.dispatchEvent(
        new CustomEvent("astermail:mail-unsnoozed", {
          detail: { mail_item_id },
        }),
      );
      emit_snoozed_changed();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "failed to unsnooze email";

      set_error(message);
      throw err;
    } finally {
      set_is_loading(false);
    }
  }, []);

  const list_snoozed = useCallback(async (): Promise<SnoozedItem[]> => {
    set_is_loading(true);
    set_error(null);

    try {
      const response = await list_snoozed_emails();

      if (response.error) {
        throw new Error(response.error || "failed to list snoozed emails");
      }

      return response.data || [];
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "failed to list snoozed emails";

      set_error(message);
      throw err;
    } finally {
      set_is_loading(false);
    }
  }, []);

  return {
    snooze,
    bulk_snooze,
    unsnooze,
    unsnooze_mail,
    list_snoozed,
    is_loading,
    error,
  };
}
