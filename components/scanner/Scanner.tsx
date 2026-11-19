
"use client";

import { useCallback, useState } from "react";
import dynamic from "next/dynamic";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScanLine } from "lucide-react";

// html5-qrcode pesa ~280 KB: solo se descarga cuando se abre el escáner.
const ScannerView = dynamic(() => import("./ScannerView"), {
  ssr: false,
  loading: () => <p className="text-sm text-muted-foreground">Abriendo cámara…</p>,
});

interface ScannerButtonProps {
  onScan: (code: string) => void;
  label?: string;
}

export function ScannerButton({
  onScan,
  label = "Escanear",
}: ScannerButtonProps) {
  const [open, setOpen] = useState(false);

  const handleScan = useCallback(
    (code: string) => {
      setOpen(false);
      onScan(code);
    },
    [onScan]
  );

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="gap-1.5"
        onClick={() => setOpen(true)}
      >
        <ScanLine size={14} />
        {label}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Escanear código</DialogTitle>
          </DialogHeader>

          {open && <ScannerView onScan={handleScan} />}
        </DialogContent>
      </Dialog>
    </>
  );
}
