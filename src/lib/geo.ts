const EARTH_RADIUS_METERS = 6_371_000;

/**
 * Calcule la distance en mètres entre 2 coordonnées GPS (formule Haversine).
 */
export function haversineDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;

  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return EARTH_RADIUS_METERS * c;
}

/**
 * Vérifie si l'employé est dans le rayon autorisé du magasin.
 * @param radiusMeters Rayon max en mètres (défaut: 50m)
 */
export function isWithinRadius(
  employeeLat: number,
  employeeLon: number,
  storeLat: number,
  storeLon: number,
  radiusMeters: number = 50
): { withinRadius: boolean; distanceMeters: number } {
  const distanceMeters = Math.round(
    haversineDistance(employeeLat, employeeLon, storeLat, storeLon)
  );
  return {
    withinRadius: distanceMeters <= radiusMeters,
    distanceMeters,
  };
}
