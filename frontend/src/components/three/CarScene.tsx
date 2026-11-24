"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";

export interface CarSceneProps {
  /** Paint colour as a CSS hex string, e.g. "#ffc107". */
  paint: string;
  /** Called once if WebGL isn't available, so the parent can show a fallback. */
  onUnsupported?: () => void;
  className?: string;
}

/* ---------------------------------------------------------------------------------------
 * A stylised sports car built entirely from Three.js primitives (no model files to load),
 * on a turntable you can drag to rotate. The scene renders only while it's on screen,
 * stops auto-rotating for reduced-motion users, and frees every GPU resource on unmount.
 * ------------------------------------------------------------------------------------ */

const WHEEL_X = 1.4; // wheel centres along the car's length
const WHEEL_R = 0.38;
const BODY_WIDTH = 1.8;

/** Side profile of the lower body (beltline down) with both wheel arches cut out. */
function bodyShape(): THREE.Shape {
  const s = new THREE.Shape();
  s.moveTo(-2.2, 0.42);
  s.lineTo(-2.27, 0.74);
  s.quadraticCurveTo(-2.26, 0.97, -2.05, 0.99);
  s.lineTo(-1.3, 1.03);
  s.lineTo(1.05, 1.03);
  s.quadraticCurveTo(1.7, 0.98, 2.08, 0.86);
  s.quadraticCurveTo(2.32, 0.78, 2.3, 0.6);
  s.lineTo(2.25, 0.42);
  s.lineTo(WHEEL_X + 0.46, 0.42);
  s.absarc(WHEEL_X, 0.42, 0.46, 0, Math.PI, false);
  s.lineTo(-WHEEL_X + 0.46, 0.42);
  s.absarc(-WHEEL_X, 0.42, 0.46, 0, Math.PI, false);
  s.lineTo(-2.2, 0.42);
  return s;
}

/** Side profile of the glasshouse (windscreen, side windows, rear window, black roof). */
function cabinShape(): THREE.Shape {
  const s = new THREE.Shape();
  s.moveTo(-1.5, 1.0);
  s.quadraticCurveTo(-1.05, 1.34, -0.65, 1.4);
  s.lineTo(0.2, 1.42);
  s.quadraticCurveTo(0.55, 1.38, 1.25, 1.0);
  s.lineTo(-1.5, 1.0);
  return s;
}

function extrude(shape: THREE.Shape, depth: number, bevel: number): THREE.ExtrudeGeometry {
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: depth - bevel * 2,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel * 0.7,
    bevelSegments: 5,
    curveSegments: 32,
  });
  geo.translate(0, 0, -(depth - bevel * 2) / 2);
  return geo;
}

function buildWheel(tire: THREE.Material, rim: THREE.Material, hub: THREE.Material): THREE.Group {
  const wheel = new THREE.Group();
  const tireMesh = new THREE.Mesh(new THREE.CylinderGeometry(WHEEL_R, WHEEL_R, 0.28, 40), tire);
  tireMesh.rotation.x = Math.PI / 2;
  tireMesh.castShadow = true;
  wheel.add(tireMesh);

  const rimMesh = new THREE.Mesh(new THREE.CylinderGeometry(WHEEL_R * 0.68, WHEEL_R * 0.68, 0.29, 40), rim);
  rimMesh.rotation.x = Math.PI / 2;
  wheel.add(rimMesh);

  // Five spokes on each face.
  for (const side of [-1, 1]) {
    for (let i = 0; i < 5; i++) {
      const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.06, WHEEL_R * 1.2, 0.03), hub);
      spoke.rotation.z = (i / 5) * Math.PI * 2;
      spoke.position.z = side * 0.15;
      wheel.add(spoke);
    }
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.04, 20), hub);
    cap.rotation.x = Math.PI / 2;
    cap.position.z = side * 0.16;
    wheel.add(cap);
  }
  return wheel;
}

