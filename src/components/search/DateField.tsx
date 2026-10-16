import { Calendar as CalIcon } from "lucide-react";
import { format, isBefore, startOfDay } from "date-fns";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";

interface Props {
  label: string;
  value?: Date;
  onChange: (d: Date | undefined) => void;
  minDate?: Date;
  disabled?: boolean;
  error?: string;
}

export const DateField = ({ label, value, onChange, minDate, disabled, error }: Props) => {
  const errorId = `${label.toLowerCase().replace(/\s+/g, "-")}-date-error`;
  return (
    <div>
      <Popover>
        <PopoverTrigger asChild disabled={disabled}>
          <button
            type="button"
            aria-label={`${label}${value ? `, ${format(value, "EEEE, dd MMMM yyyy")}` : " date"}`}
            aria-invalid={Boolean(error)}
            aria-describedby={error ? errorId : undefined}
            className={`block min-h-[76px] w-full rounded-xl bg-surface px-3.5 py-3 text-left ring-1 transition-all duration-200 hover:bg-white hover:shadow-sm hover:ring-accent/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring ${error ? "ring-destructive" : "ring-border"} ${disabled ? "cursor-not-allowed opacity-50" : ""}`}
          >
            <span className="block text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
            <span className="mt-1 flex items-center gap-2">
              <CalIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="text-sm font-semibold text-foreground">
                {value ? format(value, "EEE, dd MMM yyyy") : "Select date"}
              </span>
            </span>
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-auto rounded-2xl p-0 shadow-xl">
          <Calendar
            mode="single"
            selected={value}
            onSelect={onChange}
            disabled={(date) => isBefore(startOfDay(date), startOfDay(minDate ?? new Date()))}
            initialFocus
            className="pointer-events-auto p-3"
          />
        </PopoverContent>
      </Popover>
      {error && <p id={errorId} role="alert" className="mt-1.5 text-xs font-medium text-destructive">{error}</p>}
    </div>
  );
};
