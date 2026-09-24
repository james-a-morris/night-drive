import test from "node:test";
import assert from "node:assert/strict";
import { Group } from "three";
import {
  tunnelSpan,
  tunnelSection,
  ROUTE_LENGTH,
  TUNNEL_CYCLE_LENGTH,
} from "../src/environments.ts";
import {
  GRAFFITI_PHRASES,
  graffitiPlacements,
  graffitiBrightness,
  createTunnelGraffiti,
} from "../src/tunnel-graffiti.ts";

test("graffiti appears now and then inside the tunnel, using every phrase, and is deterministic", () => {
  for (const mode of ["tunnel", "auto"]) {
    const phrases = new Set();
    let quiet = 0;
    const cycle = mode === "auto" ? ROUTE_LENGTH : TUNNEL_CYCLE_LENGTH;
    for (let passage = 0; passage < 12; passage++) {
      const span = tunnelSpan(passage * cycle, mode);
      const tags = graffitiPlacements(span.start - 200, span.end + 200, mode);
      assert.ok(tags.length <= 16, `${mode}: ${tags.length} tags`);
      if (tags.length === 0) quiet++;
      assert.deepEqual(
        tags,
        graffitiPlacements(span.start - 200, span.end + 200, mode),
      );
      for (const tag of tags) phrases.add(tag.phrase);
      for (const tag of tags) {
        assert.ok(tag.station > span.start + 20 && tag.station < span.end - 20);
        const position = tunnelSection(tag.station, mode).position;
        assert.ok(
          position < 166 || position > 244,
          "clear of the relief, refuge and dinosaur nooks",
        );
        assert.ok(
          tag.base >= 1.4 && tag.base + tag.height <= 2.85,
          "between the cable and the lamps",
        );
        assert.ok(tag.height >= 0.54 && tag.height <= 0.84, "larger lettering stays within the wall band");
      }
    }
    assert.equal(phrases.size, GRAFFITI_PHRASES.length);
    assert.ok(
      quiet >= 2 && quiet <= 10,
      `${mode}: ${quiet} passages without paint`,
    );
  }
  assert.equal(graffitiPlacements(0, 800, "forest").length, 0);
  // Windows tile: a wide sweep equals the union of narrower ones.
  const span = tunnelSpan(ROUTE_LENGTH, "auto");
  const whole = graffitiPlacements(span.start, span.end, "auto");
  const pieces = [];
  for (let s = span.start; s < span.end; s += 96)
    pieces.push(...graffitiPlacements(s, Math.min(s + 96, span.end), "auto"));
  assert.deepEqual(pieces, whole);
});

test("paint fades into the unlit galleries and brightens beside the lamps", () => {
  const span = tunnelSpan(0, "tunnel");
  assert.ok(graffitiBrightness(span.start + 48, "tunnel") > 0.18);
  assert.ok(graffitiBrightness(span.start + 60, "tunnel") < 0.07);
  assert.ok(graffitiBrightness(span.start + 192, "tunnel") < 0.02);
});

test("graffiti meshes rebuild with finite geometry and vanish outside the tunnel", () => {
  const world = new Group();
  const graffiti = createTunnelGraffiti(world);
  const span = tunnelSpan(0, "tunnel");
  graffiti.update(span.start + 400, "tunnel");
  let vertices = 0;
  graffiti.root.traverse((object) => {
    if (!object.isMesh || !object.visible) return;
    for (const attribute of Object.values(object.geometry.attributes))
      assert.ok(attribute.array.every(Number.isFinite));
    vertices += object.geometry.attributes.position.count;
  });
  assert.ok(vertices > 0 && vertices < 2000, `bounded: ${vertices}`);
  graffiti.update(300, "forest");
  assert.ok(graffiti.root.children.every((mesh) => !mesh.visible));
});
