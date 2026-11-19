"use client";

import { useEffect, useRef, useState } from "react";
import {
  Html5Qrcode,
  Html5QrcodeScannerState,
  Html5QrcodeSupportedFormats,
} from "html5-qrcode";

/** Mensaje claro segun el motivo por el que no abrio la camara. */
export function cameraErrorMessage(err: unknown, secure = true): string {
  const name = (err as { name?: string })?.name ?? "";
  const text = String((err as { message?: string })?.message ?? err ?? "");
  if (!secure) return "La cámara solo funciona en sitios seguros (https).";
  if (name === "NotAllowedError" || /permission|denied|notallowed/i.test(text))
    return "No diste permiso para usar la cámara. Actívalo en los permisos del navegador y vuelve a intentarlo.";
  if (name === "NotFoundError" || /no camera|not found|requested device/i.test(text))
    return "Este dispositivo no tiene cámara disponible.";
  if (name === "NotReadableError" || /in use|not readable/i.test(text))
    return "La cámara está siendo usada por otra aplicación. Ciérrala e inténtalo de nuevo.";
  return "No se pudo abrir la cámara. Revisa los permisos del navegador.";
}

export default function ScannerView({ onScan }: { onScan: (code: string) => void }) {
  const regionId = "pb-scanner-region";
  const onScanRef = useRef(onScan);
  const doneRef = useRef(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    onScanRef.current = onScan;
  }, [onScan]);

  useEffect(() => {
    let disposed = false;
    let started = false;

    // QR + codigos comerciales (UPC/EAN, Code 128). Si el navegador tiene la API
    // nativa BarcodeDetector, html5-qrcode la usa en lugar del decodificador JS.
    const scanner = new Html5Qrcode(regionId, {
      verbose: false,
      formatsToSupport: [
        Html5QrcodeSupportedFormats.QR_CODE,
        Html5QrcodeSupportedFormats.EAN_13,
        Html5QrcodeSupportedFormats.EAN_8,
        Html5QrcodeSupportedFormats.UPC_A,
        Html5QrcodeSupportedFormats.UPC_E,
        Html5QrcodeSupportedFormats.CODE_128,
      ],
      useBarCodeDetectorIfSupported: true,
    });

    const startPromise = scanner
      .start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 250, height: 160 } },
        (text) => {
          if (disposed || doneRef.current) return;

          doneRef.current = true;
          onScanRef.current(text.trim());
        },
        () => {}
      )
      .then(() => {
        started = true;
      })
      .catch((err: unknown) => {
        if (!disposed) {
          console.error("No se pudo iniciar el escáner:", err);
          setError(cameraErrorMessage(err, typeof window === "undefined" || window.isSecureContext));
        }
      });

    return () => {
      disposed = true;

      void startPromise.then(async () => {
        if (!started) return;

        try {
          if (
            scanner.getState() === Html5QrcodeScannerState.SCANNING
          ) {
            await scanner.stop();
          }

          scanner.clear();
        } catch (err) {
          console.error("Error al cerrar el escáner:", err);
        }
      });
    };
  }, []);

  return (
    <div className="space-y-2">
      <div
        id={regionId}
        className="min-h-48 w-full overflow-hidden rounded-lg bg-black"
      />

      {error && <p className="text-sm text-red-500">{error}</p>}

      <p className="text-xs text-muted-foreground">
        Apunta la cámara al código QR o de barras del producto.
      </p>
    </div>
  );
}
