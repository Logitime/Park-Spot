export const BOOKING_POLICY = {
  pendingCancelMinutes: 10,   // unpaid PENDING auto-cancel after this many minutes
  noShowGraceMinutes: 30,     // CONFIRMED with no check-in past startTime + grace → NO_SHOW release
  autoCompleteMinutes: 30,    // ACTIVE past endTime + grace → AUTO_COMPLETE
  freeCancelMinutes: 15,      // cancel within this many minutes of start still gets a full refund
  partialRefundEnabled: true, // early-exit cancellations refund the unused portion
} as const;
