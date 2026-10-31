/**
 * Tally in 3D — the hero mascot on ztas.io.
 *
 * Built from primitives (no model file) to match the 2D art in
 * hugo/layouts/partials/tally/tally-count.html: tomato egg body, plum
 * blindfold with knot tails, sprout, cheeks, smile, feet and the yellow
 * tally counter. Toon shading plus inverted-hull outlines keep it flat and
 * graphic like the illustrations.
 *
 * Tally eases toward the pointer — it can't see you, but it can tell where
 * you are — and clicks its counter every few seconds.
 *
 * Progressive enhancement: mountTally3D() replaces the SVG fallback inside
 * the given element only once WebGL is running. Bundled with esbuild into
 * hugo/static/js/tally3d.js (npm run build:tally3d); self-hosted, no CDN.
 */
import {
  WebGLRenderer, Scene, PerspectiveCamera, Group, Mesh, AmbientLight, DirectionalLight,
  SphereGeometry, CylinderGeometry, CapsuleGeometry, CircleGeometry, TubeGeometry,
  ConeGeometry, PlaneGeometry, CatmullRomCurve3, Vector3, Color,
  MeshToonMaterial, MeshBasicMaterial, DataTexture, RedFormat, NearestFilter,
  BackSide, DoubleSide, CanvasTexture, SRGBColorSpace,
} from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

const C = {
  tomato: '#FF6B4A', tomatoDk: '#E64A2A', plum: '#23163A', stitch: '#4B3A68',
  blush: '#FF9EC4', sun: '#FFC93C', white: '#FFFFFF',
};

// Three-band ramp: lit / mid / shade, nearest-filtered for the cel look.
function toonRamp() {
  const t = new DataTexture(new Uint8Array([110, 190, 255]), 3, 1, RedFormat);
  t.minFilter = t.magFilter = NearestFilter;
  t.generateMipmaps = false;
  t.needsUpdate = true;
  return t;
}

