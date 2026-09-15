import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api } from '@/src/lib/api';
import { C, STATUS_LABEL, statusColor, fmtMoney } from '@/src/lib/ui';
import { Card } from '@/src/components/ui';
import type { Lot } from '@/src/lib/types';

export default function FindScreen() {
  const router = useRouter();
  const [lots, setLots] = useState<Lot[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState('');

  const load = useCallback(async () => {
    try {
      const data = await api.get<{ lots: Lot[] }>('/api/lots');
      setLots(data.lots);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load parking lots');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const filtered = (lots ?? []).filter(
    (lot) =>
      !query.trim() ||
      lot.name.toLowerCase().includes(query.toLowerCase()) ||
      lot.address.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.brand}>ParkSpot</Text>
        <Text style={styles.subtitle}>Find a parking spot near you</Text>
      </View>

      <TextInput
        value={query}
        onChangeText={setQuery}
        placeholder="Search by lot name or address…"
        placeholderTextColor={C.muted}
        style={styles.search}
      />

      {error && (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      <FlatList
        data={filtered}
        keyExtractor={(lot) => lot.id}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        ListEmptyComponent={
          <Text style={styles.empty}>
            {lots === null ? 'Loading lots…' : 'No parking lots found.'}
          </Text>
        }
        renderItem={({ item }) => {
          const avail =
            item.totalSpots === 0
              ? 0
              : Math.round(((item.totalSpots - item.available) / item.totalSpots) * 100);
          const barColor =
            avail >= 90 ? C.rose : avail >= 60 ? C.amber : C.emerald;
          return (
            <Pressable
              onPress={() =>
                router.push({ pathname: '/lot/[id]', params: { id: item.id } })
              }
              style={({ pressed }) => ({ opacity: pressed ? 0.9 : 1 })}
            >
              <Card style={styles.lotCard}>
                <View style={styles.lotTop}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.lotName}>{item.name}</Text>
                    <Text style={styles.lotAddress}>{item.address}</Text>
                  </View>
                  <Text style={styles.rate}>{fmtMoney(item.baseHourlyRate)}/hr</Text>
                </View>
                <View style={styles.availRow}>
                  <View style={styles.barTrack}>
                    <View
                      style={[
                        styles.barFill,
                        { width: `${avail}%`, backgroundColor: barColor },
                      ]}
                    />
                  </View>
                  <Text style={styles.availText}>
                    {item.available}/{item.totalSpots} free
                  </Text>
                </View>
                <Text style={styles.zoneCount}>{item.zones.length} zones</Text>
              </Card>
            </Pressable>
          );
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  header: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 4 },
  brand: { fontSize: 26, fontWeight: '800', color: C.tealDark },
  subtitle: { marginTop: 2, fontSize: 14, color: C.sub },
  search: {
    marginHorizontal: 20,
    marginTop: 12,
    marginBottom: 4,
    backgroundColor: C.card,
    borderColor: C.border,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    color: C.text,
  },
  list: { padding: 20, paddingTop: 12, gap: 12 },
  lotCard: { gap: 10 },
  lotTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  lotName: { fontSize: 16, fontWeight: '700', color: C.text },
  lotAddress: { marginTop: 2, fontSize: 12, color: C.sub },
  rate: { fontSize: 13, fontWeight: '700', color: C.teal },
  availRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  barTrack: {
    flex: 1,
    height: 6,
    borderRadius: 999,
    backgroundColor: '#f1f5f9',
    overflow: 'hidden',
  },
  barFill: { height: '100%', borderRadius: 999 },
  availText: { fontSize: 12, color: C.sub },
  zoneCount: { fontSize: 11, color: C.muted },
  errorBox: {
    marginHorizontal: 20,
    marginTop: 12,
    backgroundColor: '#fff1f2',
    borderRadius: 12,
    padding: 12,
  },
  errorText: { color: C.rose, fontSize: 13 },
  empty: { textAlign: 'center', marginTop: 40, color: C.muted },
});