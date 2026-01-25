import { useState, useCallback } from "react";

import {
  GlobalSanitizer,
  SanitizerError,
  SanitizationRules,
} from "@/lib/global_sanitizer";

export interface UseSanitizerOptions<T> {
  rules: SanitizationRules<T>;
  on_error?: (error: SanitizerError) => void;
}

export function use_sanitizer<T extends Record<string, unknown>>(
  options: UseSanitizerOptions<T>,
) {
  const [errors, set_errors] = useState<Record<string, string>>({});

  const sanitize = useCallback(
    (
      data: T,
    ): { success: boolean; data?: T; errors: Record<string, string> } => {
      try {
        const sanitized_data = GlobalSanitizer.sanitize_object(
          data,
          options.rules,
        );

        set_errors({});

        return { success: true, data: sanitized_data, errors: {} };
      } catch (error) {
        if (error instanceof SanitizerError) {
          const error_key = error.message.split(":")[0];
          const error_msg = error.message;
          const error_obj: Record<string, string> = { [error_key]: error_msg };

          set_errors(error_obj);
          if (options.on_error) {
            options.on_error(error);
          }

          return { success: false, errors: error_obj };
        }
        throw error;
      }
    },
    [options],
  );

  const sanitize_field = useCallback(
    <K extends keyof T>(
      field: K,
      value: T[K],
    ): { success: boolean; value?: T[K]; error?: string } => {
      const rule = options.rules[field];

      if (!rule) {
        return { success: true, value };
      }

      try {
        const partial_data = { [field]: value } as unknown as T;
        const sanitized = GlobalSanitizer.sanitize_object(partial_data, {
          [field]: rule,
        } as SanitizationRules<T>);

        set_errors((prev) => {
          const next: Record<string, string> = { ...prev };

          delete next[field as string];

          return next;
        });

        return { success: true, value: sanitized[field] };
      } catch (error) {
        if (error instanceof SanitizerError) {
          const error_msg = error.message;

          set_errors((prev) => ({ ...prev, [field as string]: error_msg }));
          if (options.on_error) {
            options.on_error(error);
          }

          return { success: false, error: error_msg };
        }
        throw error;
      }
    },
    [options],
  );

  const clear_errors = useCallback(() => {
    set_errors({});
  }, []);

  const clear_field_error = useCallback((field: keyof T) => {
    set_errors((prev) => {
      const next: Record<string, string> = { ...prev };

      delete next[field as string];

      return next;
    });
  }, []);

  return {
    sanitize,
    sanitize_field,
    errors,
    clear_errors,
    clear_field_error,
    has_errors: Object.keys(errors).length > 0,
  };
}

export function use_sanitized_form<T extends Record<string, unknown>>(
  initial_values: T,
  rules: SanitizationRules<T>,
  on_submit: (data: T) => void | Promise<void>,
) {
  const [values, set_values] = useState<T>(initial_values);
  const [is_submitting, set_is_submitting] = useState(false);

  const { sanitize, sanitize_field, errors, clear_field_error, has_errors } =
    use_sanitizer({
      rules,
    });

  const handle_change = useCallback(
    <K extends keyof T>(field: K, value: T[K]) => {
      set_values((prev) => ({ ...prev, [field]: value }));
      clear_field_error(field);
    },
    [clear_field_error],
  );

  const handle_blur = useCallback(
    <K extends keyof T>(field: K) => {
      const value = values[field];

      sanitize_field(field, value);
    },
    [values, sanitize_field],
  );

  const handle_submit = useCallback(
    async (e?: React.FormEvent) => {
      if (e) {
        e.preventDefault();
      }

      const result = sanitize(values);

      if (!result.success || !result.data) {
        return;
      }

      set_is_submitting(true);
      try {
        await on_submit(result.data);
      } finally {
        set_is_submitting(false);
      }
    },
    [values, sanitize, on_submit],
  );

  const reset = useCallback(() => {
    set_values(initial_values);
  }, [initial_values]);

  return {
    values,
    errors,
    is_submitting,
    has_errors,
    handle_change,
    handle_blur,
    handle_submit,
    reset,
  };
}
