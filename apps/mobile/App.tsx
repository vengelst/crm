import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import * as Network from 'expo-network';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Button,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

type WorkerInfo = {
  id: string;
  workerNumber: string;
  name: string;
  languageCode?: string;
  photoPath?: string | null;
};

type ProjectInfo = {
  id: string;
  projectNumber: string;
  title: string;
  customerName?: string | null;
};

type LoginResponse = {
  accessToken: string;
  loginType?: 'worker' | 'user' | 'kiosk-user';
  worker: WorkerInfo | null;
  currentProjects: ProjectInfo[];
  futureProjects: ProjectInfo[];
  pastProjects: ProjectInfo[];
};

type ClockQueueItem = {
  action: 'clock-in' | 'clock-out';
  payload: Record<string, unknown>;
  queuedAt: string;
};

type PhotoMeta = {
  capturedAt: string;
  locationSource: string;
  latitude?: number;
  longitude?: number;
};

type TimesheetItem = {
  id: string;
  weekYear: number;
  weekNumber: number;
  status: string;
  approvedAt?: string | null;
  billedAt?: string | null;
};

const STORAGE_KEYS = {
  session: 'mobile.worker.session',
  queue: 'mobile.worker.clock.queue',
  apiUrl: 'mobile.worker.api.url',
} as const;

const DEFAULT_API_URL = 'http://10.0.2.2:3000';

