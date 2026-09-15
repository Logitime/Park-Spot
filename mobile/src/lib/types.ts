export type SpotStatus = 'AVAILABLE' | 'OCCUPIED' | 'RESERVED';
export type SpotSize = 'COMPACT' | 'STANDARD' | 'LARGE';
export type Role = 'USER' | 'OPERATOR' | 'ADMIN';

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
    lot: {
      id: string;
      name: string;
      address: string;
      baseHourlyRate: number;
    };
  };
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

export interface AppNotification {
  id: string;
  type: string;
  content: string;
  relatedId: string | null;
  read: boolean;
  createdAt: string;
}