import { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { api } from '@/src/lib/api';
import { C } from '@/src/lib/ui';

export interface HourForecast {
  hour: string;
  label: string;
  predictedAvailable: number;
  predictedOccupancyPct: number;
  confidence: 'high' | 'medium' | 'low';
}

function dotColor(pct: number) {
  if (pct < 65) return '#34d399';
  if (pct < 85) return '#fbbf24';
  return '#fb7185';
}

export default function ForecastRow({ lotId }: { lotId: string }) {
  const [hours, setHours] = useState<HourForecast[] | null>(null);
  const [total, setTotal] = useState(0);

  const load = useCallback(async () => {
    try {
      const data = await api.get<{
        totalSpots: number;
        hours: HourForecast[];
      }>(`/api/availability/forecast?lotId=${lotId}`);
      setHours(data.hours);
      setTotal(data.totalSpots);
    } catch {
      setHours(null);
    }
  }, [lotId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!hours || hours.length === 0) return null;

  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>Expected availability</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
      >
        {hours.map((h) => (
          <View key={h.hour} style={styles.chip}>
            <View
              style={[styles.dot, { backgroundColor: dotColor(h.predictedOccupancyPct) }]}
            />
            <Text style={styles.label}>{h.label}</Text>
            <Text style={styles.value}>
              {h.predictedAvailable} free
            </Text>
            <Text style={styles.conf}>
              {h.confidence === 'high'
                ? 'confident'
                : h.confidence === 'medium'
                  ? 'likely'
                  : 'estimate'}
            </Text>
          </View>
        ))}
      </ScrollView>
      <Text style={styles.caption}>of {total} spots · next {hours.length} hours</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginTop: 14,
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 16,
    padding: 14,
  },
  title: { fontSize: 13, fontWeight: '700', color: C.text },
  row: { gap: 8, paddingTop: 10 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: C.bg,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
  label: { fontSize: 12, fontWeight: '700', color: C.text },
  value: { fontSize: 12, color: C.sub },
  conf: { fontSize: 9, color: C.muted, textTransform: 'uppercase' },
  caption: { marginTop: 8, fontSize: 11, color: C.muted },
});