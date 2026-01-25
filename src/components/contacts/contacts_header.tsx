import {
  MagnifyingGlassIcon,
  PlusIcon,
  ArrowLeftIcon,
  TrashIcon,
  EnvelopeIcon,
} from "@heroicons/react/24/outline";
import { useNavigate } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface ContactsHeaderProps {
  search_query: string;
  on_search_change: (query: string) => void;
  on_add_click: () => void;
  contact_count: number;
  filtered_count: number;
  hide_title?: boolean;
  selected_count?: number;
  all_selected?: boolean;
  some_selected?: boolean;
  on_toggle_select_all?: () => void;
  on_delete_selected?: () => void;
  on_compose_to_selected?: () => void;
}

export function ContactsHeader({
  search_query,
  on_search_change,
  on_add_click,
  contact_count,
  filtered_count,
  hide_title = false,
  selected_count = 0,
  all_selected = false,
  some_selected = false,
  on_toggle_select_all,
  on_delete_selected,
  on_compose_to_selected,
}: ContactsHeaderProps) {
  const navigate = useNavigate();
  const has_selection = all_selected || some_selected;

  return (
    <div
      className="flex-shrink-0 border-b"
      style={{ borderColor: "var(--border-primary)" }}
    >
      {!hide_title && (
        <div className="flex items-center justify-between px-4 md:px-6 py-4">
          <div className="flex items-center gap-3">
            <Button
              className="h-9 w-9 md:hidden"
              size="icon"
              variant="ghost"
              onClick={() => navigate(-1)}
            >
              <ArrowLeftIcon
                className="h-5 w-5"
                style={{ color: "var(--text-primary)" }}
              />
            </Button>
            <div className="flex items-center gap-3">
              <h1
                className="text-xl font-semibold"
                style={{ color: "var(--text-primary)" }}
              >
                Contacts
              </h1>
              <span
                className="px-2 py-0.5 text-xs font-medium rounded-full"
                style={{
                  backgroundColor: "var(--bg-secondary)",
                  color: "var(--text-muted)",
                }}
              >
                {contact_count}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              className="h-9 px-4 font-medium"
              size="sm"
              onClick={on_add_click}
            >
              <PlusIcon className="h-4 w-4 mr-1.5" />
              <span className="hidden sm:inline">Add</span>
            </Button>
          </div>
        </div>
      )}

      <div className={`px-4 md:px-6 ${hide_title ? "pt-4" : ""} pb-4`}>
        <div className="relative flex-1">
          <MagnifyingGlassIcon
            className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4"
            style={{ color: "var(--text-muted)" }}
          />
          <Input
            className="pl-10 h-10"
            placeholder="Search contacts..."
            style={{
              backgroundColor: "var(--bg-secondary)",
              borderColor: "var(--border-secondary)",
            }}
            value={search_query}
            onChange={(e) => on_search_change(e.target.value)}
          />
        </div>
      </div>

      <div
        className="flex items-center gap-2 px-3 sm:px-4 py-2 border-t"
        style={{ borderColor: "var(--border-primary)" }}
      >
        <TooltipProvider delayDuration={0}>
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex-shrink-0">
                <Checkbox
                  checked={all_selected}
                  indeterminate={some_selected}
                  onCheckedChange={on_toggle_select_all}
                />
              </div>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              {all_selected ? "Deselect all" : "Select all"}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>

        {has_selection ? (
          <div className="flex items-center gap-1 ml-2">
            <span
              className="text-sm font-medium mr-2"
              style={{ color: "var(--text-primary)" }}
            >
              {selected_count} selected
            </span>

            <TooltipProvider delayDuration={0}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    className="h-8 w-8"
                    size="icon"
                    variant="ghost"
                    onClick={on_compose_to_selected}
                  >
                    <EnvelopeIcon
                      className="h-4 w-4"
                      style={{ color: "var(--text-secondary)" }}
                    />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">Compose email</TooltipContent>
              </Tooltip>
            </TooltipProvider>

            <TooltipProvider delayDuration={0}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    className="h-8 w-8 text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10"
                    size="icon"
                    variant="ghost"
                    onClick={on_delete_selected}
                  >
                    <TrashIcon className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">Delete selected</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        ) : (
          <span className="text-sm ml-2" style={{ color: "var(--text-muted)" }}>
            {filtered_count === contact_count
              ? `${contact_count} ${contact_count === 1 ? "contact" : "contacts"}`
              : `${filtered_count} of ${contact_count}`}
          </span>
        )}
      </div>
    </div>
  );
}
