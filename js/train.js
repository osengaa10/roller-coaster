// The coaster train: cars riding on wheel trucks that follow the rails round every curve, wheels
// that spin, and coupler bars that bend between the cars. Parts that never move are merged, and
// all the wheels are one instanced mesh, so the whole train is only a few dozen draw calls.
import * as THREE from 'three';
import { makeTrainCar, Parts, chrome, darkSteel } from './characters.js';
import { beam, RAIL_GAP } from './scenery.js';

const CAR_GAP = 2.7; // meters between train cars
const AXLE = 0.8; // each car's two trucks sit this far in front of and behind its middle
const FRONT_HITCH = new THREE.Vector3(0, 0.4, 1.25);
const REAR_HITCH = new THREE.Vector3(0, 0.4, -1.1);

const BOX = new THREE.BoxGeometry(1, 1, 1);
const CYL = new THREE.CylinderGeometry(1, 1, 1, 10);

// One wheel, radius 1 and 1 wide with its axle along y: a bright urethane tire on an aluminium
// hub with five lug nuts (so you can see it turn), colored per vertex so it's a single geometry.
function wheelGeometry() {
  const colored = (geo, hex) => {
    const g = geo.toNonIndexed();
    const c = new THREE.Color(hex);
    g.setAttribute('color', new THREE.Float32BufferAttribute(Array.from({ length: g.attributes.position.count }, () => [c.r, c.g, c.b]).flat(), 3));
    return g;
  };
  const geos = [colored(new THREE.CylinderGeometry(1, 1, 0.9, 22), '#ff7b39'), colored(new THREE.CylinderGeometry(0.62, 0.62, 1, 22), '#d3d9e0'), colored(new THREE.CylinderGeometry(0.2, 0.2, 1.1, 10), '#8d96a1')];
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2;
    geos.push(colored(new THREE.CylinderGeometry(0.09, 0.09, 1.06, 6).translate(Math.cos(a) * 0.4, 0, Math.sin(a) * 0.4), '#4a505a'));
  }
  return mergeColored(geos);
}
function mergeColored(geos) {
  const g = new THREE.BufferGeometry();
  for (const name of ['position', 'normal', 'color']) {
    const arrays = geos.map((x) => x.attributes[name].array);
    const out = new Float32Array(arrays.reduce((n, a) => n + a.length, 0));
    let o = 0;
    for (const a of arrays) {
      out.set(a, o);
      o += a.length;
    }
    g.setAttribute(name, new THREE.BufferAttribute(out, 3));
  }
  return g;
}

// The wheels on one truck, in the truck's frame (x across, y up, origin between the rails): per
// rail a road wheel on top, an up-stop wheel underneath and a guide wheel on the outside.
// spin: turns of the wheel per meter rolled, signed so each one rolls the right way along its rail.
const ROAD_TO_AXLE = new THREE.Matrix4().makeRotationZ(Math.PI / 2); // axle across the track
const WHEELS = [-1, 1].flatMap((sx) => [
  { at: [sx * RAIL_GAP, 0.25, 0], mount: ROAD_TO_AXLE, r: 0.15, w: 0.1, spin: -1 / 0.15 },
  { at: [sx * RAIL_GAP, -0.24, 0], mount: ROAD_TO_AXLE, r: 0.1, w: 0.1, spin: 1 / 0.1 },
  { at: [sx * 0.79, 0, 0], mount: new THREE.Matrix4(), r: 0.09, w: 0.09, spin: -1 / (sx * 0.09) },
]).map((w) => ({ ...w, base: new THREE.Matrix4().makeTranslation(...w.at).multiply(w.mount) }));

// A truck's frame (everything but the wheels): a bolster across under the car, and on each side a
// steel yoke wrapped round the rail carrying the three wheels' axles.
function truckGeometry() {
  const p = new Parts();
  p.add(darkSteel, BOX, [0, 0.44, 0], [1.92, 0.06, 0.3]);
  for (const sx of [-1, 1]) {
    p.add(darkSteel, BOX, [sx * 0.94, 0.07, 0], [0.07, 0.8, 0.14]);
    for (const y of [0.25, -0.24]) p.add(darkSteel, CYL, [sx * 0.775, y, 0], [0.04, 0.33, 0.04], [0, 0, Math.PI / 2]);
    p.add(darkSteel, BOX, [sx * 0.865, 0.085, 0], [0.15, 0.04, 0.12]);
    p.add(darkSteel, CYL, [sx * 0.79, 0.07, 0], [0.03, 0.06, 0.03]);
  }
  return p.build()[0].geometry;
}

