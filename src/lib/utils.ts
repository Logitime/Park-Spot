export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(amount);
}

export function formatDate(date: Date | string): string {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(date));
}

export function generateQrCode(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let result = "";
  for (let i = 0; i < 12; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

export function hoursBetween(start: Date, end: Date): number {
  return Math.max(0, (end.getTime() - start.getTime()) / (1000 * 60 * 60));
}

export function calculatePrice(
  hours: number,
  pricePerHour: number,
  priceMultiplier: number
): number {
  return Math.round(hours * pricePerHour * priceMultiplier * 100) / 100;
}

export function haversineMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

export function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

export function statusColor(status: string): string {
  switch (status) {
    case "AVAILABLE":
      return "bg-emerald-500";
    case "OCCUPIED":
      return "bg-rose-500";
    case "RESERVED":
      return "bg-amber-500";
    default:
      return "bg-slate-400";
  }
}

export function statusBadge(status: string): string {
  switch (status) {
    case "AVAILABLE":
      return "bg-emerald-100 text-emerald-800";
    case "OCCUPIED":
      return "bg-rose-100 text-rose-800";
    case "RESERVED":
      return "bg-amber-100 text-amber-800";
    case "CONFIRMED":
      return "bg-blue-100 text-blue-800";
    case "ACTIVE":
      return "bg-emerald-100 text-emerald-800";
    case "COMPLETED":
      return "bg-slate-100 text-slate-800";
    case "CANCELLED":
      return "bg-rose-100 text-rose-800";
    case "PENDING":
      return "bg-amber-100 text-amber-800";
    case "EXPIRED":
      return "bg-slate-100 text-slate-600";
    case "PAID":
      return "bg-emerald-100 text-emerald-800";
    default:
      return "bg-slate-100 text-slate-600";
  }
}