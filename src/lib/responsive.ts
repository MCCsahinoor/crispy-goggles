import { useMemo } from "react";
import { useWindowDimensions } from "react-native";

/** Shortest side (dp) at which we treat the device as a tablet / large screen. */
export const TABLET_MIN_SHORT_SIDE = 600;
/** Width (dp) at which content gets the wider desktop-style column. */
export const WIDE_MIN_WIDTH = 840;

export type Layout = {
  width: number;
  height: number;
  isLandscape: boolean;
  /** Narrow phones (about 320-359dp). */
  isCompact: boolean;
  /** Tablets, foldables, and phones in landscape wide enough for a column. */
  isTablet: boolean;
  /** Horizontal screen padding. */
  gutter: number;
  /** Max width of the main content column. Phones use the full window. */
  contentMaxWidth: number;
  /** Max width of dialogs / sheets. */
  modalMaxWidth: number;
  /** Side of the QR codes on screen, scaled to the column. */
  qrSize: number;
  /** Side of the zoomed QR, scaled to the window. */
  qrZoomSize: number;
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function computeLayout(width: number, height: number): Layout {
  const shortest = Math.min(width, height);
  const isLandscape = width > height;
  const isTablet = shortest >= TABLET_MIN_SHORT_SIDE;
  const isCompact = width < 360;
  const isWide = width >= WIDE_MIN_WIDTH;

  const gutter = isWide ? 32 : width >= TABLET_MIN_SHORT_SIDE ? 24 : isCompact ? 12 : 16;
  const contentMaxWidth = isWide ? 640 : width >= TABLET_MIN_SHORT_SIDE ? 560 : width;
  const modalMaxWidth = Math.min(width - gutter * 2, isTablet ? 520 : 440);

  const columnWidth = Math.min(width, contentMaxWidth) - gutter * 2;
  // Leave room for the QR card padding (16 each side) and keep it scannable on short screens.
  const qrSize = clamp(Math.min(columnWidth - 64, height * 0.4), 140, 260);
  // Zoom card adds 20dp padding per side, the backdrop 24dp, and a "Tap to close" hint below.
  const qrZoomSize = clamp(Math.min(width, height) - 120, 160, 420);

  return {
    width,
    height,
    isLandscape,
    isCompact,
    isTablet,
    gutter,
    contentMaxWidth,
    modalMaxWidth,
    qrSize,
    qrZoomSize,
  };
}

export function useLayout(): Layout {
  const { width, height } = useWindowDimensions();
  return useMemo(() => computeLayout(width, height), [width, height]);
}
