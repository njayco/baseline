import React from "react";
import { Mic, Circle, Square, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface InstrumentSelectorProps {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  variant?: "grid" | "vertical";
}

const INSTRUMENTS = [
  { id: "beatbox", label: "Beatbox (Drums)", icon: Square, enabled: true },
  { id: "humming", label: "Humming", icon: Mic, enabled: false },
  { id: "whistle", label: "Whistle", icon: Circle, enabled: false },
  { id: "piano", label: "Piano", icon: Square, enabled: false },
  { id: "drums", label: "Drums", icon: Circle, enabled: false },
];

export function InstrumentSelector({ value, onChange, className, variant = "grid" }: InstrumentSelectorProps) {
  return (
    <div className={cn(
      variant === "grid" ? "grid grid-cols-2 gap-2 p-4" : "flex flex-col gap-2 p-0",
      className
    )}>
      {INSTRUMENTS.map((inst) => (
        <Button
          key={inst.id}
          variant={value === inst.id ? "default" : "secondary"}
          className={cn(
            "justify-start font-medium transition-all duration-200 relative",
            variant === "grid" ? "h-12" : "h-10 w-full",
            inst.enabled
              ? value === inst.id 
                ? "bg-primary text-primary-foreground shadow-[0_0_15px_rgba(251,146,60,0.5)] border-primary" 
                : "bg-muted/50 text-muted-foreground hover:bg-muted"
              : "bg-muted/20 text-muted-foreground/40 cursor-not-allowed hover:bg-muted/20"
          )}
          onClick={() => inst.enabled && onChange(inst.id)}
          disabled={!inst.enabled}
          data-testid={`instrument-${inst.id}`}
        >
          {inst.enabled ? (
            <inst.icon className="mr-2 h-4 w-4" />
          ) : (
            <Lock className="mr-2 h-3 w-3 opacity-50" />
          )}
          {inst.label}
          {!inst.enabled && (
            <span className="ml-auto text-[10px] uppercase tracking-wider opacity-50">Coming soon</span>
          )}
        </Button>
      ))}
    </div>
  );
}
