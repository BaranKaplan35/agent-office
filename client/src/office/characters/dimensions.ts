/** Body proportions of the chunky low-poly characters (metres; hip joint = body origin). */
export const DIM = {
  /** Height of the hip joint above the floor when standing. */
  hipY: 0.45,
  thigh: 0.21,
  shin: 0.2,
  torsoH: 0.34,
  shoulderY: 0.3,
  shoulderX: 0.22,
  armUpper: 0.2,
  armFore: 0.18,
  /** Head centre above the hip joint. */
  headY: 0.62,
  headR: 0.29,
} as const;

/** Hip height when sitting on the office chair (seat top is at 0.545). */
export const SEAT_HIP_Y = 0.575;
export const SIT_BODY_Y = SEAT_HIP_Y - DIM.hipY;
