interface CustomCheckboxProps {
  checked: boolean;
  on_change: () => void;
}

export function CustomCheckbox({
  checked,
  on_change,
}: CustomCheckboxProps): React.ReactElement {
  return (
    <button
      className="w-5 h-5 rounded border-2 flex items-center justify-center transition-all"
      style={{
        backgroundColor: checked ? "#3b82f6" : "var(--bg-card)",
        borderColor: checked ? "#3b82f6" : "var(--border-secondary)",
      }}
      onClick={on_change}
    >
      {checked && (
        <svg
          className="w-3.5 h-3.5 text-white"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            d="M5 13l4 4L19 7"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={3}
          />
        </svg>
      )}
    </button>
  );
}
