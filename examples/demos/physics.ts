import { Engine } from '@engine/core/Engine.js';
import type { System } from '@engine/core/System.js';
import { PhysicsSystem } from '@engine/physics/PhysicsSystem.js';
import { PhysicsWorld } from '@engine/physics/PhysicsWorld.js';
import { Renderer } from '@engine/render/Renderer.js';
import { RenderSystem } from '@engine/render/RenderSystem.js';
import { Body, Box, Plane, Vec3 } from 'cannon-es';
import {
  AmbientLight,
  BoxGeometry,
  DirectionalLight,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
} from 'three';

import { makeOverlay } from './overlay.js';
import { attachOrbit, attachStatsHud } from './scene-hud.js';

import { type Demo } from './index.js';

export const physics: Demo = {
  id: 'physics',
  name: 'Physics — cube stack',
  description:
    'cannon-es PhysicsSystem stepped at the engine fixed timestep, ECS-free for brevity. Cubes drop onto a static plane.',
  run(host) {
    const renderer = new Renderer({ clearColor: 0x0d1117 });
    renderer.attach(host);
    renderer.camera.position.set(6, 6, 10);
    renderer.camera.lookAt(0, 0, 0);
    renderer.scene.add(new AmbientLight(0xffffff, 0.4));
    const sun = new DirectionalLight(0xffffff, 1.1);
    sun.position.set(5, 10, 5);
    renderer.scene.add(sun);

    // Floor
    const floorMesh = new Mesh(
      new PlaneGeometry(20, 20),
      new MeshStandardMaterial({ color: 0x2e3440, roughness: 0.9 }),
    );
    floorMesh.rotation.x = -Math.PI / 2;
    renderer.scene.add(floorMesh);

    const physicsWorld = new PhysicsWorld({ gravity: { x: 0, y: -9.82, z: 0 } });
    const floorBody = new Body({ mass: 0, shape: new Plane() });
    floorBody.quaternion.setFromAxisAngle(new Vec3(1, 0, 0), -Math.PI / 2);
    physicsWorld.raw.addBody(floorBody);

    const cubes: Array<{ mesh: Mesh; body: Body }> = [];
    const cubeGeometry = new BoxGeometry(1, 1, 1);

    let next = 0;
    function spawnCube(): void {
      const mat = new MeshStandardMaterial({
        color: 0x88c0d0,
        roughness: 0.4,
      });
      const mesh = new Mesh(cubeGeometry, mat);
      mesh.position.set((Math.random() - 0.5) * 2, 8, (Math.random() - 0.5) * 2);
      renderer.scene.add(mesh);

      const body = new Body({
        mass: 1,
        shape: new Box(new Vec3(0.5, 0.5, 0.5)),
        position: new Vec3(mesh.position.x, mesh.position.y, mesh.position.z),
        angularDamping: 0.1,
      });
      physicsWorld.raw.addBody(body);
      cubes.push({ mesh, body });
    }

    const orbit = attachOrbit(renderer, { minDistance: 4, maxDistance: 50, target: [0, 1, 0] });

    const engine = new Engine({ fixedTimeStep: 1 / 60 });
    engine.systems.register(new PhysicsSystem(physicsWorld));
    engine.systems.register(new RenderSystem(renderer));
    engine.systems.register<System>({
      name: 'SpawnCubes',
      fixedUpdate(dt) {
        next -= dt;
        if (next <= 0 && cubes.length < 40) {
          spawnCube();
          next = 0.4;
        }
      },
    });
    engine.systems.register<System>({
      name: 'SyncMeshes',
      priority: 900,
      update() {
        for (const { mesh, body } of cubes) {
          mesh.position.set(body.position.x, body.position.y, body.position.z);
          mesh.quaternion.set(body.quaternion.x, body.quaternion.y, body.quaternion.z, body.quaternion.w);
        }
        orbit.controls.update();
      },
    });
    engine.start();

    const removeHud = attachStatsHud(host, engine, {
      label: () => `${cubes.length} cubes`,
    });
    const removeOverlay = makeOverlay(
      host,
      `<b>Physics.</b> A SpawnCubes system runs in fixedUpdate to drop cubes; PhysicsSystem steps cannon-es at 60Hz; SyncMeshes mirrors body→mesh transforms each frame. Drag to orbit.`,
    );

    return () => {
      removeOverlay();
      removeHud();
      orbit.dispose();
      engine.destroy();
      cubes.length = 0;
      host.innerHTML = '';
    };
  },
};
