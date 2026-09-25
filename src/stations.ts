import { SCENERY_DISTANCE } from "./view-distance.ts";
import * as THREE from "./three.ts";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { roadFrame, roadPoint } from "./drive.ts";
import { stationAvailable, stationsNear, type StationStop } from "./station-route.ts";
import { environmentWeights, type SceneryMode } from "./environments.ts";
import type { Lifecycle } from "./lifecycle.ts";
import { stationClockHands } from "./station-clock.ts";
import { stationPrism } from "./station-geometry.ts";
import { terrainSurfaceHeight } from "./terrain.ts";

export function createStations(world: THREE.Group, scope: Lifecycle) {
  const root = new THREE.Group(); root.name = "wayside-station"; world.add(root);
  let current = "";
  let clockMinute = -1;
  let clockTimezone: string | undefined;
  let updateClock: ((now: Date, timezone?: string) => void) | undefined;
  function clear() {
    const resources = new Set<{ dispose(): void }>();
    root.traverse(object => {
      if (!(object instanceof THREE.Mesh)) return;
      resources.add(object.geometry);
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
        resources.add(material);
        for (const value of Object.values(material)) if (value instanceof THREE.Texture) resources.add(value);
      }
    });
    resources.forEach(resource => resource.dispose()); root.clear(); updateClock = undefined;
  }
  scope.defer(clear);
  function build(stop: StationStop, mode: SceneryMode) {
    clear(); root.userData.station = stop;
    const solid: THREE.BufferGeometry[] = [], glowing: THREE.BufferGeometry[] = [];
    const weights = environmentWeights(stop.at, mode);
    const snow = weights.alpine > 0.5;
    const coast = weights.coast > 0.5;
    const roof = snow ? 0xcbd6d2 : 0x485e58, wood = 0x7b7057, cream = 0xc0b799;
    function paint(geometry: THREE.BufferGeometry, hex: number, bucket = solid) {
      const color = new THREE.Color(hex), colors = new Float32Array(geometry.attributes.position.count * 3);
      for (let i = 0; i < colors.length; i += 3) colors.set([color.r, color.g, color.b], i);
      geometry.deleteAttribute("uv"); geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3)); bucket.push(geometry);
    }
    function box(at: number, lateral: number, y: number, width: number, height: number, depth: number, color: number, bucket = solid) {
      const geometry = new THREE.BoxGeometry(width, height, depth).toNonIndexed();
      const point = roadPoint(at, lateral);
      geometry.rotateY(roadFrame(at).heading); geometry.translate(point.x, y, point.z); paint(geometry, color, bucket);
    }
    function slab(from: number, to: number, side: number, inner: number, outer: number, bottom: number, top: number, color: number, step = 3) {
      paint(stationPrism(stop.at + from, stop.at + to, side,
        [[inner, bottom], [inner, top], [outer, top], [outer, bottom]], step), color);
    }
    function brace(at: number, side: number, from: [number, number], to: [number, number], color: number) {
      const a = roadPoint(at, side * from[0]), b = roadPoint(at, side * to[0]);
      const start = new THREE.Vector3(a.x, from[1], a.z), end = new THREE.Vector3(b.x, to[1], b.z);
      const direction = end.clone().sub(start);
      const geometry = new THREE.BoxGeometry(.14, direction.length(), .16).toNonIndexed();
      geometry.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize()));
      geometry.translate(...start.add(end).multiplyScalar(.5).toArray());
      paint(geometry, color);
    }
    function gable(at: number, lateral: number, base: number, width: number, rise: number, depth: number) {
      const shape = new THREE.Shape(); shape.moveTo(-width / 2, 0); shape.lineTo(width / 2, 0); shape.lineTo(0, rise); shape.closePath();
      const geometry = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, steps: 1 });
      geometry.translate(0, base, -depth / 2);
      const point = roadPoint(at, lateral); geometry.rotateY(roadFrame(at).heading); geometry.translate(point.x, 0, point.z);
      paint(geometry, roof);
    }
    // Closed platforms follow the railway. All fixed detail is merged into
    // two meshes, with eight simple signs and clocks; there are no extra lights or shaders.
    for (const side of [-1, 1]) {
      // Keep the seaside halt on the shoulder, before the land falls away.
      // A full-width platform here reads as a concrete pier over the beach.
      const seaside = coast && side === -1;
      const outer = seaside ? 9.8 : 16.5;
      // Bury the retaining walls in the actual bank, including the coastal slope.
      let foundation = -.35;
      for (let offset = -30; offset <= 96; offset += 3) {
        const point = roadPoint(stop.at + offset, side * outer);
        foundation = Math.min(foundation, terrainSurfaceHeight(point.x, point.z, mode) - .25);
      }
      if (seaside) {
        // The approach exposes the underside. Use a light boardwalk on piles,
        // not a retaining block extending down to the lowest point of the bank.
        slab(-30, 96, side, 3.58, outer, .52, .74, 0x756e5b);
        for (let offset = -30; offset <= 96; offset += 6) {
          const at = stop.at + offset;
          for (const lateral of [4.5, outer - .55]) {
            const point = roadPoint(at, side * lateral);
            const bottom = Math.min(0, terrainSurfaceHeight(point.x, point.z, mode)) - .3;
            box(at, side * lateral, (bottom + .57) / 2, .28, .57 - bottom, .28, wood);
          }
          box(at, side * ((3.58 + outer) / 2), .45, outer - 3.58, .2, .24, wood);
        }
      } else {
        slab(-30, 96, side, 3.58, outer, foundation, .65, 0x646558);
        slab(-30, 96, side, 3.5, outer, .65, .74, 0x686b60);
      }
      const paving = snow ? [0xb1b6ac, 0xa9afa6, 0xb7b9ad, 0xaeb2a8]
        : [0x939080, 0x8e8c7d, 0x999585, 0x908f80];
      const decking = [0x9b9683, 0xa49d89, 0x969381, 0xaaa18c];
      for (let offset = -30; offset < 96; offset += 3) {
        if (seaside) {
          for (let board = 0; board < 4; board++) {
            const start = offset + board * .75;
            slab(start + .012, start + .738, side, 4.04, outer - .33, .735, .8,
              decking[((offset + 30) / 3 + board) % decking.length]);
          }
        } else {
          for (let row = 0; row < 5; row++) {
            const inner = 4.04 + row * 2.42;
            const color = paving[((offset + 30) / 3 * 7 + row * 3) % paving.length];
            slab(offset + .018, offset + 2.982, side, inner, inner + 2.395, .735, .8, color);
          }
        }
        // The coping overhang leaves a dark lip above coursed masonry.
        slab(offset + .014, offset + 2.986, side, 3.46, 4.015, .66, .825, cream);
        slab(offset + .018, offset + 2.982, side, outer - .33, outer + .06, .69, .87, 0xa5a38e);
        if (!seaside) {
          for (const y of [.17, .4]) {
            slab(offset, offset + 3, side, 3.573, 3.59, y, y + .025, 0x858474);
          }
          for (const [shift, bottom, top] of [[0, .195, .4], [1.5, .425, .64]]) {
            slab(offset + shift, offset + shift + .028, side, 3.573, 3.59, bottom, top, 0x858474);
          }
        }
      }
      for (const end of [-30, 95.58]) {
        slab(end, end + .42, side, 3.46, outer + .06, .65, .825, cream);
      }
      for (let step = 0; step < 3; step++) {
        const height = .6 - step * .2;
        const inner = seaside ? 5.8 : 12.3, edge = seaside ? 8.8 : 15.6;
        slab(-30 - (step + 1) * .48, -30 - step * .48, side, inner, edge, foundation, height, 0xa29c85);
        slab(96 + step * .48, 96 + (step + 1) * .48, side, inner, edge, foundation, height, 0xa29c85);
      }
      if (seaside) {
        // Open timber rails frame the water without blocking the seated view.
        const fence = 0xa9ac9a;
        for (let offset = -30; offset <= 96; offset += 6) {
          box(stop.at + offset, side * (outer - .16), 1.36, .16, 1.12, .16, fence);
          box(stop.at + offset, side * (outer - .16), 1.94, .22, .08, .22, cream);
        }
        for (const y of [1.22, 1.78]) {
          slab(-30, 96, side, outer - .22, outer - .1, y, y + .12, fence, 1);
          for (const end of [-30, 95.84]) {
            for (const [inner, edge] of [[3.65, 5.65], [8.95, outer - .1]]) {
              slab(end, end + .16, side, inner, edge, y, y + .12, fence);
            }
          }
        }
        for (const end of [-30, 96]) for (const lateral of [3.73, 5.57, 9.03]) {
          box(stop.at + end, side * lateral, 1.36, .16, 1.12, .16, fence);
        }
      }
      // A pitched roof with a real soffit and closed gables, joined continuously
      // through bends. Fascias, rafters and knee braces carry it down to the deck.
      const profile: [number, number][] = [[4.1, 3.62], [4.1, 3.8], [6.4, 4.3], [8.7, 3.8], [8.7, 3.62], [6.4, 4.12]];
      paint(stationPrism(stop.at - 14, stop.at + 35, side, profile, 1), roof);
      for (const edge of [4.03, 8.6]) slab(-14, 35, side, edge, edge + .17, 3.51, 3.79, cream, 1);
      for (const end of [-14.06, 34.94]) {
        paint(stationPrism(stop.at + end, stop.at + end + .12, side, profile), cream);
      }
      for (const offset of [-13, -1, 11, 23, 34]) {
        const at = stop.at + offset;
        for (const lateral of [4.9, 7.7]) {
          box(at, side * lateral, 2.32, .22, 3.04, .22, wood);
          box(at, side * lateral, .93, .4, .26, .4, 0xa09a81);
          box(at, side * lateral, 1.13, .28, .15, .28, 0x46564d);
          box(at, side * lateral, 3.53, .35, .18, .32, cream);
        }
        box(at, side * 6.4, 3.66, 4.5, .18, .2, wood);
        brace(at, side, [4.12, 3.6], [6.4, 4.1], wood);
        brace(at, side, [6.4, 4.1], [8.68, 3.6], wood);
        brace(at, side, [4.9, 2.96], [5.65, 3.66], wood);
        brace(at, side, [7.7, 2.96], [6.95, 3.66], wood);
        box(at, side * 6.4, 3.9, .14, .48, .16, wood);
        box(at, side * 6.7, 3.52, .18, .09, 1.1, 0xffd797, glowing);
      }
      for (const offset of [-4, 18, 52]) {
        const at = stop.at + offset;
        box(at, side * 7, 1.23, .65, .12, 2.6, wood);
        box(at, side * 7.3, 1.6, .09, .65, 2.6, wood);
        for (const leg of [-.9, .9]) box(at + leg, side * 7, 1, .46, .4, .12, 0x46564d);
      }
    }
    // Brick booking hall beside the boarding window, with a second hall on
    // the inland platform. Pitched roofs, cream quoins and tall sash windows.
    const sides = coast ? [1] : [-1, 1];
    for (const side of sides) {
      const at = stop.at + 15;
      const frame = roadFrame(at), origin = roadPoint(at, side * 12.1);
      function hall(partAt: number, lateral: number, y: number, width: number, height: number, depth: number, color: number, bucket = solid) {
        const geometry = new THREE.BoxGeometry(width, height, depth).toNonIndexed();
        const x = lateral - side * 12.1, z = -(partAt - at);
        geometry.rotateY(frame.heading);
        geometry.translate(origin.x + Math.cos(frame.heading) * x + Math.sin(frame.heading) * z,
          y, origin.z - Math.sin(frame.heading) * x + Math.cos(frame.heading) * z);
        paint(geometry, color, bucket);
      }

      hall(at, side * 12.1, .45, 7.6, .9, 18.8, 0x657267);
      hall(at, side * 12.1, 2.55, 7, 3.5, 18, 0x916f5b);
      gable(at, side * 12.1, 4.3, 8, 1.9, 19.1);
      hall(at, side * 8.58, 4.17, .13, .28, 18.2, cream);
      // Stone courses imply brickwork without texture samples or tiny bricks.
      for (const y of [1, 2, 3, 4]) hall(at, side * 8.57, y, .1, .08, 18, 0xa48f75);
      for (const end of [-8.75, 8.75]) hall(at + end, side * 8.53, 2.55, .2, 3.5, .36, cream);
      hall(at, side * 8.5, 2, .16, 2.4, 1.5, 0x354f46);
      hall(at, side * 8.38, 3.28, .07, .4, 1.5, 0xd7ceab);
      for (const offset of [-6, -3.5, 3.5, 6]) {
        hall(at + offset, side * 8.48, 2.45, .12, 1.95, 1.5, cream);
        hall(at + offset, side * 8.36, 2.45, .06, 1.65, 1.21, 0xe7c889, glowing);
        hall(at + offset, side * 8.3, 2.45, .08, .065, 1.23, wood);
        hall(at + offset, side * 8.3, 2.45, .08, 1.67, .065, wood);
      }
      hall(at - 5, side * 12.2, 5.5, .85, 2.2, .85, 0x866653);
      hall(at - 5, side * 12.2, 6.64, 1.1, .18, 1.1, cream);
    }
    // Lamps, a parcel trolley and a few trunks make the platform feel in use.
    for (const side of [-1, 1]) for (const offset of [-23, 43, 70]) {
      box(stop.at + offset, side * 7.5, 2.5, .12, 3.4, .12, 0x40574b);
      box(stop.at + offset, side * 7.5, 4.2, .46, .16, .46, roof);
      box(stop.at + offset, side * 7.5, 3.95, .3, .4, .3, 0xf4d7a0, glowing);
    }
    box(stop.at - 4, -7.5, 1.15, .85, .14, 1.9, wood);
    for (const offset of [-4.5, -3.6]) {
      box(stop.at + offset, -7.5, 1.52, .62, .64, .65, 0x80664c);
      box(stop.at + offset, -7.5, 1.52, .65, .67, .06, cream);
    }
    const canvas = document.createElement("canvas"); canvas.width = 512; canvas.height = 256;
    const ctx = canvas.getContext("2d")!; ctx.fillStyle = "#30493f"; ctx.fillRect(0,0,512,256);
    ctx.strokeStyle = "#b8b998"; ctx.lineWidth = 3; ctx.strokeRect(5,5,502,86);
    ctx.fillStyle = "#eee8ce"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.font = "500 32px Georgia"; ctx.fillText(stop.name.toUpperCase(),256,49,460);
    for (const [number, x] of [[1, 72], [2, 204]]) {
      ctx.strokeRect(x - 48, 119, 96, 96); ctx.font = "bold 64px Georgia"; ctx.fillText(String(number), x, 173);
    }
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
    updateClock = (now, timezone) => {
      ctx.fillStyle = "#ece7ce"; ctx.beginPath(); ctx.arc(390,174,60,0,Math.PI*2); ctx.fill();
      ctx.strokeStyle = "#354e43"; ctx.lineWidth = 4;
      for (let tick=0;tick<12;tick++) {const a=tick*Math.PI/6;ctx.beginPath();ctx.moveTo(390+Math.sin(a)*49,174-Math.cos(a)*49);ctx.lineTo(390+Math.sin(a)*55,174-Math.cos(a)*55);ctx.stroke();}
      const hands = stationClockHands(now, timezone);
      for (const [angle, length] of [[hands.hour, 31], [hands.minute, 44]]) {
        ctx.beginPath(); ctx.moveTo(390,174);
        ctx.lineTo(390+Math.sin(angle)*length,174-Math.cos(angle)*length);ctx.stroke();
      }
      texture.needsUpdate = true;
    };
    clockMinute = -1;
    function signGeometry(width: number, height: number, x: number, y: number, w: number, h: number, round = false) {
      const geometry = round ? new THREE.CircleGeometry(width / 2, 24) : new THREE.PlaneGeometry(width, height), uv=geometry.attributes.uv;
      for(let i=0;i<uv.count;i++)uv.setXY(i,(x+uv.getX(i)*w)/512,1-(y+(1-uv.getY(i))*h)/256);
      return geometry;
    }
    const signMaterial = new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide });
    for (const side of [-1, 1]) for (const offset of [-8, 24]) {
      const at = stop.at + offset, point = roadPoint(at, side * 7.9);
      const sign = new THREE.Mesh(signGeometry(3.7, .7, 0, 0, 512, 96), signMaterial);
      sign.name = "station-nameboard"; sign.position.set(point.x, 2.4, point.z);
      sign.rotation.y = roadFrame(at).heading - side * Math.PI / 2; root.add(sign);
      box(at, side * 7.99, 2.4, .14, .8, 3.8, 0x30493f);
      for (const leg of [-1.5, 1.5]) box(at + leg, side * 7.9, 1.6, .1, 1.6, .1, wood);
    }
    for (const side of [-1, 1]) {
      for (const [at, y, geometry] of [
        [stop.at + 6, 3.1, signGeometry(.72, .72, side === -1 ? 24 : 156, 119, 96, 96)],
        [stop.at + 1, 3.0, signGeometry(.88, .88, 328, 112, 124, 124, true)],
      ] as const) {
        const point = roadPoint(at, side * 4.95), sign=new THREE.Mesh(geometry, signMaterial);
        sign.position.set(point.x,y,point.z);sign.rotation.y=roadFrame(at).heading-side*Math.PI/2;root.add(sign);
        if(y === 3.0) {
          const housing = new THREE.CylinderGeometry(.49, .49, .16, 24).toNonIndexed();
          housing.rotateZ(Math.PI / 2); housing.rotateY(roadFrame(at).heading);
          const center = roadPoint(at, side * 5.04);
          housing.translate(center.x, y, center.z); paint(housing, 0x354e43);
          const rim=new THREE.RingGeometry(.44,.49,24).toNonIndexed();rim.rotateY(sign.rotation.y);rim.translate(point.x,y,point.z);paint(rim,cream);
        } else box(at, side * 5.04, y, .16, .8, .8, 0x30493f);
        box(at, side * 4.95,3.55,.06,.5,.06,wood);
      }
    }
    for (const [parts, material, name] of [
      [solid, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, side: THREE.DoubleSide }), "station-platforms-and-shelters"],
      [glowing, new THREE.MeshBasicMaterial({ vertexColors: true }), "station-lamps-and-windows"],
    ] as const) {
      const mesh = new THREE.Mesh(mergeGeometries(parts)!, material); mesh.name = name;
      parts.forEach(part => part.dispose()); root.add(mesh);
    }
  }
  return { root, update(progress: number, mode: SceneryMode, timezone?: string) {
    const stop = stationsNear(progress).find(candidate => Math.abs(candidate.at - progress) < SCENERY_DISTANCE + 110 && stationAvailable(candidate.at, mode));
    root.visible = !!stop;
    if (!stop) return;
    const key = `${stop.index}:${mode}`;
    if (key !== current) { current = key; build(stop, mode); }
    const now = Date.now(), minute = Math.floor(now / 60000);
    if (minute !== clockMinute || timezone !== clockTimezone) {
      clockMinute = minute; clockTimezone = timezone; updateClock?.(new Date(now), timezone);
    }
  }};
}
