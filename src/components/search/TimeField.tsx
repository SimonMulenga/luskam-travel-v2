import { Clock } from "lucide-react";

interface Props {
  label: string;
  value: string;
  onChange: (v: string) => void;
}

export const TimeField = ({ label, value, onChange }: Props) => (
  <label className="block rounded-md bg-surface px-3.5 py-2.5 ring-1 ring-border focus-within:ring-2 focus-within:ring-primary/40">
    <span className="block text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
    <div className="mt-1 flex items-center gap-2">
      <Clock className="h-4 w-4 shrink-0 text-muted-foreground" />
      <input
        type="time"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-transparent text-sm font-semibold text-foreground focus:outline-none"
      />
    </div>
  </label>
);
