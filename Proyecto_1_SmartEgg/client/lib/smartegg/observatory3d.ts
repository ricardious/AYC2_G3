import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import type { ObservatoryState } from "./observatory";
import { composeLcd, drawLcd } from "./lcd";

export type ObservatoryView = "orbit" | "front" | "top" | "lcd";
export interface SceneState extends ObservatoryState {
  systemEnabled: boolean | null;
  sensorOk: boolean | null;
  heater: boolean | null;
  buzzer: boolean | null;
  doorOpen: boolean | null;
  autoRotate: boolean;
  view: ObservatoryView;
  reset: number;
}

/** Modelo ilustrativo: la telemetría controla actuadores, no una simulación térmica. */
export async function createObservatory(
  host: HTMLElement,
  read: () => SceneState,
  select: (slot: number) => void,
  onError: () => void,
  inspectLcd: () => void,
) {
  const assembly = await new GLTFLoader().loadAsync("/egg-assembly.glb");
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.25;
  const canvas = renderer.domElement;
  canvas.setAttribute("aria-hidden", "true");
  host.appendChild(canvas);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 80);
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.enablePan = false;
  controls.minDistance = 2;
  controls.maxDistance = 16;
  controls.minPolarAngle = 0.08;
  controls.maxPolarAngle = Math.PI * 0.49;
  controls.autoRotateSpeed = 0.45;
  controls.target.set(0, 1.5, 0);
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  const metal = new THREE.MeshStandardMaterial({ color: "#35434a", metalness: 0.75, roughness: 0.32 });
  const dark = new THREE.MeshStandardMaterial({ color: "#121e25", metalness: 0.5, roughness: 0.45 });
  const porcelain = new THREE.MeshStandardMaterial({ color: "#efe1c5", roughness: 0.36, metalness: 0.06 });
  const glow = new THREE.MeshBasicMaterial({ color: "#e9ad5e" });
  const glass = new THREE.MeshPhysicalMaterial({ color: "#8ecbc9", transparent: true, opacity: 0.07, roughness: 0.12, metalness: 0.1, side: THREE.DoubleSide, depthWrite: false });
  const model = new THREE.Group();
  scene.add(model);
  const mesh = (geometry: THREE.BufferGeometry, material: THREE.Material, parent: THREE.Object3D, x = 0, y = 0, z = 0) => {
    const object = new THREE.Mesh(geometry, material);
    object.position.set(x, y, z);
    parent.add(object);
    return object;
  };
  const box = (w: number, h: number, d: number, material: THREE.Material, parent: THREE.Object3D, x = 0, y = 0, z = 0) => {
    const object = mesh(new THREE.BoxGeometry(w, h, d), material, parent, x, y, z);
    if (material.transparent) {
      const edgeMaterial = new THREE.LineBasicMaterial({
        color: "color" in material ? (material as THREE.MeshBasicMaterial).color : "#b8cac6",
        transparent: true,
        opacity: 0.5,
      });
      object.add(new THREE.LineSegments(new THREE.EdgesGeometry(object.geometry), edgeMaterial));
    }
    return object;
  };
  const ringGeometry = new THREE.TorusGeometry(0.46, 0.018, 8, 64);
  const ring = (radius: number, material: THREE.Material, parent: THREE.Object3D, y: number) => {
    const object = mesh(radius === 0.46 ? ringGeometry : new THREE.TorusGeometry(radius, 0.018, 8, 96), material, parent, 0, y);
    object.rotation.x = Math.PI / 2;
    return object;
  };
  // Silueta y disposición tomadas del prototipo: gabinete, ventana y panel superior.
  const green = new THREE.MeshBasicMaterial({ color: "#16a34a", transparent: true, opacity: 0.48, depthWrite: false });
  const frontGreen = new THREE.MeshBasicMaterial({ color: "#16a34a", transparent: true, opacity: 0.48, depthWrite: false });
  const red = new THREE.MeshBasicMaterial({ color: "#e32646", transparent: true, opacity: 0.36, depthWrite: false });
  const silver = new THREE.MeshStandardMaterial({ color: "#b8cac6", metalness: 0.4, roughness: 0.45 });
  box(3.55, 0.16, 2.95, red, model, 0, 0.05);
  const shell = new THREE.Group();
  model.add(shell);
  for (const x of [-1.7, 1.7]) {
    box(0.14, 3.65, 2.9, red, shell, x, 1.9);
  }
  box(3.5, 3.65, 0.14, red, shell, 0, 1.9, -1.4);
  // Revestimiento interior y división fija del compartimento de circuitos.
  // Su cara inferior coincide con el borde superior de la puerta (y = 2.93).
  const interior = new THREE.Group();
  interior.name = "paredes-interiores";
  shell.add(interior);
  const lining = red.clone();
  lining.opacity = 0.16;
  for (const x of [-1.6, 1.6])
    box(0.04, 2.76, 2.64, lining, interior, x, 1.55, 0.01);
  box(3.24, 2.76, 0.04, lining, interior, 0, 1.55, -1.29);
  const partitionMaterial = red.clone();
  partitionMaterial.opacity = 0.4;
  const partition = box(3.26, 0.1, 2.68, partitionMaterial, interior, 0, 2.98, 0.01);
  partition.name = "division-circuitos-camara";
  // Franja del LCD, interruptor, buzzer y piloto.
  box(3.55, 0.8, 0.16, frontGreen, model, 0, 3.42, 1.43);
  box(1.3, 0.43, 0.045, dark, model, -0.8, 3.45, 1.54);
  const lcdCanvas = document.createElement("canvas");
  lcdCanvas.width = 512;
  lcdCanvas.height = 128;
  const lcdContext = lcdCanvas.getContext("2d")!;
  const lcdTexture = new THREE.CanvasTexture(lcdCanvas);
  lcdTexture.colorSpace = THREE.SRGBColorSpace;
  const lcd = new THREE.MeshBasicMaterial({ map: lcdTexture });
  const screen = box(1.13, 0.28, 0.02, lcd, model, -0.8, 3.45, 1.57);
  screen.userData.lcd = true;
  const toggle = mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.07, 6), silver, model, 0.35, 3.45, 1.55);
  toggle.rotation.x = Math.PI / 2;
  const lever = box(0.035, 0.23, 0.035, silver, model, 0.35, 3.52, 1.64);
  lever.rotation.x = 0.5;
  const buzzer = mesh(new THREE.CylinderGeometry(0.115, 0.115, 0.07, 24), dark, model, 1.05, 3.58, 1.55);
  buzzer.rotation.x = Math.PI / 2;
  const pilot = new THREE.MeshBasicMaterial({ color: "#443c2e" });
  mesh(new THREE.SphereGeometry(0.067, 16, 12), pilot, model, 1.05, 3.27, 1.56);
  for (const x of [-1.59, 1.59]) box(0.36, 2.95, 0.14, frontGreen, model, x, 1.55, 1.43);
  box(3.55, 0.25, 0.14, frontGreen, model, 0, 0.23, 1.43);
  const door = new THREE.Group();
  const doorWhite = new THREE.MeshBasicMaterial({
    color: "#ffffff", transparent: true, opacity: 0.38, depthWrite: false,
  });
  door.position.set(-1.4, 0.38, 1.53);
  model.add(door);
  for (const x of [0, 2.8]) box(0.12, 2.55, 0.08, doorWhite, door, x, 1.275);
  for (const y of [0, 2.55]) box(2.92, 0.12, 0.08, doorWhite, door, 1.4, y);
  box(2.68, 2.43, 0.018, glass, door, 1.4, 1.275);
  box(0.06, 0.38, 0.12, silver, door, 2.65, 1.2, 0.08);
  // Sensor azul en la pared izquierda, como en la fotografía del interior.
  box(0.12, 0.45, 0.32, dark, shell, -1.54, 1.7, -0.2);
  const sensorBlue = new THREE.MeshStandardMaterial({ color: "#387b96", roughness: 0.65 });
  box(0.13, 0.3, 0.23, sensorBlue, shell, -1.45, 1.65, -0.2);
  const roof = new THREE.Group();
  roof.position.y = 3.83;
  model.add(roof);
  box(3.6, 0.12, 3, green, roof);
  // Foco centrado; el portalámparas queda al nivel del borde superior de la puerta.
  const lamp = new THREE.Group();
  // Portalámparas fijado a la cara inferior de la división, sin varilla colgante.
  lamp.position.set(0, -0.9, 0);
  roof.add(lamp);
  mesh(new THREE.CylinderGeometry(0.23, 0.18, 0.22, 32), porcelain, lamp, 0, -0.11);
  mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.2, 32), metal, lamp, 0, -0.31);
  for (let i = 0; i < 4; i++) ring(0.125, silver, lamp, -0.24 - i * 0.045);
  const bulbGlass = new THREE.MeshBasicMaterial({ color: "#ffce79", transparent: true, opacity: 0.14, depthWrite: false });
  const bulbProfile = [
    [0, -1.02], [0.12, -1], [0.23, -0.93], [0.29, -0.82],
    [0.3, -0.7], [0.27, -0.6], [0.18, -0.5], [0.12, -0.44], [0.12, -0.4],
  ].map(([radius, y]) => new THREE.Vector2(radius, y));
  const bulbGeometry = new THREE.LatheGeometry(bulbProfile, 32);
  mesh(bulbGeometry, bulbGlass, lamp);
  const lampOutline = new THREE.LineBasicMaterial({ color: "#ffd38b", transparent: true, opacity: 0.75 });
  for (let i = 0; i < 4; i++) {
    const contour = new THREE.BufferGeometry().setFromPoints(bulbProfile.map(point => new THREE.Vector3(point.x, point.y, 0)));
    const line = new THREE.Line(contour, lampOutline);
    line.rotation.y = i * Math.PI / 2;
    lamp.add(line);
  }
  const filamentGeometry = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(-0.045, -0.41, 0), new THREE.Vector3(-0.08, -0.77, 0),
    new THREE.Vector3(-0.04, -0.72, 0), new THREE.Vector3(0, -0.78, 0),
    new THREE.Vector3(0.04, -0.72, 0), new THREE.Vector3(0.08, -0.77, 0), new THREE.Vector3(0.045, -0.41, 0),
  ]);
  lamp.add(new THREE.Line(filamentGeometry, lampOutline));
  const lampLight = new THREE.PointLight("#ffc16a", 0, 5, 2);
  lampLight.position.set(0, -0.8, 0);
  lamp.add(lampLight);
  const fanMount = new THREE.Group();
  fanMount.position.set(0, 1.79, -1.19);
  fanMount.rotation.x = Math.PI / 2;
  shell.add(fanMount);
  box(0.86, 0.1, 0.86, dark, fanMount);
  ring(0.38, metal, fanMount, 0.07);
  const rotor = new THREE.Group();
  fanMount.add(rotor);
  rotor.scale.setScalar(0.55);
  rotor.position.y = 0.1;
  mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.13, 24), metal, rotor);
  const bladeGeometry = new THREE.SphereGeometry(1, 16, 8);
  for (let i = 0; i < 5; i++) {
    const arm = new THREE.Group();
    arm.rotation.y = i * Math.PI * 2 / 5;
    const blade = mesh(bladeGeometry, metal, arm, 0.35);
    blade.scale.set(0.32, 0.025, 0.12);
    blade.rotation.y = 0.45;
    rotor.add(arm);
  }
  // Original Blender assembly, converted from Z-up to glTF Y-up during export.
  // Its support feet remain fixed; the carrier and rack pivot about the X axle.
  const mechanism = new THREE.Group();
  // Tamaño compacto, conservando el apoyo de las patas en el piso.
  const mechanismScale = 0.01235475;
  mechanism.scale.setScalar(mechanismScale);
  mechanism.position.set(-8 * mechanismScale, 0.152 + 64 * mechanismScale, 0);
  model.add(mechanism);
  const tray = new THREE.Group();
  mechanism.add(tray);
  const gearPivot = new THREE.Group();
  mechanism.add(gearPivot);
  const carrierMaterial = new THREE.MeshPhysicalMaterial({ color: "#65c6d5", transparent: true, opacity: 0.28, depthWrite: false, roughness: 0.16 });
  const supportMaterial = new THREE.MeshPhysicalMaterial({ color: "#a6c6c8", transparent: true, opacity: 0.22, depthWrite: false, roughness: 0.18 });
  const gearMaterial = new THREE.MeshPhysicalMaterial({ color: "#e6b775", transparent: true, opacity: 0.35, depthWrite: false, roughness: 0.18 });
  const assemblyMeshes: THREE.Mesh[] = [];
  assembly.scene.updateMatrixWorld(true);
  assembly.scene.traverse(object => { if (object instanceof THREE.Mesh) assemblyMeshes.push(object); });
  const partEdges = new THREE.LineBasicMaterial({ color: "#86bdc4", transparent: true, opacity: 0.3 });
  for (const part of assemblyMeshes) {
    // Bake the imported transform so every component shares the mechanical axle.
    part.geometry.applyMatrix4(part.matrixWorld);
    part.position.set(0, 0, 0);
    part.quaternion.identity();
    part.scale.set(1, 1, 1);
    const materials = Array.isArray(part.material) ? part.material : [part.material];
    materials.forEach(material => material.dispose());
    const movingPart = part.name === "carrier" || part.name === "cremallera_10T";
    part.material = part.name === "carrier" ? carrierMaterial : part.name.startsWith("pata") ? supportMaterial : gearMaterial;
    part.add(new THREE.LineSegments(new THREE.EdgesGeometry(part.geometry, 35), partEdges));
    if (part.name === "pinon_5T") {
      const center = new THREE.Box3().setFromBufferAttribute(part.geometry.attributes.position as THREE.BufferAttribute).getCenter(new THREE.Vector3());
      gearPivot.position.copy(center);
      // Eleva el piñón hacia la cremallera; conserva su centro local de giro.
      gearPivot.position.y += 22;
      part.position.copy(center).negate();
      gearPivot.add(part);
    } else (movingPart ? tray : mechanism).add(part);
  }
  // Four selectable specimens placed in the four openings of the real carrier.
  const specimens = new THREE.Group();
  specimens.scale.setScalar(1 / 0.017);
  tray.add(specimens);
  const slots: THREE.Mesh[] = [];
  const eggs: THREE.Mesh[] = [];
  const points: THREE.Vector2[] = [];
  for (let i = 0; i <= 48; i++) {
    const t = i / 48 * Math.PI;
    points.push(new THREE.Vector2(Math.sin(t) * 0.38 * (1 - 0.18 * Math.cos(t)), Math.cos(t) * 0.56));
  }
  const eggGeometry = new THREE.LatheGeometry(points.reverse(), 48);
  for (let i = 0; i < 4; i++) {
    const slot = new THREE.Group();
    slot.position.set(i % 2 ? 0.425 : -0.425, 0, i < 2 ? -0.425 : 0.425);
    slot.scale.setScalar(0.72);
    specimens.add(slot);
    const socket = mesh(new THREE.CylinderGeometry(0.46, 0.4, 0.025, 48), supportMaterial, slot);
    socket.userData.slot = i;
    slots.push(socket);
    const halo = ring(0.46, glow.clone(), slot, 0.055);
    halo.userData.slot = i;
    slots.push(halo);
    const egg = mesh(eggGeometry, porcelain, slot, 0, 0.6);
    egg.userData.slot = i;
    eggs.push(egg);
  }
  const grid = new THREE.GridHelper(14, 28, "#405e60", "#253a40");
  grid.position.y = -0.39;
  grid.material.transparent = true;
  grid.material.opacity = 0.2;
  scene.add(grid);
  scene.add(new THREE.HemisphereLight("#e6faff", "#26343c", 2.4));
  const key = new THREE.DirectionalLight("#ffe4bd", 4);
  key.position.set(3, 7, 5);
  scene.add(key);
  const rim = new THREE.DirectionalLight("#74dfe1", 3);
  rim.position.set(-4, 3, -3);
  scene.add(rim);
  const particlePositions = new Float32Array(100 * 3);
  const particleGeometry = new THREE.BufferGeometry();
  particleGeometry.setAttribute("position", new THREE.BufferAttribute(particlePositions, 3));
  const particleMaterial = new THREE.PointsMaterial({ color: "#f9c57c", size: 0.025, transparent: true, opacity: 0.65, depthWrite: false });
  const particles = new THREE.Points(particleGeometry, particleMaterial);
  particles.frustumCulled = false;
  model.add(particles);
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const down = new THREE.Vector2();
  const targets: THREE.Mesh[] = [];
  model.traverse(object => {
    if (object instanceof THREE.Mesh && (!object.material.transparent || object.userData.slot !== undefined)) targets.push(object);
  });
  const pick = (event: PointerEvent) => {
    const rect = canvas.getBoundingClientRect();
    pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
    const first = raycaster.intersectObjects(targets, false).find(hit => hit.object.visible);
    return first && (first.object.userData.slot !== undefined || first.object.userData.lcd) ? first : undefined;
  };
  const pointerDown = (event: PointerEvent) => down.set(event.clientX, event.clientY);
  const pointerUp = (event: PointerEvent) => {
    if (Math.hypot(event.clientX - down.x, event.clientY - down.y) > 6) return;
    const hit = pick(event);
    if (hit?.object.userData.lcd) inspectLcd();
    else if (hit) select(hit.object.userData.slot);
  };
  const pointerMove = (event: PointerEvent) => { canvas.style.cursor = pick(event) ? "pointer" : "grab"; };
  const lost = (event: Event) => { event.preventDefault(); renderer.setAnimationLoop(null); onError(); };
  canvas.addEventListener("pointerdown", pointerDown);
  canvas.addEventListener("pointerup", pointerUp);
  canvas.addEventListener("pointermove", pointerMove);
  canvas.addEventListener("webglcontextlost", lost);
  const resize = () => {
    const width = host.clientWidth, height = host.clientHeight;
    renderer.setSize(width, height);
    camera.aspect = width / Math.max(height, 1);
    camera.updateProjectionMatrix();
  };
  const observer = new ResizeObserver(resize);
  observer.observe(host);
  resize();
  let previous = 0, phase = 0, reset = -1;
  let lcdText = "";
  let lcdScreen = "";
  let marqueeOffset = 0;
  let lastLcdFrame = -1;
  let view: ObservatoryView | undefined;
  const accent = new THREE.Color();
  renderer.setAnimationLoop((time) => {
    const dt = Math.min((time - previous) / 1000, 0.05);
    previous = time;
    if (document.hidden) return;
    const s = read();
    const lcdFrame = Math.floor(phase / 0.15) % 256;
    const nextScreen = s.systemEnabled === false ? "disabled" : s.sensorOk === false ? "fault" : "running";
    if (nextScreen !== lcdScreen) {
      lcdScreen = nextScreen;
      marqueeOffset = 0;
    } else if (lcdScreen === "fault" && lcdFrame !== lastLcdFrame && lcdFrame % 2 === 0) marqueeOffset++;
    lastLcdFrame = lcdFrame;
    const lines = composeLcd(s, lcdFrame, marqueeOffset);
    const nextText = lines.join("\n") + lcdFrame;
    if (lcdText !== nextText) {
      lcdText = nextText;
      drawLcd(lcdContext, lines, lcdFrame);
      lcdTexture.needsUpdate = true;
    }
    if (s.view !== view || s.reset !== reset) {
      view = s.view; reset = s.reset;
      controls.target.set(0, 1.9, 0);
      const distance = camera.aspect < 0.85 ? 1.5 : 1;
      camera.position.set(...(view === "top" ? [0, 12 * distance, 0.01] : view === "front" ? [0, 2.8, 12 * distance] : [6 * distance, 5.3 * distance, 11 * distance]) as [number, number, number]);
      if (view === "lcd") {
        controls.target.set(-0.8, 3.45, 1.57);
        camera.position.set(-0.8, 3.45, 4.5 * distance);
      }
    }
    const moving = !s.paused && !reduced.matches;
    if (moving && s.live) phase += dt;
    controls.autoRotate = moving && s.autoRotate && view !== "lcd";
    controls.update(dt);
    const ease = reduced.matches ? 1 : 1 - Math.exp(-dt * 7);
    door.rotation.y = THREE.MathUtils.lerp(door.rotation.y, s.exploded || (s.live && s.doorOpen) ? -Math.PI * 0.62 : 0, ease);
    tray.rotation.x = THREE.MathUtils.lerp(tray.rotation.x, THREE.MathUtils.degToRad(THREE.MathUtils.clamp(s.angle ?? 0, -45, 45)), ease);
    gearPivot.rotation.x = -tray.rotation.x * 2;
    if (moving && s.live && s.fan) rotor.rotation.y += dt * 8;
    const heating = s.live && s.heater === true;
    lampLight.intensity = heating ? 3 : 0;
    bulbGlass.opacity = heating ? 0.6 : 0.14;
    lampOutline.color.set(heating ? "#ffca70" : s.light ? "#766440" : "#c2c9cf");
    carrierMaterial.opacity = s.light ? 0.45 : 0.28;
    supportMaterial.opacity = s.light ? 0.38 : 0.22;
    gearMaterial.opacity = s.light ? 0.5 : 0.35;
    partEdges.color.set(s.light ? "#387581" : "#86bdc4");
    pilot.color.set(!s.live ? "#443c2e" : s.buzzer ? "#ff4545" : heating ? "#ffc16a" : "#416947");
    lever.rotation.x = s.systemEnabled === null ? 0 : s.systemEnabled ? -0.5 : 0.5;
    accent.set(s.critical ? s.danger : s.layer === "temperature" ? s.warning : s.primary);
    glow.color.copy(accent);
    particleMaterial.color.copy(accent);
    glass.opacity = s.exploded ? 0.025 : 0.07;
    metal.color.set(s.light ? "#677777" : "#35434a");
    for (let i = 0; i < 4; i++) {
      eggs[i].visible = i < s.occupied;
      const halo = slots[i * 2 + 1];
      (halo.material as THREE.MeshBasicMaterial).color.set(i === s.selected ? accent : "#536665");
      halo.scale.setScalar((i === s.selected ? 1.1 : 1));
    }
    const count = s.humidity === null ? 0 : Math.round(THREE.MathUtils.clamp(s.humidity, 0, 100));
    particleGeometry.setDrawRange(0, count);
    for (let i = 0; i < count; i++) {
      const t = i * 2.399 + phase * (s.fan ? 0.6 : 0.05);
      particlePositions[i * 3] = Math.sin(t) * (0.7 + (i % 5) * 0.14);
      particlePositions[i * 3 + 1] = 0.45 + ((i * 0.137 + phase * (s.fan ? 0.45 : 0.04)) % 2.45);
      particlePositions[i * 3 + 2] = Math.cos(t) * 1.05;
    }
    particleGeometry.attributes.position.needsUpdate = true;
    renderer.render(scene, camera);
  });
  return () => {
    renderer.setAnimationLoop(null);
    observer.disconnect();
    controls.dispose();
    canvas.removeEventListener("pointerdown", pointerDown);
    canvas.removeEventListener("pointerup", pointerUp);
    canvas.removeEventListener("pointermove", pointerMove);
    canvas.removeEventListener("webglcontextlost", lost);
    const geometries = new Set<THREE.BufferGeometry>();
    const materials = new Set<THREE.Material>();
    scene.traverse(object => {
      if (object instanceof THREE.Mesh || object instanceof THREE.Line || object instanceof THREE.Points) {
        geometries.add(object.geometry);
        for (const material of Array.isArray(object.material) ? object.material : [object.material]) materials.add(material);
      }
    });
    geometries.forEach(geometry => geometry.dispose());
    materials.forEach(material => material.dispose());
    lcdTexture.dispose();
    renderer.dispose();
    canvas.remove();
  };
}
