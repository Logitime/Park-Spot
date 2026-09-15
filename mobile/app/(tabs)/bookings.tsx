import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api, ApiError } from '@/src/lib/api';
import { C, fmtMoney, fmtTime } from '@/src/lib/ui';
import { Card, Chip } from '@/src/components/ui';
import { useAuth } from '@/src/lib/auth';
import type { Reservation } from '@/src/lib/types';

export default function BookingsScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [rows, setRows] = useState<Reservation[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!user) {
      setRows(null);
      return;
    }
    try {
      const data = await api.get<{ reservations: Reservation[] }>(
        '/api/reservations'
      );
      setRows(data.reservations);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load bookings');
    }
  }, [user]);

  useEffect(() => {
    void load();
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  if (!user) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.header}>
          <Text style={styles.title}>My bookings</Text>
        </View>
        <View style={styles.center}>
          <Text style={styles.muted}>Sign in to see your bookings.</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>My bookings</Text>
        <Text style={styles.subtitle}>
          {rows ? `${rows.length} booking${rows.length === 1 ? '' : 's'}` : ' '}
        </Text>
      </View>

      <FlatList
        data={rows ?? []}
        keyExtractor={(r) => r.id}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        ListEmptyComponent={
          <Text style={styles.empty}>
            {rows === null
              ? !error
                ? 'Loading bookings…'
                : error
              : 'No bookings yet. Find parking from the home tab.'}
          </Text>
        }
        renderItem={({ item }) => (
          <Pressable
            onPress={() =>
              router.push({
                pathname: '/booking/[id]',
                params: { id: item.id },
              })
            }
            style={({ pressed }) => ({ opacity: pressed ? 0.9 : 1 })}
          >
            <Card style={styles.card}>
              <View style={styles.row}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.name}>
                    {item.spot.zone.lot.name} · #{item.spot.number}
                  </Text>
                  <Text style={styles.meta}>
                    {fmtTime(item.startTime)} → {fmtTime(item.endTime)}
                  </Text>
                </View>
                <View style={styles.right}>
                  <Chip status={item.status} />
                  <Text style={styles.amount}>{fmtMoney(item.totalPrice)}</Text>
                </View>
              </View>
            </Card>
          </Pressable>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  header: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 8 },
  title: { fontSize: 24, fontWeight: '800', color: C.text },
  subtitle: { marginTop: 2, fontSize: 13, color: C.sub },
  list: { padding: 20, paddingTop: 8, gap: 12 },
  card: { gap: 0 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  name: { fontSize: 15, fontWeight: '600', color: C.text },
  meta: { marginTop: 4, fontSize: 12, color: C.sub },
  right: { alignItems: 'flex-end', gap: 6 },
  amount: { fontSize: 14, fontWeight: '700', color: C.teal },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  muted: { color: C.muted },
  empty: { textAlign: 'center', marginTop: 40, color: C.muted },
});