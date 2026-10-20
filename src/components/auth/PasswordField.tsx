import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { getPasswordRequirementResults } from "@/lib/passwordPolicy";

type PasswordFieldProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete?: string;
  required?: boolean;
  showRequirements?: boolean;
};

export function PasswordField({ label, value, onChange, autoComplete = "new-password", required = true, showRequirements = false }: PasswordFieldProps) {
  const [visible, setVisible] = useState(false);
  const inputId = `auth-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  const requirements = getPasswordRequirementResults(value);

  return (
    <div>
      <label htmlFor={inputId} className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</label>
      <div className="relative mt-1">
        <input
          id={inputId}
          type={visible ? "text" : "password"}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          autoComplete={autoComplete}
          required={required}
          className="w-full rounded-md border border-border bg-background px-3 py-2 pr-12 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
        <button
          type="button"
          aria-label={visible ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}
          aria-pressed={visible}
          onClick={() => setVisible((current) => !current)}
          className="absolute inset-y-0 right-2 inline-flex items-center justify-center px-2 text-muted-foreground hover:text-primary"
        >
          {visible ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
        </button>
      </div>
      {showRequirements && (
        <ul className="mt-2 space-y-1 text-xs" aria-label="Password requirements">
          {requirements.map((requirement) => (
            <li key={requirement.id} className={requirement.satisfied ? "text-emerald-700" : "text-muted-foreground"}>
              <span aria-hidden="true">{requirement.satisfied ? "✓" : "○"}</span>{" "}
              <span>{requirement.label}</span>
              <span className="sr-only">{requirement.satisfied ? " satisfied" : " not satisfied"}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
