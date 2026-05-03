import { Types, defineComponent } from 'bitecs';

/**
 * 3D transform — position, quaternion rotation, and scale.
 * Components are SoA / typed arrays for ECS-friendly cache locality.
 */
export const Transform = defineComponent({
  x: Types.f32,
  y: Types.f32,
  z: Types.f32,
  rx: Types.f32,
  ry: Types.f32,
  rz: Types.f32,
  rw: Types.f32,
  sx: Types.f32,
  sy: Types.f32,
  sz: Types.f32,
});

/**
 * Reference to an external mesh kept by id (the game owns a Map<id, Object3D>).
 * Keeping Three.js Object3D refs out of bitecs lets us treat ECS storage as
 * data-only, which plays well with workers / serialization.
 */
export const MeshRef = defineComponent({
  id: Types.ui32,
});
