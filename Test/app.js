import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import * as BufferGeometryUtils from "three/addons/utils/BufferGeometryUtils.js";

const loaderEl = document.getElementById("loader");
const viewEl = document.getElementById("view");
function viewW() { return viewEl.clientWidth || window.innerWidth; }
function viewH() { return viewEl.clientHeight || window.innerHeight; }
function pointerFromEvent(e) {
  const r = renderer.domElement.getBoundingClientRect();
  pointer.x = ((e.clientX - r.left) / r.width) * 2 - 1;
  pointer.y = -((e.clientY - r.top) / r.height) * 2 + 1;
}
const countEl = document.getElementById("count");

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x141a26);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
renderer.setSize(viewW(), viewH());
viewEl.appendChild(renderer.domElement);

const HOME_POS = new THREE.Vector3(290.064, 208.357, 90.812);
const HOME_TARGET = new THREE.Vector3(202.966, -16.992, -63.327);
const LOCATIONS = {
  floor1: { pos: HOME_POS, target: HOME_TARGET },
  hall1: {
    pos: new THREE.Vector3(125.957, 141.862, -58.907),
    target: new THREE.Vector3(125.957, -12.994, -58.957),
  },
  hall2: {
    pos: new THREE.Vector3(304.556, 129.271, -101.007),
    target: new THREE.Vector3(304.556, -17.841, -101.007),
    rotZ: 0.9707,
  },
  lobby: {
    pos: new THREE.Vector3(257.622, 142.966, -51.942),
    target: new THREE.Vector3(257.622, -28.619, -51.942),
    rotZ: 0.4853,
  },
};

const camera = new THREE.PerspectiveCamera(40, viewW() / viewH(), 0.1, 200000);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableRotate = true;
controls.enableDamping = false;
controls.screenSpacePanning = true;
controls.zoomToCursor = true;
controls.mouseButtons.LEFT = THREE.MOUSE.PAN;
controls.mouseButtons.RIGHT = THREE.MOUSE.ROTATE;
controls.minPolarAngle = 0.08;
controls.maxPolarAngle = Math.PI * 0.48;
controls.touches.ONE = THREE.TOUCH.PAN;

scene.add(new THREE.HemisphereLight(0xd5dce8, 0x1a1e26, 0.7));
const key = new THREE.DirectionalLight(0xffffff, 1.05);
scene.add(key);

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const fixtures = [];
let lightMesh = null;

init();

async function init() {
  try {
    loaderEl.textContent = "Загрузка модели…";
    const gltf = await new GLTFLoader().loadAsync("./floor1.glb");
    loaderEl.textContent = "Собираю стены и свет…";
    const building = buildScene(gltf.scene);
    scene.add(building);

    const box = new THREE.Box3().setFromObject(building);
    addGroundGrid(building, box);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    fitCamera(box, size, center);
    key.position.set(center.x + size.x * 0.25, box.max.y + size.y + 400, center.z + size.z * 0.45);
    key.target.position.copy(center);
    scene.add(key.target);
    if (countEl) countEl.textContent = "Светильников: " + fixtures.length;
    loaderEl.classList.add("hidden");
    window.__READY = true;
  } catch (err) {
    loaderEl.textContent = "Error: " + (err?.message || err);
    console.error(err);
  }
}

function fixtureName(obj) {
  let n = obj;
  while (n) {
    if (n.name && n.name.startsWith("D-")) return n.name;
    n = n.parent;
  }
  return null;
}

function meshToGeo(child) {
  const pos = child.geometry?.attributes?.position;
  if (!child.isMesh || !pos || pos.count < 3) return null;
  const src = child.geometry.index ? child.geometry.toNonIndexed() : child.geometry;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", src.attributes.position.clone());
  geo.applyMatrix4(child.matrixWorld);
  return geo;
}

