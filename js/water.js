// Water: one material for pools, ponds, the sea and the water on the slide. Ripples come from a
// normal map sampled twice, drifting different ways, so they never look like a sliding picture;
// the standard material's Fresnel then reflects the sky (strongest at a glancing look) and the
// sun leaves glints on the ripples. Call tick(time) every frame to keep it moving.
import * as THREE from 'three';
import { rippleNormalTexture } from './textures.js';

// color: the water's own color. opacity < 1 makes it see-through. ripple: meters per ripple
// tile (or, with uvScale, texture repeats per uv unit). flow: [u, v] drift per second of the
// first ripple layer, in uv units. strength: how bumpy the ripples look.
export function makeWater({
  color = '#3fc3ee',
  opacity = 1,
  repeat = [1, 1],
  flow = [0.02, 0.015],
  strength = 0.35,
  roughness = 0.06,
  map = null,
  vertexColors = false,
  side = THREE.FrontSide,
  emissive = '#0a2f48',
} = {}) {
  const normalMap = rippleNormalTexture().clone();
  normalMap.needsUpdate = true;
  normalMap.repeat.set(repeat[0], repeat[1]);
  const material = new THREE.MeshStandardMaterial({
    color,
    map,
    vertexColors,
    normalMap,
    normalScale: new THREE.Vector2(strength, strength),
    roughness,
    metalness: 0,
    emissive,
    transparent: opacity < 1,
    opacity,
    depthWrite: opacity >= 1,
    side,
  });
  const off1 = { value: new THREE.Vector2() };
  const off2 = { value: new THREE.Vector2() };
  material.onBeforeCompile = (shader) => {
    shader.uniforms.waterOff1 = off1;
    shader.uniforms.waterOff2 = off2;
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec2 waterOff1;\nuniform vec2 waterOff2;')
      .replace(
        '#include <normal_fragment_maps>',
        /* glsl */ `
        #ifdef USE_NORMALMAP_TANGENTSPACE
          vec3 rip1 = texture2D( normalMap, vNormalMapUv + waterOff1 ).xyz * 2.0 - 1.0;
          vec3 rip2 = texture2D( normalMap, vNormalMapUv * 1.63 + waterOff2 ).xyz * 2.0 - 1.0;
          vec3 mapN = normalize( vec3( rip1.xy + rip2.xy, rip1.z * rip2.z ) );
          mapN.xy *= normalScale;
          normal = normalize( tbn * mapN );
        #endif`,
      );
  };
  material.customProgramCacheKey = () => 'water';
  material.userData.tick = (time) => {
    off1.value.set(flow[0] * time, flow[1] * time);
    off2.value.set(-flow[1] * time * 0.8 + 0.37, flow[0] * time * 0.7 + 0.11);
  };
  return material;
}
