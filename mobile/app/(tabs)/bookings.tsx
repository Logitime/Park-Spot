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

type FilterTab = 'ALL' | 'ACTIVE' | 'COMPLETED' | 'EXPIRED';

const STATUS_ORDER: Record<string, number> = {
  ACTIVE: 1,
  CONFIRMED: 2,
  PENDING: 3,
  COMPLETED: 4,
  EXPIRED: 5,
  CANCELLED: 6,
};

export default function BookingsScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [rows, setRows] = useState<Reservation[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<FilterTab>('ALL');

  const load = useCallback(async () => {
    if (!user) {
      setRows(null);
      return;
    }
    try {
      const data = await api.get<{ reservations: Reservation[] }>(
        '/api/reservations'
      );
      // Sort reservations by priority
      const sorted = (data.reservations || []).sort((a, b) => {
        const orderA = STATUS_ORDER[a.status] || 99;
        const orderB = STATUS_ORDER[b.status] || 99;
        if (orderA !== orderB) return orderA - orderB;
        return new Date(b.startTime).getTime() - new Date(a.startTime).getTime();
      });
      setRows(sorted);
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

  if (user.role === 'OPERATOR') {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.header}>
          <Text style={styles.title}>Operator Portal</Text>
          <Text style={styles.subtitle}>Operator Mode Active</Text>
        </View>
        <View style={[styles.center, { paddingHorizontal: 32 }]}>
          <Text style={{ fontSize: 40, marginBottom: 12 }}>🛡️</Text>
          <Text style={[styles.name, { textAlign: 'center', fontSize: 18, marginBottom: 8 }]}>
            Operator Account
          </Text>
          <Text style={[styles.muted, { textAlign: 'center', lineHeight: 20 }]}>
            You are signed in as an Operator. Parking lot monitoring and barrier operations are managed from the web portal.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  const filteredRows = (rows ?? []).filter((r) => {
    if (activeTab === 'ALL') return true;
    if (activeTab === 'ACTIVE') return ['ACTIVE', 'CONFIRMED', 'PENDING'].includes(r.status);
    if (activeTab === 'COMPLETED') return r.status === 'COMPLETED';
    if (activeTab === 'EXPIRED') return ['EXPIRED', 'CANCELLED'].includes(r.status);
    return true;
  });

  const activeCount = (rows ?? []).filter((r) => ['ACTIVE', 'CONFIRMED', 'PENDING'].includes(r.status)).length;
  const completedCount = (rows ?? []).filter((r) => r.status === 'COMPLETED').length;
  const expiredCount = (rows ?? []).filter((r) => ['EXPIRED', 'CANCELLED'].includes(r.status)).length;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>My bookings</Text>
        <Text style={styles.subtitle}>
          {rows ? `${rows.length} booking${rows.length === 1 ? '' : 's'}` : ' '}
        </Text>
      </View>

      {/* Filter Tabs */}
      <View style={styles.tabsContainer}>
        <Pressable
          onPress={() => setActiveTab('ALL')}
          style={[styles.tabBtn, activeTab === 'ALL' && styles.tabBtnActive]}
        >
          <Text style={[styles.tabText, activeTab === 'ALL' && styles.tabTextActive]}>
            All ({rows?.length ?? 0})
          </Text>
        </Pressable>
        <Pressable
          onPress={() => setActiveTab('ACTIVE')}
          style={[styles.tabBtn, activeTab === 'ACTIVE' && styles.tabBtnActive]}
        >
          <Text style={[styles.tabText, activeTab === 'ACTIVE' && styles.tabTextActive]}>
            Active ({activeCount})
          </Text>
        </Pressable>
        <Pressable
          onPress={() => setActiveTab('COMPLETED')}
          style={[styles.tabBtn, activeTab === 'COMPLETED' && styles.tabBtnActive]}
        >
          <Text style={[styles.tabText, activeTab === 'COMPLETED' && styles.tabTextActive]}>
            Completed ({completedCount})
          </Text>
        </Pressable>
        <Pressable
          onPress={() => setActiveTab('EXPIRED')}
          style={[styles.tabBtn, activeTab === 'EXPIRED' && styles.tabBtnActive]}
        >
          <Text style={[styles.tabText, activeTab === 'EXPIRED' && styles.tabTextActive]}>
            Expired ({expiredCount})
          </Text>
        </Pressable>
      </View>

      <FlatList
        data={filteredRows}
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
              : 'No bookings found in this category.'}
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
                    {item.vehicle?.plateNumber ? ` · ${item.vehicle.plateNumber}` : ''}
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
  header: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 4 },
  title: { fontSize: 24, fontWeight: '800', color: C.text },
  subtitle: { marginTop: 2, fontSize: 13, color: C.sub },
  tabsContainer: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingVertical: 8,
    gap: 6,
  },
  tabBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: '#f1f5f9',
  },
  tabBtnActive: {
    backgroundColor: C.teal,
  },
  tabText: {
    fontSize: 12,
    fontWeight: '600',
    color: C.sub,
  },
  tabTextActive: {
    color: '#ffffff',
    fontWeight: '700',
  },
  list: { padding: 20, paddingTop: 6, gap: 12 },
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