export function mountTally3D(host, { reducedMotion = false } = {}) {
  const ramp = toonRamp();
  const toon = (hex) => new MeshToonMaterial({ color: new Color(hex), gradientMap: ramp });
  const outlineMat = new MeshBasicMaterial({ color: C.plum, side: BackSide });

  // A mesh plus its plum outline (inverted hull, scaled up slightly).
  function inked(geometry, hex, outline = 0.045) {
    const g = new Group();
    g.add(new Mesh(geometry, toon(hex)));
    if (outline) {
      const hull = new Mesh(geometry, outlineMat);
      hull.scale.setScalar(1 + outline);
      g.add(hull);
    }
    return g;
  }

  const tally = new Group();

  // Body: an egg, a little wider at the bottom.
  const bodyGeo = new SphereGeometry(1, 64, 48);
  const p = bodyGeo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i);
    const widen = 1 + 0.1 * Math.max(0, -y);
    p.setXYZ(i, p.getX(i) * 0.98 * widen, y * 1.04, p.getZ(i) * 0.92 * widen);
  }
  bodyGeo.computeVertexNormals();
  tally.add(inked(bodyGeo, C.tomato, 0.035));

  // Blindfold: an open band hugging the head, plus knot tails at the back-right.
  const band = new Mesh(
    new CylinderGeometry(1.0, 1.0, 0.34, 72, 1, true),
    new MeshBasicMaterial({ color: C.plum, side: DoubleSide }),
  );
  band.scale.set(1.0, 1, 0.94);
  band.position.y = 0.3;
  tally.add(band);
  const stitch = new Mesh(
    new CylinderGeometry(1.012, 1.012, 0.02, 72, 1, true),
    new MeshBasicMaterial({ color: C.stitch, side: DoubleSide }),
  );
  stitch.scale.set(1.0, 1, 0.94);
  stitch.position.y = 0.33;
  tally.add(stitch);
  for (const [rz, y] of [[-0.5, 0.42], [0.45, 0.2]]) {
    const tail = new Mesh(new ConeGeometry(0.13, 0.42, 4), new MeshBasicMaterial({ color: C.plum }));
    tail.position.set(0.98, y, -0.42);
    tail.rotation.set(0, 0.5, Math.PI / 2 + rz);
    tally.add(tail);
  }

  // Sprout on top.
  const sprout = inked(new CapsuleGeometry(0.07, 0.2, 6, 12), C.tomato, 0.12);
  sprout.position.set(0.05, 1.12, 0);
  sprout.rotation.z = -0.35;
  tally.add(sprout);

  // Face (on the front, +z): cheeks, smile, highlight.
  for (const x of [-0.48, 0.48]) {
    const cheek = new Mesh(new CircleGeometry(0.15, 32), new MeshBasicMaterial({ color: C.blush }));
    cheek.scale.y = 0.58;
    cheek.position.set(x, -0.12, 0.83);
    cheek.lookAt(x * 2.2, -0.12, 3);
    tally.add(cheek);
  }
  const smile = new Mesh(
    new TubeGeometry(new CatmullRomCurve3([
      new Vector3(-0.16, -0.1, 0.9), new Vector3(0, -0.22, 0.93), new Vector3(0.16, -0.1, 0.9),
    ]), 24, 0.03, 8),
    new MeshBasicMaterial({ color: C.plum }),
  );
  tally.add(smile);
  const shine = new Mesh(
    new TubeGeometry(new CatmullRomCurve3([
      new Vector3(-0.62, 0.66, 0.5), new Vector3(-0.45, 0.82, 0.48), new Vector3(-0.25, 0.9, 0.42),
    ]), 16, 0.03, 8),
    new MeshBasicMaterial({ color: C.white, transparent: true, opacity: 0.55 }),
  );
  tally.add(shine);

  // Feet: planted on the ground, NOT part of the body. The body pivots and
  // squashes above them from the hips (see `hips` below), so they never slide.
  const feet = new Group();
  for (const x of [-0.42, 0.42]) {
    const foot = inked(new SphereGeometry(0.26, 32, 16), C.tomatoDk, 0.08);
    foot.scale.set(1, 0.5, 1.15);
    foot.position.set(x, -1.0, 0.18);
    feet.add(foot);
  }

  // Free (left) arm, as in the 2D art: a short plum curve hanging at the side,
  // hinged at the shoulder so it can swing a little.
  const leftArm = new Group();
  // Starts at the body's edge (anything further in disappears inside the egg)
  // and hangs relaxed down the side, hand resting near the hip.
  leftArm.position.set(-0.96, -0.02, 0.24);
  leftArm.add(new Mesh(
    new TubeGeometry(new CatmullRomCurve3([
      new Vector3(0, 0, 0), new Vector3(-0.1, -0.16, 0.03), new Vector3(-0.14, -0.38, 0.06), new Vector3(-0.1, -0.6, 0.08),
    ]), 24, 0.05, 8),
    new MeshBasicMaterial({ color: C.plum }),
  ));
  const leftHand = new Mesh(new SphereGeometry(0.065, 12, 8), new MeshBasicMaterial({ color: C.plum }));
  leftHand.position.set(-0.1, -0.61, 0.08);
  leftArm.add(leftHand);
  tally.add(leftArm);

  // Counter arm + the yellow tally counter, screen showing a live count.
  const arm = new Mesh(
    new TubeGeometry(new CatmullRomCurve3([
      new Vector3(0.88, -0.1, 0.25), new Vector3(1.12, -0.12, 0.42), new Vector3(1.2, -0.3, 0.55),
    ]), 16, 0.045, 8),
    new MeshBasicMaterial({ color: C.plum }),
  );
  tally.add(arm);

  const counter = new Group();
  counter.add(inked(new RoundedBoxGeometry(0.62, 0.46, 0.26, 4, 0.08), C.sun, 0.06));
  const screenCanvas = document.createElement('canvas');
  screenCanvas.width = 256;
  screenCanvas.height = 96;
  const screenTex = new CanvasTexture(screenCanvas);
  screenTex.colorSpace = SRGBColorSpace;
  const screen = new Mesh(new PlaneGeometry(0.46, 0.17), new MeshBasicMaterial({ map: screenTex }));
  screen.position.set(0, 0.06, 0.135);
  counter.add(screen);
  const button = inked(new SphereGeometry(0.07, 20, 12), C.tomato, 0.2);
  button.position.set(0.18, 0.25, 0);
  counter.add(button);
  counter.position.set(1.28, -0.42, 0.62);
  counter.rotation.set(-0.12, -0.35, 0.08);
  tally.add(counter);

  let count = 1284;
  function drawCount() {
    const g = screenCanvas.getContext('2d');
    g.fillStyle = C.white;
    g.fillRect(0, 0, 256, 96);
    g.strokeStyle = C.plum;
    g.lineWidth = 8;
    g.strokeRect(4, 4, 248, 88);
    g.fillStyle = C.plum;
    g.font = '500 54px "DM Mono", ui-monospace, monospace';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(count.toLocaleString('en-US'), 128, 52);
    screenTex.needsUpdate = true;
  }
  drawCount();
  if (document.fonts && document.fonts.load) {
    document.fonts.load('500 54px "DM Mono"').then(drawCount).catch(() => {});
  }

  // Ground shadow.
  const shadow = new Mesh(
    new CircleGeometry(0.8, 48),
    new MeshBasicMaterial({ color: C.plum, transparent: true, opacity: 0.12 }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.scale.y = 0.35;
  shadow.position.y = -1.14;

  // Scene.
  const scene = new Scene();
  // The body hangs from a hip pivot just above the feet: turning, leaning and
  // squashing all happen around that point, so the feet stay put.
  const HIP_Y = -0.92;
  const hips = new Group();
  hips.position.y = HIP_Y;
  tally.position.y = -HIP_Y;
  hips.add(tally);
  const rig = new Group();
  rig.add(hips, feet, shadow);
  // The counter sticks out on Tally's right; shift left so both fit the frame.
  rig.position.x = -0.22;
  scene.add(rig);
  scene.add(new AmbientLight(0xffffff, 1.7));
  const key = new DirectionalLight(0xffffff, 1.4);
  key.position.set(-2.5, 3, 4);
  scene.add(key);

  const camera = new PerspectiveCamera(30, 1, 0.1, 50);
  camera.position.set(0, 0.15, 7.4);
  camera.lookAt(0, 0, 0);

  const renderer = new WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = SRGBColorSpace;
  const canvas = renderer.domElement;
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', host.getAttribute('data-label') || 'Tally, a blindfolded tomato-red character, clicking a tally counter');
  canvas.style.display = 'block';
  canvas.style.width = '100%';
  canvas.style.height = '100%';

  function size() {
    const w = host.clientWidth || 1;
    const h = host.clientHeight || 1;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  // Swap the SVG fallback for the canvas.
  host.replaceChildren(canvas);
  size();

  // Pointer tracking (normalized -1..1 around the stage's center).
  const target = { x: 0, y: 0 };
  function onPointer(e) {
    const r = host.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    target.x = Math.max(-1, Math.min(1, (e.clientX - cx) / (window.innerWidth / 2)));
    target.y = Math.max(-1, Math.min(1, (e.clientY - cy) / (window.innerHeight / 2)));
  }

  if (reducedMotion) {
    rig.rotation.y = -0.2;
    renderer.render(scene, camera);
    window.addEventListener('resize', () => { size(); renderer.render(scene, camera); });
    return;
  }

  window.addEventListener('pointermove', onPointer, { passive: true });
  window.addEventListener('resize', size);

  let visible = true;
  new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; }).observe(host);

  let rotY = 0;
  let rotX = 0;
  let nextClick = performance.now() + 2200;
  let press = 0;
  const t0 = performance.now();

  function frame(now) {
    requestAnimationFrame(frame);
    if (!visible || document.hidden) return;
    const t = (now - t0) / 1000;

    // Ease toward the pointer: turn to face it, tilt a little.
    rotY += (target.x * 1.05 - rotY) * 0.06;
    rotX += (target.y * 0.4 - rotX) * 0.06;
    hips.rotation.y = rotY;
    hips.rotation.x = rotX * 0.55;
    hips.rotation.z = -rotY * 0.08; // lean into the turn

    // Idle: breathe as squash-and-stretch from the hips (volume-preserving),
    // so the body bounces while the feet stay planted.
    const s = Math.sin(t * 2.1) * 0.025;
    hips.scale.set(1 - s * 0.5, 1 + s, 1 - s * 0.5);
    sprout.rotation.z = -0.35 + Math.sin(t * 3.2) * 0.12;
    leftArm.rotation.z = Math.sin(t * 2.1 + 0.6) * 0.05;
    leftArm.rotation.x = -rotX * 0.4;

    // Click the counter every few seconds.
    if (now > nextClick) {
      count += 1;
      drawCount();
      press = 1;
      nextClick = now + 1800 + Math.random() * 2600;
    }
    press = Math.max(0, press - 0.12);
    button.position.y = 0.25 - press * 0.05;
    counter.position.y = -0.42 - press * 0.03;

    renderer.render(scene, camera);
  }
  requestAnimationFrame(frame);
}
