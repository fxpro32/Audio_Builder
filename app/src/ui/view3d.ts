// 3D view of a box, driver(s), port(s) and inserts with three.js. Units: metres (glTF/Blender default).
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import { STLExporter } from "three/examples/jsm/exporters/STLExporter.js";
import { Mesh as TriMesh, V3, bbox } from "../engine/mesh";
import { portLayout, PortLayout } from "../engine/portfit";
import type { PortGeom } from "../engine/port";

/** A free-form box: outside mesh, inside (air) mesh, drivers and ports placed on panels (metres, front face at z = 0). */
export interface FreeModel {
  outer: TriMesh; inner: TriMesh; material: "wood" | "fibreglass";
  drivers: { centres: V3[]; normal: V3; outer: number; cutout: number; depth: number };
  ports?: { centres: V3[]; normal: V3; shape: "round" | "slot"; d?: number; w?: number; h?: number; length: number; fits?: boolean }; // fits false = not drawn (red marker only)
  chord?: [V3, V3]; ring?: number; // MDF ring outer diameter (fibreglass)
}
export function meshGeometry(m: TriMesh): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  const pos = new Float32Array(m.v.length * 3); m.v.forEach((p, i) => pos.set(p, 3 * i));
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setIndex(m.t.flat()); g.computeVertexNormals(); return g;
}

export interface Model3D {
  W: number; H: number; D: number; Dtop?: number; t: number; baffleExtra?: number;
  drivers: { count: number; outer: number; cutout: number; depth: number };
  port?: { shape: "round" | "slot"; count: number; d?: number; w?: number; h?: number; length: number };
  insertVolume?: number; // m³ shown as a block at the back
  braces?: boolean;
  dividers?: number[];   // bandpass: inner walls at these fractions of the inside depth (from the front)
  driverWall?: number; // bandpass: index of the inner wall the driver sits on (undefined = front baffle)
  items?: { x: number; y: number; pr: boolean }[]; // A11: centres on the front face (x from the centre, y from the bottom), drivers and passive radiators
  prs?: { outer: number; cutout: number; depth: number }; // passive radiator sizes (m)
  // A15_TLINE: folded transmission line. Dividers (z0 = front face behind the inside face of the baffle, h = height, gap at the
  // top or bottom), terminus opening, centre line of the path (y above the inside bottom, z behind the baffle's inside face) and
  // the stuffed length along it. The right-hand side panel is drawn see-through so the folds are visible.
  tl?: { dividers: { z0: number; h: number; gapTop: boolean }[]; terminus: { where: "top" | "back"; w: number; h: number; z0: number }; path: [number, number][]; stuffLen: number };
}

