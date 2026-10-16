import { Users, Minus, Plus } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export type CabinClass = "Economy" | "Premium Economy" | "Business" | "First";
export interface PaxState {
  adults: number;
  children: number;
  infants: number;
  cabin: CabinClass;
}

interface Props {
  value: PaxState;
  onChange: (v: PaxState) => void;
  showCabin?: boolean;
  label?: string;
}

const Row = ({
  title,
  subtitle,
  count,
  min = 0,
  max = 9,
  onDec,
  onInc,
}: {
  title: string;
  subtitle: string;
  count: number;
  min?: number;
  max?: number;
  onDec: () => void;
  onInc: () => void;
}) => (
  <div className="flex items-center justify-between py-3">
    <div>
      <div className="text-sm font-semibold text-foreground">{title}</div>
      <div className="text-xs text-muted-foreground">{subtitle}</div>
    </div>
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={onDec}
        disabled={count <= min}
        className="flex h-10 w-10 items-center justify-center rounded-full border border-border text-foreground transition-colors hover:border-accent hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-30"
        aria-label={`Decrease ${title}`}
      >
        <Minus className="h-4 w-4" />
      </button>
      <span className="w-5 text-center text-sm font-semibold tabular-nums">{count}</span>
      <button
        type="button"
        onClick={onInc}
        disabled={count >= max}
        className="flex h-10 w-10 items-center justify-center rounded-full border border-border text-foreground transition-colors hover:border-accent hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-30"
        aria-label={`Increase ${title}`}
      >
        <Plus className="h-4 w-4" />
      </button>
    </div>
  </div>
);

export const PassengerSelect = ({ value, onChange, showCabin = true, label = "Passengers" }: Props) => {
  const total = value.adults + value.children + value.infants;
  const set = (k: keyof PaxState, v: number | string) => onChange({ ...value, [k]: v as never });

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="block min-h-[76px] w-full rounded-xl bg-surface px-3.5 py-3 text-left ring-1 ring-border transition-all duration-200 hover:bg-white hover:shadow-sm hover:ring-accent/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span className="block text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
          <div className="mt-1 flex items-center gap-2">
            <Users className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="truncate text-sm font-semibold text-foreground">
              {total} {total === 1 ? "Traveler" : "Travelers"}
              {showCabin ? ` · ${value.cabin}` : ""}
            </span>
          </div>
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(340px,calc(100vw-2rem))] rounded-2xl p-4 shadow-xl">
        <Row
          title="Adults"
          subtitle="12+ years"
          count={value.adults}
          min={1}
          onDec={() => set("adults", value.adults - 1)}
          onInc={() => set("adults", value.adults + 1)}
        />
        <div className="border-t border-border" />
        <Row
          title="Children"
          subtitle="2 – 11 years"
          count={value.children}
          onDec={() => set("children", value.children - 1)}
          onInc={() => set("children", value.children + 1)}
        />
        <div className="border-t border-border" />
        <Row
          title="Infants"
          subtitle="Under 2 years"
          count={value.infants}
          max={value.adults}
          onDec={() => set("infants", value.infants - 1)}
          onInc={() => set("infants", value.infants + 1)}
        />
        {showCabin && (
          <>
            <div className="mt-2 border-t border-border pt-3">
              <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Cabin class
              </label>
              <select
                value={value.cabin}
                onChange={(e) => set("cabin", e.target.value)}
                className="mt-1.5 w-full rounded-xl border border-border bg-background px-3 py-3 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-ring/40"
              >
                <option>Economy</option>
                <option>Premium Economy</option>
                <option>Business</option>
                <option>First</option>
              </select>
            </div>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
};
