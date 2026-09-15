export type SpotStatus = "AVAILABLE" | "OCCUPIED" | "RESERVED";
export type SpotSize = "COMPACT" | "STANDARD" | "LARGE";
export type Role = "USER" | "OPERATOR" | "ADMIN";

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
}

export interface Lot {
  id: string;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  totalSpots: number;
  baseHourlyRate: number;
  available: number;
  operatorId: string | null;
  zones: {
    id: string;
    name: string;
    floor: number;
    priceMultiplier: number;
    _count: { spots: number };
  }[];
}

export interface Spot {
  id: string;
  number: number;
  status: SpotStatus;
  size: SpotSize;
  evCharging: boolean;
  accessible: boolean;
  pricePerHour: number;
  zone: {
    id: string;
    name: string;
    floor: number;
    priceMultiplier: number;
    lot: { id: string; name: string; address: string; baseHourlyRate: number; evChargingRate?: number };
  };
}

export interface ZoneAvailability {
  id: string;
  name: string;
  floor: number;
  total: number;
  available: number;
}

export interface LotAvailability {
  lotId: string;
  name: string;
  total: number;
  available: number;
  occupied: number;
  reserved: number;
  occupancyPct: number;
  zones: ZoneAvailability[];
}

export interface Reservation {
  id: string;
  status: string;
  startTime: string;
  endTime: string;
  totalPrice: number;
  qrCode: string | null;
  createdAt: string;
  spot: {
    id: string;
    number: number;
    size: SpotSize;
    evCharging: boolean;
    accessible: boolean;
    zone: {
      id: string;
      name: string;
      floor: number;
      lot: { id: string; name: string; address: string };
    };
  };
  vehicle: { plateNumber: string; type: string } | null;
  payments: { status: string; amount: number; provider: string }[];
}

export interface PolicySettings {
  pendingCancelMinutes: number;
  noShowGraceMinutes: number;
  autoCompleteMinutes: number;
  freeCancelMinutes: number;
  partialRefundEnabled: boolean;
  surgeMinMultiplier: number;
  surgeMaxMultiplier: number;
  surgeHighOccupancy: number;
}

export interface OpsReservationRow {
  id: string;
  status: string;
  startTime: string;
  endTime: string;
  totalPrice: number;
  qrCode: string | null;
  user: { id: string; name: string; email: string };
  vehicle: { plateNumber: string; type: string } | null;
  spot: {
    number: number;
    zone: { name: string; floor: number; lot: { id: string; name: string } };
  };
  paid?: boolean;
}

export interface OpsBoard {
  onSiteCount: number;
  onSite: OpsReservationRow[];
  expectedCount: number;
  expected: OpsReservationRow[];
  breachCount: number;
  breach: OpsReservationRow[];
  lots: {
    id: string;
    name: string;
    total: number;
    occupied: number;
    reserved: number;
    free: number;
    occupancyPct: number;
  }[];
  feed: {
    id: string;
    action: string;
    details: string;
    userRole: string | null;
    createdAt: string;
  }[];
  timestamp: string;
}

export interface RefundPaymentRow {
  id: string;
  amount: number;
  refundedAmount: number;
  status: string;
  provider: string;
  providerRef: string | null;
  refundedAt: string | null;
  createdAt: string;
  reservation: {
    id: string;
    status: string;
    qrCode: string | null;
    user: { name: string; email: string } | null;
    vehicle: { plateNumber: string } | null;
    spot: { number: number; zone: { name: string; lot: { name: string } } };
  };
}

export interface AuditEntry {
  id: string;
  userId: string | null;
  userRole: string | null;
  action: string;
  details: string;
  createdAt: string;
}

export interface PricingAutoPreview {
  policy: {
    highOccupancyThreshold: number;
    minMultiplier: number;
    maxMultiplier: number;
  };
  generatedAt: string;
  lots: {
    id: string;
    name: string;
    occupancyPct: number;
    total: number;
    occupied: number;
    reserved: number;
    free: number;
    zones: {
      zoneId: string;
      zoneName: string;
      recommendedMultiplier: number;
      currentMultiplier: number;
      surgeActive: boolean;
    }[];
  }[];
}

export interface AdminSummary {
  totalUsers: number;
  totalReservations: number;
  totalPayments: number;
  totalRevenue: number;
}

export interface AdminLotStats {
  lotId: string;
  name: string;
  total: number;
  available: number;
  occupied: number;
  reserved: number;
  occupancyPct: number;
  revenue: number;
  confirmedToday: number;
}

export interface AdminAnalytics {
  summary: AdminSummary;
  lots: AdminLotStats[];
  dailyTrend: DailyTrendPoint[];
  recentReservations: {
    id: string;
    user: string;
    email: string;
    lot: string;
    spot: number;
    status: string;
    amount: number;
    createdAt: string;
  }[];
}

export interface PricingRule {
  id: string;
  name: string;
  dayOfWeek: number | null;
  startHour: number;
  endHour: number;
  multiplier: number;
}

export interface PricingZone {
  id: string;
  name: string;
  floor: number;
  priceMultiplier: number;
  lot: { id: string; name: string };
  spotCount: number;
  rules: PricingRule[];
}

export interface PricingConfig {
  dayNames: string[];
  zones: PricingZone[];
}

export interface DailyTrendPoint {
  date: string;
  label: string;
  reservations: number;
  checkins: number;
  revenue: number;
}

export interface AppNotification {
  id: string;
  type: string;
  content: string;
  relatedId: string | null;
  read: boolean;
  createdAt: string;
}