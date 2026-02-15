import React, { useState, useEffect } from "react";
import { Link } from "wouter";
import { ArrowLeft, Download, Music, CheckCircle2, Loader2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

type DownloadStatus = "verifying" | "ready" | "failed";

interface DownloadLink {
  format: string;
  label: string;
  url: string;
}

export default function CheckoutSuccess() {
  const [status, setStatus] = useState<DownloadStatus>("verifying");
  const [downloads, setDownloads] = useState<DownloadLink[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const scoreId = params.get("score_id");
    const formats = params.get("formats")?.split(",") || [];
    const exportIds = params.get("export_ids")?.split(",") || [];
    const sessionId = params.get("session_id");

    if (!scoreId || !sessionId || formats.length === 0 || exportIds.length === 0) {
      setStatus("failed");
      setError("Missing payment information. Please try your purchase again.");
      return;
    }

    verifyPayment(scoreId, formats, exportIds, sessionId);
  }, []);

  const verifyPayment = async (scoreId: string, formats: string[], exportIds: string[], sessionId: string) => {
    try {
      const res = await fetch("/api/verify-payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scoreId, formats, exportIds, sessionId }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Payment verification failed");
      }

      const data = await res.json();

      if (data.paid) {
        const links: DownloadLink[] = formats.map((fmt, i) => ({
          format: fmt,
          label: fmt === "musicxml" ? "MusicXML" : "MIDI",
          url: `/api/scores/${scoreId}/export/${fmt}/download?export_id=${exportIds[i]}&session_id=${sessionId}`,
        }));
        setDownloads(links);
        setStatus("ready");
      } else {
        setStatus("failed");
        setError("Payment has not been completed yet. Please try again.");
      }
    } catch (err: any) {
      setStatus("failed");
      setError(err.message || "Could not verify your payment. Please contact support.");
    }
  };

  const handleDownload = (url: string) => {
    window.open(url, "_blank");
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <div className="max-w-md w-full space-y-6">
        <Link href="/">
          <div className="flex items-center gap-2 cursor-pointer group mb-8">
            <ArrowLeft className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
            <h1 className="font-display text-2xl tracking-wide text-primary text-glow">BASELINE</h1>
          </div>
        </Link>

        {status === "verifying" && (
          <div className="text-center space-y-4 py-8" data-testid="status-verifying">
            <Loader2 className="h-12 w-12 text-primary animate-spin mx-auto" />
            <h2 className="text-xl font-semibold">Verifying payment...</h2>
            <p className="text-sm text-muted-foreground">Please wait while we confirm your purchase.</p>
          </div>
        )}

        {status === "ready" && (
          <div className="space-y-6" data-testid="status-ready">
            <div className="text-center space-y-3">
              <CheckCircle2 className="h-16 w-16 text-green-500 mx-auto" />
              <h2 className="text-2xl font-bold">Payment Successful!</h2>
              <p className="text-sm text-muted-foreground">Your export files are ready for download.</p>
            </div>

            <div className="space-y-3">
              {downloads.map((dl) => (
                <Button
                  key={dl.format}
                  className="w-full gap-3 h-14"
                  size="lg"
                  onClick={() => handleDownload(dl.url)}
                  data-testid={`button-download-${dl.format}`}
                >
                  {dl.format === "musicxml" ? (
                    <Download className="h-5 w-5" />
                  ) : (
                    <Music className="h-5 w-5" />
                  )}
                  <span className="flex-1 text-left">Download {dl.label}</span>
                </Button>
              ))}
            </div>

            <p className="text-xs text-muted-foreground text-center">
              You can download your files multiple times. They will remain available.
            </p>

            <div className="flex gap-3">
              <Link href="/desktop" className="flex-1">
                <Button variant="outline" className="w-full" data-testid="button-back-editor">
                  Back to Editor
                </Button>
              </Link>
              <Link href="/" className="flex-1">
                <Button variant="ghost" className="w-full" data-testid="button-home">
                  Home
                </Button>
              </Link>
            </div>
          </div>
        )}

        {status === "failed" && (
          <div className="space-y-6 text-center" data-testid="status-failed">
            <XCircle className="h-16 w-16 text-destructive mx-auto" />
            <h2 className="text-2xl font-bold">Something went wrong</h2>
            <p className="text-sm text-muted-foreground">{error}</p>
            <div className="flex gap-3">
              <Link href="/desktop" className="flex-1">
                <Button variant="outline" className="w-full">Try Again</Button>
              </Link>
              <Link href="/" className="flex-1">
                <Button variant="ghost" className="w-full">Home</Button>
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
