import type {
  DecryptedCustomFieldDefinition,
  DecryptedCustomFieldValue,
  CustomFieldType,
} from "@/types/contacts";

import { useState, useCallback, useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  PlusIcon,
  TrashIcon,
  XMarkIcon,
  PencilIcon,
  CheckIcon,
} from "@heroicons/react/24/outline";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  list_custom_field_definitions,
  create_custom_field_definition,
  delete_custom_field_definition,
  set_contact_custom_field_value,
  delete_contact_custom_field_value,
} from "@/services/api/contact_custom_fields";

interface ContactCustomFieldsProps {
  contact_id: string;
  field_values: DecryptedCustomFieldValue[];
  on_field_values_change: (values: DecryptedCustomFieldValue[]) => void;
  disabled?: boolean;
}

const FIELD_TYPE_LABELS: Record<CustomFieldType, string> = {
  text: "Text",
  date: "Date",
  url: "URL",
  phone: "Phone",
  email: "Email",
  number: "Number",
};

const FIELD_TYPE_INPUTS: Record<CustomFieldType, string> = {
  text: "text",
  date: "date",
  url: "url",
  phone: "tel",
  email: "email",
  number: "number",
};

export function ContactCustomFields({
  contact_id,
  field_values,
  on_field_values_change,
  disabled = false,
}: ContactCustomFieldsProps) {
  const [definitions, set_definitions] = useState<
    DecryptedCustomFieldDefinition[]
  >([]);
  const [is_loading, set_is_loading] = useState(true);
  const [is_adding, set_is_adding] = useState(false);
  const [new_field_name, set_new_field_name] = useState("");
  const [new_field_type, set_new_field_type] = useState<CustomFieldType>("text");
  const [editing_field_id, set_editing_field_id] = useState<string | null>(null);
  const [editing_value, set_editing_value] = useState("");
  const [saving_field_id, set_saving_field_id] = useState<string | null>(null);
  const [deleting_definition_id, set_deleting_definition_id] = useState<
    string | null
  >(null);
  const [error, set_error] = useState<string | null>(null);

  const load_definitions = useCallback(async () => {
    set_is_loading(true);
    try {
      const response = await list_custom_field_definitions();
      if (response.data) {
        set_definitions(response.data);
      }
    } catch (err) {
      set_error(
        err instanceof Error ? err.message : "Failed to load custom fields",
      );
    } finally {
      set_is_loading(false);
    }
  }, []);

  useEffect(() => {
    load_definitions();
  }, [load_definitions]);

  const handle_create_definition = useCallback(async () => {
    if (!new_field_name.trim()) return;

    set_is_adding(true);
    set_error(null);

    try {
      const response = await create_custom_field_definition(
        new_field_name.trim(),
        new_field_type,
      );

      if (response.error || !response.data) {
        set_error(response.error || "Failed to create field");
        return;
      }

      set_definitions((prev) => [...prev, response.data!]);
      set_new_field_name("");
      set_new_field_type("text");
    } catch (err) {
      set_error(err instanceof Error ? err.message : "Failed to create field");
    } finally {
      set_is_adding(false);
    }
  }, [new_field_name, new_field_type]);

  const handle_delete_definition = useCallback(
    async (definition_id: string) => {
      set_deleting_definition_id(definition_id);
      set_error(null);

      try {
        const response = await delete_custom_field_definition(definition_id);

        if (response.error) {
          set_error(response.error);
          return;
        }

        set_definitions((prev) => prev.filter((d) => d.id !== definition_id));
        on_field_values_change(
          field_values.filter((v) => v.field_definition_id !== definition_id),
        );
      } catch (err) {
        set_error(err instanceof Error ? err.message : "Failed to delete field");
      } finally {
        set_deleting_definition_id(null);
      }
    },
    [field_values, on_field_values_change],
  );

  const handle_start_edit = useCallback(
    (definition: DecryptedCustomFieldDefinition) => {
      const existing_value = field_values.find(
        (v) => v.field_definition_id === definition.id,
      );
      set_editing_field_id(definition.id);
      set_editing_value(existing_value?.value || "");
    },
    [field_values],
  );

  const handle_save_value = useCallback(async () => {
    if (!editing_field_id) return;

    set_saving_field_id(editing_field_id);
    set_error(null);

    try {
      if (editing_value.trim()) {
        const response = await set_contact_custom_field_value(
          contact_id,
          editing_field_id,
          editing_value.trim(),
        );

        if (response.error) {
          set_error(response.error);
          return;
        }

        const existing_index = field_values.findIndex(
          (v) => v.field_definition_id === editing_field_id,
        );

        if (existing_index >= 0) {
          const updated = [...field_values];
          updated[existing_index] = {
            ...updated[existing_index],
            value: editing_value.trim(),
          };
          on_field_values_change(updated);
        } else {
          const definition = definitions.find((d) => d.id === editing_field_id);
          if (definition) {
            on_field_values_change([
              ...field_values,
              {
                id: crypto.randomUUID(),
                contact_id,
                field_definition_id: editing_field_id,
                field_name: definition.name,
                field_type: definition.field_type,
                value: editing_value.trim(),
                created_at: new Date().toISOString(),
              },
            ]);
          }
        }
      } else {
        const existing = field_values.find(
          (v) => v.field_definition_id === editing_field_id,
        );
        if (existing) {
          await delete_contact_custom_field_value(contact_id, editing_field_id);
          on_field_values_change(
            field_values.filter(
              (v) => v.field_definition_id !== editing_field_id,
            ),
          );
        }
      }

      set_editing_field_id(null);
      set_editing_value("");
    } catch (err) {
      set_error(err instanceof Error ? err.message : "Failed to save value");
    } finally {
      set_saving_field_id(null);
    }
  }, [
    contact_id,
    editing_field_id,
    editing_value,
    field_values,
    on_field_values_change,
  ]);

  const handle_cancel_edit = useCallback(() => {
    set_editing_field_id(null);
    set_editing_value("");
  }, []);

  const get_field_value = useCallback(
    (definition_id: string): string => {
      return field_values.find((v) => v.field_definition_id === definition_id)
        ?.value || "";
    },
    [field_values],
  );

  if (is_loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium text-foreground-600">
          Custom Fields
        </label>
      </div>

      <div className="space-y-3">
        <AnimatePresence mode="popLayout">
          {definitions.map((definition) => {
            const is_editing = editing_field_id === definition.id;
            const is_saving = saving_field_id === definition.id;
            const is_deleting = deleting_definition_id === definition.id;
            const current_value = get_field_value(definition.id);

            return (
              <motion.div
                key={definition.id}
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, x: -10 }}
                className="group"
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-medium text-foreground-500">
                    {definition.name}
                  </span>
                  <span className="text-[10px] text-foreground-400 bg-default-100 px-1.5 py-0.5 rounded">
                    {FIELD_TYPE_LABELS[definition.field_type]}
                  </span>
                  <div className="flex-1" />
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handle_delete_definition(definition.id)}
                    disabled={disabled || is_deleting}
                    className="p-1 h-auto opacity-0 group-hover:opacity-100 transition-opacity text-danger hover:bg-danger/10"
                  >
                    {is_deleting ? (
                      <div className="w-3 h-3 border-2 border-danger border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <TrashIcon className="w-3 h-3" />
                    )}
                  </Button>
                </div>

                {is_editing ? (
                  <div className="flex items-center gap-2">
                    <Input
                      type={FIELD_TYPE_INPUTS[definition.field_type]}
                      value={editing_value}
                      onChange={(e) => set_editing_value(e.target.value)}
                      placeholder={`Enter ${definition.name.toLowerCase()}...`}
                      className="flex-1"
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handle_save_value();
                        if (e.key === "Escape") handle_cancel_edit();
                      }}
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handle_save_value}
                      disabled={is_saving}
                      className="p-1.5 h-auto text-success hover:bg-success/10"
                    >
                      {is_saving ? (
                        <div className="w-4 h-4 border-2 border-success border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <CheckIcon className="w-4 h-4" />
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handle_cancel_edit}
                      disabled={is_saving}
                      className="p-1.5 h-auto text-foreground-500 hover:bg-default-100"
                    >
                      <XMarkIcon className="w-4 h-4" />
                    </Button>
                  </div>
                ) : (
                  <div
                    className={cn(
                      "flex items-center gap-2 p-2 rounded-lg border border-divider cursor-pointer hover:bg-default-50 transition-colors",
                      disabled && "cursor-not-allowed opacity-50",
                    )}
                    onClick={() => !disabled && handle_start_edit(definition)}
                  >
                    {current_value ? (
                      <span className="text-sm flex-1">{current_value}</span>
                    ) : (
                      <span className="text-sm text-foreground-400 flex-1 italic">
                        Click to add value...
                      </span>
                    )}
                    <PencilIcon className="w-4 h-4 text-foreground-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                )}
              </motion.div>
            );
          })}
        </AnimatePresence>

        {definitions.length === 0 && (
          <p className="text-sm text-foreground-500 text-center py-4">
            No custom fields defined yet
          </p>
        )}
      </div>

      <div className="border-t border-divider pt-4">
        <p className="text-xs text-foreground-500 mb-3">Add new field type</p>
        <div className="flex items-center gap-2">
          <Input
            value={new_field_name}
            onChange={(e) => set_new_field_name(e.target.value)}
            placeholder="Field name..."
            className="flex-1"
            onKeyDown={(e) => {
              if (e.key === "Enter") handle_create_definition();
            }}
          />
          <select
            value={new_field_type}
            onChange={(e) =>
              set_new_field_type(e.target.value as CustomFieldType)
            }
            className="h-9 px-2 rounded-lg border border-divider bg-background text-sm"
          >
            {Object.entries(FIELD_TYPE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <Button
            variant="ghost"
            size="sm"
            onClick={handle_create_definition}
            disabled={!new_field_name.trim() || is_adding}
            className="gap-1.5"
          >
            {is_adding ? (
              <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            ) : (
              <PlusIcon className="w-4 h-4" />
            )}
            Add
          </Button>
        </div>
      </div>

      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="flex items-center gap-2 text-xs text-danger"
          >
            <XMarkIcon className="w-4 h-4" />
            {error}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
