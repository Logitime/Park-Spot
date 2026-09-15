import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { api, ApiError } from '@/src/lib/api';
import { C, SIZE_LABEL, fmtMoney } from '@/src/lib/ui';
import { Card, ErrorBox, PrimaryButton, ScreenSection, Spacer } from '@/src/components/ui';
import type { Spot } from '@/src/lib/types';

const START_OPTIONS = [
  { label: 'Now', minutes: 5 },
  { label: '30 min', minutes: 30 },
  { label: '1 hr', minutes: 60 },
  { label: '2 hrs', minutes: 120 },
];

const DURATIONS = [1, 2, 3, 4, 6, 8];

const round2 = (n: number) => Math.round(n * 100) / 100;

export default function BookScreen() {
  const { spotId, lotId, spotNumber } = useLocalSearchParams<{
    spotId: string;
    lotId: string;
    spotNumber?: string;
  }>();
  const router = useRouter();

  const [spot, setSpot] = useState<Spot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [startIdx, setStartIdx] = useState(1);
  const [duration, setDuration] = useState(2);
  const [plate, setPlate] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await api.get<{ spots: Spot[] }>(`/api/spots?lotId=${lotId}`);
      const found = data.spots.find((s) => s.id === spotId);
      if (!found) throw new Error('Spot not found');
      setSpot(found);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load spot');
    }
  }, [lotId, spotId]);

  useEffect(() => {
    void load();
  }, [load]);

  const estimate = useMemo(() => {
    if (!spot) return 0;
    return round2(duration * spot.pricePerHour);
  }, [spot, duration]);

  const evAddOn = useMemo(() => {
    if (!spot?.evCharging) return 0;
    return duration * (spot.zone.lot.evChargingRate ?? 0);
  }, [spot, duration]);

  const reserve = async () => {
    if (!spot) return;
    setSubmitting(true);
    setError(null);
    try {
      const start = new Date(Date.now() + START_OPTIONS[startIdx].minutes * 60_000);
      const end = new Date(start.getTime() + duration * 3_600_000);
      const data = await api.post<{ reservation: { id: string } }>(
        '/api/reservations',
        {
          spotId: spot.id,
          startTime: start.toISOString(),
          endTime: end.toISOString(),
          plateNumber: plate.trim() || null,
        }
      );
      router.replace({
        pathname: '/booking/[id]',
        params: { id: data.reservation.id },
      });
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        setError('Log in first — use the Account tab to sign in.');
      } else {
        setError(e instanceof Error ? e.message : 'Failed to reserve');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: C.bg }}
      contentContainerStyle={styles.content}
    >
      {spot && (
        <Card>
          <Text style={styles.spotId}>
            Spot #{spotNumber ?? spot.number}
          </Text>
          <Text style={styles.zone}>
            {spot.zone.name} · Floor {spot.zone.floor} · {spot.zone.lot.name}
          </Text>
          <Text style={styles.zone}>
            {SIZE_LABEL[spot.size] ?? spot.size}
            {spot.evCharging ? ' · EV charging' : ''}
            {spot.accessible ? ' · Accessible' : ''}
          </Text>
          <Text style={styles.rate}>
            {fmtMoney(spot.pricePerHour)}/hr
          </Text>
        </Card>
      )}

      <Spacer />

      <ScreenSection title="Starts in">
        <View style={styles.chips}>
          {START_OPTIONS.map((o, i) => (
            <PressChip
              key={o.label}
              label={o.label}
              active={i === startIdx}
              onPress={() => setStartIdx(i)}
            />
          ))}
        </View>
      </ScreenSection>

      <ScreenSection title="Duration">
        <View style={styles.chips}>
          {DURATIONS.map((d) => (
            <PressChip
              key={d}
              label={`${d} hr${d > 1 ? 's' : ''}`}
              active={d === duration}
              onPress={() => setDuration(d)}
            />
          ))}
        </View>
      </ScreenSection>

      <ScreenSection title="License plate (optional)">
        <TextInput
          value={plate}
          onChangeText={setPlate}
          placeholder="e.g. ABC 123"
          autoCapitalize="characters"
          autoCorrect={false}
          style={styles.input}
        />
        <Text style={styles.hint}>
          Plate-linked bookings can be looked up at the entry gate.
        </Text>
      </ScreenSection>

      <Card style={styles.estimate}>
        <Text style={styles.estimateLabel}>Estimated total</Text>
        <Text style={styles.estimateValue}>{fmtMoney(estimate)}</Text>
        {evAddOn > 0 && (
          <Text style={styles.evNote}>
            +{fmtMoney(evAddOn)} EV charging add-on
          </Text>
        )}
        <Text style={styles.estimateNote}>
          Final price is computed by the booking engine (incl. zone multiplier).
        </Text>
      </Card>

      <Spacer size={16} />
      <ErrorBox message={error} />
      <Spacer />

      <PrimaryButton
        label="Confirm & reserve"
        onPress={reserve}
        loading={submitting}
      />
    </ScrollView>
  );
}

function PressChip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <View
      style={[
        styles.chip,
        active
          ? { backgroundColor: C.teal, borderColor: C.teal }
          : { backgroundColor: C.card, borderColor: C.border },
      ]}
    >
      <Text
        onPress={onPress}
        style={[styles.chipLabel, { color: active ? '#ffffff' : C.text }]}
      >
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: 20, paddingBottom: 40 },
  spotId: { fontSize: 24, fontWeight: '800', color: C.text },
  zone: { marginTop: 4, fontSize: 13, color: C.sub },
  rate: { marginTop: 10, fontSize: 18, fontWeight: '800', color: C.teal },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  chipLabel: { fontSize: 13, fontWeight: '600' },
  estimate: { marginBottom: 8 },
  estimateLabel: { fontSize: 12, color: C.sub },
  estimateValue: {
    marginTop: 4,
    fontSize: 28,
    fontWeight: '800',
    color: C.teal,
  },
  estimateNote: { marginTop: 6, fontSize: 12, color: C.muted },
  evNote: { marginTop: 2, fontSize: 13, fontWeight: '700', color: C.teal },
  input: {
    marginTop: 4,
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    color: C.text,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  hint: { marginTop: 6, fontSize: 12, color: C.muted },
});