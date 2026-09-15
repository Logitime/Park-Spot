import { useRouter } from 'expo-router';
import * as Location from 'expo-location';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  FlatList,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api } from '@/src/lib/api';
import {
  C,
  STATUS_LABEL,
  formatDistance,
  fmtMoney,
  haversineKm,
  statusColor,
} from '@/src/lib/ui';
import { Card } from '@/src/components/ui';
import type { Lot } from '@/src/lib/types';

function Cap({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.cap,
        active && { backgroundColor: C.teal, borderColor: C.teal },
      ]}
    >
      <Text style={[styles.capText, active && { color: '#ffffff' }]}>{label}</Text>
    </Pressable>
  );
}

export default function FindScreen() {
  const router = useRouter();
  const [lots, setLots] = useState<Lot[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState('');
  const [view, setView] = useState<'list' | 'map'>('list');
  const [userLocation, setUserLocation] = useState<{
    latitude: number;
    longitude: number;
  } | null>(null);
  const [locError, setLocError] = useState(false);

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

  useEffect(() => {
    if (Platform.OS === 'web') return;
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          setLocError(true);
          return;
        }
        const pos = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        setUserLocation({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
        });
      } catch {
        setLocError(true);
      }
    })();
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const filtered = useMemo(() => {
    const base = (lots ?? []).filter(
      (lot) =>
        !query.trim() ||
        lot.name.toLowerCase().includes(query.toLowerCase()) ||
        lot.address.toLowerCase().includes(query.toLowerCase())
    );
    if (!userLocation) return base;
    return [...base].sort(
      (a, b) =>
        haversineKm(
          userLocation.latitude,
          userLocation.longitude,
          a.latitude,
          a.longitude
        ) -
        haversineKm(
          userLocation.latitude,
          userLocation.longitude,
          b.latitude,
          b.longitude
        )
    );
  }, [lots, query, userLocation]);

  const selectedRegion = useMemo(() => {
    if (userLocation)
      return {
        latitude: userLocation.latitude,
        longitude: userLocation.longitude,
      };
    if (filtered[0])
      return { latitude: filtered[0].latitude, longitude: filtered[0].longitude };
    return { latitude: 40.6413, longitude: -73.7781 };
  }, [userLocation, filtered]);

  const initialRegion = useMemo(
    () => ({ ...selectedRegion, latitudeDelta: 0.35, longitudeDelta: 0.35 }),
    [selectedRegion]
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.brand}>ParkSpot</Text>
          <Text style={styles.subtitle}>
            Find a parking spot near you
            {userLocation ? ' (sorted by distance)' : ''}
          </Text>
        </View>
        <View style={styles.capRow}>
          <Cap label="List" active={view === 'list'} onPress={() => setView('list')} />
          {Platform.OS !== 'web' && (
            <Cap label="Map" active={view === 'map'} onPress={() => setView('map')} />
          )}
        </View>
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

      {locError && (
        <View style={styles.locHint}>
          <Text style={styles.locHintText}>
            Enable location access to sort lots by distance.
          </Text>
        </View>
      )}

      {view === 'map' && Platform.OS !== 'web' && lots && lots.length > 0 ? (
        <View style={styles.mapWrap}>
          <MapView style={StyleSheet.absoluteFill} initialRegion={initialRegion}>
            {userLocation && (
              <Marker
                title="You are here"
                pinColor="#0284c7"
                coordinate={selectedRegion}
              />
            )}
            {filtered.map((lot) => (
              <Marker
                key={lot.id}
                pinColor={lot.available > 0 ? '#059669' : C.rose}
                title={lot.name}
                description={`${lot.available}/${lot.totalSpots} free · ${fmtMoney(lot.baseHourlyRate)}/hr`}
                coordinate={{ latitude: lot.latitude, longitude: lot.longitude }}
                onPress={() =>
                  router.push({
                    pathname: '/lot/[id]',
                    params: {
                      id: lot.id,
                      name: lot.name,
                      address: lot.address,
                      lat: String(lot.latitude),
                      lng: String(lot.longitude),
                    },
                  })
                }
              />
            ))}
          </MapView>
        </View>
      ) : (
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
            const barColor = avail >= 90 ? C.rose : avail >= 60 ? C.amber : C.emerald;
            const distanceM = userLocation
              ? haversineKm(
                  userLocation.latitude,
                  userLocation.longitude,
                  item.latitude,
                  item.longitude
                ) * 1000
              : null;
            return (
              <Pressable
                onPress={() =>
                  router.push({
                    pathname: '/lot/[id]',
                    params: {
                      id: item.id,
                      name: item.name,
                      address: item.address,
                      lat: String(item.latitude),
                      lng: String(item.longitude),
                    },
                  })
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
                  <View style={styles.metaRow}>
                    <Text style={styles.zoneCount}>{item.zones.length} zones</Text>
                    {distanceM !== null && (
                      <Text style={styles.distance}>{formatDistance(distanceM)} away</Text>
                    )}
                  </View>
                </Card>
              </Pressable>
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  header: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  brand: { fontSize: 26, fontWeight: '800', color: C.tealDark },
  subtitle: { marginTop: 2, fontSize: 13, color: C.sub },
  capRow: { flexDirection: 'row', gap: 6 },
  cap: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.card,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  capText: { fontSize: 12, fontWeight: '600', color: C.sub },
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
  mapWrap: { flex: 1, marginTop: 12, overflow: 'hidden' },
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
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  zoneCount: { fontSize: 11, color: C.muted },
  distance: { fontSize: 11, fontWeight: '600', color: C.teal },
  errorBox: {
    marginHorizontal: 20,
    marginTop: 12,
    backgroundColor: '#fff1f2',
    borderRadius: 12,
    padding: 12,
  },
  errorText: { color: C.rose, fontSize: 13 },
  locHint: {
    marginHorizontal: 20,
    marginTop: 12,
    backgroundColor: '#eff6ff',
    borderRadius: 12,
    padding: 12,
  },
  locHintText: { color: C.sky, fontSize: 12 },
  empty: { textAlign: 'center', marginTop: 40, color: C.muted },
});