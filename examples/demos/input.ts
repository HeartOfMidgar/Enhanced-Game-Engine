import { Engine } from '@engine/core/Engine.js';
import type { System } from '@engine/core/System.js';
import { InputManager } from '@engine/input/InputManager.js';
import { InputSystem } from '@engine/input/InputSystem.js';
import { Renderer } from '@engine/render/Renderer.js';
import { RenderSystem } from '@engine/render/RenderSystem.js';
import {
  AmbientLight,
  BoxGeometry,
  DirectionalLight,
  GridHelper,
  Mesh,
  MeshStandardMaterial,
} from 'three';

import { makeOverlay } from './overlay.js';
import { attachStatsHud } from './scene-hud.js';

import { type Demo } from './index.js';

export const input: Demo = {
  id: 'input',
  name: 'Input + actions',
  description:
    'Action map binding WASD/arrows to "move" and Space/GamepadA to "jump". Move the cube around.',
  run(host) {
    const renderer = new Renderer({ clearColor: 0x0d1117 });
    renderer.attach(host);
    renderer.scene.add(new AmbientLight(0xffffff, 0.5));
    const sun = new DirectionalLight(0xffffff, 1.0);
    sun.position.set(4, 6, 2);
    renderer.scene.add(sun);

    const grid = new GridHelper(20, 20, 0x2c313c, 0x1d2129);
    grid.position.y = -0.5;
    renderer.scene.add(grid);

    const cube = new Mesh(
      new BoxGeometry(1, 1, 1),
      new MeshStandardMaterial({ color: 0xa3be8c, roughness: 0.4 }),
    );
    renderer.scene.add(cube);

    const inputMgr = new InputManager({
      actions: {
        moveLeft: ['Key:KeyA', 'Key:ArrowLeft', 'Axis:0:0:-'],
        moveRight: ['Key:KeyD', 'Key:ArrowRight', 'Axis:0:0:+'],
        moveUp: ['Key:KeyW', 'Key:ArrowUp', 'Axis:0:1:-'],
        moveDown: ['Key:KeyS', 'Key:ArrowDown', 'Axis:0:1:+'],
        jump: ['Key:Space', 'Pad:0:0'],
      },
    });

    const engine = new Engine();
    engine.systems.register(new InputSystem(inputMgr));
    engine.systems.register(new RenderSystem(renderer));
    engine.systems.register<System>({
      name: 'Movement',
      update(dt) {
        const speed = 4;
        const dx = (inputMgr.actions.value('moveRight') || 0) - (inputMgr.actions.value('moveLeft') || 0);
        const dy = (inputMgr.actions.value('moveDown') || 0) - (inputMgr.actions.value('moveUp') || 0);
        cube.position.x += dx * speed * dt;
        cube.position.z += dy * speed * dt;
        if (inputMgr.actions.pressed('jump')) cube.position.y = 2;
        cube.position.y *= 0.92;
      },
    });
    engine.start();

    const removeHud = attachStatsHud(host, engine, {
      label: () =>
        `mv:${(inputMgr.actions.value('moveRight') - inputMgr.actions.value('moveLeft')).toFixed(2)},${(inputMgr.actions.value('moveDown') - inputMgr.actions.value('moveUp')).toFixed(2)} jump:${inputMgr.actions.held('jump') ? '1' : '0'}`,
    });
    const removeOverlay = makeOverlay(
      host,
      `<b>Input + actions.</b> Click the canvas to focus, then use WASD/arrows to move and Space to jump. Gamepad axis 0/1 + button A also bound. The HUD shows the live action values.`,
    );

    return () => {
      removeOverlay();
      removeHud();
      engine.destroy();
      host.innerHTML = '';
    };
  },
};