function buildCar(paint: THREE.MeshPhysicalMaterial) {
  const car = new THREE.Group();
  const disposables: { dispose(): void }[] = [];
  const track = <T extends { dispose(): void }>(x: T) => (disposables.push(x), x);

  const glass = track(new THREE.MeshPhysicalMaterial({ color: 0x0b1220, metalness: 0.6, roughness: 0.05, clearcoat: 1 }));
  const tire = track(new THREE.MeshStandardMaterial({ color: 0x15171c, roughness: 0.85 }));
  const rim = track(new THREE.MeshStandardMaterial({ color: 0x2a2f3a, metalness: 0.9, roughness: 0.3 }));
  const hub = track(new THREE.MeshStandardMaterial({ color: 0xd9dde5, metalness: 1, roughness: 0.2 }));
  const trim = track(new THREE.MeshStandardMaterial({ color: 0x101318, roughness: 0.6 }));
  const headlight = track(new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff6d8, emissiveIntensity: 2.2 }));
  const taillight = track(new THREE.MeshStandardMaterial({ color: 0xff2030, emissive: 0xff1020, emissiveIntensity: 1.6 }));

  const body = new THREE.Mesh(track(extrude(bodyShape(), BODY_WIDTH, 0.14)), paint);
  body.castShadow = true;
  car.add(body);

  const cabin = new THREE.Mesh(track(extrude(cabinShape(), BODY_WIDTH - 0.28, 0.12)), glass);
  cabin.castShadow = true;
  car.add(cabin);

  // Lower trim: side skirts and a front splitter.
  const skirtGeo = track(new THREE.BoxGeometry(1.9, 0.08, 0.06));
  for (const z of [-BODY_WIDTH / 2, BODY_WIDTH / 2]) {
    const skirt = new THREE.Mesh(skirtGeo, trim);
    skirt.position.set(0, 0.46, z);
    car.add(skirt);
  }
  const splitter = new THREE.Mesh(track(new THREE.BoxGeometry(0.2, 0.06, BODY_WIDTH - 0.2)), trim);
  splitter.position.set(2.2, 0.43, 0);
  car.add(splitter);

  // Grille.
  const grille = new THREE.Mesh(track(new THREE.BoxGeometry(0.06, 0.16, 0.9)), trim);
  grille.position.set(2.29, 0.6, 0);
  car.add(grille);

  // Lights: slim LED strips front and back.
  const headGeo = track(new THREE.BoxGeometry(0.08, 0.06, 0.42));
  const tailGeo = track(new THREE.BoxGeometry(0.06, 0.07, 0.5));
  for (const side of [-1, 1]) {
    const h = new THREE.Mesh(headGeo, headlight);
    h.position.set(2.2, 0.8, side * 0.55);
    h.rotation.z = -0.35;
    car.add(h);
    const t = new THREE.Mesh(tailGeo, taillight);
    t.position.set(-2.24, 0.86, side * 0.5);
    car.add(t);
  }
  const tailBar = new THREE.Mesh(track(new THREE.BoxGeometry(0.05, 0.03, 0.9)), taillight);
  tailBar.position.set(-2.25, 0.86, 0);
  car.add(tailBar);

  // Wing mirrors.
  const mirrorGeo = track(new THREE.BoxGeometry(0.16, 0.09, 0.14));
  for (const side of [-1, 1]) {
    const m = new THREE.Mesh(mirrorGeo, paint);
    m.position.set(0.85, 1.1, side * (BODY_WIDTH / 2 + 0.02));
    m.castShadow = true;
    car.add(m);
  }

  // Wheels: geometry is created per wheel inside buildWheel, so collect it for disposal.
  const wheels: THREE.Group[] = [];
  for (const x of [-WHEEL_X, WHEEL_X]) {
    for (const z of [-1, 1]) {
      const w = buildWheel(tire, rim, hub);
      w.position.set(x, WHEEL_R, z * (BODY_WIDTH / 2 - 0.12));
      car.add(w);
      wheels.push(w);
      w.traverse((o) => {
        if (o instanceof THREE.Mesh) disposables.push(o.geometry);
      });
    }
  }

  return { car, wheels, disposables };
}

