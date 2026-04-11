import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY = "last_location_v2";

export async function saveLastLocation(lat: number, lng: number) {
  await AsyncStorage.setItem(
    KEY,
    JSON.stringify({
      lat,
      lng,
      timestamp: Date.now(),
    })
  );
}

export async function getLastLocation() {
  const data = await AsyncStorage.getItem(KEY);
  if (!data) return null;

  const parsed = JSON.parse(data);
  const age = Date.now() - (parsed.timestamp ?? 0);

  if (age > 1000 * 60 * 10) {
    return null;
  }

  return parsed;
}
