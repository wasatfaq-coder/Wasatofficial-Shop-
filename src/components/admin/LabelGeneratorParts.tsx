import React, { useEffect, useMemo, useRef } from 'react';
import type { LabelFormat } from '../../types';
import { canvasMeasure, drawLabel, layoutLabel, type LabelData, type LabelOptions, type LabelTemplate } from '../../utils/labels';

/** Small pieces of «Этикетки и штрихкоды» (`AdminLabelGenerator`): the label preview, a format outline, a switch */

/** Canvas preview drawn by the same layout as the PDF */
export const LabelCanvas: React.FC<{
  format: Pick<LabelFormat, 'widthMm' | 'heightMm'>;
  template: LabelTemplate;
  data: LabelData;
  options: LabelOptions;
  displayWidth: number;
  fontsReady: boolean;
  className?: string;
}> = ({ format, template, data, options, displayWidth, fontsReady, className }) => {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const measure = useMemo(() => canvasMeasure(), []);
  const displayHeight = (displayWidth * format.heightMm) / format.widthMm;

  useEffect(() => {
    if (!ref.current) return;
    const pxPerMm = (displayWidth / format.widthMm) * (window.devicePixelRatio || 1);
    drawLabel(ref.current, layoutLabel(template, format, data, options, measure), pxPerMm);
  }, [format, template, data, options, displayWidth, fontsReady, measure]);

  return (
    <canvas
      ref={ref}
      style={{ width: displayWidth, height: displayHeight }}
      className={className}
      aria-hidden="true"
    />
  );
};

/** Proportional outline of a format, for the delete confirmation */
export const FormatThumb: React.FC<{ format: Pick<LabelFormat, 'widthMm' | 'heightMm'>; size?: number }> = ({ format, size = 44 }) => {
  const scale = size / Math.max(format.widthMm, format.heightMm);
  return (
    <span
      aria-hidden="true"
      className="block rounded-[3px] bg-white border border-text-primary/60 shrink-0"
      style={{ width: format.widthMm * scale, height: format.heightMm * scale }}
    />
  );
};

export const Switch: React.FC<{ checked: boolean; onChange: (v: boolean) => void; label: string }> = ({ checked, onChange, label }) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    onClick={() => onChange(!checked)}
    className="w-full h-11 px-3 rounded-xl neu-button flex items-center justify-between gap-3 text-xs font-bold text-text-primary cursor-pointer"
  >
    <span>{label}</span>
    <span
      className={`w-12 h-7 rounded-full p-1 flex items-center shrink-0 transition-colors duration-200 ${
        checked ? 'neu-fill-accent' : 'neu-inset'
      }`}
    >
      <span
        className={`w-5 h-5 rounded-full neu-switch-thumb transition-transform duration-200 ${
          checked ? 'translate-x-5' : 'translate-x-0'
        }`}
      />
    </span>
  </button>
);
