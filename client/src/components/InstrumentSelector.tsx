import React from "react";
import { Mic, Circle, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface InstrumentSelectorProps {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  variant?: "grid" | "vertical";
}

const INSTRUMENTS = [
  { id: "humming", label: "Humming", icon: Mic },
  { id: "whistle", label: "Whistle", icon: Circle },
  { id: "beatbox", label: "Beatbox", icon: Square },
  { id: "piano", label: "Piano", icon: Square },
  { id: "drums", label: "Drums", icon: Circle },
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
            "justify-start font-medium transition-all duration-200",
            variant === "grid" ? "h-12" : "h-10 w-full",
            value === inst.id 
              ? "bg-primary text-primary-foreground shadow-[0_0_15px_rgba(251,146,60,0.5)] border-primary" 
              : "bg-muted/50 text-muted-foreground hover:bg-muted"
          )}
          onClick={() => onChange(inst.id)}
          data-testid={`instrument-${inst.id}`}
        >
          <inst.icon className="mr-2 h-4 w-4" />
          {inst.label}
        </Button>
      ))}
    </div>
  );
}
