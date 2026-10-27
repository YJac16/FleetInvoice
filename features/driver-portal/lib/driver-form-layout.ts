/**
 * Two equal columns that are allowed to shrink below a control's min-content
 * size. `1fr` is `minmax(auto, 1fr)`, and iOS Safari date/time inputs report a
 * large intrinsic width, so a plain `grid-cols-2` lets Date and Time overlap
 * and run off a phone screen. The columns live in `.driver-pair-grid` so a
 * utility class cannot override the narrow-screen stack.
 */
export const DRIVER_PAIR_GRID = "driver-pair-grid";

/** Same grid, stacked below 360px so 320px phones keep both fields on screen. */
export const DRIVER_PAIR_GRID_STACK =
  "driver-pair-grid driver-pair-grid--stack";

export const DRIVER_PAIR_CELL = "min-w-0 space-y-1.5";

/** Forces native date/time controls to stay inside the grid cell. */
export const DRIVER_DATETIME_INPUT = "driver-datetime w-full min-w-0 max-w-full";
