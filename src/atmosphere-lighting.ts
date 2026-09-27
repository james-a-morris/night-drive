// An absent daylight value retains the route's authored atmosphere. Synced
// weather uses the same illumination for scenery and the unlit ocean shader.
export function atmosphereLighting(daylight?: number, cloudCover = 0) {
  if (daylight === undefined) {
    return { ambient: 1.6, directional: 1.8, waterBrightness: 1, reflection: 1 };
  }
  const day = Math.max(0, Math.min(1, daylight));
  const clouds = Math.max(0, Math.min(1, cloudCover));
  return {
    ambient: (.55 + day * 1.65) * (1 - clouds * .2),
    directional: (.35 + day * 2.65) * (1 - clouds) ** 2,
    waterBrightness: (.055 + day * .945) * (1 - clouds * .4),
    reflection: (.12 + day * .88) * (1 - clouds) ** 2,
  };
}
