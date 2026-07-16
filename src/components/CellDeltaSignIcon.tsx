import React from 'react';

export type CellDeltaSignIconProps = {
  className?: string;
  /** Pixel width/height; default 14 for grid delta glyphs */
  size?: number;
  /** Positive / negative when no variant */
  deltaPercent?: number;
  /** Saved-edit direction; overrides deltaPercent when set */
  variant?: 'increase' | 'decrease';
};

/**
 * Up / down arrow marks: hot orange 60 (increase), palette blue 40 (decrease).
 * Use `deltaPercent` in the % badge, or `variant` after save (no % shown).
 */
export function CellDeltaSignIcon({
  deltaPercent,
  variant,
  className,
  size = 14,
}: CellDeltaSignIconProps) {
  const isIncrease =
    variant === 'increase'
      ? true
      : variant === 'decrease'
        ? false
        : (deltaPercent ?? 0) > 0;

  const cn = ['cell-delta-sign-icon', className].filter(Boolean).join(' ');

  if (isIncrease) {
    return (
      <svg
        className={cn}
        width={size}
        height={size}
        viewBox="0 0 14 14"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden
      >
        <path
          d="M7 12.5V2.2M3 6.5L7 2.2L11 6.5"
          stroke="var(--slds-g-color-palette-hot-orange-60)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      </svg>
    );
  }

  return (
    <svg
      className={cn}
      width={size}
      height={size}
      viewBox="0 0 14 14"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <path
        d="M7 1.5V11.8M3 7.5L7 11.8L11 7.5"
        stroke="var(--slds-g-color-palette-blue-40)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}