function buildScene(root) {
  uprightToY(root);
  root.updateMatrixWorld(true);

  const wallGeos = [];
  const lightGeos = [];

  root.traverse((child) => {
    const geo = meshToGeo(child);
    if (!geo) return;
    const name = fixtureName(child);
    if (name) {
      const box = new THREE.Box3().setFromBufferAttribute(geo.attributes.position);
      const start = lightGeos.reduce((s, g) => s + g.attributes.position.count, 0);
      fixtures.push({
        name,
        on: true,
        level: 1,
        hover: 0,
        targetHover: 0,
        selected: false,
        start,
        count: geo.attributes.position.count,
        center: box.getCenter(new THREE.Vector3()),
      });
      lightGeos.push(geo);
    } else {
      wallGeos.push(geo);
    }
  });

  const group = new THREE.Group();
  if (wallGeos.length) {
    const merged = BufferGeometryUtils.mergeGeometries(wallGeos, false);
    wallGeos.forEach((g) => g.dispose());
    merged.computeVertexNormals();
    const wallMesh = new THREE.Mesh(
      merged,
      new THREE.MeshLambertMaterial({ color: 0x8fa0ba, side: THREE.DoubleSide, transparent: true, opacity: 0.45, depthWrite: false }),
    );
    wallMesh.name = "walls";
    group.add(wallMesh);
  }

  if (lightGeos.length) {
    const merged = BufferGeometryUtils.mergeGeometries(lightGeos, false);
    lightGeos.forEach((g) => g.dispose());
    const colors = new Float32Array(merged.attributes.position.count * 3);
    colors.fill(0);
    for (let i = 0; i < colors.length; i += 3) {
      colors[i] = 1;
      colors[i + 1] = 0.42;
      colors[i + 2] = 0.04;
    }
    merged.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    lightMesh = new THREE.Mesh(
      merged,
      new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide }),
    );
    group.add(lightMesh);
  }

  root.traverse((child) => child.geometry?.dispose());
  return group;
}

function mixCol(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}
const COL_OFF = [0.12, 0.07, 0.02];
const COL_ON = [1, 0.42, 0.04];
const COL_HOV = [1, 0.62, 0.14];
function baseColor(fix) {
  return fix.on ? mixCol(COL_OFF, COL_ON, fix.level) : COL_OFF;
}
function hoverColor(fix) {
  return fix.on ? mixCol(COL_OFF, COL_HOV, fix.level) : [0.28, 0.16, 0.05];
}
function paintFixture(fix) {
  if (!lightMesh) return;
  const col = lightMesh.geometry.attributes.color;
  const a = baseColor(fix);
  const b = hoverColor(fix);
  const k = fix.hover;
  const r = a[0] + (b[0] - a[0]) * k;
  const g = a[1] + (b[1] - a[1]) * k;
  const bl = a[2] + (b[2] - a[2]) * k;
  for (let i = 0; i < fix.count; i++) {
    const p = (fix.start + i) * 3;
    col.array[p] = r;
    col.array[p + 1] = g;
    col.array[p + 2] = bl;
  }
  col.needsUpdate = true;
}
function setFixture(fix, on) {
  fix.on = on;
  paintFixture(fix);
}
function setLevel(fix, level) {
  fix.level = Math.min(1, Math.max(0, level));
  fix.on = fix.level > 0.005;
  paintFixture(fix);
}
function groupFor(fix) {
  if (fix.selected) return fixtures.filter((f) => f.selected);
  return [fix];
}
function setLevelAll(list, level) {
  for (const f of list) setLevel(f, level);
}

