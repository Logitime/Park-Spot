import type { PricingRule } from "../generated/prisma/client";

export interface ZonePricingInput {
  priceMultiplier: number;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function ruleMultiplierFor(rules: PricingRule[], date: Date): number {
  const day = date.getDay();
  const hour = date.getHours();
  const rule = rules.find(
    (r) =>
      (r.dayOfWeek === null || r.dayOfWeek === day) &&
      hour >= r.startHour &&
      hour < r.endHour
  );
  return rule?.multiplier ?? 1;
}

export function calculateDynamicPrice(
  zone: ZonePricingInput,
  pricePerHour: number,
  start: Date,
  end: Date,
  rules: PricingRule[],
  addOnHourly = 0,
): number {
  if (end <= start) return 0;

  let total = 0;
  const current = new Date(start);

  while (current < end) {
    const nextHour = new Date(current);
    nextHour.setHours(current.getHours() + 1, 0, 0, 0);
    const segmentEnd = nextHour < end ? nextHour : end;
    const segmentHours =
      (segmentEnd.getTime() - current.getTime()) / (1000 * 60 * 60);

    const hourly = pricePerHour * zone.priceMultiplier + addOnHourly;
    const multiplier = ruleMultiplierFor(rules, current);
    total += hourly * multiplier * segmentHours;
    current.setHours(current.getHours() + 1, 0, 0, 0);
  }

  return round2(total);
}