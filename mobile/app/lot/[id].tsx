import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  FlatList,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import { api } from '@/src/lib/api';
import { C, SIZE_LABEL, fmtMoney, openDirections, statusColor } from '@/src/lib/ui';
import ForecastRow from '@/src/components/ForecastRow';
import type { Spot } from '@/src/lib/types';

type Section = { key: string; title: string; spots: Spot[] };

export default function LotScreen() {
  const { id, name, address, lat, lng } = useLocalSearchParams<{
    id: string;
    name?: string;
    address?: string;
    lat?: string;
    lng?: string;
  }>();
  const router = useRouter();

  const [spots, setSpots] = useState<Spot[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await api.get<{ spots: Spot[] }>(`/api/spots?lotId=${id}`);
      setSpots(data.spots);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load spots');
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const sections = useMemo<Section[]>(() => {
    if (!spots) return [];
    const map = new Map<string, Section>();
    for (const spot of spots) {
      const key = spot.zone.id;
      if (!map.has(key)) {
        map.set(key, {
          key,
          title: `${spot.zone.name} · Floor ${spot.zone.floor}`,
          spots: [],
        });
      }
      map.get(key)!.spots.push(spot);
    }
    return [...map.values()];
  }, [spots]);

  const lotName = name ?? spots?.[0]?.zone.lot.name ?? 'Parking lot';
  const lotAddress = address ?? spots?.[0]?.zone.lot.address ?? '';
  const lotLat = lat ? Number(lat) : undefined;
  const lotLng = lng ? Number(lng) : undefined;

  return (
    <FlatList
      style={{ flex: 1, backgroundColor: C.bg }}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
      ListHeaderComponent={
        <View>
          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{lotName}</Text>
              <Text style={styles.address}>{lotAddress}</Text>
            </View>
            {lotLat !== undefined && lotLng !== undefined && (
              <Pressable
                onPress={() => openDirections(lotLat, lotLng)}
                style={({ pressed }) => [
                  styles.navBtn,
                  { opacity: pressed ? 0.8 : 1 },
                ]}
              >
                <Text style={styles.navBtnText}>Navigate ↗</Text>
              </Pressable>
            )}
          </View>
          {lotLat !== undefined && lotLng !== undefined && Platform.OS !== 'web' && (
            <View style={styles.mapPreview}>
              <MapView
                style={StyleSheet.absoluteFill}
                scrollEnabled={false}
                zoomEnabled={false}
                pitchEnabled={false}
                rotateEnabled={false}
                initialRegion={{
                  latitude: lotLat,
                  longitude: lotLng,
                  latitudeDelta: 0.015,
                  longitudeDelta: 0.015,
                }}
              >
                <Marker
                  pinColor={C.teal}
                  title={lotName}
                  coordinate={{ latitude: lotLat, longitude: lotLng }}
                />
              </MapView>
            </View>
          )}
          {error && (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}
          <Text style={styles.hint}>
            Tap a green spot to book it. Pricing follows the zone multiplier.
          </Text>
          <ForecastRow lotId={id} />
        </View>
      }
      data={sections}
      keyExtractor={(s) => s.key}
      renderItem={({ item }) => (
        <View style={styles.section}>
          <Text style={styles.zoneTitle}>{item.title}</Text>
          <View style={styles.grid}>
            {item.spots.map((spot) => {
              const sc = statusColor(spot.status);
              const disabled = spot.status !== 'AVAILABLE';
              return (
                <Pressable
                  key={spot.id}
                  disabled={disabled}
                  onPress={() =>
                    router.push({
                      pathname: '/book/[spotId]',
                      params: {
                        spotId: spot.id,
                        lotId: id,
                        spotNumber: String(spot.number),
                      },
                    })
                  }
                  style={({ pressed }) => [
                    styles.spot,
                    {
                      backgroundColor: disabled ? '#f1f5f9' : '#d1fae5',
                      borderColor: disabled ? '#e2e8f0' : '#6ee7b7',
                      opacity: pressed ? 0.8 : 1,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.spotNum,
                      { color: disabled ? C.muted : C.tealDark },
                    ]}
                  >
                    {spot.number}
                  </Text>
                  <Text
                    style={[styles.spotMeta, { color: disabled ? C.muted : C.sub }]}
                    numberOfLines={1}
                  >
                    {SIZE_LABEL[spot.size] ?? spot.size}
                  </Text>
                  <Text style={[styles.spotMeta, { color: sc.text }]}>
                    {statusColor(spot.status).text ? spot.status : ''}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      )}
      ListEmptyComponent={
        <Text style={styles.empty}>
          {spots === null ? 'Loading spots…' : 'No spots in this lot.'}
        </Text>
      }
    />
  );
}

const styles = StyleSheet.create({
  content: { padding: 20, paddingBottom: 40 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 4 },
  name: { fontSize: 22, fontWeight: '800', color: C.text },
  address: { marginTop: 2, fontSize: 13, color: C.sub },
  navBtn: {
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  navBtnText: { color: C.teal, fontSize: 13, fontWeight: '600' },
  mapPreview: {
    height: 160,
    borderRadius: 16,
    overflow: 'hidden',
    marginTop: 12,
    borderWidth: 1,
    borderColor: C.border,
  },
  errorBox: {
    marginTop: 12,
    backgroundColor: '#fff1f2',
    borderRadius: 12,
    padding: 12,
  },
  errorText: { color: C.rose, fontSize: 13 },
  hint: { marginTop: 10, fontSize: 12, color: C.sub },
  section: { marginTop: 20 },
  zoneTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: C.sub,
    marginBottom: 10,
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  spot: {
    width: 96,
    borderRadius: 12,
    borderWidth: 1,
    paddingVertical: 10,
    paddingHorizontal: 8,
    alignItems: 'center',
  },
  spotNum: { fontSize: 18, fontWeight: '800' },
  spotMeta: { fontSize: 10, marginTop: 2 },
  empty: { textAlign: 'center', marginTop: 40, color: C.muted },
});