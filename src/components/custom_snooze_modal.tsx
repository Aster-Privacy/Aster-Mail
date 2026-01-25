import { useState, useMemo, useCallback } from "react";
import { setHours, setMinutes, isBefore, startOfMinute } from "date-fns";
import { CalendarIcon } from "@heroicons/react/24/outline";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Modal,
  ModalHeader,
  ModalTitle,
  ModalBody,
} from "@/components/ui/modal";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface CustomSnoozeModalProps {
  is_open: boolean;
  on_close: () => void;
  on_snooze: (snooze_until: Date) => Promise<void>;
}

export function CustomSnoozeModal({
  is_open,
  on_close,
  on_snooze,
}: CustomSnoozeModalProps) {
  const [selected_date, set_selected_date] = useState<Date | undefined>(
    undefined,
  );
  const [selected_hour, set_selected_hour] = useState(9);
  const [selected_minute, set_selected_minute] = useState(0);
  const [is_loading, set_is_loading] = useState(false);

  const hours = useMemo(() => Array.from({ length: 24 }, (_, i) => i), []);
  const minutes = useMemo(() => [0, 15, 30, 45], []);

  const format_hour = (hour: number) => {
    const period = hour >= 12 ? "PM" : "AM";
    const display_hour = hour % 12 || 12;

    return `${display_hour} ${period}`;
  };

  const is_valid_custom_time = useMemo(() => {
    if (!selected_date) return false;
    const scheduled = setMinutes(
      setHours(selected_date, selected_hour),
      selected_minute,
    );

    return !isBefore(scheduled, startOfMinute(new Date()));
  }, [selected_date, selected_hour, selected_minute]);

  const handle_confirm = useCallback(async () => {
    if (!selected_date || !is_valid_custom_time) return;

    const snooze_date = setMinutes(
      setHours(selected_date, selected_hour),
      selected_minute,
    );

    set_is_loading(true);
    try {
      await on_snooze(snooze_date);
      on_close();
      set_selected_date(undefined);
      set_selected_hour(9);
      set_selected_minute(0);
    } finally {
      set_is_loading(false);
    }
  }, [
    selected_date,
    selected_hour,
    selected_minute,
    is_valid_custom_time,
    on_snooze,
    on_close,
  ]);

  const handle_close = useCallback(() => {
    on_close();
    set_selected_date(undefined);
    set_selected_hour(9);
    set_selected_minute(0);
  }, [on_close]);

  return (
    <Modal is_open={is_open} on_close={handle_close} size="sm">
      <ModalHeader>
        <ModalTitle className="flex items-center gap-2">
          <CalendarIcon className="h-5 w-5" />
          Pick snooze time
        </ModalTitle>
      </ModalHeader>
      <ModalBody>
        <Calendar
          disabled={(date) => isBefore(date, startOfMinute(new Date()))}
          mode="single"
          selected={selected_date}
          onSelect={set_selected_date}
        />
        <div
          className="my-3 h-px"
          style={{ backgroundColor: "var(--border-secondary)" }}
        />
        <div className="flex items-center gap-2">
          <span
            className="text-sm font-medium"
            style={{ color: "var(--text-muted)" }}
          >
            Time:
          </span>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button className="h-8 w-20" size="sm" variant="outline">
                {format_hour(selected_hour)}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              className="max-h-60 overflow-y-auto"
              style={{
                backgroundColor: "var(--bg-primary)",
                borderColor: "var(--border-primary)",
              }}
            >
              {hours.map((hour) => (
                <DropdownMenuItem
                  key={hour}
                  onClick={() => set_selected_hour(hour)}
                >
                  {format_hour(hour)}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <span style={{ color: "var(--text-muted)" }}>:</span>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button className="h-8 w-16" size="sm" variant="outline">
                {selected_minute.toString().padStart(2, "0")}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              style={{
                backgroundColor: "var(--bg-primary)",
                borderColor: "var(--border-primary)",
              }}
            >
              {minutes.map((minute) => (
                <DropdownMenuItem
                  key={minute}
                  onClick={() => set_selected_minute(minute)}
                >
                  {minute.toString().padStart(2, "0")}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <div className="flex justify-end mt-4 gap-2">
          <Button size="sm" variant="ghost" onClick={handle_close}>
            Cancel
          </Button>
          <Button
            className={is_valid_custom_time ? "text-white" : ""}
            disabled={!is_valid_custom_time || is_loading}
            size="sm"
            style={{
              background: is_valid_custom_time
                ? "linear-gradient(to bottom, #6b8aff 0%, #4f6ef7 50%, #3b5ae8 100%)"
                : undefined,
            }}
            onClick={handle_confirm}
          >
            Snooze
          </Button>
        </div>
      </ModalBody>
    </Modal>
  );
}
