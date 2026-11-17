import { useEffect } from 'react';
import { useGeofence } from '../src/context/GeofenceContext';
import { useRoadTest } from '../src/context/RoadTestContext';
// Keep foreground tracking alive when the technician opens another in-app screen.
export function RoadTestBridge() {
  const { liveCoords, insideGeofence } = useGeofence();
  const { isLiveDrive, recordLivePoint } = useRoadTest();
  useEffect(() => {
    if (isLiveDrive && liveCoords?.timestamp && Date.now() - liveCoords.timestamp < 12000) {
      recordLivePoint(liveCoords.latitude, liveCoords.longitude, liveCoords.speedKmh ?? 0, insideGeofence, liveCoords.timestamp);
    }
  }, [isLiveDrive, liveCoords, insideGeofence, recordLivePoint]);
  useEffect(() => {
    if (!isLiveDrive || !navigator.wakeLock) return;
    let lock: WakeLockSentinel | undefined, stopped = false;
    const acquire = async () => {
      if (document.visibilityState !== 'visible' || stopped) return;
      try { const acquired = await navigator.wakeLock.request('screen'); if (stopped) await acquired.release(); else lock = acquired; } catch {}
    };
    void acquire(); document.addEventListener('visibilitychange', acquire);
    return () => { stopped = true; document.removeEventListener('visibilitychange', acquire); void lock?.release(); };
  }, [isLiveDrive]);
  return null;
}
