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
import { api } from '@/src/lib/api';
import { C } from '@/src/lib/ui';
import { Card } from '@/src/components/ui';
import { useAuth } from '@/src/lib/auth';
import type { AppNotification } from '@/src/lib/types';

export default function AlertsScreen() {
  const { user } = useAuth();
  const [items, setItems] = useState<AppNotification[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!user) {
      setItems(null);
      return;
    }
    try {
      const data = await api.get<{ notifications: AppNotification[] }>(
        '/api/notifications'
      );
      setItems(data.notifications);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load alerts');
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

  const toggleRead = async (id: string, read: boolean) => {
    setItems(
      (list) =>
        list?.map((x) => (x.id === id ? { ...x, read } : x)) ?? list
    );
    await api
      .patch(`/api/notifications/${id}`, { read })
      .catch(() => {});
  };

  const markAllRead = async () => {
    await api.post('/api/notifications/read-all', {}).catch(() => {});
    setItems((list) => list?.map((x) => ({ ...x, read: true })) ?? list);
  };

  if (!user) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.header}>
          <Text style={styles.title}>Alerts</Text>
        </View>
        <View style={styles.center}>
          <Text style={styles.muted}>Sign in to see your alerts.</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text style={styles.title}>Alerts</Text>
          <Pressable onPress={markAllRead} style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}>
            <Text style={styles.markAll}>Mark all read</Text>
          </Pressable>
        </View>
      </View>

      <FlatList
        data={items ?? []}
        keyExtractor={(n) => n.id}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        ListEmptyComponent={
          <Text style={styles.empty}>
            {items === null
              ? !error
                ? 'Loading alerts…'
                : error
              : 'You’re all caught up.'}
          </Text>
        }
        renderItem={({ item }) => (
          <Pressable
            onPress={() => toggleRead(item.id, !item.read)}
            style={({ pressed }) => ({ opacity: pressed ? 0.9 : 1 })}
          >
            <Card
              style={
                item.read
                  ? styles.card
                  : [styles.card, { borderColor: C.teal, backgroundColor: C.tealBg }]
              }
            >
              <View style={styles.cardRow}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.content, item.read && { color: C.sub }]}>
                    {item.content}
                  </Text>
                  <Text style={styles.time}>
                    {new Date(item.createdAt).toLocaleString()}
                  </Text>
                </View>
                {!item.read && <View style={styles.dot} />}
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
  markAll: { fontSize: 13, fontWeight: '600', color: C.teal },
  list: { padding: 20, paddingTop: 8, gap: 10 },
  card: { flexDirection: 'row', alignItems: 'center' },
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  content: { fontSize: 14, color: C.text, lineHeight: 20 },
  time: { marginTop: 4, fontSize: 11, color: C.muted },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: C.teal },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  muted: { color: C.muted },
  empty: { textAlign: 'center', marginTop: 40, color: C.muted },
});