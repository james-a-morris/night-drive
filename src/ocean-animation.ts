import { AnimationClip } from "./three.ts";

const loops = new WeakMap<AnimationClip, AnimationClip>();

// The local marine clips omit a closing pose: some fins jump by 20 degrees
// at the wrap. Give each track a short interpolated return to its first pose.
export function loopedSwimClip(source: AnimationClip) {
  const cached = loops.get(source);
  if (cached) return cached;
  const duration = source.duration + .12;
  const tracks = source.tracks.map(track => {
    const copy = track.clone();
    const width = track.getValueSize();
    const times = new Float32Array(track.times.length + 1);
    const values = new Float32Array(track.values.length + width);
    times.set(track.times);
    times[times.length - 1] = duration;
    values.set(track.values);
    values.set(track.values.slice(0, width), track.values.length);
    copy.times = times;
    copy.values = values;
    return copy;
  });
  const clip = new AnimationClip(`${source.name}-continuous`, duration, tracks);
  loops.set(source, clip);
  return clip;
}