export default function App() {
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [apiUrl, setApiUrl] = useState(DEFAULT_API_URL);
  const [pin, setPin] = useState('');
  const [session, setSession] = useState<LoginResponse | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [clockStatus, setClockStatus] = useState<string>('Unbekannt');
  const [queueSize, setQueueSize] = useState(0);
  const [pickedImageUri, setPickedImageUri] = useState<string | null>(null);
  const [photoNote, setPhotoNote] = useState('');
  const [photoMeta, setPhotoMeta] = useState<PhotoMeta | null>(null);
  const [timesheets, setTimesheets] = useState<TimesheetItem[]>([]);
  const [selectedTimesheetId, setSelectedTimesheetId] = useState('');
  const syncInFlightRef = useRef(false);

  const [signerName, setSignerName] = useState('');
  const [signaturePath, setSignaturePath] = useState('');

  const allProjects = useMemo<ProjectInfo[]>(
    () => [
      ...(session?.currentProjects ?? []),
      ...(session?.futureProjects ?? []),
      ...(session?.pastProjects ?? []),
    ],
    [session],
  );

  const request = useCallback(
    async <T,>(
      path: string,
      init?: RequestInit,
      token?: string,
    ): Promise<T> => {
      const response = await fetch(`${apiUrl}${path}`, {
        ...init,
        headers: {
          ...(init?.headers ?? {}),
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });
      if (!response.ok) {
        const body = await response.text();
        throw new Error(`${response.status} ${response.statusText}: ${body}`);
      }
      return (await response.json()) as T;
    },
    [apiUrl],
  );

  const loadQueue = useCallback(async () => {
    const raw = await AsyncStorage.getItem(STORAGE_KEYS.queue);
    const parsed: ClockQueueItem[] = raw ? (JSON.parse(raw) as ClockQueueItem[]) : [];
    setQueueSize(parsed.length);
    return parsed;
  }, []);

  const saveQueue = useCallback(async (items: ClockQueueItem[]) => {
    await AsyncStorage.setItem(STORAGE_KEYS.queue, JSON.stringify(items));
    setQueueSize(items.length);
  }, []);

  const bootstrap = useCallback(async () => {
    try {
      const [savedSession, savedApiUrl] = await Promise.all([
        AsyncStorage.getItem(STORAGE_KEYS.session),
        AsyncStorage.getItem(STORAGE_KEYS.apiUrl),
      ]);
      if (savedApiUrl) setApiUrl(savedApiUrl);
      if (savedSession) {
        const parsed = JSON.parse(savedSession) as LoginResponse;
        if (!parsed.worker) {
          await AsyncStorage.removeItem(STORAGE_KEYS.session);
          return;
        }
        setSession(parsed);
        setSignerName(parsed.worker.name);
        setSelectedProjectId(parsed.currentProjects[0]?.id ?? '');
      }
      await loadQueue();
    } finally {
      setLoading(false);
    }
  }, [loadQueue]);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  const refreshTimeData = useCallback(async () => {
    if (!session?.accessToken || !session.worker?.id) return;
    const [status, weekly] = await Promise.all([
      request<{
        hasOpenWork?: boolean;
        openEntry?: { projectTitle?: string; startedAt?: string } | null;
      }>(
        `/time/status?workerId=${encodeURIComponent(session.worker.id)}`,
        undefined,
        session.accessToken,
      ),
      request<TimesheetItem[]>(
        `/timesheets/weekly?workerId=${encodeURIComponent(session.worker.id)}`,
        undefined,
        session.accessToken,
      ),
    ]);
    const statusText = status.hasOpenWork
      ? `Aktiv seit ${status.openEntry?.startedAt ?? '?'} (${status.openEntry?.projectTitle ?? 'Projekt'})`
      : 'Nicht eingestempelt';
    setClockStatus(statusText);
    setTimesheets(Array.isArray(weekly) ? weekly : []);
    if (!selectedTimesheetId && Array.isArray(weekly) && weekly.length > 0) {
      setSelectedTimesheetId(String(weekly[0].id ?? ''));
    }
  }, [request, selectedTimesheetId, session?.accessToken, session?.worker?.id]);

  useEffect(() => {
    if (!session || !session.worker) return;
    void refreshTimeData();
  }, [refreshTimeData, session]);

  const handleLogin = useCallback(async () => {
    if (!pin) {
      Alert.alert('Eingabe fehlt', 'Bitte Kiosk-PIN eingeben.');
      return;
    }
    setBusy(true);
    try {
      const login = await request<LoginResponse>('/auth/kiosk-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pin,
          deviceUuid: 'mobile-android',
          platform: 'android',
        }),
      });
      if (!login.worker) {
        Alert.alert(
          'Nicht unterstuetzt',
          'Kiosk-Login mit Benutzerrolle wird in dieser Mobile-App aktuell nicht unterstuetzt. Bitte Worker-PIN nutzen.',
        );
        return;
      }
      setSession(login);
      setSignerName(login.worker.name);
      setSelectedProjectId(login.currentProjects[0]?.id ?? '');
      await Promise.all([
        AsyncStorage.setItem(STORAGE_KEYS.session, JSON.stringify(login)),
        AsyncStorage.setItem(STORAGE_KEYS.apiUrl, apiUrl),
      ]);
      Alert.alert('Erfolg', `Angemeldet als ${login.worker.name}`);
    } catch (error) {
      Alert.alert('Login fehlgeschlagen', String(error));
    } finally {
      setBusy(false);
    }
  }, [apiUrl, pin, request]);

  const handleLogout = useCallback(async () => {
    await AsyncStorage.removeItem(STORAGE_KEYS.session);
    setSession(null);
    setTimesheets([]);
    setSelectedTimesheetId('');
    setPickedImageUri(null);
    setPhotoNote('');
    setPhotoMeta(null);
  }, []);

  const getLocationPayload = useCallback(async () => {
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== 'granted') {
        return {
          locationSource: 'permission-denied',
        };
      }
      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      return {
        latitude: loc.coords.latitude,
        longitude: loc.coords.longitude,
        accuracy: loc.coords.accuracy ?? undefined,
        locationSource: 'gps',
      };
    } catch {
      return {
        locationSource: 'unavailable',
      };
    }
  }, []);

  const postClockAction = useCallback(
    async (action: 'clock-in' | 'clock-out') => {
      if (!session?.worker || !selectedProjectId) {
        Alert.alert('Projekt fehlt', 'Bitte zuerst ein Projekt auswaehlen.');
        return;
      }
      const location = await getLocationPayload();
      const payload = {
        workerId: session.worker.id,
        projectId: selectedProjectId,
        occurredAtClient: new Date().toISOString(),
        sourceDevice: 'android-app-mvp',
        ...location,
      };
      try {
        await request(`/time/${action}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }, session.accessToken);
      } catch {
        const current = await loadQueue();
        current.push({ action, payload, queuedAt: new Date().toISOString() });
        await saveQueue(current);
        Alert.alert(
          'Offline gespeichert',
          'Buchung wurde lokal gespeichert und wird spaeter synchronisiert.',
        );
      }
      await refreshTimeData();
    },
    [
      getLocationPayload,
      loadQueue,
      refreshTimeData,
      request,
      saveQueue,
      selectedProjectId,
      session,
    ],
  );

  const syncQueue = useCallback(async (silent = false) => {
    if (!session?.accessToken) return;
    if (syncInFlightRef.current) return;
    syncInFlightRef.current = true;
    setBusy(true);
    try {
      const queued = await loadQueue();
      if (queued.length === 0) return;
      const remaining: ClockQueueItem[] = [];
      for (const item of queued) {
        try {
          await request(`/time/${item.action}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(item.payload),
          }, session.accessToken);
        } catch {
          remaining.push(item);
        }
      }
      await saveQueue(remaining);
      await refreshTimeData();
      if (!silent) {
        Alert.alert(
          'Sync beendet',
          `${queued.length - remaining.length} Eintraege gesendet.`,
        );
      }
    } finally {
      syncInFlightRef.current = false;
      setBusy(false);
    }
  }, [loadQueue, refreshTimeData, request, saveQueue, session?.accessToken]);

  useEffect(() => {
    if (!session?.accessToken) return;

    const subscription = Network.addNetworkStateListener((state) => {
      if (state.isConnected && state.isInternetReachable !== false) {
        void syncQueue(true);
      }
    });

    void syncQueue(true);
    return () => {
      subscription.remove();
    };
  }, [session?.accessToken, syncQueue]);

  const pickImage = useCallback(async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Keine Berechtigung', 'Bitte Zugriff auf Fotos erlauben.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.7,
    });
    if (!result.canceled && result.assets.length > 0) {
      const location = await getLocationPayload();
      setPickedImageUri(result.assets[0].uri);
      setPhotoMeta({
        capturedAt: new Date().toISOString(),
        locationSource: String(location.locationSource ?? 'gallery'),
        latitude:
          typeof location.latitude === 'number' ? location.latitude : undefined,
        longitude:
          typeof location.longitude === 'number' ? location.longitude : undefined,
      });
    }
  }, [getLocationPayload]);

  const captureImage = useCallback(async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Keine Berechtigung', 'Bitte Kamerazugriff erlauben.');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      quality: 0.7,
    });

    if (!result.canceled && result.assets.length > 0) {
      const location = await getLocationPayload();
      setPickedImageUri(result.assets[0].uri);
      setPhotoMeta({
        capturedAt: new Date().toISOString(),
        locationSource: String(location.locationSource ?? 'camera'),
        latitude:
          typeof location.latitude === 'number' ? location.latitude : undefined,
        longitude:
          typeof location.longitude === 'number' ? location.longitude : undefined,
      });
    }
  }, [getLocationPayload]);

  const uploadProjectPhoto = useCallback(async () => {
    if (!session?.accessToken || !pickedImageUri || !selectedProjectId) {
      Alert.alert('Upload nicht moeglich', 'Projekt und Bild muessen gewaehlt sein.');
      return;
    }
    setBusy(true);
    try {
      const form = new FormData();
      form.append('documentType', 'FOTO');
      form.append('entityType', 'PROJECT');
      form.append('entityId', selectedProjectId);
      form.append('title', `Mobile Upload ${new Date().toLocaleString()}`);
      const descriptionParts = [
        photoNote.trim() ? `Notiz: ${photoNote.trim()}` : '',
        `Aufnahmezeit: ${photoMeta?.capturedAt ?? new Date().toISOString()}`,
        `Location source: ${photoMeta?.locationSource ?? 'unknown'}`,
        photoMeta?.latitude != null ? `Latitude: ${photoMeta.latitude}` : '',
        photoMeta?.longitude != null ? `Longitude: ${photoMeta.longitude}` : '',
      ].filter(Boolean);
      form.append('description', descriptionParts.join(' | '));
      form.append('file', {
        uri: pickedImageUri,
        name: 'mobile-upload.jpg',
        type: 'image/jpeg',
      } as any);

      await request('/documents/upload', {
        method: 'POST',
        body: form,
      }, session.accessToken);

      Alert.alert('Upload erfolgreich', 'Das Bild wurde dem Projekt zugeordnet.');
      setPickedImageUri(null);
      setPhotoNote('');
      setPhotoMeta(null);
    } catch (error) {
      Alert.alert('Upload fehlgeschlagen', String(error));
    } finally {
      setBusy(false);
    }
  }, [
    photoMeta?.capturedAt,
    photoMeta?.latitude,
    photoMeta?.locationSource,
    photoMeta?.longitude,
    photoNote,
    pickedImageUri,
    request,
    selectedProjectId,
    session?.accessToken,
  ]);

  const signTimesheet = useCallback(async () => {
    if (!session?.accessToken || !selectedTimesheetId || !signerName || !signaturePath) {
      Alert.alert(
        'Signatur unvollstaendig',
        'Stundenzettel, Name und signatureImagePath sind erforderlich.',
      );
      return;
    }
    setBusy(true);
    try {
      await request(`/timesheets/${selectedTimesheetId}/worker-sign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          signerName,
          signerRole: 'WORKER',
          signatureImagePath: signaturePath,
          deviceInfo: 'android-app-mvp',
        }),
      }, session.accessToken);
      Alert.alert('Signiert', 'Stundenzettel wurde signiert.');
      await refreshTimeData();
    } catch (error) {
      Alert.alert('Signatur fehlgeschlagen', String(error));
    } finally {
      setBusy(false);
    }
  }, [
    refreshTimeData,
    request,
    selectedTimesheetId,
    session?.accessToken,
    signaturePath,
    signerName,
  ]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
        <Text>Lade App...</Text>
      </View>
    );
  }

  if (!session || !session.worker) {
    return (
      <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
        <Text style={styles.title}>CRM Monteur App (Android MVP)</Text>
        <Text style={styles.caption}>Kiosk-Login mit PIN</Text>
        <TextInput
          style={styles.input}
          placeholder="API URL (z. B. http://10.0.2.2:3000)"
          value={apiUrl}
          onChangeText={setApiUrl}
          autoCapitalize="none"
        />
        <TextInput
          style={styles.input}
          placeholder="Kiosk-PIN"
          value={pin}
          secureTextEntry
          onChangeText={setPin}
        />
        <Button title={busy ? 'Anmeldung...' : 'Anmelden'} onPress={handleLogin} disabled={busy} />
      </ScrollView>
    );
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <StatusBar style="dark" />
      <Text style={styles.title}>Willkommen, {session.worker.name}</Text>
      <Text style={styles.caption}>Monteur-Nr: {session.worker.workerNumber}</Text>
      <Text style={styles.caption}>Status: {clockStatus}</Text>
      <Text style={styles.caption}>
        Offline-Queue: {queueSize} Eintraege {queueSize > 0 ? '(wird automatisch synchronisiert)' : ''}
      </Text>
      <Button
        title="Offline-Queue jetzt synchronisieren"
        onPress={() => void syncQueue(false)}
        disabled={busy || queueSize === 0}
      />

      <Text style={styles.sectionTitle}>Projekt waehlen</Text>
      {allProjects.map((project) => (
        <View key={project.id} style={styles.row}>
          <Button
            title={`${selectedProjectId === project.id ? '✓ ' : ''}${project.projectNumber} - ${project.title}`}
            onPress={() => setSelectedProjectId(project.id)}
          />
        </View>
      ))}

      <Text style={styles.sectionTitle}>Zeiterfassung</Text>
      <View style={styles.row}>
        <Button title="Einchecken" onPress={() => void postClockAction('clock-in')} disabled={busy} />
      </View>
      <View style={styles.row}>
        <Button title="Auschecken" onPress={() => void postClockAction('clock-out')} disabled={busy} />
      </View>

      <Text style={styles.sectionTitle}>Projektfoto hochladen</Text>
      <View style={styles.row}>
        <Button title="Foto aufnehmen (Kamera)" onPress={captureImage} disabled={busy} />
      </View>
      <View style={styles.row}>
        <Button title="Bild aus Galerie waehlen" onPress={pickImage} disabled={busy} />
      </View>
      {pickedImageUri ? <Image source={{ uri: pickedImageUri }} style={styles.preview} /> : null}
      <TextInput
        style={styles.input}
        placeholder="Notiz zum Foto (optional)"
        value={photoNote}
        onChangeText={setPhotoNote}
      />
      {photoMeta ? (
        <Text style={styles.caption}>
          Zeit/GPS: {photoMeta.capturedAt} / {photoMeta.latitude ?? '-'}, {photoMeta.longitude ?? '-'} (
          {photoMeta.locationSource})
        </Text>
      ) : null}
      <View style={styles.row}>
        <Button title="Bild hochladen" onPress={uploadProjectPhoto} disabled={busy || !pickedImageUri} />
      </View>

      <Text style={styles.sectionTitle}>Stundenzettel</Text>
      {timesheets.map((sheet) => (
        <View key={String(sheet.id)} style={styles.card}>
          <Text style={styles.cardTitle}>
            KW {sheet.weekNumber}/{sheet.weekYear}
          </Text>
          <Text style={styles.caption}>Status: {String(sheet.status ?? 'UNBEKANNT')}</Text>
          <Text style={styles.timelineTitle}>Timeline</Text>
          {getTimesheetTimeline(sheet).map((step) => (
            <Text key={step.label} style={styles.timelineItem}>
              {step.done ? '✓' : '○'} {step.label}
            </Text>
          ))}
          <View style={styles.row}>
            <Button
              title={
                selectedTimesheetId === String(sheet.id)
                  ? 'Ausgewaehlt'
                  : 'Diesen Zettel waehlen'
              }
              onPress={() => setSelectedTimesheetId(String(sheet.id))}
            />
          </View>
        </View>
      ))}
      <TextInput
        style={styles.input}
        placeholder="Signer Name"
        value={signerName}
        onChangeText={setSignerName}
      />
      <TextInput
        style={styles.input}
        placeholder="signatureImagePath (MVP)"
        value={signaturePath}
        onChangeText={setSignaturePath}
      />
      <Button title="Stundenzettel signieren" onPress={signTimesheet} disabled={busy || !selectedTimesheetId} />

      <View style={styles.row}>
        <Button title="Aktualisieren" onPress={() => void refreshTimeData()} disabled={busy} />
      </View>
      <View style={styles.row}>
        <Button title="Abmelden" color="#a62a2a" onPress={handleLogout} disabled={busy} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#f5f7fb',
  },
  content: {
    padding: 16,
    gap: 12,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
  },
  caption: {
    color: '#334155',
  },
  sectionTitle: {
    marginTop: 8,
    fontSize: 18,
    fontWeight: '600',
  },
  input: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#fff',
  },
  row: {
    marginTop: 4,
  },
  preview: {
    width: '100%',
    height: 180,
    borderRadius: 10,
    backgroundColor: '#dbeafe',
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#dbe2ef',
    padding: 12,
    gap: 4,
  },
  cardTitle: {
    fontWeight: '600',
  },
  timelineTitle: {
    marginTop: 4,
    fontWeight: '600',
  },
  timelineItem: {
    color: '#1e293b',
  },
});

function getTimesheetTimeline(sheet: TimesheetItem): Array<{ label: string; done: boolean }> {
  const status = String(sheet.status ?? '').toUpperCase();
  const workerSignedStatuses = new Set([
    'WORKER_SIGNED',
    'CUSTOMER_SIGNED',
    'COMPLETED',
    'APPROVED',
    'BILLED',
    'LOCKED',
  ]);
  const customerSignedStatuses = new Set([
    'CUSTOMER_SIGNED',
    'COMPLETED',
    'APPROVED',
    'BILLED',
    'LOCKED',
  ]);
  const approvedStatuses = new Set(['APPROVED', 'BILLED']);
  const billedStatuses = new Set(['BILLED']);

  return [
    { label: 'Erfasst', done: status !== 'NO_TIMESHEET' },
    { label: 'Monteur signiert', done: workerSignedStatuses.has(status) },
    { label: 'Kunde signiert', done: customerSignedStatuses.has(status) },
    {
      label: 'Freigegeben',
      done: approvedStatuses.has(status) || Boolean(sheet.approvedAt),
    },
    {
      label: 'Abgerechnet',
      done: billedStatuses.has(status) || Boolean(sheet.billedAt),
    },
  ];
}