// The car's own underside: frame rails and cross members, a polished brake fin down the middle,
// a chain dog for the lift hill, an anti-rollback pawl over the lift's ratchet teeth, and a
// coupler lug at each end that has a car to tow or be towed by.
function chassisParts(frontLug, rearLug) {
  const p = new Parts();
  const m = new THREE.Matrix4();
  for (const sx of [-1, 1]) p.add(darkSteel, BOX, [sx * 0.5, 0.41, 0], [0.12, 0.1, 2.25]);
  for (const z of [-0.35, 0.35]) p.add(darkSteel, BOX, [0, 0.41, z], [1.0, 0.08, 0.1]);
  p.add(chrome, BOX, [0, 0.2, 0], [0.025, 0.32, 1.1]);
  p.add(darkSteel, BOX, [0, 0.21, 0.62], [0.08, 0.3, 0.08]);
  p.addMatrix(darkSteel, CYL, beam(m, new THREE.Vector3(0.24, 0.37, 0.55), new THREE.Vector3(0.24, 0.07, 0.3), 0.03));
  p.add(darkSteel, CYL, [0.24, 0.37, 0.55], [0.04, 0.1, 0.04], [0, 0, Math.PI / 2]);
  if (frontLug) p.add(darkSteel, CYL, [0, 0.4, 1.12], [0.06, 0.28, 0.06], [Math.PI / 2, 0, 0]);
  if (rearLug) p.add(darkSteel, CYL, [0, 0.4, -0.98], [0.06, 0.28, 0.06], [Math.PI / 2, 0, 0]);
  return p.build();
}

export function makeTrain(colors) {
  const group = new THREE.Group();
  const n = colors.length;
  const truckGeo = truckGeometry();
  const cars = colors.map((color, k) => {
    const car = makeTrainCar(color, k === 0, { number: k + 1, back: k === n - 1 });
    car.add(...chassisParts(k > 0, k < n - 1));
    car.userData.trucks = [AXLE, -AXLE].map((z) => {
      const truck = new THREE.Mesh(truckGeo, darkSteel);
      truck.position.z = z;
      car.add(truck);
      return truck;
    });
    group.add(car);
    return car;
  });

  const wheels = new THREE.InstancedMesh(wheelGeometry(), new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.35, roughness: 0.45 }), n * 2 * WHEELS.length);
  wheels.frustumCulled = false; // its matrices are in world space and change every frame
  const couplers = new THREE.InstancedMesh(CYL, darkSteel, Math.max(1, n - 1));
  couplers.frustumCulled = false;
  couplers.count = n - 1;
  group.add(wheels, couplers);

  const m = new THREE.Matrix4();
  const spin = new THREE.Matrix4();
  const fwd = new THREE.Vector3();
  const up = new THREE.Vector3();
  const side = new THREE.Vector3();
  const q = new THREE.Quaternion();
  const carInv = new THREE.Quaternion();
  const basis = (tan, u) => {
    side.crossVectors(u, tan).normalize();
    up.crossVectors(tan, side);
    return q.setFromRotationMatrix(m.makeBasis(side, up, tan));
  };

  return {
    group,
    cars,
    // frameAt(s) -> { pos, up, tan } of the track s meters along; s is the front car's middle.
    place(frameAt, s) {
      let w = 0;
      cars.forEach((car, k) => {
        const mid = Math.max(0, s - k * CAR_GAP);
        const ends = [frameAt(mid + AXLE), frameAt(mid - AXLE)];
        // The body runs straight from one truck to the other, cutting the inside of curves.
        fwd.subVectors(ends[0].pos, ends[1].pos);
        if (fwd.lengthSq() < 1e-6) fwd.copy(ends[0].tan);
        fwd.normalize();
        car.quaternion.copy(basis(fwd, up.addVectors(ends[0].up, ends[1].up)));
        car.position.addVectors(ends[0].pos, ends[1].pos).multiplyScalar(0.5);
        car.updateMatrixWorld();
        carInv.copy(car.quaternion).invert();
        // Each truck swivels to sit square on the rails right where it is.
        car.userData.trucks.forEach((truck, j) => {
          const f = ends[j];
          truck.quaternion.copy(carInv).multiply(basis(f.tan, f.up));
          truck.position.copy(car.worldToLocal(f.pos.clone()));
          truck.updateMatrixWorld();
          const rolled = mid + (j ? -AXLE : AXLE);
          for (const wheel of WHEELS) {
            spin.makeRotationY(rolled * wheel.spin).scale(up.set(wheel.r, wheel.w, wheel.r));
            wheels.setMatrixAt(w++, m.multiplyMatrices(truck.matrixWorld, wheel.base).multiply(spin));
          }
        });
      });
      for (let k = 0; k < n - 1; k++) {
        couplers.setMatrixAt(k, beam(m, cars[k].localToWorld(REAR_HITCH.clone()), cars[k + 1].localToWorld(FRONT_HITCH.clone()), 0.045));
      }
      wheels.instanceMatrix.needsUpdate = true;
      couplers.instanceMatrix.needsUpdate = true;
    },
  };
}
