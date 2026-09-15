import { useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { api } from '@/src/lib/api';
import {
  C,
  SIZE_LABEL,
  STATUS_LABEL,
  fmtMoney,
  fmtTime,
  openDirections,
} from '@/src/lib/ui';
import { Card, Chip, ErrorBox, PrimaryButton, Spacer } from '@/src/components/ui';
import type { Lot, Reservation } from '@/src/lib/types';

export default function BookingScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();

  const [reservation, setReservation] = useState<Reservation | null>(null);
  const [lots, setLots] = useState<Lot[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await api.get<{ reservations: Reservation[] }>(
        '/api/reservations'
      );
      const found = data.reservations.find((r) => r.id === id);
      if (!found) throw new Error('Booking not found');
      setReservation(found);
      const lotData = await api.get<{ lots: Lot[] }>('/api/lots');
      setLots(lotData.lots);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load booking');
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const act = async (kind: 'pay' | 'cancel') => {
    if (!reservation) return;
    setBusy(kind);
    setError(null);
    try {
      if (kind === 'pay') {
        await api.post('/api/payments', { reservationId: reservation.id });
      } else {
        await api.put(`/api/reservations/${reservation.id}`, {});
      }
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Action failed');
    } finally {
      setBusy(null);
    }
  };

  if (!reservation && !error) {
    return (
      <View style={styles.center}>
        <Text style={styles.muted}>Loading booking…</Text>
      </View>
    );
  }

  if (!reservation) {
    return (
      <View style={styles.center}>
        <Text style={styles.muted}>{error}</Text>
      </View>
    );
  }

  const lot = lots.find((l) => l.id === reservation.spot.zone.lot.id);
  const cancellable = ['PENDING', 'CONFIRMED', 'ACTIVE'].includes(
    reservation.status
  );
  const showQr =
    !!reservation.qrCode &&
    ['CONFIRMED', 'ACTIVE'].includes(reservation.status);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: C.bg }}
      contentContainerStyle={styles.content}
    >
      <View style={styles.topRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>
            {reservation.spot.zone.lot.name}
          </Text>
          <Text style={styles.sub}>
            Spot #{reservation.spot.number} · {reservation.spot.zone.name} · Floor{' '}
            {reservation.spot.zone.floor}
          </Text>
        </View>
        <Chip status={reservation.status} />
      </View>

      {STATUS_LABEL[reservation.status] && (
        <Text style={styles.statusLine}>
          {STATUS_LABEL[reservation.status]}
        </Text>
      )}

      <Spacer />

      <Card>
        <Row label="Starts" value={fmtTime(reservation.startTime)} />
        <Row label="Ends" value={fmtTime(reservation.endTime)} />
        <Row label="Size" value={SIZE_LABEL[reservation.spot.size] ?? reservation.spot.size} />
        <Row label="Total" value={fmtMoney(reservation.totalPrice)} strong />
        {reservation.payments.map((p, i) => (
          <Row
            key={i}
            label={`Payment (${p.provider})`}
            value={`${p.status} · ${fmtMoney(p.amount)}`}
          />
        ))}
      </Card>

      {showQr && (
        <>
          <Spacer />
          <Card style={styles.qrCard}>
            <Text style={styles.qrTitle}>Gate pass</Text>
            <Text style={styles.qrHint}>
              Show this QR at the entry gate for check-in.
            </Text>
            <View style={styles.qrBox}>
              <QRCode
                value={reservation.qrCode ?? reservation.id}
                size={200}
                color={C.text}
                backgroundColor="#ffffff"
              />
            </View>
            <Text style={styles.qrCode}>{reservation.qrCode}</Text>
          </Card>
        </>
      )}

      <Spacer size={16} />
      <ErrorBox message={error} />
      <Spacer size={8} />

      {reservation.status === 'PENDING' && (
        <PrimaryButton
          label="Pay now"
          tone="teal"
          onPress={() => act('pay')}
          loading={busy === 'pay'}
        />
      )}

      {lot && (
        <View style={{ marginTop: 10 }}>
          <PrimaryButton
            label="Navigate to lot"
            tone="outline"
            onPress={() => openDirections(lot.latitude, lot.longitude)}
          />
        </View>
      )}

      {cancellable && (
        <View style={{ marginTop: 10 }}>
          <PrimaryButton
            label="Cancel reservation"
            tone="rose"
            onPress={() => act('cancel')}
            loading={busy === 'cancel'}
          />
        </View>
      )}
    </ScrollView>
  );
}

function Row({
  label,
  value,
  strong,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={[styles.rowValue, strong && { fontWeight: '800' }]}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: 20, paddingBottom: 40 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
  muted: { color: C.muted },
  topRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  title: { fontSize: 22, fontWeight: '800', color: C.text },
  sub: { marginTop: 3, fontSize: 13, color: C.sub },
  statusLine: { marginTop: 8, fontSize: 13, color: C.sub },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  rowLabel: { fontSize: 13, color: C.sub },
  rowValue: { fontSize: 14, color: C.text },
  qrCard: { alignItems: 'center' },
  qrTitle: { fontSize: 15, fontWeight: '700', color: C.text },
  qrHint: { marginTop: 4, fontSize: 12, color: C.sub, textAlign: 'center' },
  qrBox: {
    marginTop: 16,
    padding: 16,
    backgroundColor: '#ffffff',
    borderRadius: 16,
  },
  qrCode: { marginTop: 12, fontSize: 13, color: C.sub, letterSpacing: 1 },
});