const ripples = [];
function spawnRipple(fix) {
  const src = lightMesh.geometry.attributes.position.array;
  const arr = new Float32Array(fix.count * 3);
  const c = fix.center;
  for (let i = 0; i < fix.count; i++) {
    const o = (fix.start + i) * 3;
    arr[i * 3] = src[o] - c.x;
    arr[i * 3 + 1] = src[o + 1] - c.y;
    arr[i * 3 + 2] = src[o + 2] - c.z;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(arr, 3));
  const edges = new THREE.EdgesGeometry(geo, 20);
  geo.dispose();
  const mat = new THREE.LineBasicMaterial({
    color: 0xfff0a0,
    transparent: true,
    opacity: 0.95,
    depthWrite: false,
  });
  const mesh = new THREE.LineSegments(edges, mat);
  mesh.position.copy(c);
  mesh.renderOrder = 5;
  mesh.userData.age = 0;
  scene.add(mesh);
  ripples.push(mesh);
}
function updateRipples(dt) {
  const life = 1.3;
  for (let i = ripples.length - 1; i >= 0; i--) {
    const m = ripples[i];
    m.userData.age += dt;
    const k = m.userData.age / life;
    if (k >= 1) {
      scene.remove(m);
      m.geometry.dispose();
      m.material.dispose();
      ripples.splice(i, 1);
      continue;
    }
    m.scale.setScalar(1 + k * 5);
    m.material.opacity = 0.95 * (1 - k) * (1 - k);
  }
}
function pickFixture(e) {
  if (!lightMesh) return null;
  pointerFromEvent(e);
  raycaster.setFromCamera(pointer, camera);
  const hit = raycaster.intersectObject(lightMesh, false)[0];
  if (!hit) return null;
  const idx = hit.face ? hit.face.a : hit.index;
  return fixtures.find((f) => idx >= f.start && idx < f.start + f.count) || null;
}

function uprightToY(root) {
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
  const size = box.getSize(new THREE.Vector3());
  if (size.z < size.x && size.z < size.y) {
    root.rotation.x = -Math.PI / 2;
    root.updateMatrixWorld(true);
  } else if (size.x < size.y && size.x < size.z) {
    root.rotation.z = Math.PI / 2;
    root.updateMatrixWorld(true);
  }
}

function fitCamera(box, size, center) {
  const onResize = () => {
    camera.aspect = viewW() / viewH();
    camera.updateProjectionMatrix();
    renderer.setSize(viewW(), viewH());
  };
  onResize();
  const aspect = viewW() / Math.max(viewH(), 1);
  const fov = THREE.MathUtils.degToRad(camera.fov);
  const half = Math.tan(fov / 2);
  const pad = 1.28;
  let dist = Math.max((size.z * pad) / (2 * half), (size.x * pad) / (2 * half * aspect));
  camera.near = Math.max(dist / 200, 0.1);
  camera.far = dist * 8;
  camera.up.set(0, 1, 0);
  applyLocation("floor1", true);
  camera.updateProjectionMatrix();
  dist = camera.position.distanceTo(controls.target);
  controls.minDistance = dist * 0.08;
  controls.maxDistance = dist * 8;
  controls.update();

  window.addEventListener("resize", onResize);
  new ResizeObserver(onResize).observe(viewEl);
}

function locPose(loc) {
  const target = loc.target.clone();
  const offset = new THREE.Vector3().subVectors(loc.pos, loc.target);
  const spherical = new THREE.Spherical().setFromVector3(offset);
  if (loc.rotZ != null) spherical.theta = loc.rotZ;
  if (spherical.phi < 0.02) spherical.phi = 0.02;
  spherical.makeSafe();
  const pos = target.clone().add(offset.setFromSpherical(spherical));
  return { pos, target, flat: spherical.phi < 0.08 };
}

let fly = null;
const _flyOff = new THREE.Vector3();

function applyPose(dest) {
  camera.up.set(0, 1, 0);
  camera.position.copy(dest.pos);
  controls.target.copy(dest.target);
  camera.lookAt(controls.target);
  controls.minPolarAngle = dest.flat ? 0 : 0.08;
  controls.enabled = true;
  if (controls._scale != null) controls._scale = 1;
  if (controls._panOffset) controls._panOffset.set(0, 0, 0);
  if (controls._sphericalDelta) controls._sphericalDelta.set(0, 0, 0);
}

