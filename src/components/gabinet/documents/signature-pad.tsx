import { useRef, useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { useTranslation } from "react-i18next";

interface SignaturePadProps {
  onSign: (dataUrl: string) => void;
  onCancel: () => void;
}

export function SignaturePad({ onSign, onCancel }: SignaturePadProps) {
  const { t } = useTranslation();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasContent, setHasContent] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    canvas.width = canvas.offsetWidth * 2;
    canvas.height = canvas.offsetHeight * 2;
    ctx.scale(2, 2);
    ctx.strokeStyle = "#000";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
  }, []);

  const getPos = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
    const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;
    return { x: clientX - rect.left, y: clientY - rect.top };
  }, []);

  const startDraw = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const { x, y } = getPos(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
    setIsDrawing(true);
  }, [getPos]);

  const draw = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing) return;
    e.preventDefault();
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const { x, y } = getPos(e);
    ctx.lineTo(x, y);
    ctx.stroke();
    setHasContent(true);
  }, [isDrawing, getPos]);

  const endDraw = useCallback(() => setIsDrawing(false), []);

  const clear = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasContent(false);
  }, []);

  const handleSign = useCallback(() => {
    if (!canvasRef.current || !hasContent) return;
    onSign(canvasRef.current.toDataURL("image/png"));
  }, [hasContent, onSign]);

  return (
    <div className="space-y-3">
      <div className="rounded-md border-2 border-dashed p-1">
        <canvas
          ref={canvasRef}
          className="h-40 w-full cursor-crosshair touch-none"
          onMouseDown={startDraw}
          onMouseMove={draw}
          onMouseUp={endDraw}
          onMouseLeave={endDraw}
          onTouchStart={startDraw}
          onTouchMove={draw}
          onTouchEnd={endDraw}
        />
      </div>
      <div className="flex justify-between">
        <Button variant="outline" size="sm" onClick={clear}>{t("gabinet.documents.clearSignature")}</Button>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={onCancel}>{t("common.cancel")}</Button>
          <Button size="sm" onClick={handleSign} disabled={!hasContent}>{t("gabinet.documents.confirmSign")}</Button>
        </div>
      </div>
    </div>
  );
}
