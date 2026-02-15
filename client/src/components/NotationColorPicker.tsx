import React from "react";
import { type NotationColors, NOTATION_PRESETS } from "@/lib/types";

interface NotationColorPickerProps {
  value: string;
  onChange: (presetKey: string, colors: NotationColors) => void;
  variant?: "horizontal" | "vertical";
}

export function NotationColorPicker({ value, onChange, variant = "horizontal" }: NotationColorPickerProps) {
  const presetEntries = Object.entries(NOTATION_PRESETS);

  return (
    <div className={variant === "vertical" ? "space-y-1.5" : "flex flex-wrap gap-2"}>
      {presetEntries.map(([key, preset]) => {
        const isSelected = value === key;
        return (
          <button
            key={key}
            onClick={() => onChange(key, preset.colors)}
            className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-xs transition-all ${
              isSelected
                ? "border-primary bg-primary/10 text-primary"
                : "border-border/50 bg-muted/30 text-muted-foreground hover:border-border hover:bg-muted/50"
            } ${variant === "vertical" ? "w-full" : ""}`}
            data-testid={`color-preset-${key}`}
          >
            <div className="flex gap-0.5 shrink-0">
              <span
                className="w-3 h-3 rounded-full border border-white/10"
                style={{ backgroundColor: preset.colors.noteColor }}
                data-testid={`swatch-note-${key}`}
              />
              <span
                className="w-3 h-3 rounded-full border border-white/10"
                style={{ backgroundColor: preset.colors.activeColor }}
                data-testid={`swatch-active-${key}`}
              />
            </div>
            <span className="truncate" data-testid={`text-color-preset-${key}`}>{preset.name}</span>
          </button>
        );
      })}
    </div>
  );
}
