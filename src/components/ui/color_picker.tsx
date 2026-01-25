import * as React from "react";
import { HexColorPicker } from "react-colorful";

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

interface ColorPickerProps {
  value: string;
  onChange: (color: string) => void;
  children: React.ReactNode;
  presets?: string[];
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

const default_presets = [
  "#000000",
  "#ffffff",
  "#ef4444",
  "#f97316",
  "#f59e0b",
  "#eab308",
  "#84cc16",
  "#22c55e",
  "#10b981",
  "#14b8a6",
  "#06b6d4",
  "#0ea5e9",
  "#3b82f6",
  "#6366f1",
  "#8b5cf6",
  "#a855f7",
  "#d946ef",
  "#ec4899",
];

const color_picker_styles = `
  .react-colorful {
    width: 100% !important;
  }

  .react-colorful__saturation {
    border-radius: 6px 6px 0 0;
    border-bottom: none;
    height: 180px !important;
  }

  .react-colorful__hue {
    border-radius: 0 0 6px 6px;
    height: 14px;
  }

  .react-colorful__pointer {
    width: 18px;
    height: 18px;
    border: 2px solid #ffffff;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
  }

  .dark .react-colorful__pointer {
    border-color: var(--border-primary);
  }
`;

export function ColorPicker({
  value,
  onChange,
  children,
  presets = default_presets,
  open: controlled_open,
  onOpenChange,
}: ColorPickerProps) {
  const [internal_open, set_internal_open] = React.useState(false);
  const [input_value, set_input_value] = React.useState(value);

  const is_controlled = controlled_open !== undefined;
  const open = is_controlled ? controlled_open : internal_open;

  const set_open = React.useCallback(
    (new_open: boolean) => {
      onOpenChange?.(new_open);
      if (!is_controlled) set_internal_open(new_open);
    },
    [is_controlled, onOpenChange],
  );

  React.useEffect(() => set_input_value(value), [value]);

  React.useEffect(() => {
    if (!open) return;
    const handle_escape = (e: KeyboardEvent) => {
      if (e.key === "Escape") set_open(false);
    };

    document.addEventListener("keydown", handle_escape);

    return () => document.removeEventListener("keydown", handle_escape);
  }, [open, set_open]);

  const handle_input_change = (e: React.ChangeEvent<HTMLInputElement>) => {
    const new_value = e.target.value;

    set_input_value(new_value);
    if (/^#[0-9A-F]{6}$/i.test(new_value)) onChange(new_value);
  };

  const handle_input_blur = () => {
    if (!/^#[0-9A-F]{6}$/i.test(input_value)) set_input_value(value);
  };

  const handle_preset_click = (preset: string) => {
    onChange(preset);
    set_open(false);
  };

  const handle_interact_outside = (e: Event) => {
    const target = e.target as HTMLElement;

    if (
      target.closest('[role="dialog"]') ||
      target.closest(".react-colorful")
    ) {
      e.preventDefault();
    }
  };

  return (
    <>
      <style>{color_picker_styles}</style>
      <Popover open={open} onOpenChange={set_open}>
        <PopoverTrigger asChild>{children}</PopoverTrigger>
        <PopoverContent
          className="w-[340px] p-3"
          side="top"
          onInteractOutside={handle_interact_outside}
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <div className="flex flex-col gap-3 w-full">
            <HexColorPicker color={value} onChange={onChange} />
            <div className="flex items-center gap-2">
              <div
                className="w-8 h-8 rounded flex-shrink-0"
                style={{
                  backgroundColor: value,
                  border: "2px solid var(--border-primary)",
                }}
              />
              <input
                className={cn(
                  "flex-1 h-8 px-2 text-sm rounded",
                  "focus:outline-none focus:ring-2 focus:ring-blue-500/20",
                )}
                maxLength={7}
                placeholder="#000000"
                style={{
                  backgroundColor: "var(--input-bg)",
                  border: "1px solid var(--input-border)",
                  color: "var(--text-primary)",
                }}
                type="text"
                value={input_value}
                onBlur={handle_input_blur}
                onChange={handle_input_change}
              />
            </div>
            {presets.length > 0 && (
              <div className="grid grid-cols-9 gap-2">
                {presets.map((preset) => (
                  <button
                    key={preset}
                    className={cn(
                      "w-7 h-7 rounded transition-all hover:scale-110",
                      value.toLowerCase() === preset.toLowerCase() &&
                        "ring-2 ring-blue-500 ring-offset-1",
                    )}
                    style={{
                      backgroundColor: preset,
                      border: "2px solid var(--border-primary)",
                    }}
                    title={preset}
                    type="button"
                    onClick={() => handle_preset_click(preset)}
                  />
                ))}
              </div>
            )}
          </div>
        </PopoverContent>
      </Popover>
    </>
  );
}