export class View3D {
  renderer: THREE.WebGLRenderer; scene = new THREE.Scene(); camera: THREE.PerspectiveCamera; controls: OrbitControls;
  root = new THREE.Group(); xray = false; explode = 0; blenderMouse = true; private model?: { W: number; H: number; D: number }; private free?: FreeModel;
  constructor(private host: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
    host.appendChild(this.renderer.domElement);
    this.camera = new THREE.PerspectiveCamera(40, 1, 0.01, 100);
    this.camera.position.set(1.2, 0.8, 1.6);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.setBlenderMouse(true);
    this.scene.background = new THREE.Color(0x3a3a3a); // Blender-like viewport grey
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 1.2));
    const sun = new THREE.DirectionalLight(0xffffff, 1.6); sun.position.set(2, 3, 2); this.scene.add(sun);
    const grid = new THREE.GridHelper(4, 40, 0x555555, 0x484848); this.scene.add(grid);
    const axes = new THREE.AxesHelper(0.3); axes.position.set(-1.9, 0.001, -1.9); this.scene.add(axes);
    this.scene.add(this.root);
    new ResizeObserver(() => this.resize()).observe(host);
    host.tabIndex = 0;
    host.addEventListener("keydown", (e) => this.key(e));
    const loop = () => { if (this.disposed) return; this.controls.update(); this.renderer.render(this.scene, this.camera); requestAnimationFrame(loop); };
    loop();
  }
  get hostEl() { return this.host; }
  dispose() { this.disposed = true; this.controls.dispose(); this.renderer.dispose(); this.renderer.forceContextLoss(); }
  private disposed = false;
  setBlenderMouse(on: boolean) {
    this.blenderMouse = on;
    // Blender: middle-drag orbit, Shift+middle pan, wheel zoom. Left-drag orbit is kept for laptops/touchpads.
    this.controls.mouseButtons = on
      ? { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.ROTATE, RIGHT: THREE.MOUSE.PAN }
      : { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };
    const dom = this.renderer.domElement;
    dom.onpointerdown = (e) => { if (on && e.button === 1 && e.shiftKey) this.controls.mouseButtons.MIDDLE = THREE.MOUSE.PAN; };
    dom.onpointerup = () => { if (on) this.controls.mouseButtons.MIDDLE = THREE.MOUSE.ROTATE; };
  }
  private resize() {
    const w = this.host.clientWidth, h = Math.max(200, this.host.clientHeight);
    this.renderer.setSize(w, h, false); this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
  }
  /** Blender numpad views: 1 front, 3 right, 7 top, 9 opposite (back), 0/5 = reset perspective. Ctrl = opposite side. */
  key(e: KeyboardEvent) {
    const m = this.model; if (!m) return;
    const r = Math.max(m.W, m.H, m.D) * 2.6, cy = m.H / 2;
    const k = e.key, opp = e.ctrlKey ? -1 : 1;
    const set = (x: number, y: number, z: number) => { this.camera.position.set(x, y, z); this.controls.target.set(0, cy, 0); };
    if (k === "1") set(0, cy, r * opp); else if (k === "3") set(r * opp, cy, 0); else if (k === "7") set(0, cy + r * opp, 0.0001);
    else if (k === "9") set(0, cy, -r); else if (k === "5" || k === "0" || k === "Home") this.frame();
    else if (k === "x" || k === "X") { this.xray = !this.xray; this.rebuild(); }
    else return;
    e.preventDefault();
  }
  frame() {
    const m = this.model; if (!m) return;
    const r = Math.max(m.W, m.H, m.D);
    this.controls.target.set(0, m.H / 2, 0);
    this.camera.position.set(r * 1.6, m.H / 2 + r * 1.0, r * 2.0);
  }
  build(m: Model3D) {
    const first = !this.model; this.model = m; this.free = undefined; this.lastClassic = m;
    this.root.clear();
    const wood = new THREE.MeshStandardMaterial({ color: 0xb08a5a, roughness: 0.8, transparent: this.xray, opacity: this.xray ? 0.25 : 1, side: THREE.DoubleSide, depthWrite: !this.xray });
    const baffleMat = wood.clone(); baffleMat.color.set(0x9c7a4e);
    const ex = this.explode;
    const { W, H, D, t } = m; const Dt = m.Dtop ?? D; const bx = m.baffleExtra ?? 0;
    const front = D / 2; // z of front face; box centred in z on the bottom depth
    const add = (mesh: THREE.Object3D, name: string, off: THREE.Vector3) => { mesh.name = name; mesh.position.add(off.multiplyScalar(ex)); this.root.add(mesh); };
    // Side panels: trapezoid profile in (z, y), extruded along x by t
    const sideShape = new THREE.Shape();
    sideShape.moveTo(front, 0); sideShape.lineTo(front - D, 0); sideShape.lineTo(front - Dt, H); sideShape.lineTo(front, H); sideShape.closePath();
    const seeThrough = wood.clone(); seeThrough.transparent = true; seeThrough.opacity = 0.18; seeThrough.depthWrite = false;
    for (const s of [-1, 1]) {
      const g = new THREE.ExtrudeGeometry(sideShape, { depth: t, bevelEnabled: false });
      const mesh = new THREE.Mesh(g, m.tl && s > 0 ? seeThrough : wood); mesh.rotation.y = -Math.PI / 2; // shape x→ -z… map: after rotation, shape x along z
      mesh.position.x = s < 0 ? -W / 2 + t : W / 2;
      add(mesh, s < 0 ? "Side_Left" : "Side_Right", new THREE.Vector3(s * 0.15, 0, 0));
    }
    const Wi = W - 2 * t;
    // bottom and top
    const bottom = new THREE.Mesh(new THREE.BoxGeometry(Wi, t, D), wood); bottom.position.set(0, t / 2, front - D / 2); add(bottom, "Bottom", new THREE.Vector3(0, -0.15, 0));
    const top = new THREE.Mesh(new THREE.BoxGeometry(Wi, t, Dt), wood); top.position.set(0, H - t / 2, front - Dt / 2); add(top, "Top", new THREE.Vector3(0, 0.15, 0));
    // back (sloped if wedge)
    const Hi = H - 2 * t; const dz = D - Dt; const backLen = Math.hypot(Hi, dz);
    const back = new THREE.Mesh(new THREE.BoxGeometry(Wi, backLen, t), wood);
    back.position.set(0, H / 2, front - (D + Dt) / 2 + t / 2); back.rotation.x = Math.atan2(dz, Hi); add(back, "Back", new THREE.Vector3(0, 0, -0.15));
    // front baffle with holes
    const tb = t + bx;
    const shape = new THREE.Shape(); shape.moveTo(-Wi / 2, t); shape.lineTo(Wi / 2, t); shape.lineTo(Wi / 2, H - t); shape.lineTo(-Wi / 2, H - t); shape.closePath();
    const n = Math.max(1, m.drivers.count);
    const portZone = m.port ? (m.port.shape === "slot" ? (m.port.h ?? 0) + t : 0) : 0; // slot opening + its top board
    const usableH = Hi - portZone;
    const centres: THREE.Vector2[] = []; const prCentres: THREE.Vector2[] = [];
    const vertical = usableH >= Wi;
    if (m.items?.length) for (const it of m.items) (it.pr ? prCentres : centres).push(new THREE.Vector2(it.x, it.y)); // A11: baffle layout from engine/autosize.ts
    else for (let i = 0; i < n; i++) {
      const f = (i + 0.5) / n;
      centres.push(vertical ? new THREE.Vector2(0, t + portZone + usableH * f) : new THREE.Vector2(-Wi / 2 + Wi * f, t + portZone + usableH / 2));
    }
    const rc = m.drivers.cutout / 2;
    if (m.driverWall === undefined) for (const c of centres) { const h = new THREE.Path(); h.absarc(c.x, c.y, rc, 0, Math.PI * 2, true); shape.holes.push(h); }
    if (m.prs) for (const c of prCentres) { const h = new THREE.Path(); h.absarc(c.x, c.y, m.prs.cutout / 2, 0, Math.PI * 2, true); shape.holes.push(h); }
    // ports: laid out by engine/portfit.ts (straight, or folded along the bottom and up the back); never drawn outside the box
    const lay = m.port ? portLayout({ W, H, D, Dtop: m.Dtop, t, baffleExtra: bx }, m.port as PortGeom) : undefined;
    this.portLayout = lay;
    if (m.port && lay && lay.fits) {
      const p = m.port;
      for (const x of lay.xs) {
        const hp = new THREE.Path();
        if (p.shape === "round") hp.absarc(x, lay.yc, p.d! / 2, 0, Math.PI * 2, true);
        else { const x0 = x - lay.w / 2; hp.moveTo(x0, t); hp.lineTo(x0, t + p.h!); hp.lineTo(x0 + lay.w, t + p.h!); hp.lineTo(x0 + lay.w, t); hp.closePath(); }
        shape.holes.push(hp);
      }
    }
    const baffle = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: tb, bevelEnabled: false }), baffleMat);
    baffle.position.z = front - tb; add(baffle, "Front_Baffle", new THREE.Vector3(0, 0, 0.2));
    if (m.port && lay && lay.fits) {
      const p = m.port; const tubeMat = new THREE.MeshStandardMaterial({ color: 0x222222, side: THREE.DoubleSide });
      const exOff = () => new THREE.Vector3(0, 0.05, 0.2);
      // board from (x, y, s) ranges; s = depth from the outer front face
      const board = (x0: number, x1: number, y0: number, y1: number, s0: number, s1: number, name: string) => {
        if (x1 - x0 < 1e-6 || y1 - y0 < 1e-6 || s1 - s0 < 1e-6) return;
        const b = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, y1 - y0, s1 - s0), wood); b.position.set((x0 + x1) / 2, (y0 + y1) / 2, front - (s0 + s1) / 2); add(b, name, exOff());
      };
      if (p.shape === "round") {
        const r = p.d! / 2; const sEnd = lay.mode === "folded" ? lay.sBend : p.length;
        for (const x of lay.xs) {
          const g = new THREE.CylinderGeometry(r, r, sEnd, 40, 1, true);
          const tube = new THREE.Mesh(g, tubeMat); tube.rotation.x = Math.PI / 2; tube.position.set(x, lay.yc, front - sEnd / 2); add(tube, "Port_Tube", new THREE.Vector3(0, 0, 0.2));
          if (lay.mode === "folded") {
            const up = new THREE.Mesh(new THREE.CylinderGeometry(r, r, lay.L2, 40, 1, true), tubeMat); up.position.set(x, lay.yc + lay.L2 / 2, front - lay.sBend); add(up, "Port_Tube_Up", new THREE.Vector3(0, 0, 0.2));
            const elbow = new THREE.Mesh(new THREE.SphereGeometry(r, 24, 12), tubeMat); elbow.position.set(x, lay.yc, front - lay.sBend); add(elbow, "Port_Elbow", new THREE.Vector3(0, 0, 0.2));
          }
        }
      } else {
        const h = p.h!; const n = lay.xs.length; const xL = -Wi / 2; const used = n * lay.w + (n - 1) * t; const xR = Math.min(Wi / 2, xL + used + (used < Wi - 1e-4 ? t : 0));
        const folded = lay.mode === "folded"; const sFrontLeg = lay.sBend - h / 2; // front face of the vertical channel
        // top board over the horizontal channel
        board(xL, xR, t + h, t + h + t, tb, folded ? sFrontLeg - t : p.length, "Port_Slot_Wall");
        if (folded) {
          board(xL, xR, t + h, lay.yEnd, sFrontLeg - t, sFrontLeg, "Port_Slot_Wall_Up");
          if (lay.rearBoard) board(xL, xR, t, lay.yEnd, lay.sBend + h / 2, lay.sBend + h / 2 + t, "Port_Slot_Rear_Board");
        }
        // dividers between slots and a closing side board when the slots do not reach the right-hand wall
        const sides: number[] = []; for (let i = 1; i < n; i++) sides.push(xL + i * (lay.w + t) - t); if (used < Wi - 1e-4) sides.push(xL + used);
        for (const x0 of sides) {
          board(x0, x0 + t, t, t + h, tb, folded ? lay.sBend + h / 2 : p.length, "Port_Slot_Side");
          if (folded) board(x0, x0 + t, t + h, lay.yEnd, sFrontLeg, lay.sBend + h / 2, "Port_Slot_Side_Up");
        }
      }
    }
    // bandpass inner walls
    for (const fr of m.dividers ?? []) {
      const Di = D - 2 * t - bx; const z = front - t - bx - Di * fr;
      const wall = new THREE.Mesh(new THREE.BoxGeometry(Wi, Hi, t), wood); wall.position.set(0, H / 2, z); add(wall, "Chamber_Wall", new THREE.Vector3(0, 0.1, 0));
    }
    // A15_TLINE: folded line: dividers, terminus opening, centre line of the path (orange; yellow where stuffed)
    if (m.tl) {
      const zIn = front - t - bx; // inside face of the baffle
      m.tl.dividers.forEach((dv, i) => {
        const b = new THREE.Mesh(new THREE.BoxGeometry(Wi, dv.h, t), wood);
        b.position.set(0, dv.gapTop ? t + dv.h / 2 : H - t - dv.h / 2, zIn - dv.z0 - t / 2); add(b, `TL_Divider_${i + 1}`, new THREE.Vector3(0, 0.1, 0));
      });
      const dark = new THREE.MeshStandardMaterial({ color: 0x111111, side: THREE.DoubleSide });
      const tm = m.tl.terminus;
      const hole = tm.where === "top" ? new THREE.Mesh(new THREE.BoxGeometry(tm.w, 0.004, tm.h), dark) : new THREE.Mesh(new THREE.BoxGeometry(tm.w, tm.h, 0.004), dark);
      if (tm.where === "top") hole.position.set(0, H + 0.002, zIn - tm.z0 - tm.h / 2); else hole.position.set(0, t + tm.h / 2, front - D - 0.002);
      add(hole, "TL_Terminus", new THREE.Vector3(0, 0, 0));
      const pts = m.tl.path.map(([y, z]) => new THREE.Vector3(0, t + y, zIn - z));
      let acc = 0; const stuffPts: THREE.Vector3[] = [pts[0]]; const restPts: THREE.Vector3[] = [];
      for (let i = 1; i < pts.length; i++) {
        const l = pts[i].distanceTo(pts[i - 1]);
        if (acc + l <= m.tl.stuffLen) stuffPts.push(pts[i]);
        else if (acc >= m.tl.stuffLen) { if (!restPts.length) restPts.push(pts[i - 1]); restPts.push(pts[i]); }
        else { const mid = pts[i - 1].clone().lerp(pts[i], (m.tl.stuffLen - acc) / l); stuffPts.push(mid); restPts.push(mid, pts[i]); }
        acc += l;
      }
      const tube = (p: THREE.Vector3[], color: number, name: string) => {
        if (p.length < 2) return; const path = new THREE.CurvePath<THREE.Vector3>(); for (let i = 1; i < p.length; i++) path.add(new THREE.LineCurve3(p[i - 1], p[i]));
        // drawn over everything (no depth test) so the whole path shows through the dividers from any angle
        const mesh = new THREE.Mesh(new THREE.TubeGeometry(path, 24 * p.length, 0.012, 8, false), new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.5, depthTest: false, transparent: true, opacity: 0.9 }));
        mesh.renderOrder = 10; add(mesh, name, new THREE.Vector3(0, 0, 0));
      };
      tube(m.tl.stuffLen > 0 ? stuffPts : [], 0xf7d154, "TL_Path_Stuffed"); tube(m.tl.stuffLen > 0 ? restPts : pts, 0xff7a1a, "TL_Path");
    }
    // drivers
    const dzDrv = m.driverWall !== undefined && m.dividers?.[m.driverWall] !== undefined ? front - t - bx - (D - 2 * t - bx) * m.dividers[m.driverWall] + t / 2 : front;
    for (const c of centres) add(driverMesh(m.drivers.outer / 2, rc, m.drivers.depth, c.x, c.y, dzDrv), "Driver", new THREE.Vector3(0, 0, 0.4));
    if (m.prs) for (const c of prCentres) add(passiveMesh(m.prs.outer / 2, m.prs.cutout / 2, m.prs.depth, c.x, c.y, front), "Passive_Radiator", new THREE.Vector3(0, 0, 0.4));
    // insert block (FIX mode)
    if (m.insertVolume && m.insertVolume > 0) {
      const Di = D - 2 * t - bx; const th = Math.min(Di * 0.8, m.insertVolume / (Wi * Hi));
      const mat = new THREE.MeshStandardMaterial({ color: 0x3a8ee6, transparent: true, opacity: 0.55 });
      const blk = new THREE.Mesh(new THREE.BoxGeometry(Wi * 0.98, Hi * 0.98, th), mat);
      blk.position.set(0, H / 2, front - D + t + th / 2); add(blk, "Insert_Block", new THREE.Vector3(0, 0, -0.1));
    }
    if (first) this.frame();
  }
  private lastClassic?: Model3D;
  /** Layout of the classic box's port as last drawn (undefined = no port). */
  portLayout?: PortLayout;
  /** World-space bounds of every drawn object (for tests and the headless dry run). */
  bounds(): { name: string; min: number[]; max: number[] }[] {
    this.root.updateMatrixWorld(true);
    return this.root.children.flatMap((o) => (!o.name && o.type === "Group" ? o.children : [o])).map((o) => { const b = new THREE.Box3().setFromObject(o); return { name: o.name, min: b.min.toArray(), max: b.max.toArray() }; });
  }
  rebuild() { if (this.free) this.buildFree(this.free); else if (this.lastClassic) this.build(this.lastClassic); }
  /** Free-form box: shell (outer mesh), Inside_Air (closed inner mesh, exported for volume checks in Blender), drivers, ports. */
  buildFree(f: FreeModel) {
    const b = bbox(f.outer); const first = !this.model;
    this.model = { W: b.size[0], H: b.max[1], D: b.size[2] }; this.free = f; this.lastClassic = undefined;
    this.root.clear();
    const g = new THREE.Group(); g.position.z = b.size[2] / 2 - b.max[2]; this.root.add(g); // centre in depth like the classic view
    const ex = this.explode;
    const shellMat = new THREE.MeshStandardMaterial({ color: f.material === "wood" ? 0xb08a5a : 0x9aa7b0, roughness: f.material === "wood" ? 0.8 : 0.35, flatShading: f.material === "wood",
      transparent: true, opacity: this.xray ? 0.25 : 0.92, side: THREE.DoubleSide, depthWrite: !this.xray });
    const shell = new THREE.Mesh(meshGeometry(f.outer), shellMat); shell.name = "Shell_Outer"; g.add(shell);
    const airMat = new THREE.MeshStandardMaterial({ color: 0x3a8ee6, transparent: true, opacity: this.xray ? 0.35 : 0.0, depthWrite: false, side: THREE.DoubleSide });
    const air = new THREE.Mesh(meshGeometry(f.inner), airMat); air.name = "Inside_Air"; g.add(air);
    const q = new THREE.Quaternion();
    const n = new THREE.Vector3(...f.drivers.normal).normalize(); q.setFromUnitVectors(new THREE.Vector3(0, 0, 1), n);
    for (const c of f.drivers.centres) {
      const d = driverMesh(f.drivers.outer / 2, f.drivers.cutout / 2, f.drivers.depth, 0, 0, 0);
      d.quaternion.copy(q); d.position.set(c[0], c[1], c[2]).add(n.clone().multiplyScalar(0.001 + 0.3 * ex)); d.name = "Driver"; g.add(d);
      if (f.ring && f.ring > 0) { const r = new THREE.Mesh(new THREE.RingGeometry(f.drivers.cutout / 2, f.ring / 2, 64), new THREE.MeshStandardMaterial({ color: 0x8a6a3a, side: THREE.DoubleSide })); r.quaternion.copy(q); r.position.set(c[0], c[1], c[2]).add(n.clone().multiplyScalar(0.0005)); r.name = "MDF_Ring"; g.add(r); }
    }
    if (f.ports) {
      const p = f.ports; const pn = new THREE.Vector3(...p.normal).normalize(); const pq = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), pn);
      const mat = new THREE.MeshStandardMaterial({ color: 0x222222, side: THREE.DoubleSide });
      for (const c of p.centres) {
        if (p.fits === false) { // does not fit inside the shape: a red marker on the opening, no tube through the walls
          const red = new THREE.MeshStandardMaterial({ color: 0xff3b3b, side: THREE.DoubleSide });
          const mk = new THREE.Mesh(p.shape === "round" ? new THREE.CircleGeometry(p.d! / 2, 40) : new THREE.PlaneGeometry(p.w!, p.h!), red);
          mk.quaternion.copy(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), pn)); mk.position.set(c[0], c[1], c[2]).add(pn.clone().multiplyScalar(0.002)); mk.name = "Port_Does_Not_Fit"; g.add(mk); continue;
        }
        const geo = p.shape === "round" ? new THREE.CylinderGeometry(p.d! / 2, p.d! / 2, p.length, 40, 1, true) : new THREE.BoxGeometry(p.w!, p.length, p.h!);
        const tube = new THREE.Mesh(geo, mat); tube.quaternion.copy(pq);
        tube.position.set(c[0], c[1], c[2]).add(pn.clone().multiplyScalar(-p.length / 2 + 0.2 * ex)); tube.name = "Port"; g.add(tube);
      }
    }
    if (f.chord && this.xray) {
      const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(f.chord.map((p) => new THREE.Vector3(...p))), new THREE.LineBasicMaterial({ color: 0xff5555 }));
      line.name = "Longest_Inside_Line"; g.add(line);
    }
    if (first) this.frame();
  }
  exportGLB(): Promise<ArrayBuffer> {
    return new Promise((ok, bad) => new GLTFExporter().parse(this.root, (r) => ok(r as ArrayBuffer), bad, { binary: true }));
  }
  exportSTL(): string { return new STLExporter().parse(this.root) as string; }
  screenshot(): string { this.renderer.render(this.scene, this.camera); return this.renderer.domElement.toDataURL("image/png"); }
}