function applyLocation(id, instant) {
  const loc = LOCATIONS[id];
  if (!loc) return;
  const dest = locPose(loc);
  if (instant) {
    fly = null;
    applyPose(dest);
    return;
  }
  const startTarget = controls.target.clone();
  const s0 = new THREE.Spherical().setFromVector3(_flyOff.subVectors(camera.position, startTarget));
  const s1 = new THREE.Spherical().setFromVector3(_flyOff.subVectors(dest.pos, dest.target));
  let dTheta = s1.theta - s0.theta;
  while (dTheta > Math.PI) dTheta -= Math.PI * 2;
  while (dTheta < -Math.PI) dTheta += Math.PI * 2;
  const horiz = Math.hypot(dest.target.x - startTarget.x, dest.target.z - startTarget.z)
    + Math.hypot(dest.pos.x - camera.position.x, dest.pos.z - camera.position.z);
  if (horiz < 0.4) {
    applyPose(dest);
    return;
  }
  camera.up.set(0, 1, 0);
  controls.minPolarAngle = 0;
  controls.enabled = false;
  fly = {
    t: 0,
    dur: THREE.MathUtils.clamp(0.8 + horiz / 170, 0.9, 2.4) / 1.5,
    startTarget,
    destTarget: dest.target,
    r0: s0.radius,
    r1: s1.radius,
    phi0: Math.max(0.02, s0.phi),
    phi1: Math.max(0.02, s1.phi),
    theta0: s0.theta,
    theta1: s0.theta + dTheta,
    lift: Math.max(12, horiz * 0.45),
    dest,
  };
}

function easeInOut(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function updateFly(dt) {
  if (!fly) return;
  fly.t += dt;
  const e = easeInOut(Math.min(1, fly.t / fly.dur));
  const sph = new THREE.Spherical(
    THREE.MathUtils.lerp(fly.r0, fly.r1, e) + fly.lift * Math.sin(Math.PI * e),
    THREE.MathUtils.lerp(fly.phi0, fly.phi1, e),
    THREE.MathUtils.lerp(fly.theta0, fly.theta1, e),
  );
  controls.target.lerpVectors(fly.startTarget, fly.destTarget, e);
  camera.position.copy(controls.target).add(_flyOff.setFromSpherical(sph));
  camera.lookAt(controls.target);
  if (fly.t >= fly.dur) {
    applyPose(fly.dest);
    fly = null;
  }
}

function applyHomeView() {
  applyLocation("floor1");
}

function applyTopView() {
  camera.up.set(0, 1, 0);
  controls.minPolarAngle = 0;
  const offset = new THREE.Vector3().subVectors(camera.position, controls.target);
  const spherical = new THREE.Spherical().setFromVector3(offset);
  spherical.phi = 0.02;
  spherical.makeSafe();
  camera.position.copy(controls.target).add(offset.setFromSpherical(spherical));
  camera.lookAt(controls.target);
  controls.update();
}

function setActiveLoc(id) {
  document.querySelectorAll(".loc").forEach((b) => b.classList.toggle("active", b.dataset.loc === id));
}

document.getElementById("camCopy")?.addEventListener("click", async () => {
  const f = (v) => v.x.toFixed(3) + "  " + v.y.toFixed(3) + "  " + v.z.toFixed(3);
  const text = "pos     " + f(camera.position) + "\ntarget  " + f(controls.target) + "\nrotZ    " + controls.getAzimuthalAngle().toFixed(4);
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    ta.remove();
  }
  const btn = document.getElementById("camCopy");
  if (!btn) return;
  btn.textContent = "Скопировано";
  setTimeout(() => { btn.textContent = "Координаты"; }, 1200);
});

document.getElementById("camHome")?.addEventListener("click", () => {
  applyHomeView();
  setActiveLoc("floor1");
});
document.getElementById("camTop")?.addEventListener("click", applyTopView);
document.querySelectorAll(".loc").forEach((btn) => {
  btn.addEventListener("click", () => {
    applyLocation(btn.dataset.loc);
    setActiveLoc(btn.dataset.loc);
  });
});

const dimmerEl = document.getElementById("dimmer");
const dimmerRange = document.getElementById("dimmerRange");
const dimmerVal = document.getElementById("dimmerVal");
let dimmerFix = null;
let dimmerGroup = null;
let holdTimer = null;
let press = null;

