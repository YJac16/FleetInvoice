"use client";

import { useMutation } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { scanQrToken } from "@/services/attendance.service";
import { getErrorMessage } from "@/utils/errors";

type ScanQrFormProps = {
  onScanned?: () => void;
  initialToken?: string;
};

type BarcodeDetectorLike = {
  detect: (source: ImageBitmapSource) => Promise<Array<{ rawValue: string }>>;
};

type BarcodeDetectorCtor = new (options?: {
  formats?: string[];
}) => BarcodeDetectorLike;

function extractTokenFromPayload(raw: string): string {
  const trimmed = raw.trim();
  try {
    const url = new URL(trimmed);
    const token = url.searchParams.get("token");
    if (token) return token;
  } catch {
    // not a URL
  }
  return trimmed;
}

export function ScanQrForm({ onScanned, initialToken = "" }: ScanQrFormProps) {
  const [token, setToken] = useState(initialToken);
  const [notes, setNotes] = useState("");
  const [cameraOn, setCameraOn] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [lastEmployee, setLastEmployee] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanningRef = useRef(false);

  useEffect(() => {
    setToken(initialToken);
  }, [initialToken]);

  const scanMutation = useMutation({
    mutationFn: (value: string) => {
      const cleaned = extractTokenFromPayload(value);
      if (!cleaned.trim()) throw new Error("Enter a boarding code or token");
      return scanQrToken({ token: cleaned, notes: notes || null });
    },
    onSuccess: (event) => {
      toast.success("Boarding recorded");
      setLastEmployee(event.employees?.full_name ?? event.employee_id);
      setToken("");
      setNotes("");
      onScanned?.();
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const stopCamera = useCallback(() => {
    scanningRef.current = false;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setCameraOn(false);
  }, []);

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  async function startCamera() {
    setCameraError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCameraOn(true);
      scanningRef.current = true;

      const Detector = (window as unknown as { BarcodeDetector?: BarcodeDetectorCtor })
        .BarcodeDetector;
      if (!Detector) {
        setCameraError(
          "Camera preview is on, but QR detection isn’t supported in this browser. Use the backup code field below."
        );
        return;
      }

      const detector = new Detector({ formats: ["qr_code"] });
      const tick = async () => {
        if (!scanningRef.current || !videoRef.current) return;
        try {
          const codes = await detector.detect(videoRef.current);
          const value = codes[0]?.rawValue;
          if (value && !scanMutation.isPending) {
            scanningRef.current = false;
            stopCamera();
            scanMutation.mutate(value);
            return;
          }
        } catch {
          // keep scanning
        }
        if (scanningRef.current) {
          requestAnimationFrame(() => void tick());
        }
      };
      requestAnimationFrame(() => void tick());
    } catch {
      setCameraError(
        "Unable to access camera. Enter the 6-character backup code instead."
      );
      setCameraOn(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <Label>Camera scanner</Label>
          {cameraOn ? (
            <Button type="button" size="sm" variant="outline" onClick={stopCamera}>
              Stop camera
            </Button>
          ) : (
            <Button type="button" size="sm" onClick={() => void startCamera()}>
              Start camera
            </Button>
          )}
        </div>
        <div className="overflow-hidden rounded-xl border bg-black/90 aspect-[4/3]">
          <video
            ref={videoRef}
            className="h-full w-full object-cover"
            muted
            playsInline
          />
        </div>
        {cameraError ? (
          <p className="text-sm text-muted-foreground">{cameraError}</p>
        ) : (
          <p className="text-xs text-muted-foreground">
            Point at the employee QR. If the camera can’t read it, use the code
            below.
          </p>
        )}
      </div>

      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          scanMutation.mutate(token);
        }}
      >
        <div className="space-y-2">
          <Label htmlFor="scan-token">Backup code or token</Label>
          <Input
            id="scan-token"
            value={token}
            onChange={(e) => {
              const value = e.target.value;
              setToken(
                value.length <= 8 ? value.toUpperCase() : value
              );
            }}
            placeholder="8-char code or paste token"
            className="font-mono text-sm tracking-wider"
            autoComplete="off"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="scan-notes">Notes (optional)</Label>
          <Textarea
            id="scan-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
          />
        </div>
        <Button type="submit" disabled={scanMutation.isPending} className="w-full">
          {scanMutation.isPending ? "Recording…" : "Record boarding"}
        </Button>
      </form>

      {lastEmployee ? (
        <p className="rounded-lg bg-muted px-3 py-2 text-sm">
          Last boarded: <span className="font-medium">{lastEmployee}</span>
        </p>
      ) : null}
    </div>
  );
}
