interface PasswordStrengthIndicatorProps {
  password: string;
}

export function PasswordStrengthIndicator({
  password,
}: PasswordStrengthIndicatorProps) {
  const get_strength = () => {
    if (!password) return { level: 0, label: "", color: "", suggestions: [] };

    let score = 0;
    const suggestions: string[] = [];

    if (password.length >= 8) score++;
    else suggestions.push("Use at least 8 characters");

    if (password.length >= 12) score++;
    else if (password.length >= 8)
      suggestions.push("Try 12+ characters for better security");

    if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score++;
    else suggestions.push("Mix uppercase and lowercase letters");

    if (/[0-9]/.test(password)) score++;
    else suggestions.push("Add some numbers");

    if (/[^A-Za-z0-9]/.test(password)) score++;
    else if (score >= 2) suggestions.push("Add special characters (!@#$%)");

    if (score <= 1)
      return { level: 1, label: "Weak", color: "#ef4444", suggestions };
    if (score === 2)
      return { level: 2, label: "Fair", color: "#f59e0b", suggestions };
    if (score === 3)
      return { level: 3, label: "Good", color: "#22c55e", suggestions };

    return { level: 4, label: "Strong", color: "#22c55e", suggestions: [] };
  };

  const strength = get_strength();

  if (!password) return null;

  return (
    <div className="mt-2">
      <div className="flex items-center gap-2">
        <div className="flex gap-1 flex-1">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="h-1 flex-1 rounded-full transition-colors"
              style={{
                backgroundColor:
                  i <= strength.level
                    ? strength.color
                    : "var(--border-secondary)",
              }}
            />
          ))}
        </div>
        <span className="text-xs" style={{ color: strength.color }}>
          {strength.label}
        </span>
      </div>
      {strength.suggestions.length > 0 && strength.level < 3 && (
        <p
          className="text-xs mt-1.5 text-left"
          style={{ color: "var(--text-muted)" }}
        >
          {strength.suggestions[0]}
        </p>
      )}
    </div>
  );
}
