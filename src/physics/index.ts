export { PhysicsWorld, type PhysicsWorldOptions, type BroadphaseKind } from './PhysicsWorld.js';
export { PhysicsSystem } from './PhysicsSystem.js';
// Re-export cannon-es so consumers don't need a direct dep.
export { Body, Vec3 } from 'cannon-es';
