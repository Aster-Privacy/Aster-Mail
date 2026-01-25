export const MODAL_SIZES = {
  small: { width: 400, height: 300 },
  medium: { width: 600, height: 500 },
  large: { width: 600, height: 600 },
} as const;

export const BUTTON_COLORS = {
  primary: "linear-gradient(to bottom, #526ef9, #374feb)",
  danger: "#ef4444",
  success: "#22c55e",
  warning: "#f59e0b",
  disabled: "#d1d5db",
} as const;

export type ModalSize = (typeof MODAL_SIZES)[keyof typeof MODAL_SIZES];
