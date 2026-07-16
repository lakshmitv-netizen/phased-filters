import React, { useState, useEffect } from 'react';
import '../styles/components/FillHandle.css';

const FILL_HANDLE_LABEL = 'Drag handle: drag to extend cell selection';

interface FillHandleProps {
  cellKey: string;
  onDragStart?: (cellKey: string) => void;
  onDragMove?: (cellKey: string) => void;
  onDragEnd?: () => void;
}

const FillHandle: React.FC<FillHandleProps> = ({
  cellKey,
  onDragStart,
  onDragMove,
  onDragEnd,
}) => {
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    if (!isDragging) return;

    const cellKeyUnder = (clientX: number, clientY: number): string | null => {
      const el = document.elementFromPoint(clientX, clientY);
      const cellElement = el?.closest('.grid-cell');
      return cellElement?.getAttribute('data-cell-key') ?? null;
    };

    const finish = () => {
      setIsDragging(false);
      onDragEnd?.();
    };

    const onMove = (e: PointerEvent | MouseEvent) => {
      const targetCellKey = cellKeyUnder(e.clientX, e.clientY);
      if (targetCellKey && targetCellKey !== cellKey && onDragMove) {
        onDragMove(targetCellKey);
      }
    };

    const onUp = () => finish();

    if (typeof window !== 'undefined' && window.PointerEvent) {
      document.addEventListener('pointermove', onMove, { capture: true });
      document.addEventListener('pointerup', onUp, { capture: true });
      document.addEventListener('pointercancel', onUp, { capture: true });
      return () => {
        document.removeEventListener('pointermove', onMove, { capture: true });
        document.removeEventListener('pointerup', onUp, { capture: true });
        document.removeEventListener('pointercancel', onUp, { capture: true });
      };
    }

    document.addEventListener('mousemove', onMove, { capture: true });
    document.addEventListener('mouseup', onUp, { capture: true });
    return () => {
      document.removeEventListener('mousemove', onMove, { capture: true });
      document.removeEventListener('mouseup', onUp, { capture: true });
    };
  }, [isDragging, cellKey, onDragMove, onDragEnd]);

  const startDrag = (
    e:
      | React.PointerEvent<HTMLButtonElement | HTMLDivElement>
      | React.MouseEvent<HTMLButtonElement | HTMLDivElement>,
  ) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
    onDragStart?.(cellKey);
  };

  return (
    <button
      type="button"
      className="fill-handle"
      aria-label={FILL_HANDLE_LABEL}
      title={FILL_HANDLE_LABEL}
      onPointerDown={startDrag}
      onMouseDown={(e) => {
        if (typeof PointerEvent !== 'undefined') return;
        startDrag(e);
      }}
    />
  );
};

export default FillHandle;
