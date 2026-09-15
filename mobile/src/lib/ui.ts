import { Linking, Platform } from 'react-native';

export const C = {
  teal: '#0d9488',
  tealDark: '#0f766e',
  tealLight: '#ccfbf1',
  tealBg: '#f0fdfa',
  bg: '#f8fafc',
  card: '#ffffff',
  border: '#e2e8f0',
  text: '#0f172a',
  sub: '#64748b',
  muted: '#94a3b8',
  rose: '#e11d48',
  emerald: '#059669',
  amber: '#d97706',
  sky: '#0284c7',
};

export function fmtMoney(n: number): string {
  return `$${n.toFixed(2)}`;
}

export function fmtTime(s: string): string {
  return new Date(s).toLocaleString();
}

export const STATUS_LABEL: Record<string, string> = {
  PENDING: 'Awaiting payment',
  CONFIRMED: 'Confirmed',
  ACTIVE: 'In progress',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
  EXPIRED: 'Expired',
  AVAILABLE: 'Available',
  OCCUPIED: 'Occupied',
  RESERVED: 'Reserved',
  PAID: 'Paid',
};

export function statusColor(status: string): { bg: string; text: string } {
  switch (status) {
    case 'AVAILABLE':
      return { bg: '#d1fae5', text: '#047857' };
    case 'OCCUPIED':
      return { bg: '#ffe4e6', text: '#be123c' };
    case 'RESERVED':
      return { bg: '#fef3c7', text: '#b45309' };
    case 'CONFIRMED':
      return { bg: '#dbeafe', text: '#1d4ed8' };
    case 'ACTIVE':
      return { bg: '#d1fae5', text: '#047857' };
    case 'COMPLETED':
      return { bg: '#f1f5f9', text: '#475569' };
    case 'CANCELLED':
      return { bg: '#ffe4e6', text: '#be123c' };
    case 'PENDING':
      return { bg: '#fef3c7', text: '#b45309' };
    case 'PAID':
      return { bg: '#d1fae5', text: '#047857' };
    default:
      return { bg: '#f1f5f9', text: '#475569' };
  }
}

export const SIZE_LABEL: Record<string, string> = {
  COMPACT: 'Compact',
  STANDARD: 'Standard',
  LARGE: 'Large',
};

export function openDirections(lat: number, lng: number) {
  const dest = `${lat},${lng}`;
  const fallback = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
  if (Platform.OS === 'ios') {
    Linking.openURL(`http://maps.apple.com/?daddr=${dest}`).catch(() =>
      Linking.openURL(fallback).catch(() => {})
    );
  } else {
    Linking.openURL(`google.navigation:q=${dest}`).catch(() =>
      Linking.openURL(fallback).catch(() => {})
    );
  }
}

export function haversineKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}