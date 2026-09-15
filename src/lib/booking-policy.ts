export const BOOKING_POLICY = {
  pendingCancelMinutes: 10,   // unpaid PENDING auto-cancel after this many minutes
  noShowGraceMinutes: 30,     // CONFIRMED with no check-in past startTime + grace → NO_SHOW release
  autoCompleteMinutes: 30,    // ACTIVE past endTime + grace → AUTO_COMPLETE
} as const;