function hideDimmer() {
  dimmerFix = null;
  dimmerGroup = null;
  dimmerEl?.classList.remove("show");
}
function fixtureScreen(fix) {
  const v = fix.center.clone().project(camera);
  const r = viewEl.getBoundingClientRect();
  return {
    x: (v.x * 0.5 + 0.5) * r.width,
    y: (-v.y * 0.5 + 0.5) * r.height,
  };
}
function showDimmer(fix) {
  dimmerFix = fix;
  dimmerEl.classList.add("show");
  syncDimmerUi(fix.level);
  const p = fixtureScreen(fix);
  const view = viewEl.getBoundingClientRect();
  const w = dimmerEl.offsetWidth;
  const h = dimmerEl.offsetHeight;
  const trackTop = dimmerRange.offsetTop;
  const trackH = dimmerRange.offsetHeight;
  const thumbY = trackTop + (1 - fix.level) * trackH;
  let x = p.x - w - 12;
  let y = p.y - thumbY;
  x = Math.min(view.width - w - 8, Math.max(8, x));
  y = Math.min(view.height - h - 8, Math.max(8, y));
  dimmerEl.style.left = x + "px";
  dimmerEl.style.top = y + "px";
}
function levelFromPointer(clientY) {
  const track = dimmerRange.getBoundingClientRect();
  return Math.min(1, Math.max(0, (track.bottom - clientY) / track.height));
}
function syncDimmerUi(level) {
  const v = Math.round(level * 100);
  if (dimmerRange) dimmerRange.value = String(v);
  if (dimmerVal) dimmerVal.textContent = v + "%";
}
const marqueeEl = document.getElementById("marquee");
const lassoSvg = document.getElementById("lassoSvg");
const lassoLine = document.getElementById("lassoLine");
const lassoFill = document.getElementById("lassoFill");
const selTools = document.getElementById("selTools");
let selMode = "rect";
let boxSel = null;
let lasso = null;

function setSelMode(mode) {
  selMode = mode;
  document.getElementById("selRect")?.classList.toggle("active", mode === "rect");
  document.getElementById("selLasso")?.classList.toggle("active", mode === "lasso");
}
setSelMode("rect");
function showSelTools() { selTools?.classList.add("show"); }
function hideSelTools() {
  if (boxSel || lasso) return;
  selTools?.classList.remove("show");
}
window.addEventListener("keydown", (e) => {
  if (e.key === "Shift") showSelTools();
});
window.addEventListener("keyup", (e) => {
  if (e.key === "Shift") hideSelTools();
});
document.getElementById("selRect")?.addEventListener("pointerdown", (e) => {
  e.stopPropagation();
  setSelMode("rect");
});
document.getElementById("selLasso")?.addEventListener("pointerdown", (e) => {
  e.stopPropagation();
  setSelMode("lasso");
});

function viewPoint(e) {
  const r = viewEl.getBoundingClientRect();
  return { x: e.clientX - r.left, y: e.clientY - r.top };
}
function applyHover(hoverFix) {
  fixtures.forEach((f) => { f.targetHover = f.selected || f === hoverFix ? 1 : 0; });
}
function clearSelection() {
  fixtures.forEach((f) => { f.selected = false; });
  applyHover(null);
}
function updateMarquee() {
  if (!boxSel || !marqueeEl) return;
  const x = Math.min(boxSel.x0, boxSel.x1);
  const y = Math.min(boxSel.y0, boxSel.y1);
  const w = Math.abs(boxSel.x1 - boxSel.x0);
  const h = Math.abs(boxSel.y1 - boxSel.y0);
  marqueeEl.style.left = x + "px";
  marqueeEl.style.top = y + "px";
  marqueeEl.style.width = w + "px";
  marqueeEl.style.height = h + "px";
  marqueeEl.classList.add("show");
  for (const f of fixtures) {
    const p = fixtureScreen(f);
    f.selected = p.x >= x && p.x <= x + w && p.y >= y && p.y <= y + h;
  }
  applyHover(null);
}
function endBoxSel() {
  boxSel = null;
  marqueeEl?.classList.remove("show");
  if (!fly) controls.enabled = true;
  hideSelTools();
}