export function CarScene({ paint, onUnsupported, className }: CarSceneProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const paintRef = useRef<THREE.MeshPhysicalMaterial | null>(null);

  // Paint changes don't rebuild the scene: just tween the material colour.
  useEffect(() => {
    const mat = paintRef.current;
    if (!mat) return;
    const from = mat.color.clone();
    const to = new THREE.Color(paint);
    let frame = 0;
    let raf = 0;
    const step = () => {
      frame += 1;
      mat.color.copy(from).lerp(to, Math.min(1, frame / 18));
      if (frame < 18) raf = requestAnimationFrame(step);
    };
    step();
    return () => cancelAnimationFrame(raf);
  }, [paint]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
    } catch {
      onUnsupported?.();
      return;
    }

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.domElement.style.touchAction = "pan-y"; // vertical swipes still scroll the page on phones
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(renderer);
    const room = new RoomEnvironment();
    const envMap = pmrem.fromScene(room, 0.04).texture;
    scene.environment = envMap;

    const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
    camera.position.set(6.2, 2.4, 6.2);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 0.7, 0);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.enableZoom = false;
    controls.enablePan = false;
    controls.minPolarAngle = Math.PI * 0.28;
    controls.maxPolarAngle = Math.PI * 0.48;
    controls.autoRotate = !reduceMotion;
    controls.autoRotateSpeed = 1.2;

    // Lights: environment for reflections, plus a key light that casts the shadow.
    scene.add(new THREE.HemisphereLight(0xffffff, 0x8899aa, 0.6));
    const key = new THREE.DirectionalLight(0xffffff, 2.2);
    key.position.set(4, 7, 3);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.left = -4;
    key.shadow.camera.right = 4;
    key.shadow.camera.top = 4;
    key.shadow.camera.bottom = -4;
    key.shadow.radius = 6;
    scene.add(key);

    const paintMat = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(paint),
      metalness: 0.55,
      roughness: 0.28,
      clearcoat: 1,
      clearcoatRoughness: 0.04,
    });
    paintRef.current = paintMat;

    const { car, wheels, disposables } = buildCar(paintMat);
    scene.add(car);

    // Turntable: soft shadow catcher plus a thin brand-yellow ring.
    const groundGeo = new THREE.CircleGeometry(3.4, 64);
    const groundMat = new THREE.ShadowMaterial({ opacity: 0.22 });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);

    const ringGeo = new THREE.RingGeometry(3.05, 3.12, 96);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xffc107, transparent: true, opacity: 0.85 });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.005;
    scene.add(ring);

    const resize = () => {
      const { clientWidth: w, clientHeight: h } = mount;
      if (!w || !h) return;
      renderer.setSize(w, h, false);
      renderer.domElement.style.width = "100%";
      renderer.domElement.style.height = "100%";
      camera.aspect = w / h;
      // Pull the camera back on narrow screens so the whole car stays in frame.
      const dist = w / h < 1 ? 12.5 : 10.2;
      const dir = camera.position.clone().sub(controls.target).normalize();
      camera.position.copy(controls.target).addScaledVector(dir, dist);
      camera.updateProjectionMatrix();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(mount);
    resize();

    // Render only while visible.
    let visible = true;
    const io = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
    });
    io.observe(mount);

    const clock = new THREE.Clock();
    let raf = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      if (!visible || document.hidden) return;
      const dt = clock.getDelta();
      const t = clock.elapsedTime;
      if (!reduceMotion) {
        car.position.y = Math.sin(t * 1.6) * 0.012; // idle "engine running" bob
        for (const w of wheels) w.rotation.z -= dt * 1.5;
      }
      controls.update();
      renderer.render(scene, camera);
    };
    tick();

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      controls.dispose();
      for (const d of disposables) d.dispose();
      paintMat.dispose();
      groundGeo.dispose();
      groundMat.dispose();
      ringGeo.dispose();
      ringMat.dispose();
      envMap.dispose();
      room.dispose();
      pmrem.dispose();
      renderer.dispose();
      renderer.domElement.remove();
      paintRef.current = null;
    };
    // The scene is built once; paint updates go through paintRef above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div ref={mountRef} className={className} />;
}
