import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, ActivityIndicator, Alert, TextInput,
} from 'react-native';
import { useAuth } from '@clerk/clerk-expo';
import { useFocusEffect } from '@react-navigation/native';
import { createApiClient, PassportEntry, PassportStats } from '../lib/api';

export default function PassportScreen() {
  const { getToken } = useAuth();
  const [entries, setEntries] = useState<PassportEntry[]>([]);
  const [stats, setStats] = useState<PassportStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editRating, setEditRating] = useState(0);
  const [editNotes, setEditNotes] = useState('');

  const load = async () => {
    try {
      const token = await getToken();
      if (!token) return;
      const api = createApiClient(token);
      const data = await api.passport.list();
      setEntries(data.entries || []);
      setStats(data.stats);
    } catch { /* silent */ } finally {
      setLoading(false);
    }
  };

  useFocusEffect(useCallback(() => { load(); }, []));

  const saveEdit = async (id: string) => {
    try {
      const token = await getToken();
      if (!token) return;
      const api = createApiClient(token);
      await api.passport.update(id, editRating || null, editNotes || null);
      setEditingId(null);
      await load();
    } catch {
      Alert.alert('Error', 'Failed to save.');
    }
  };

  const handleDelete = (id: string) => {
    Alert.alert('Remove dish?', 'This will remove it from your passport.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove', style: 'destructive', onPress: async () => {
          try {
            const token = await getToken();
            if (!token) return;
            const api = createApiClient(token);
            await api.passport.remove(id);
            await load();
          } catch {
            Alert.alert('Error', 'Failed to delete.');
          }
        },
      },
    ]);
  };

  const groupByCityCountry = () => {
    const groups: Record<string, { city: string; country: string; entries: PassportEntry[] }> = {};
    entries.forEach((e) => {
      const key = `${e.city_name}|${e.country}`;
      if (!groups[key]) groups[key] = { city: e.city_name, country: e.country, entries: [] };
      groups[key].entries.push(e);
    });
    return Object.values(groups);
  };

  const StarRow = ({ value, onChange }: { value: number; onChange: (v: number) => void }) => (
    <View style={{ flexDirection: 'row', gap: 6 }}>
      {[1, 2, 3, 4, 5].map((s) => (
        <TouchableOpacity key={s} onPress={() => onChange(s === value ? 0 : s)}>
          <Text style={{ fontSize: 26, color: s <= value ? '#7c3aed' : '#e5e7eb' }}>★</Text>
        </TouchableOpacity>
      ))}
    </View>
  );

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>🛂 My Food Passport</Text>
        <Text style={styles.subtitle}>Your culinary adventures, logged for life.</Text>
      </View>

      {stats && (
        <View style={styles.statsRow}>
          <View style={styles.statBox}>
            <Text style={[styles.statNum, { color: '#7c3aed' }]}>{stats.total_dishes}</Text>
            <Text style={styles.statLabel}>Dishes Tried</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statNum}>{stats.cities_visited}</Text>
            <Text style={styles.statLabel}>Cities</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statNum}>{stats.cuisine_types}</Text>
            <Text style={styles.statLabel}>Cuisines</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={[styles.statNum, { color: '#f59e0b' }]}>
              {stats.avg_rating ? `${Number(stats.avg_rating).toFixed(1)}★` : '—'}
            </Text>
            <Text style={styles.statLabel}>Avg. Rating</Text>
          </View>
        </View>
      )}

      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color="#7c3aed" />
      ) : entries.length === 0 ? (
        <View style={styles.emptyBox}>
          <Text style={styles.emptyEmoji}>🍽️</Text>
          <Text style={styles.emptyTitle}>Your passport is empty</Text>
          <Text style={styles.emptySubtitle}>
            Explore cities and add the dishes you try.
          </Text>
        </View>
      ) : (
        <View style={styles.groups}>
          {groupByCityCountry().map((group) => (
            <View key={`${group.city}|${group.country}`} style={styles.group}>
              <Text style={styles.groupTitle}>
                📍 {group.city}, {group.country}
                {'  '}
                <Text style={styles.groupCount}>
                  {group.entries.length} dish{group.entries.length !== 1 ? 'es' : ''}
                </Text>
              </Text>

              {group.entries.map((entry) => (
                <View key={entry.id} style={styles.card}>
                  {editingId === entry.id ? (
                    <View>
                      <Text style={styles.cardName}>{entry.dish_name}</Text>
                      <Text style={styles.editLabel}>Your rating</Text>
                      <StarRow value={editRating} onChange={setEditRating} />
                      <TextInput
                        style={styles.notesInput}
                        value={editNotes}
                        onChangeText={setEditNotes}
                        placeholder="Notes, memories, recommendations…"
                        multiline
                        numberOfLines={3}
                        placeholderTextColor="#9ca3af"
                      />
                      <View style={styles.editActions}>
                        <TouchableOpacity
                          style={styles.saveBtn}
                          onPress={() => saveEdit(entry.id)}
                        >
                          <Text style={styles.saveBtnText}>Save</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={styles.cancelBtn}
                          onPress={() => setEditingId(null)}
                        >
                          <Text style={styles.cancelBtnText}>Cancel</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  ) : (
                    <View>
                      <View style={styles.cardRow}>
                        <View style={styles.cardInfo}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                            <Text style={styles.cardName}>{entry.dish_name}</Text>
                            {entry.cuisine_type ? (
                              <View style={styles.cuisineTag}>
                                <Text style={styles.cuisineTagText}>{entry.cuisine_type}</Text>
                              </View>
                            ) : null}
                          </View>
                          {entry.restaurant_name ? (
                            <Text style={styles.restaurantName}>at {entry.restaurant_name}</Text>
                          ) : null}
                          {entry.rating ? (
                            <Text style={styles.stars}>
                              {'★'.repeat(entry.rating)}{'☆'.repeat(5 - entry.rating)}
                            </Text>
                          ) : null}
                          {entry.notes ? (
                            <Text style={styles.notes}>"{entry.notes}"</Text>
                          ) : null}
                          <Text style={styles.date}>
                            {new Date(entry.tasted_at).toLocaleDateString('en-US', {
                              year: 'numeric', month: 'long', day: 'numeric',
                            })}
                          </Text>
                        </View>
                        <View style={styles.cardActions}>
                          <TouchableOpacity
                            style={styles.editBtn}
                            onPress={() => {
                              setEditingId(entry.id);
                              setEditRating(entry.rating || 0);
                              setEditNotes(entry.notes || '');
                            }}
                          >
                            <Text style={styles.editBtnText}>Edit</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={styles.deleteBtn}
                            onPress={() => handleDelete(entry.id)}
                          >
                            <Text style={styles.deleteBtnText}>Remove</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    </View>
                  )}
                </View>
              ))}
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
  subtitle: { fontSize: 15, color: '#6b7280' },
  statsRow: {
    flexDirection: 'row', backgroundColor: '#fff',
    borderBottomWidth: 1, borderBottomColor: '#f3f4f6',
  },
  statBox: { flex: 1, paddingVertical: 16, alignItems: 'center' },
  statNum: { fontSize: 22, fontWeight: '700', color: '#1f2937' },
  statLabel: { fontSize: 11, color: '#9ca3af', marginTop: 2 },
  emptyBox: { padding: 40, alignItems: 'center' },
  emptyEmoji: { fontSize: 48, marginBottom: 12 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: '#1f2937', marginBottom: 6 },
  emptySubtitle: { fontSize: 14, color: '#9ca3af', textAlign: 'center' },
  groups: { padding: 16 },
  group: { marginBottom: 24 },
  groupTitle: { fontSize: 17, fontWeight: '700', color: '#1f2937', marginBottom: 10 },
  groupCount: { fontSize: 13, fontWeight: '400', color: '#9ca3af' },
  card: {
    backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 10,
    shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 4, elevation: 1,
  },
  cardRow: { flexDirection: 'row', gap: 12 },
  cardInfo: { flex: 1 },
  cardName: { fontSize: 16, fontWeight: '600', color: '#1f2937', marginBottom: 2 },
  cuisineTag: { backgroundColor: '#f3e8ff', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 20 },
  cuisineTagText: { fontSize: 11, color: '#7c3aed' },
  restaurantName: { fontSize: 13, color: '#9ca3af', marginTop: 2 },
  stars: { fontSize: 16, color: '#7c3aed', marginTop: 4 },
  notes: { fontSize: 13, color: '#6b7280', fontStyle: 'italic', marginTop: 4 },
  date: { fontSize: 11, color: '#9ca3af', marginTop: 6 },
  cardActions: { gap: 6 },
  editBtn: { borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  editBtnText: { fontSize: 12, color: '#6b7280' },
  deleteBtn: { borderWidth: 1, borderColor: '#fecaca', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  deleteBtnText: { fontSize: 12, color: '#f87171' },
  editLabel: { fontSize: 13, color: '#6b7280', marginBottom: 6, marginTop: 10 },
  notesInput: {
    borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8,
    padding: 10, fontSize: 14, color: '#1f2937', marginTop: 10,
    minHeight: 70, textAlignVertical: 'top',
  },
  editActions: { flexDirection: 'row', gap: 8, marginTop: 10 },
  saveBtn: { backgroundColor: '#7c3aed', borderRadius: 8, paddingHorizontal: 16, paddingVertical: 8 },
  saveBtnText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  cancelBtn: { borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, paddingHorizontal: 16, paddingVertical: 8 },
  cancelBtnText: { color: '#6b7280', fontSize: 14 },
});