/** Passive radiator: frame, surround and a flat light-grey diaphragm with a mass plate; a shallow open basket, no magnet. */
function passiveMesh(rOut: number, rCut: number, depth: number, x: number, y: number, front: number): THREE.Group {
  const g = new THREE.Group();
  const frame = new THREE.MeshStandardMaterial({ color: 0x1b1b1b, roughness: 0.6, side: THREE.DoubleSide });
  const dia = new THREE.MeshStandardMaterial({ color: 0x9aa3ad, roughness: 0.5, metalness: 0.2, side: THREE.DoubleSide });
  const metal = new THREE.MeshStandardMaterial({ color: 0x666666, metalness: 0.7, roughness: 0.35, side: THREE.DoubleSide });
  const rCone = rCut * 0.9;
  g.add(new THREE.Mesh(new THREE.RingGeometry(rCut * 0.98, rOut, 64), frame));
  const sur = new THREE.Mesh(new THREE.TorusGeometry(rCone + (rCut * 0.98 - rCone) / 2, (rCut * 0.98 - rCone) / 2 + 0.004, 12, 64), frame); sur.scale.z = 0.7; g.add(sur);
  const disc = new THREE.Mesh(new THREE.CircleGeometry(rCone, 64), dia); disc.position.z = -0.004; g.add(disc);
  const plate = new THREE.Mesh(new THREE.CylinderGeometry(rCut * 0.3, rCut * 0.3, 0.006, 48), metal); plate.rotation.x = Math.PI / 2; plate.position.z = -0.002; g.add(plate);
  const basket = new THREE.Mesh(new THREE.CylinderGeometry(rCut * 0.95, rCut * 0.75, Math.max(0.01, depth * 0.8), 32, 1, true), metal); basket.rotation.x = Math.PI / 2; basket.position.z = -depth * 0.4; g.add(basket);
  g.position.set(x, y, front + 0.001);
  return g;
}
function driverMesh(rOut: number, rCut: number, depth: number, x: number, y: number, front: number): THREE.Group {
  const g = new THREE.Group();
  const black = new THREE.MeshStandardMaterial({ color: 0x1b1b1b, roughness: 0.6, side: THREE.DoubleSide });
  const cone = new THREE.MeshStandardMaterial({ color: 0x2c2c30, roughness: 0.9, side: THREE.DoubleSide });
  const metal = new THREE.MeshStandardMaterial({ color: 0x777777, metalness: 0.7, roughness: 0.35 });
  const rCone = rCut * 0.92, rCap = rCut * 0.28, coneDepth = depth * 0.35;
  // flange ring
  const ring = new THREE.Mesh(new THREE.RingGeometry(rCut * 0.98, rOut, 64), black); g.add(ring);
  // surround (half torus)
  const sur = new THREE.Mesh(new THREE.TorusGeometry(rCone + (rCut * 0.98 - rCone) / 2, (rCut * 0.98 - rCone) / 2 + 0.004, 12, 64), black);
  sur.scale.z = 0.7; g.add(sur);
  // cone via lathe: profile from rim to cap, going into the box (−z)
  const pts = [new THREE.Vector2(rCone, 0), new THREE.Vector2(rCap, -coneDepth)];
  const lathe = new THREE.Mesh(new THREE.LatheGeometry(pts, 64), cone); lathe.rotation.x = Math.PI / 2; g.add(lathe);
  const cap = new THREE.Mesh(new THREE.SphereGeometry(rCap, 32, 12, 0, Math.PI * 2, 0, Math.PI / 3), cone); cap.rotation.x = Math.PI / 2; cap.position.z = -coneDepth - rCap * 0.5 + rCap * 0.5; g.add(cap);
  // basket + magnet behind
  const basket = new THREE.Mesh(new THREE.CylinderGeometry(rCut * 0.95, rCut * 0.45, depth * 0.55, 32, 1, true), metal); basket.rotation.x = Math.PI / 2; basket.position.z = -depth * 0.3; g.add(basket);
  const magnet = new THREE.Mesh(new THREE.CylinderGeometry(rCut * 0.55, rCut * 0.55, depth * 0.4, 48), black); magnet.rotation.x = Math.PI / 2; magnet.position.z = -depth * 0.78; g.add(magnet);
  g.position.set(x, y, front + 0.001);
  return g;
}
