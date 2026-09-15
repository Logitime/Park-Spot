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
    lot: { id: string; name: string; address: string; baseHourlyRate: number };
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