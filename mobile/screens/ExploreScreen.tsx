import { useState, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, ActivityIndicator, Alert, Animated,
} from 'react-native';
import { useAuth } from '@clerk/clerk-expo';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { createApiClient, Dish, City, Job } from '../lib/api';
import { ExploreStackParamList } from '../App';

type NavProp = NativeStackNavigationProp<ExploreStackParamList, 'ExploreHome'>;

type Stage = 'idle' | 'searching' | 'dishes';

export default function ExploreScreen() {
  const { getToken } = useAuth();
  const navigation = useNavigation<NavProp>();
  const [cityInput, setCityInput] = useState('');
  const [countryInput, setCountryInput] = useState('');
  const [stage, setStage] = useState<Stage>('idle');
  const [city, setCity] = useState<City | null>(null);
  const [dishes, setDishes] = useState<Dish[]>([]);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = () => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  };

  const pollJob = async (jobId: string, onComplete: (job: Job) => void) => {
    stopPolling();
    const token = await getToken();
    if (!token) return;
    const api = createApiClient(token);
    pollRef.current = setInterval(async () => {
      try {
        const job = await api.jobs.get(jobId);
        if (job.status === 'completed') {
          stopPolling();
          onComplete(job);
        } else if (job.status === 'failed') {
          stopPolling();
          Alert.alert('Search failed', job.error_message || 'Please try again.');
          setStage('idle');
        }
      } catch { /* keep polling */ }
    }, 2000);
  };

  const handleSearch = async () => {
    if (!cityInput.trim() || !countryInput.trim()) {
      Alert.alert('Missing fields', 'Please enter both a city and country.');
      return;
    }
    setStage('searching');
    setDishes([]);
    setCity(null);

    try {
      const token = await getToken();
      if (!token) throw new Error('Not authenticated');
      const api = createApiClient(token);
      const { job_id } = await api.discover.start(cityInput.trim(), countryInput.trim());

      pollJob(job_id, async (job) => {
        const dishesPayload = job.dishes_payload || {};
        const cityId =
          (job.summary_payload?.city_id as string) ||
          (dishesPayload?.city_id as string);
        if (cityId) {
          const token2 = await getToken();
          if (!token2) return;
          const api2 = createApiClient(token2);
          const data = await api2.cities.dishes(cityId);
          setCity(data.city);
          setDishes(data.dishes);
          setStage('dishes');
        }
      });
    } catch (e: unknown) {
      Alert.alert('Error', (e as Error).message || 'Failed to start search.');
      setStage('idle');
    }
  };

  const handleAddToPassport = async (dish: Dish) => {
    try {
      const token = await getToken();
      if (!token) return;
      const api = createApiClient(token);
      await api.passport.add(dish.id);
      setDishes((prev) =>
        prev.map((d) => (d.id === dish.id ? { ...d, in_passport: true } : d))
      );
      Alert.alert('Added!', `"${dish.name}" added to your passport.`);
    } catch {
      Alert.alert('Error', 'Failed to add to passport.');
    }
  };

  const rankColors: Record<number, string> = {
    1: '#7c3aed',
    2: '#9ca3af',
    3: '#a78bfa',
  };

  return (
    <ScrollView style={styles.container} keyboardShouldPersistTaps="handled">
      <View style={styles.header}>
        <Text style={styles.title}>Explore a City</Text>
        <Text style={styles.subtitle}>
          Discover 5 must-try dishes and where to eat them.
        </Text>
      </View>

      <View style={styles.form}>
        <TextInput
          style={styles.input}
          placeholder="City (e.g. Tokyo)"
          value={cityInput}
          onChangeText={setCityInput}
          placeholderTextColor="#9ca3af"
          editable={stage !== 'searching'}
        />
        <TextInput
          style={styles.input}
          placeholder="Country (e.g. Japan)"
          value={countryInput}
          onChangeText={setCountryInput}
          placeholderTextColor="#9ca3af"
          editable={stage !== 'searching'}
        />
        <TouchableOpacity
          style={[styles.button, stage === 'searching' && styles.buttonDisabled]}
          onPress={handleSearch}
          disabled={stage === 'searching'}
        >
          {stage === 'searching' ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>Discover</Text>
          )}
        </TouchableOpacity>
      </View>

      {stage === 'searching' && (
        <View style={styles.loadingBox}>
          <Text style={styles.loadingEmoji}>🤖</Text>
          <Text style={styles.loadingText}>Researching local food scene…</Text>
          <Text style={styles.loadingHint}>Usually takes 20–40 seconds</Text>
        </View>
      )}

      {stage === 'dishes' && city && dishes.length > 0 && (
        <View style={styles.results}>
          <Text style={styles.resultsTitle}>
            Must-try dishes in {city.name}, {city.country}
          </Text>
          {city.description ? (
            <Text style={styles.resultsDesc}>{city.description}</Text>
          ) : null}

          {dishes.map((dish) => (
            <View key={dish.id} style={styles.dishCard}>
              <View style={styles.dishHeader}>
                <View
                  style={[
                    styles.rankBadge,
                    { backgroundColor: rankColors[dish.rank] || '#e5e7eb' },
                  ]}
                >
                  <Text style={styles.rankText}>{dish.rank}</Text>
                </View>
                {dish.in_passport && <Text style={{ fontSize: 18 }}>🛂</Text>}
              </View>

              <Text style={styles.dishName}>{dish.name}</Text>
              {dish.cuisine_type ? (
                <Text style={styles.dishCuisine}>{dish.cuisine_type}</Text>
              ) : null}
              <Text style={styles.dishDesc} numberOfLines={3}>{dish.description}</Text>

              <View style={styles.tagRow}>
                {dish.tags.slice(0, 3).map((tag) => (
                  <View key={tag} style={styles.tag}>
                    <Text style={styles.tagText}>{tag}</Text>
                  </View>
                ))}
              </View>

              <View style={styles.dishActions}>
                <TouchableOpacity
                  style={styles.findBtn}
                  onPress={() =>
                    navigation.navigate('Restaurants', {
                      dishId: dish.id,
                      dishName: dish.name,
                      cityName: city.name,
                      cityCountry: city.country,
                    })
                  }
                >
                  <Text style={styles.findBtnText}>Find places →</Text>
                </TouchableOpacity>
                {!dish.in_passport && (
                  <TouchableOpacity
                    style={styles.passportBtn}
                    onPress={() => handleAddToPassport(dish)}
                  >
                    <Text style={styles.passportBtnText}>🛂</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  header: { padding: 20, paddingTop: 60, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  title: { fontSize: 28, fontWeight: '700', color: '#1f2937', marginBottom: 4 },
  subtitle: { fontSize: 15, color: '#6b7280', lineHeight: 22 },
  form: { padding: 16, gap: 12 },
  input: {
    borderWidth: 1, borderColor: '#d1d5db', borderRadius: 10,
    padding: 14, fontSize: 16, backgroundColor: '#fff', color: '#1f2937',
  },
  button: {
    backgroundColor: '#7c3aed', borderRadius: 10,
    padding: 16, alignItems: 'center',
  },
  buttonDisabled: { backgroundColor: '#9ca3af' },
  buttonText: { color: '#fff', fontSize: 17, fontWeight: '600' },
  loadingBox: {
    margin: 16, backgroundColor: '#fff', borderRadius: 12,
    padding: 32, alignItems: 'center', shadowColor: '#000',
    shadowOpacity: 0.06, shadowRadius: 8, elevation: 2,
  },
  loadingEmoji: { fontSize: 40, marginBottom: 12 },
  loadingText: { fontSize: 16, fontWeight: '600', color: '#374151', marginBottom: 4 },
  loadingHint: { fontSize: 13, color: '#9ca3af' },
  results: { padding: 16 },
  resultsTitle: { fontSize: 20, fontWeight: '700', color: '#1f2937', marginBottom: 4 },
  resultsDesc: { fontSize: 14, color: '#6b7280', marginBottom: 16, lineHeight: 20 },
  dishCard: {
    backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 12,
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 6, elevation: 2,
  },
  dishHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  rankBadge: {
    width: 28, height: 28, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
  },
  rankText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  dishName: { fontSize: 17, fontWeight: '600', color: '#1f2937', marginBottom: 2 },
  dishCuisine: { fontSize: 13, color: '#9ca3af', marginBottom: 6 },
  dishDesc: { fontSize: 14, color: '#6b7280', lineHeight: 20, marginBottom: 10 },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 },
  tag: { backgroundColor: '#f3e8ff', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
  tagText: { fontSize: 12, color: '#7c3aed' },
  dishActions: { flexDirection: 'row', gap: 8 },
  findBtn: {
    flex: 1, backgroundColor: '#7c3aed', borderRadius: 8,
    paddingVertical: 10, alignItems: 'center',
  },
  findBtnText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  passportBtn: {
    borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8,
    paddingHorizontal: 14, paddingVertical: 10, alignItems: 'center',
  },
  passportBtnText: { fontSize: 16 },
});
