import { useState, useEffect, useRef } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, ActivityIndicator, Alert, Linking,
} from 'react-native';
import { useAuth } from '@clerk/clerk-expo';
import { useRoute, RouteProp } from '@react-navigation/native';
import { createApiClient, Restaurant, Job } from '../lib/api';
import { ExploreStackParamList } from '../App';

type RoutePropType = RouteProp<ExploreStackParamList, 'Restaurants'>;

export default function RestaurantsScreen() {
  const { getToken } = useAuth();
  const route = useRoute<RoutePropType>();
  const { dishId, dishName, cityName, cityCountry } = route.params;

  const [loading, setLoading] = useState(true);
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [statusMsg, setStatusMsg] = useState('Finding the best spots…');
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = () => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  };

  useEffect(() => {
    startRanking();
    return stopPolling;
  }, []);

  const startRanking = async () => {
    try {
      const token = await getToken();
      if (!token) return;
      const api = createApiClient(token);
      const { job_id } = await api.restaurants.rank(dishId, dishName, cityName, cityCountry);

      pollRef.current = setInterval(async () => {
        try {
          const token2 = await getToken();
          if (!token2) return;
          const api2 = createApiClient(token2);
          const job: Job = await api2.jobs.get(job_id);

          if (job.status === 'completed') {
            stopPolling();
            const rList = (job.restaurants_payload?.restaurants as Restaurant[]) || [];
            if (rList.length > 0) {
              setRestaurants(rList);
            } else {
              // Fallback: fetch direct
              const data = await api2.restaurants.list(dishId);
              setRestaurants(data.restaurants || []);
            }
            setLoading(false);
          } else if (job.status === 'failed') {
            stopPolling();
            Alert.alert('Error', job.error_message || 'Failed to load restaurants.');
            setLoading(false);
          }
        } catch { /* keep polling */ }
      }, 2000);
    } catch (e: unknown) {
      Alert.alert('Error', (e as Error).message);
      setLoading(false);
    }
  };

  const rankColors: Record<number, string> = { 1: '#7c3aed', 2: '#9ca3af', 3: '#a78bfa' };

  return (
    <ScrollView style={styles.container}>
      <View style={styles.subheader}>
        <Text style={styles.subheaderText}>AI-ranked by rating, reviews & local reputation</Text>
      </View>

      {loading ? (
        <View style={styles.loadingBox}>
          <Text style={styles.loadingEmoji}>🤖</Text>
          <Text style={styles.loadingText}>{statusMsg}</Text>
          <ActivityIndicator color="#7c3aed" style={{ marginTop: 12 }} />
          <Text style={styles.loadingHint}>Usually takes 20–40 seconds</Text>
        </View>
      ) : restaurants.length === 0 ? (
        <View style={styles.emptyBox}>
          <Text style={styles.emptyText}>No restaurants found yet.</Text>
        </View>
      ) : (
        <View style={styles.list}>
          {restaurants.map((r) => (
            <View key={r.id || String(r.rank)} style={styles.card}>
              <View style={styles.cardHeader}>
                <View style={[styles.rankBadge, { backgroundColor: rankColors[r.rank] || '#e5e7eb' }]}>
                  <Text style={styles.rankText}>{r.rank}</Text>
                </View>
                <View style={styles.ratingRow}>
                  {r.google_rating ? (
                    <Text style={styles.rating}>
                      ★ {r.google_rating}
                      {r.review_count ? (
                        <Text style={styles.reviewCount}>  ({r.review_count.toLocaleString()})</Text>
                      ) : null}
                    </Text>
                  ) : null}
                  {r.price_level ? (
                    <Text style={styles.priceLevel}>{r.price_level}</Text>
                  ) : null}
                </View>
              </View>

              <Text style={styles.restaurantName}>{r.name}</Text>
              {r.address ? <Text style={styles.address}>{r.address}</Text> : null}
              {r.rank_rationale ? (
                <Text style={styles.rationale}>"{r.rank_rationale}"</Text>
              ) : null}

              {r.highlights.length > 0 && (
                <View style={styles.tagRow}>
                  {r.highlights.slice(0, 4).map((h, i) => (
                    <View key={i} style={styles.tag}>
                      <Text style={styles.tagText}>{h}</Text>
                    </View>
                  ))}
                </View>
              )}

              {r.google_maps_url ? (
                <TouchableOpacity
                  style={styles.mapsBtn}
                  onPress={() => Linking.openURL(r.google_maps_url!)}
                >
                  <Text style={styles.mapsBtnText}>📍 Open in Google Maps</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  subheader: { padding: 16, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  subheaderText: { fontSize: 13, color: '#9ca3af' },
  loadingBox: {
    margin: 16, backgroundColor: '#fff', borderRadius: 12,
    padding: 32, alignItems: 'center', shadowColor: '#000',
    shadowOpacity: 0.06, shadowRadius: 8, elevation: 2,
  },
  loadingEmoji: { fontSize: 40, marginBottom: 12 },
  loadingText: { fontSize: 16, fontWeight: '600', color: '#374151', marginBottom: 4 },
  loadingHint: { fontSize: 13, color: '#9ca3af', marginTop: 8 },
  emptyBox: { padding: 40, alignItems: 'center' },
  emptyText: { color: '#9ca3af', fontSize: 15 },
  list: { padding: 16 },
  card: {
    backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 12,
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 6, elevation: 2,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  rankBadge: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
  },
  rankText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  ratingRow: { alignItems: 'flex-end' },
  rating: { fontSize: 15, fontWeight: '600', color: '#7c3aed' },
  reviewCount: { fontSize: 12, color: '#9ca3af', fontWeight: '400' },
  priceLevel: { fontSize: 13, color: '#9ca3af', marginTop: 2 },
  restaurantName: { fontSize: 18, fontWeight: '700', color: '#1f2937', marginBottom: 4 },
  address: { fontSize: 13, color: '#9ca3af', marginBottom: 6 },
  rationale: { fontSize: 13, color: '#6b7280', fontStyle: 'italic', marginBottom: 10, lineHeight: 19 },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 },
  tag: { backgroundColor: '#f0fdf4', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
  tagText: { fontSize: 12, color: '#16a34a' },
  mapsBtn: {
    backgroundColor: '#eff6ff', borderRadius: 8,
    paddingVertical: 10, alignItems: 'center',
  },
  mapsBtnText: { color: '#2563eb', fontSize: 14, fontWeight: '600' },
});
