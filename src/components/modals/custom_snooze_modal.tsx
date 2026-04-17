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
import { useState, useMemo, useCallback } from "react";
import { setHours, setMinutes, isBefore, startOfMinute } from "date-fns";
import { CalendarIcon } from "@heroicons/react/24/outline";
import { Button } from "@aster/ui";

import { use_i18n } from "@/lib/i18n/context";
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
} from "@/components/ui/dropdown_menu";

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
  const { t } = use_i18n();
  const [selected_date, set_selected_date] = useState<Date | undefined>(
    undefined,
  );
  const [selected_hour, set_selected_hour] = useState(9);
  const [selected_minute, set_selected_minute] = useState(0);
  const [is_loading, set_is_loading] = useState(false);

  const hours = useMemo(() => Array.from({ length: 24 }, (_, i) => i), []);
  const minutes = useMemo(() => [0, 15, 30, 45], []);

  const format_hour = (hour: number) => {
    const period = hour >= 12 ? t("common.pm") : t("common.am");
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
    <Modal is_open={is_open} on_close={handle_close} size="md">
      <ModalHeader>
        <ModalTitle className="flex items-center gap-2">
          <CalendarIcon className="h-5 w-5" />
          {t("common.pick_snooze_time")}
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
            {t("common.time_label")}
          </span>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button className="h-8 w-20" size="md" variant="outline">
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
              <Button className="h-8 w-16" size="md" variant="outline">
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
        <div className="flex mt-4 gap-2">
          <Button
            className="flex-1"
            size="md"
            variant="ghost"
            onClick={handle_close}
          >
            {t("common.cancel")}
          </Button>
          <Button
            className="flex-1"
            disabled={!is_valid_custom_time || is_loading}
            size="md"
            variant="depth"
            onClick={handle_confirm}
          >
            {t("mail.snooze")}
          </Button>
        </div>
      </ModalBody>
    </Modal>
  );
}
