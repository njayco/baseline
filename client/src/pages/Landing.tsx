import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Mic, Monitor } from "lucide-react";

export default function Landing() {
  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6 relative overflow-hidden">
      {/* Background Ambience */}
      <div className="absolute inset-0 bg-grid-pattern opacity-10 pointer-events-none" />
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/20 rounded-full blur-[128px] pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-64 h-64 bg-chart-2/20 rounded-full blur-[96px] pointer-events-none" />

      <div className="relative z-10 text-center max-w-2xl mx-auto space-y-12">
        <div className="space-y-4 animate-in fade-in slide-in-from-bottom-8 duration-700">
          <h1 className="text-6xl md:text-8xl font-display font-bold tracking-tighter text-glow text-foreground">
            BASELINE
          </h1>
          <p className="text-xl text-muted-foreground font-light max-w-md mx-auto">
            Sing it. See it. Play it. <br/>
            Real-time melody to sheet music converter.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full max-w-md mx-auto animate-in fade-in slide-in-from-bottom-12 duration-1000 delay-200">
          <Link href="/mobile">
            <Button 
              className="w-full h-32 text-xl flex flex-col gap-3 border-2 border-primary/20 hover:border-primary hover:bg-primary/10 transition-all duration-300 group"
              variant="outline"
            >
              <Mic className="h-8 w-8 text-primary group-hover:scale-110 transition-transform" />
              <span>Mobile Mode</span>
              <span className="text-xs text-muted-foreground font-normal">Fast, simple, for phones</span>
            </Button>
          </Link>

          <Link href="/desktop">
            <Button 
              className="w-full h-32 text-xl flex flex-col gap-3 border-2 border-primary/20 hover:border-primary hover:bg-primary/10 transition-all duration-300 group"
              variant="outline"
            >
              <Monitor className="h-8 w-8 text-primary group-hover:scale-110 transition-transform" />
              <span>Desktop Mode</span>
              <span className="text-xs text-muted-foreground font-normal">Power user, editing, export</span>
            </Button>
          </Link>
        </div>
      </div>
      
      <div className="absolute bottom-8 text-center text-xs text-muted-foreground/50">
        <p>Mockup Prototype v0.1</p>
      </div>
    </div>
  );
}
