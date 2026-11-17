const geolocation = {
  setRNConfiguration() {},
  getCurrentPosition(success: PositionCallback, error?: PositionErrorCallback, options?: PositionOptions) {
    if (!navigator.geolocation) { error?.({ code: 1, message: 'Location is unavailable. Use HTTPS and enable location access.' } as any); return; }
    navigator.geolocation.getCurrentPosition(success, error, options);
  },
  watchPosition(success: PositionCallback, error?: PositionErrorCallback, options?: PositionOptions) {
    if (!navigator.geolocation) { error?.({ code: 1, message: 'Location is unavailable.' } as any); return -1; }
    return navigator.geolocation.watchPosition(success, error, options);
  },
  clearWatch(id: number) { if (id >= 0) navigator.geolocation?.clearWatch(id); },
};
export async function requestLocationPermission() {
  if (!navigator.geolocation) return false;
  return new Promise<boolean>(resolve => navigator.geolocation.getCurrentPosition(() => resolve(true), () => resolve(false), { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 }));
}
export default geolocation;
