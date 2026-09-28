import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { AnimationClip, AnimationMixer, Group, QuaternionKeyframeTrack, Quaternion } from 'three';
import { loopedSwimClip } from '../src/ocean-animation.ts';
import { OCEAN_SPECIES } from '../src/ocean-motion.ts';

test('the actual marine assets have continuous poses at their swim-loop boundaries', async () => {
  for (const species of Object.keys(OCEAN_SPECIES)) {
    const bytes = await readFile(new URL(`../public/assets/ocean-${species}.glb`, import.meta.url));
    const length = bytes.readUInt32LE(12);
    const gltf = JSON.parse(bytes.toString('utf8', 20, 20 + length));
    const bin = 28 + length;
    const floats = accessor => {
      const a = gltf.accessors[accessor], view = gltf.bufferViews[a.bufferView];
      const width = { SCALAR: 1, VEC4: 4 }[a.type];
      return new Float32Array(bytes.buffer, bytes.byteOffset + bin + (view.byteOffset ?? 0) + (a.byteOffset ?? 0), a.count * width);
    };
    const animation = gltf.animations[0];
    let duration = 0;
    const tracks = animation.channels.filter(channel => channel.target.path === 'rotation').map((channel, index) => {
      const sampler = animation.samplers[channel.sampler], times = floats(sampler.input);
      duration = Math.max(duration, times.at(-1));
      return new QuaternionKeyframeTrack(`bone${index}.quaternion`, times, floats(sampler.output));
    });
    const source = new AnimationClip(species, duration, tracks);
    const firstTrack = [...source.tracks[0].values];
    const clip = loopedSwimClip(source);
    assert.equal(loopedSwimClip(source), clip, 'all swimmers share the prepared clip');
    assert.deepEqual([...source.tracks[0].values], firstTrack, 'the cached source asset is unchanged');
    const rig = new Group();
    tracks.forEach((_, index) => { const bone = new Group(); bone.name = `bone${index}`; rig.add(bone); });
    const mixer = new AnimationMixer(rig);
    mixer.clipAction(clip).play();
    mixer.setTime(clip.duration - .0001);
    const before = rig.children.map(bone => new Quaternion().copy(bone.quaternion));
    mixer.setTime(clip.duration + .0001);
    rig.children.forEach((bone, index) => {
      assert.ok(before[index].angleTo(bone.quaternion) < .004, `${species}: no fin snap at the loop boundary`);
    });
    mixer.stopAllAction();
    mixer.uncacheRoot(rig);
  }
});
