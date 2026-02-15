import React, { useState, useEffect } from "react";
import { Play, Pause, Square, RotateCcw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { playbackEngine, type PlaybackState } from "@/lib/playback/player";
import type { NoteEvent } from "@/lib/types";

interface TransportControlsProps {
  notes: NoteEvent[];
  onClear?: () => void;
  variant?: "compact" | "full";
  className?: string;
}

export function TransportControls({ notes, onClear, variant = "full", className = "" }: TransportControlsProps) {
  const [playbackState, setPlaybackState] = useState<PlaybackState>("stopped");

  useEffect(() => {
    const unsub = playbackEngine.onStateChange((state) => {
      setPlaybackState(state);
    });
    return unsub;
  }, []);

  const handlePlayPause = () => {
    playbackEngine.togglePlayPause(notes);
  };

  const handleStop = () => {
    playbackEngine.stop();
  };

  const handleReplay = () => {
    playbackEngine.replay(notes);
  };

  const isPlaying = playbackState === "playing";
  const disabled = notes.length === 0;

  if (variant === "compact") {
    return (
      <div className={`flex items-center gap-1 ${className}`}>
        <Button
          variant="ghost"
          size="sm"
          onClick={handlePlayPause}
          disabled={disabled}
          data-testid="button-play-pause"
        >
          {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleStop}
          disabled={disabled || playbackState === "stopped"}
          data-testid="button-stop"
        >
          <Square className="h-3 w-3" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleReplay}
          disabled={disabled}
          data-testid="button-replay"
        >
          <RotateCcw className="h-4 w-4" />
        </Button>
      </div>
    );
  }

  return (
    <div className={`flex items-center justify-center gap-4 p-4 bg-card/50 backdrop-blur-md rounded-xl border border-border/50 shadow-xl ${className}`}>
      {onClear && (
        <Button
          variant="ghost"
          size="icon"
          onClick={onClear}
          className="text-muted-foreground hover:text-destructive transition-colors"
          data-testid="button-clear"
        >
          <Trash2 className="h-5 w-5" />
        </Button>
      )}

      <Button
        variant="outline"
        size="icon"
        onClick={handleStop}
        disabled={disabled || playbackState === "stopped"}
        className="h-10 w-10 rounded-full border-2"
        data-testid="button-stop"
      >
        <Square className="h-4 w-4 fill-current" />
      </Button>

      <Button
        variant="default"
        size="icon"
        onClick={handlePlayPause}
        disabled={disabled}
        className="h-14 w-14 rounded-full shadow-[0_0_20px_rgba(251,146,60,0.4)] hover:shadow-[0_0_30px_rgba(251,146,60,0.6)] transition-all scale-100 hover:scale-105 active:scale-95"
        data-testid="button-play-pause"
      >
        {isPlaying ? (
          <Pause className="h-6 w-6 fill-current" />
        ) : (
          <Play className="h-6 w-6 fill-current ml-1" />
        )}
      </Button>

      <Button
        variant="outline"
        size="icon"
        onClick={handleReplay}
        disabled={disabled}
        className="h-10 w-10 rounded-full border-2"
        data-testid="button-replay"
      >
        <RotateCcw className="h-4 w-4" />
      </Button>
    </div>
  );
}
