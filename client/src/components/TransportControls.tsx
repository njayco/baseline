import React from "react";
import { Play, Pause, Square, SkipBack, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface TransportControlsProps {
  isPlaying: boolean;
  onPlayPause: () => void;
  onStop: () => void;
  onClear: () => void;
}

export function TransportControls({ isPlaying, onPlayPause, onStop, onClear }: TransportControlsProps) {
  return (
    <div className="flex items-center justify-center gap-4 p-4 bg-card/50 backdrop-blur-md rounded-xl border border-border/50 shadow-xl">
      <Button
        variant="ghost"
        size="icon"
        onClick={onClear}
        className="text-muted-foreground hover:text-destructive transition-colors"
        data-testid="button-clear"
      >
        <Trash2 className="h-5 w-5" />
      </Button>

      <Button
        variant="outline"
        size="icon"
        onClick={onStop}
        className="h-10 w-10 rounded-full border-2"
        data-testid="button-stop"
      >
        <Square className="h-4 w-4 fill-current" />
      </Button>

      <Button
        variant="default"
        size="icon"
        onClick={onPlayPause}
        className="h-14 w-14 rounded-full shadow-[0_0_20px_rgba(251,146,60,0.4)] hover:shadow-[0_0_30px_rgba(251,146,60,0.6)] transition-all scale-100 hover:scale-105 active:scale-95"
        data-testid="button-play"
      >
        {isPlaying ? (
          <Pause className="h-6 w-6 fill-current" />
        ) : (
          <Play className="h-6 w-6 fill-current ml-1" />
        )}
      </Button>
    </div>
  );
}
