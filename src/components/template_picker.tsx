import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";

import { use_templates } from "@/contexts/templates_context";

interface TemplatePickerProps {
  on_select: (content: string) => void;
  disabled?: boolean;
}

export function TemplatePicker({
  on_select,
  disabled = false,
}: TemplatePickerProps) {
  const { templates, grouped_templates, is_loading } = use_templates();
  const [is_open, set_is_open] = useState(false);
  const container_ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handle_click_outside = (event: MouseEvent) => {
      if (
        container_ref.current &&
        !container_ref.current.contains(event.target as Node)
      ) {
        set_is_open(false);
      }
    };

    if (is_open) {
      document.addEventListener("mousedown", handle_click_outside);
    }

    return () => {
      document.removeEventListener("mousedown", handle_click_outside);
    };
  }, [is_open]);

  const handle_select = (content: string) => {
    on_select(content);
    set_is_open(false);
  };

  const is_disabled = disabled || is_loading || templates.length === 0;

  return (
    <div ref={container_ref} className="relative">
      <button
        className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        disabled={is_disabled}
        title={
          templates.length === 0 ? "No templates available" : "Insert template"
        }
        onClick={() => set_is_open(!is_open)}
      >
        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6z" />
        </svg>
      </button>

      <AnimatePresence>
        {is_open && (
          <motion.div
            animate={{ opacity: 1, y: 0 }}
            className="absolute z-50 mt-2 w-64 border rounded-lg shadow-lg bg-white dark:bg-gray-800"
            exit={{ opacity: 0, y: -10 }}
            initial={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.15 }}
          >
            <div className="max-h-96 overflow-y-auto">
              {Object.entries(grouped_templates).map(
                ([category, category_templates]) => (
                  <div key={category}>
                    <div className="px-4 py-2 text-xs font-semibold text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-700/50 sticky top-0">
                      {category}
                    </div>
                    {category_templates.map((template) => (
                      <button
                        key={template.id}
                        className="w-full px-4 py-2 text-sm text-left hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors border-b last:border-0 dark:border-gray-600"
                        onClick={() => handle_select(template.content)}
                      >
                        <div className="font-medium text-gray-900 dark:text-white">
                          {template.name}
                        </div>
                        <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
                          {template.content.substring(0, 50)}
                        </div>
                      </button>
                    ))}
                  </div>
                ),
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