function ptsAttr(pts) {
  return pts.map((p) => p.x + "," + p.y).join(" ");
}
function inPoly(x, y, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const xi = pts[i].x, yi = pts[i].y, xj = pts[j].x, yj = pts[j].y;
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
function updateLasso() {
  if (!lasso?.pts.length) return;
  const pts = ptsAttr(lasso.pts);
  if (lassoLine) lassoLine.setAttribute("points", pts);
  if (lassoFill) lassoFill.setAttribute("points", pts);
  lassoSvg?.classList.add("show");
  const poly = lasso.pts;
  if (poly.length > 2) {
    for (const f of fixtures) {
      const p = fixtureScreen(f);
      f.selected = inPoly(p.x, p.y, poly);
    }
    applyHover(null);
  }
}
function endLasso() {
  lasso = null;
  lassoSvg?.classList.remove("show");
  if (lassoLine) lassoLine.setAttribute("points", "");
  if (lassoFill) lassoFill.setAttribute("points", "");
  if (!fly) controls.enabled = true;
  hideSelTools();
}

function clearHold() {
  if (holdTimer) {
    clearTimeout(holdTimer);
    holdTimer = null;
  }
}

renderer.domElement.addEventListener("pointerdown", (e) => {
  clearHold();
  hideDimmer();
  if (e.button === 0 && e.shiftKey) {
    e.stopImmediatePropagation();
    const p = viewPoint(e);
    press = { x: e.clientX, y: e.clientY, id: e.pointerId, fix: null, held: false, box: true };
    if (!fly) controls.enabled = false;
    renderer.domElement.setPointerCapture?.(e.pointerId);
    if (selMode === "lasso") {
      lasso = { pts: [p] };
      updateLasso();
    } else {
      boxSel = { x0: p.x, y0: p.y, x1: p.x, y1: p.y };
      updateMarquee();
    }
    return;
  }
  const fix = e.button === 0 ? pickFixture(e) : null;
  press = { x: e.clientX, y: e.clientY, id: e.pointerId, fix, held: false };
  if (fix) {
    e.stopImmediatePropagation();
    if (!fly) controls.enabled = false;
    holdTimer = setTimeout(() => {
      if (!press?.fix) return;
      press.held = true;
      dimmerGroup = groupFor(press.fix);
      if (dimmerGroup.every((f) => !f.on)) {
        for (const f of dimmerGroup) {
          f.level = 0;
          f.on = false;
          paintFixture(f);
        }
      }
      showDimmer(press.fix);
      renderer.domElement.setPointerCapture?.(press.id);
    }, 1000);
  }
}, true);
renderer.domElement.addEventListener("pointerup", (e) => {
  if (boxSel || lasso || press?.held || press?.fix) e.stopImmediatePropagation();
  clearHold();
  if (boxSel) {
    endBoxSel();
    press = null;
    return;
  }
  if (lasso) {
    endLasso();
    press = null;
    return;
  }
  if (!fly) controls.enabled = true;
  if (!press || !lightMesh) { press = null; hideDimmer(); return; }
  const held = press.held;
  const fix = press.fix;
  const dx = e.clientX - press.x;
  const dy = e.clientY - press.y;
  press = null;
  if (held) {
    hideDimmer();
    clearSelection();
    return;
  }
  if (dx * dx + dy * dy > 25) return;
  if (!fix) {
    clearSelection();
    return;
  }
  const group = groupFor(fix);
  const on = !fix.on;
  for (const f of group) setFixture(f, on);
  spawnRipple(fix);
  clearSelection();
}, true);
renderer.domElement.addEventListener("pointercancel", () => {
  clearHold();
  if (boxSel) endBoxSel();
  if (lasso) endLasso();
  if (!fly) controls.enabled = true;
  press = null;
  hideDimmer();
});
renderer.domElement.addEventListener("pointermove", (e) => {
  if (boxSel) {
    e.stopImmediatePropagation();
    const p = viewPoint(e);
    boxSel.x1 = p.x;
    boxSel.y1 = p.y;
    updateMarquee();
    return;
  }
  if (lasso) {
    e.stopImmediatePropagation();
    const p = viewPoint(e);
    const last = lasso.pts[lasso.pts.length - 1];
    if ((p.x - last.x) ** 2 + (p.y - last.y) ** 2 > 9) lasso.pts.push(p);
    updateLasso();
    return;
  }
  if (press?.held && dimmerFix) {
    e.stopImmediatePropagation();
    const next = levelFromPointer(e.clientY);
    setLevelAll(dimmerGroup || [dimmerFix], next);
    syncDimmerUi(next);
    return;
  }
  if (press && press.fix && (e.clientX - press.x) ** 2 + (e.clientY - press.y) ** 2 > 25) {
    clearHold();
    press.fix = null;
    if (!fly) controls.enabled = true;
  }
  applyHover(pickFixture(e));
}, true);
renderer.domElement.addEventListener("pointerleave", () => {
  applyHover(null);
});

let lastT = performance.now();
function tick(now) {
  const dt = Math.min(0.05, (now - lastT) / 1000);
  lastT = now;
  let dirty = false;
  for (const f of fixtures) {
    const spd = f.targetHover > f.hover ? 8 : 2;
    const next = f.hover + (f.targetHover - f.hover) * Math.min(1, dt * spd);
    if (Math.abs(next - f.hover) > 0.002) {
      f.hover = next;
      paintFixture(f);
      dirty = true;
    } else if (f.hover !== f.targetHover) {
      f.hover = f.targetHover;
      paintFixture(f);
    }
  }
  updateRipples(dt);
  updateFly(dt);
  if (!fly) controls.update();
  renderer.render(scene, camera);
  requestAnimationFrame(tick);
}
tick();

function tickClock() {
  const el = document.getElementById("clock");
  if (!el) return;
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  el.textContent = p(d.getHours()) + ":" + p(d.getMinutes()) + ":" + p(d.getSeconds()) + "  " + p(d.getDate()) + "/" + p(d.getMonth() + 1) + "/" + d.getFullYear();
}
tickClock();
setInterval(tickClock, 1000);


function addGroundGrid(building, box) {
  const walls = building.getObjectByName("walls");
  if (!walls?.geometry?.attributes?.position) return;

  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const span = Math.max(size.x, size.z);
  const extent = span * 1.9;
  const worldMin = new THREE.Vector2(center.x - extent / 2, center.z - extent / 2);
  const worldMax = new THREE.Vector2(center.x + extent / 2, center.z + extent / 2);
  const distTex = footprintDistanceTexture(walls.geometry, worldMin, worldMax, 512);
  const cell = span / 110;

  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: {
      distMap: { value: distTex },
      gridSize: { value: cell },
      extent: { value: extent },
      fadeFar: { value: span / 8 },
      color: { value: new THREE.Color(0x7a8aa3) },
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform sampler2D distMap;
      uniform float gridSize;
      uniform float extent;
      uniform float fadeFar;
      uniform vec3 color;
      varying vec2 vUv;
      void main() {
        float d = texture2D(distMap, vUv).r * 255.0;
        if (d < 0.02) discard;
        vec2 world = vUv * extent;
        vec2 p = fract(world / gridSize) - 0.5;
        float sq = 1.0 - smoothstep(0.08, 0.10, max(abs(p.x), abs(p.y)));
        float fade = 1.0 - smoothstep(0.0, fadeFar, d);
        float alpha = sq * fade * 0.48;
        if (alpha < 0.012) discard;
        gl_FragColor = vec4(color, alpha);
      }
    `,
  });

  const geo = new THREE.PlaneGeometry(extent, extent);
  geo.rotateX(-Math.PI / 2);
  const ground = new THREE.Mesh(geo, mat);
  ground.position.set(center.x, box.min.y - 0.2, center.z);
  ground.name = "groundGrid";
  scene.add(ground);
}

function footprintDistanceTexture(geometry, worldMin, worldMax, res) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = res;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, res, res);
  ctx.fillStyle = "#fff";
  const pos = geometry.attributes.position;
  const sx = res / (worldMax.x - worldMin.x);
  const sz = res / (worldMax.y - worldMin.y);
  ctx.beginPath();
  for (let i = 0; i < pos.count; i += 3) {
    const x0 = (pos.getX(i) - worldMin.x) * sx;
    const z0 = (pos.getZ(i) - worldMin.y) * sz;
    const x1 = (pos.getX(i + 1) - worldMin.x) * sx;
    const z1 = (pos.getZ(i + 1) - worldMin.y) * sz;
    const x2 = (pos.getX(i + 2) - worldMin.x) * sx;
    const z2 = (pos.getZ(i + 2) - worldMin.y) * sz;
    ctx.moveTo(x0, z0);
    ctx.lineTo(x1, z1);
    ctx.lineTo(x2, z2);
    ctx.closePath();
    if (i % 2400 === 0) {
      ctx.fill();
      ctx.beginPath();
    }
  }
  ctx.fill();

  const img = ctx.getImageData(0, 0, res, res).data;
  const wall = new Uint8Array(res * res);
  for (let i = 0; i < wall.length; i++) wall[i] = img[i * 4] > 20 ? 1 : 0;

  const sealed = new Uint8Array(wall);
  const rad = 3;
  for (let y = 0; y < res; y++) {
    for (let x = 0; x < res; x++) {
      if (!wall[y * res + x]) continue;
      const x0 = Math.max(0, x - rad);
      const x1 = Math.min(res - 1, x + rad);
      const y0 = Math.max(0, y - rad);
      const y1 = Math.min(res - 1, y + rad);
      for (let yy = y0; yy <= y1; yy++) {
        for (let xx = x0; xx <= x1; xx++) sealed[yy * res + xx] = 1;
      }
    }
  }

  const outside = new Uint8Array(res * res);
  const stack = [];
  const seed = (i) => {
    if (sealed[i] || outside[i]) return;
    outside[i] = 1;
    stack.push(i);
  };
  for (let x = 0; x < res; x++) {
    seed(x);
    seed((res - 1) * res + x);
  }
  for (let y = 0; y < res; y++) {
    seed(y * res);
    seed(y * res + res - 1);
  }
  while (stack.length) {
    const i = stack.pop();
    const x = i % res;
    const y = (i / res) | 0;
    if (x) seed(i - 1);
    if (x < res - 1) seed(i + 1);
    if (y) seed(i - res);
    if (y < res - 1) seed(i + res);
  }

  let grow = new Uint8Array(outside);
  for (let k = 0; k < rad; k++) {
    const next = new Uint8Array(grow);
    for (let y = 0; y < res; y++) {
      for (let x = 0; x < res; x++) {
        const i = y * res + x;
        if (!grow[i]) continue;
        const nbs = [i, x ? i - 1 : i, x < res - 1 ? i + 1 : i, y ? i - res : i, y < res - 1 ? i + res : i];
        for (const j of nbs) {
          if (wall[j]) continue;
          if (sealed[j]) next[j] = 1;
        }
      }
    }
    grow = next;
  }
  for (let i = 0; i < outside.length; i++) outside[i] = grow[i];

  const INF = 1e6;
  const dist = new Float32Array(res * res);
  for (let i = 0; i < dist.length; i++) dist[i] = outside[i] ? INF : 0;
  for (let y = 0; y < res; y++) {
    for (let x = 0; x < res; x++) {
      const i = y * res + x;
      if (x) dist[i] = Math.min(dist[i], dist[i - 1] + 1);
      if (y) dist[i] = Math.min(dist[i], dist[i - res] + 1);
    }
  }
  for (let y = res - 1; y >= 0; y--) {
    for (let x = res - 1; x >= 0; x--) {
      const i = y * res + x;
      if (x < res - 1) dist[i] = Math.min(dist[i], dist[i + 1] + 1);
      if (y < res - 1) dist[i] = Math.min(dist[i], dist[i + res] + 1);
    }
  }
  const px = (worldMax.x - worldMin.x) / res;
  const rgba = new Uint8Array(res * res * 4);
  for (let i = 0; i < dist.length; i++) {
    const d = Math.min(dist[i] * px, 255);
    rgba[i * 4] = d;
    rgba[i * 4 + 3] = 255;
  }
  const tex = new THREE.DataTexture(rgba, res, res, THREE.RGBAFormat);
  tex.needsUpdate = true;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.flipY = true;
  return tex;
}
