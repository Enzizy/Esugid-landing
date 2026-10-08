/* E-sugid showcase — the 3D world (classic script, three.js r180 via window.THREE).
   Barili's 42 barangays are extruded from the app's PSA 2020 boundary file. Everything
   else — relief, houses, trees, landmarks, signal lines — is illustrative.
   The world never drives the presentation; it follows esugid:state / esugid:step events. */
(function () {
  'use strict';
  var THREE = window.THREE, GEO = window.ESUGID_GEO, TEX = window.ESUGID_TEX || { phone: {}, ring: [] };
  var DECK = window.ESUGID;
  var doc = document.documentElement;
  var worldEl = document.getElementById('world');
  var canvas = document.getElementById('world-canvas');
  var labelsEl = document.getElementById('world-labels');
  var tipEl = document.getElementById('tip');
  var noteEl = document.getElementById('world-note');
  if (!THREE || !GEO || !canvas || !DECK) return;

  var V3 = THREE.Vector3, C = function (h) { return new THREE.Color(h); };
  var DEG = Math.PI / 180;
  var clamp = function (v, a, b) { return Math.max(a, Math.min(b, v)); };
  var lerp = function (a, b, t) { return a + (b - a) * t; };
  var smooth = function (a, b, x) { var t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  var damp = function (a, b, l, dt) { return a + (b - a) * (1 - Math.exp(-l * dt)); };
  var easeOutBack = function (t) { var c1 = 1.4, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };
  function rng(seed) { return function () { seed |= 0; seed = seed + 0x6D2B79F5 | 0; var t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  function inPoly(x, y, ring) {
    var inside = false;
    for (var i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      var xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1];
      if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) inside = !inside;
    }
    return inside;
  }

  /* ================================================================ renderer */
  var renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  } catch (e) {
    doc.classList.add('no-webgl');
    return;
  }
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  var maxDpr = Math.min(window.devicePixelRatio || 1, 1.75);
  var dpr = maxDpr;

  var scene = new THREE.Scene();
  var camera = new THREE.PerspectiveCamera(28, 1, 0.5, 400);

  /* lights: warm sun from the south-west (echoing the gold glow of the app's community artwork) */
  var hemi = new THREE.HemisphereLight(0xD3EEDD, 0x14231A, 0.78);
  scene.add(hemi);
  var sun = new THREE.DirectionalLight(0xFFE1B0, 3.1);
  sun.position.set(-14, 24, 12);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  var sc = sun.shadow.camera; sc.left = -14; sc.right = 14; sc.top = 14; sc.bottom = -14; sc.near = 4; sc.far = 70;
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.025;
  scene.add(sun);
  var rim = new THREE.DirectionalLight(0x5FE0B0, 0.75);
  rim.position.set(12, 6, -16);
  scene.add(rim);

  /* ================================================================ island */
  var BASE = 0.62;           // depth of the soil base below sea level of the diorama
  var BEVEL = 0.05;
  var island = new THREE.Group();
  scene.add(island);
  var tiles = [];
  var byName = {};
  var GRASS = ['#3A9659', '#44A062', '#348A54', '#4DA766', '#3E9A5F', '#2F8452', '#48A262'];
  var soil = C('#6B4A2D'), soilDark = C('#2E1F14'), gold = C('#E2C277');

  function tileMaterial(top, hex) {
    var mat = new THREE.MeshStandardMaterial({ color: C(hex), roughness: 0.86, metalness: 0 });
    var u = {
      uTopY: { value: top }, uBaseY: { value: -BASE - BEVEL },
      uSoil: { value: soil }, uSoilDark: { value: soilDark }, uGold: { value: gold },
      uGlow: { value: new THREE.Color(0, 0, 0) }, uDim: { value: 0 }
    };
    mat.userData.u = u;
    mat.customProgramCacheKey = function () { return 'esugid-tile'; };
    mat.onBeforeCompile = function (sh) {
      Object.assign(sh.uniforms, u);
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vObjPos;\nvarying vec3 vObjN;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvObjPos = position;\nvObjN = normal;');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vObjPos;\nvarying vec3 vObjN;\nuniform float uTopY;\nuniform float uBaseY;\nuniform vec3 uSoil;\nuniform vec3 uSoilDark;\nuniform vec3 uGold;\nuniform vec3 uGlow;\nuniform float uDim;')
        .replace('#include <color_fragment>', [
          '#include <color_fragment>',
          'float gUp = normalize(vObjN).y;',
          'float gH = vObjPos.y;',
          'float gTop = smoothstep(0.35, 0.75, gUp);',
          'float gBand = smoothstep(uBaseY + 0.13, uBaseY + 0.145, gH) * (1.0 - smoothstep(uBaseY + 0.19, uBaseY + 0.205, gH));',
          'float gLip = smoothstep(uTopY - 0.16, uTopY - 0.07, gH);',
          'vec3 gSoil = mix(uSoilDark, uSoil, smoothstep(uBaseY, uTopY - 0.12, gH));',
          'vec3 gSide = mix(gSoil, uGold, gBand);',
          'gSide = mix(gSide, diffuseColor.rgb * 0.82, gLip);',
          'vec3 gCol = mix(gSide, diffuseColor.rgb, gTop);',
          'if (gUp < -0.5) gCol = uSoilDark * 0.6;',
          'diffuseColor.rgb = gCol * (1.0 - uDim * 0.72);'
        ].join('\n'))
        .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.3, gBand * (1.0 - gTop));')
        .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor = mix(metalnessFactor, 0.85, gBand * (1.0 - gTop));')
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += uGlow * (0.35 + 0.65 * gTop) + uGold * gBand * (1.0 - gTop) * 0.12;');
    };
    return mat;
  }

  var R = rng(20261008);
  GEO.barangays.forEach(function (b, i) {
    var cx = b.c[0], cy = b.c[1];
    var r = Math.sqrt(b.area / Math.PI);
    var s = 1 - 0.034 / r;
    var ring = b.ring.map(function (p) { return [cx + (p[0] - cx) * s, cy + (p[1] - cy) * s]; });
    var shape = new THREE.Shape(ring.map(function (p) { return new THREE.Vector2(p[0] - cx, p[1] - cy); }));
    var inland = smooth(-6.8, 7.2, cx);
    var top = 0.24 + 0.62 * Math.pow(inland, 1.25) + (R() - 0.5) * 0.08;
    if (b.name === 'Poblacion') top = 0.22;
    var geo = new THREE.ExtrudeGeometry(shape, { depth: top + BASE, bevelEnabled: true, bevelThickness: BEVEL, bevelSize: 0.045, bevelSegments: 3, curveSegments: 2, steps: 1 });
    geo.rotateX(-Math.PI / 2);
    geo.translate(0, -BASE, 0);
    var hex = GRASS[Math.floor(R() * GRASS.length)];
    var mat = tileMaterial(top + BEVEL, hex);
    var mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = true; mesh.receiveShadow = true;
    mesh.position.set(cx, 0, -cy);
    var tile = {
      i: i, name: b.name, code: b.code, area: b.area, c: new V3(cx, top + BEVEL, -cy), top: top + BEVEL, ring: ring, raw: b.ring,
      mesh: mesh, mat: mat, home: new V3(cx, 0, -cy),
      glow: 0, glowT: 0, glowColor: C('#000000'), glowColorT: C('#2FD49B'), lift: 0, liftT: 0,
      sepDir: new V3(cx, 0, -cy).normalize(), sepK: 0.6 + R() * 0.9, sepY: (R() - 0.5) * 2, sepRot: new V3((R() - 0.5), (R() - 0.5) * 1.6, (R() - 0.5)),
      introDelay: 0, phase: R() * Math.PI * 2, hue: R()
    };
    mesh.userData.tile = tile;
    tiles.push(tile); byName[b.name] = tile;
    island.add(mesh);
  });

  function tilePoint(name, dx, dy) {
    var t = byName[name];
    return new V3(t.c.x + (dx || 0), t.top, t.c.z - (dy || 0));
  }
  function randomPointIn(tile, rnd, avoid) {
    var minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
    tile.ring.forEach(function (p) { minX = Math.min(minX, p[0]); maxX = Math.max(maxX, p[0]); minY = Math.min(minY, p[1]); maxY = Math.max(maxY, p[1]); });
    for (var k = 0; k < 40; k++) {
      var x = lerp(minX, maxX, rnd()), y = lerp(minY, maxY, rnd());
      if (!inPoly(x, y, tile.ring)) continue;
      // keep away from the tile edge so props don't overhang gaps
      var ok = true;
      for (var q = 0; q < tile.ring.length && ok; q++) {
        var p1 = tile.ring[q], p2 = tile.ring[(q + 1) % tile.ring.length];
        var dx = p2[0] - p1[0], dy = p2[1] - p1[1], l2 = dx * dx + dy * dy || 1;
        var tt = clamp(((x - p1[0]) * dx + (y - p1[1]) * dy) / l2, 0, 1);
        var ex = p1[0] + tt * dx - x, ey = p1[1] + tt * dy - y;
        if (ex * ex + ey * ey < 0.012) ok = false;
      }
      if (ok && avoid) for (var a = 0; a < avoid.length && ok; a++) { var A = avoid[a]; if ((A[0] - x) * (A[0] - x) + (A[1] - y) * (A[1] - y) < A[2] * A[2]) ok = false; }
      if (ok) return [x, y];
    }
    return null;
  }

  /* ---------------------------------------------------------------- simple geometry merge with vertex colours */
  function colorize(geo, hex) {
    geo = geo.index ? geo.toNonIndexed() : geo;
    var c = C(hex), n = geo.attributes.position.count, arr = new Float32Array(n * 3);
    for (var i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
    geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    if (geo.attributes.uv) geo.deleteAttribute('uv');
    return geo;
  }
  function merge(list) {
    var total = 0; list.forEach(function (g) { total += g.attributes.position.count; });
    var pos = new Float32Array(total * 3), nor = new Float32Array(total * 3), col = new Float32Array(total * 3), o = 0;
    list.forEach(function (g) {
      pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3); col.set(g.attributes.color.array, o * 3);
      o += g.attributes.position.count;
    });
    var out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    out.setAttribute('color', new THREE.BufferAttribute(col, 3));
    return out;
  }
  function part(geo, hex, tx, ty, tz, sx, sy, sz, ry) {
    if (sx) geo.scale(sx, sy, sz);
    if (ry) geo.rotateY(ry);
    geo.translate(tx || 0, ty || 0, tz || 0);
    return colorize(geo, hex);
  }

  /* ---------------------------------------------------------------- props (instanced; follow their tile) */
  var clay = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, metalness: 0 });
  var treeGeo = merge([
    part(new THREE.CylinderGeometry(0.12, 0.16, 0.9, 6), '#7A5333', 0, 0.45, 0),
    part(new THREE.IcosahedronGeometry(0.62, 1), '#3C8F4E', 0, 1.25, 0),
    part(new THREE.IcosahedronGeometry(0.42, 1), '#46A057', 0.32, 1.05, 0.18)
  ]);
  var palmGeo = merge([
    part(new THREE.CylinderGeometry(0.06, 0.1, 1.5, 5), '#8A6440', 0, 0.75, 0),
    part(new THREE.IcosahedronGeometry(0.55, 0), '#4DA75A', 0, 1.55, 0, 1.3, 0.32, 1.3)
  ]);
  var houseGeo = merge([
    part(new THREE.BoxGeometry(1, 0.72, 0.86), '#F2EBDD', 0, 0.36, 0),
    part(new THREE.ConeGeometry(0.82, 0.52, 4, 1), '#E7DCC6', 0, 0.98, 0, 1, 1, 0.82, Math.PI / 4),
    part(new THREE.BoxGeometry(0.22, 0.36, 0.04), '#9C7A55', 0, 0.18, 0.44)
  ]);
  var roofHouseGeo = merge([
    part(new THREE.BoxGeometry(1, 0.72, 0.86), '#F4EEE2', 0, 0.36, 0),
    part(new THREE.ConeGeometry(0.82, 0.52, 4, 1), '#2D7658', 0, 0.98, 0, 1, 1, 0.82, Math.PI / 4),
    part(new THREE.BoxGeometry(0.22, 0.36, 0.04), '#9C7A55', 0, 0.18, 0.44)
  ]);
  var props = [];   // {mesh, items:[{tile, local: Matrix4}]}
  function makeProps(geo, list, scaleBase) {
    var mesh = new THREE.InstancedMesh(geo, clay, Math.max(1, list.length));
    mesh.castShadow = true; mesh.receiveShadow = true;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    var colors = [];
    list.forEach(function (it, k) {
      var q = new THREE.Quaternion().setFromAxisAngle(new V3(0, 1, 0), it.rot);
      var s = scaleBase * it.scale;
      it.local = new THREE.Matrix4().compose(new V3(it.x, it.tile.top - 0.01, it.z), q, new V3(s, s * (it.sy || 1), s));
      var col = new THREE.Color(1, 1, 1).offsetHSL((it.hue || 0) * 0.04 - 0.02, 0, (it.light || 0) * 0.12 - 0.04);
      mesh.setColorAt(k, col);
    });
    mesh.count = list.length;
    island.add(mesh);
    var group = { mesh: mesh, items: list };
    props.push(group);
    return group;
  }

  /* landmark positions (world XZ), chosen inside their barangays */
  var POB = byName.Poblacion, VITO = byName.Vito, CAMP = byName.Campangga, CAGAY = byName.Cagay;
  var hallLocal = [POB.c.x + 0.05, -POB.c.z + 0.12];
  var churchLocal = [POB.c.x - 0.42, -POB.c.z + 0.34];
  var marketLocal = [POB.c.x + 0.3, -POB.c.z - 0.34];
  var vitoHallLocal = [VITO.c.x - 0.2, -VITO.c.z - 0.3];
  var residentLocal = [VITO.c.x + 0.62, -VITO.c.z - 0.75];
  var fallsLocal = [CAMP.c.x + 0.15, -CAMP.c.z - 0.1];
  var avoidAll = [[hallLocal[0], hallLocal[1], 0.42], [churchLocal[0], churchLocal[1], 0.3], [marketLocal[0], marketLocal[1], 0.32], [vitoHallLocal[0], vitoHallLocal[1], 0.3], [residentLocal[0], residentLocal[1], 0.22], [fallsLocal[0], fallsLocal[1], 0.45]];

  (function scatter() {
    var rnd = rng(7);
    var trees = [], palms = [], houses = [], greenHouses = [];
    tiles.forEach(function (t) {
      var lowland = 1 - smooth(-6, 2, t.c.x);
      var urban = t.name === 'Poblacion' ? 1 : (['Japitan', 'Santa Ana', 'San Rafael', 'Azucena', 'Guibuangan', 'Maghanoy'].indexOf(t.name) >= 0 ? 0.6 : 0.18 + lowland * 0.25);
      var nTrees = Math.round(clamp(t.area * (4.5 + 3 * (1 - lowland)), 3, 34) * (1 - urban * 0.6));
      var nHouses = Math.round(clamp(t.area * (1.6 + urban * 7), 2, 18));
      var hubs = [randomPointIn(t, rnd, avoidAll), randomPointIn(t, rnd, avoidAll)].filter(Boolean);
      for (var h = 0; h < nHouses; h++) {
        var p = null;
        if (hubs.length && rnd() < 0.8) {
          var hub = hubs[h % hubs.length];
          for (var tries = 0; tries < 12 && !p; tries++) {
            var x = hub[0] + (rnd() - 0.5) * 0.9, y = hub[1] + (rnd() - 0.5) * 0.9;
            if (inPoly(x, y, t.ring)) p = [x, y];
          }
        }
        p = p || randomPointIn(t, rnd, avoidAll);
        if (!p) continue;
        var item = { tile: t, x: p[0] - t.c.x, z: -(p[1] - (-t.c.z)), rot: rnd() * Math.PI, scale: 0.85 + rnd() * 0.35, light: rnd() };
        (rnd() < 0.22 ? greenHouses : houses).push(item);
      }
      for (var k = 0; k < nTrees; k++) {
        var q = randomPointIn(t, rnd, avoidAll);
        if (!q) continue;
        var it = { tile: t, x: q[0] - t.c.x, z: -(q[1] - (-t.c.z)), rot: rnd() * Math.PI * 2, scale: 0.75 + rnd() * 0.6, sy: 0.85 + rnd() * 0.35, hue: rnd(), light: rnd() };
        (lowland > 0.55 && rnd() < 0.35 ? palms : trees).push(it);
      }
    });
    makeProps(treeGeo, trees, 0.14);
    makeProps(palmGeo, palms, 0.15);
    makeProps(houseGeo, houses, 0.11);
    makeProps(roofHouseGeo, greenHouses, 0.11);
  })();

  /* ---------------------------------------------------------------- landmarks */
  var landmarks = new THREE.Group(); island.add(landmarks);
  var attach = [];   // {obj, tile, local:Vector3}
  function place(obj, tile, xz, yOff) {
    var local = new V3(xz[0] - tile.c.x, tile.top + (yOff || 0), -(xz[1]) - tile.c.z);
    obj.traverse(function (o) { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    landmarks.add(obj); attach.push({ obj: obj, tile: tile, local: local });
    return obj;
  }
  function meshOf(geo) { return new THREE.Mesh(geo, clay); }
  // Municipal hall (Poblacion): ivory hall with columns and a blue roof, as in the app's municipal-hall artwork
  var hall = new THREE.Group();
  (function () {
    var parts = [
      part(new THREE.BoxGeometry(1.25, 0.08, 0.9), '#E9E1D0', 0, 0.04, 0),
      part(new THREE.BoxGeometry(1.1, 0.42, 0.6), '#F4EEE1', 0, 0.29, -0.06),
      part(new THREE.ConeGeometry(0.82, 0.3, 4, 1), '#7E97D6', 0, 0.65, -0.06, 1, 1, 0.58, Math.PI / 4),
      part(new THREE.BoxGeometry(0.62, 0.05, 0.22), '#F7F2E7', 0, 0.53, 0.3),
      part(new THREE.ConeGeometry(0.36, 0.16, 3, 1), '#F7F2E7', 0, 0.63, 0.31, 1, 1, 0.35, 0)
    ];
    for (var k = 0; k < 6; k++) parts.push(part(new THREE.CylinderGeometry(0.026, 0.03, 0.42, 8), '#FFFFFF', -0.27 + k * 0.108, 0.29, 0.31));
    parts.push(part(new THREE.BoxGeometry(0.66, 0.05, 0.12), '#E0D6C1', 0, 0.035, 0.42));
    hall.add(meshOf(merge(parts)));
    hall.scale.setScalar(0.62);
  })();
  place(hall, POB, hallLocal);
  // Church
  var church = new THREE.Group();
  church.add(meshOf(merge([
    part(new THREE.BoxGeometry(0.42, 0.34, 0.7), '#F2E7CF', 0, 0.17, 0),
    part(new THREE.ConeGeometry(0.36, 0.2, 4, 1), '#C9774E', 0, 0.44, 0, 0.85, 1, 1.4, Math.PI / 4),
    part(new THREE.BoxGeometry(0.2, 0.62, 0.2), '#F6EDD8', 0.14, 0.31, 0.3),
    part(new THREE.ConeGeometry(0.16, 0.2, 4, 1), '#C9774E', 0.14, 0.72, 0.3, 1, 1, 1, Math.PI / 4),
    part(new THREE.BoxGeometry(0.02, 0.14, 0.02), '#E6CB84', 0.14, 0.88, 0.3),
    part(new THREE.BoxGeometry(0.08, 0.02, 0.02), '#E6CB84', 0.14, 0.9, 0.3)
  ])));
  church.scale.setScalar(0.62); church.rotation.y = 0.5;
  place(church, POB, churchLocal);
  // Market stalls with striped awnings
  var market = new THREE.Group();
  (function () {
    var cols = ['#E8893A', '#D9653B', '#EAA640'];
    for (var k = 0; k < 3; k++) {
      var g = merge([
        part(new THREE.BoxGeometry(0.3, 0.16, 0.2), '#B07A4C', 0, 0.08, 0),
        part(new THREE.BoxGeometry(0.34, 0.03, 0.26), cols[k], 0, 0.3, 0.02),
        part(new THREE.BoxGeometry(0.03, 0.3, 0.03), '#8D6340', -0.14, 0.15, 0.1),
        part(new THREE.BoxGeometry(0.03, 0.3, 0.03), '#8D6340', 0.14, 0.15, 0.1)
      ]);
      var m = meshOf(g); m.position.x = (k - 1) * 0.38; m.rotation.y = (k - 1) * 0.08;
      market.add(m);
    }
    market.scale.setScalar(0.7); market.rotation.y = -0.4;
  })();
  place(market, POB, marketLocal);
  // Barangay Vito hall
  var vitoHall = new THREE.Group();
  vitoHall.add(meshOf(merge([
    part(new THREE.BoxGeometry(0.7, 0.32, 0.46), '#F5EFE3', 0, 0.16, 0),
    part(new THREE.ConeGeometry(0.52, 0.26, 4, 1), '#0E7A5C', 0, 0.45, 0, 1, 1, 0.7, Math.PI / 4),
    part(new THREE.CylinderGeometry(0.012, 0.012, 0.75, 6), '#DADADA', 0.42, 0.37, 0.18),
    part(new THREE.BoxGeometry(0.16, 0.1, 0.01), '#E6CB84', 0.5, 0.68, 0.18)
  ])));
  vitoHall.scale.setScalar(0.6);
  place(vitoHall, VITO, vitoHallLocal);
  // The resident's home in Vito (origin of the concern story)
  var home = new THREE.Group();
  home.add(meshOf(merge([
    part(new THREE.BoxGeometry(1, 0.72, 0.86), '#FFF8EA', 0, 0.36, 0),
    part(new THREE.ConeGeometry(0.82, 0.52, 4, 1), '#E6CB84', 0, 0.98, 0, 1, 1, 0.82, Math.PI / 4)
  ])));
  home.scale.setScalar(0.15);
  place(home, VITO, residentLocal);
  // Mantayupan Falls (Campangga), stylised: a rock step, falling water, pool
  var falls = new THREE.Group();
  var waterTexCanvas = document.createElement('canvas'); waterTexCanvas.width = 32; waterTexCanvas.height = 128;
  (function () {
    var g = waterTexCanvas.getContext('2d');
    var gr = g.createLinearGradient(0, 0, 0, 128); gr.addColorStop(0, '#E8FBFF'); gr.addColorStop(1, '#9BDCF0');
    g.fillStyle = gr; g.fillRect(0, 0, 32, 128);
    for (var k = 0; k < 40; k++) { g.fillStyle = 'rgba(255,255,255,' + (0.3 + Math.random() * 0.5) + ')'; g.fillRect(Math.random() * 32, Math.random() * 128, 1 + Math.random() * 2, 8 + Math.random() * 20); }
  })();
  var waterTex = new THREE.CanvasTexture(waterTexCanvas); waterTex.wrapS = waterTex.wrapT = THREE.RepeatWrapping; waterTex.colorSpace = THREE.SRGBColorSpace;
  (function () {
    falls.add(meshOf(merge([
      part(new THREE.DodecahedronGeometry(0.5, 0), '#6E7A6F', 0, 0.32, -0.25, 1.4, 0.9, 0.6),
      part(new THREE.DodecahedronGeometry(0.34, 0), '#7D8A7E', -0.45, 0.2, -0.15, 1, 0.8, 0.8),
      part(new THREE.DodecahedronGeometry(0.3, 0), '#5F6B60', 0.48, 0.18, -0.12, 1, 0.9, 0.9),
      part(new THREE.IcosahedronGeometry(0.28, 1), '#3F944F', -0.5, 0.58, -0.3),
      part(new THREE.IcosahedronGeometry(0.24, 1), '#4AA35A', 0.5, 0.52, -0.3)
    ])));
    var w = new THREE.Mesh(new THREE.PlaneGeometry(0.26, 0.62), new THREE.MeshBasicMaterial({ map: waterTex, transparent: true, opacity: 0.92 }));
    w.position.set(0, 0.36, 0.05); falls.add(w);
    var pool = new THREE.Mesh(new THREE.CircleGeometry(0.34, 24), new THREE.MeshStandardMaterial({ color: '#7FD3EA', roughness: 0.15, metalness: 0.1, emissive: '#2A8FB0', emissiveIntensity: 0.25 }));
    pool.rotation.x = -Math.PI / 2; pool.position.set(0, 0.02, 0.32); falls.add(pool);
    falls.scale.setScalar(0.8);
  })();
  place(falls, CAMP, fallsLocal);

  // Floating nodes: "one shared record" and an organization hub (not tied to a place)
  var glowCanvas = document.createElement('canvas'); glowCanvas.width = glowCanvas.height = 128;
  (function () { var g = glowCanvas.getContext('2d'), gr = g.createRadialGradient(64, 64, 0, 64, 64, 64); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,255,255,.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 128, 128); })();
  var glowTex = new THREE.CanvasTexture(glowCanvas);
  function glowSprite(hex, size) {
    var s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: C(hex), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.9 }));
    s.scale.setScalar(size); return s;
  }
  function gem(hex, size) {
    var g = new THREE.Group();
    var m = new THREE.Mesh(new THREE.OctahedronGeometry(size, 0), new THREE.MeshStandardMaterial({ color: C(hex), roughness: 0.25, metalness: 0.6, emissive: C(hex), emissiveIntensity: 0.35, flatShading: true }));
    g.add(m); g.add(glowSprite(hex, size * 5));
    g.userData.core = m; g.scale.setScalar(0.001);
    scene.add(g);
    return g;
  }
  var coreGem = gem('#E6CB84', 0.42); coreGem.position.set(0.6, 4.6, 0.2);
  var orgHub = gem('#7DB5EE', 0.3); orgHub.position.set(4.2, 3.6, -5.6);

  // Concern token: a small glowing orb that travels between places
  var token = new THREE.Group();
  token.add(new THREE.Mesh(new THREE.SphereGeometry(0.09, 20, 14), new THREE.MeshBasicMaterial({ color: '#FFFFFF' })));
  var tokenGlow = glowSprite('#2FD49B', 1.1); token.add(tokenGlow);
  token.visible = false; scene.add(token);

  // soft shadow under the floating island
  var blob = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), new THREE.MeshBasicMaterial({ map: glowTex, color: '#000000', transparent: true, opacity: 0.55, depthWrite: false }));
  blob.rotation.x = -Math.PI / 2; blob.position.y = -BASE - 3.2; scene.add(blob);

  // clouds (weather beat)
  var clouds = new THREE.Group(); scene.add(clouds);
  (function () {
    var rnd = rng(3);
    for (var k = 0; k < 6; k++) {
      var parts = [];
      for (var j = 0; j < 4; j++) parts.push(part(new THREE.IcosahedronGeometry(0.45 + rnd() * 0.3, 1), '#FFFFFF', (j - 1.5) * 0.45, rnd() * 0.15, (rnd() - 0.5) * 0.3));
      var m = new THREE.Mesh(merge(parts), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, transparent: true, opacity: 0.95 }));
      m.position.set((rnd() - 0.5) * 14, 3.2 + rnd() * 1.4, (rnd() - 0.5) * 14);
      m.userData.speed = 0.15 + rnd() * 0.2;
      clouds.add(m);
    }
    clouds.scale.setScalar(0.001);
  })();

  // drifting dust for atmosphere
  var dust;
  (function () {
    var n = 260, pos = new Float32Array(n * 3), rnd = rng(11);
    for (var k = 0; k < n; k++) { pos[k * 3] = (rnd() - 0.5) * 60; pos[k * 3 + 1] = rnd() * 22 - 6; pos[k * 3 + 2] = (rnd() - 0.5) * 60; }
    var g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    dust = new THREE.Points(g, new THREE.PointsMaterial({ size: 0.09, map: glowTex, color: '#E6CB84', transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true }));
    scene.add(dust);
  })();

  /* ================================================================ the 3D phone (real home screen as texture) */
  function roundedRect(w, h, r) {
    var s = new THREE.Shape(), x = -w / 2, y = -h / 2;
    s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r);
    s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r);
    s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
    return s;
  }
  function planeUV(geo) {
    geo.computeBoundingBox();
    var bb = geo.boundingBox, uv = geo.attributes.uv, p = geo.attributes.position;
    for (var i = 0; i < uv.count; i++) uv.setXY(i, (p.getX(i) - bb.min.x) / (bb.max.x - bb.min.x), (p.getY(i) - bb.min.y) / (bb.max.y - bb.min.y));
    uv.needsUpdate = true; return geo;
  }
  var texLoader = new THREE.TextureLoader();
  function loadTex(uri) {
    if (!uri) return null;
    var t = texLoader.load(uri); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy()); return t;
  }
  var phone = new THREE.Group();
  var phoneScreens = [];
  (function () {
    var W = 1.0, H = 2.25;
    var body = new THREE.Mesh(new THREE.ExtrudeGeometry(roundedRect(W, H, 0.16), { depth: 0.08, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.03, bevelSegments: 4, curveSegments: 10 }),
      new THREE.MeshPhysicalMaterial({ color: '#1B2622', metalness: 0.55, roughness: 0.32, clearcoat: 1, clearcoatRoughness: 0.2 }));
    body.position.z = -0.04; body.castShadow = true;
    phone.add(body);
    var bezel = new THREE.Mesh(new THREE.ShapeGeometry(roundedRect(W - 0.03, H - 0.03, 0.145), 10), new THREE.MeshStandardMaterial({ color: '#050806', roughness: 0.4 }));
    bezel.position.z = 0.071; phone.add(bezel);
    var sw = 0.925, sh = sw * 2460 / 1080;
    var keys = ['home', 'services', 'concern-center'];
    keys.forEach(function (k, n) {
      var geo = planeUV(new THREE.ShapeGeometry(roundedRect(sw, sh, 0.11), 10));
      var mat = new THREE.MeshBasicMaterial({ map: loadTex(TEX.phone[k]), transparent: true, opacity: n === 0 ? 1 : 0, toneMapped: false, depthWrite: n === 0 });
      var m = new THREE.Mesh(geo, mat); m.position.z = 0.073 + n * 0.0008; m.renderOrder = 2 + n;
      phone.add(m); phoneScreens.push(m);
    });
    var glass = new THREE.Mesh(new THREE.ShapeGeometry(roundedRect(sw, sh, 0.11), 10), new THREE.MeshPhysicalMaterial({ color: '#ffffff', transparent: true, opacity: 0.06, roughness: 0.05, metalness: 0, clearcoat: 1 }));
    glass.position.z = 0.078; glass.renderOrder = 6; phone.add(glass);
    var side = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.32, 0.05), new THREE.MeshStandardMaterial({ color: '#2B3631', metalness: 0.6, roughness: 0.4 }));
    side.position.set(W / 2 + 0.03, 0.45, 0); phone.add(side);
  })();
  phone.scale.setScalar(0.001);
  scene.add(phone);
  var phoneShine = glowSprite('#2FD49B', 7); phoneShine.material.opacity = 0.25; phoneShine.position.z = -0.6; phone.add(phoneShine);

  /* ring of real screens for the finale (lazy) */
  var ring = new THREE.Group(); ring.visible = false; scene.add(ring);
  var ringBuilt = false;
  function buildRing() {
    if (ringBuilt) return; ringBuilt = true;
    var list = TEX.ring || [], n = list.length, radius = 13.5;
    list.forEach(function (it, k) {
      var mob = it.kind === 'mobile';
      var w = mob ? 1.15 : 3.1, h = mob ? w * 2460 / 1080 : w * 762 / 1439;
      var geo = planeUV(new THREE.ShapeGeometry(roundedRect(w, h, mob ? 0.14 : 0.1), 6));
      var front = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: loadTex(it.uri), toneMapped: false, transparent: true, opacity: 0 }));
      var back = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: '#2D7658', transparent: true, opacity: 0, depthWrite: false }));
      back.rotation.y = Math.PI; back.position.z = -0.01;
      var card = new THREE.Group(); card.add(front); card.add(back);
      var a = (k / n) * Math.PI * 2;
      card.position.set(Math.sin(a) * radius, 1.6 + (mob ? 0 : -0.4) + Math.sin(k * 1.7) * 0.6, Math.cos(a) * radius);
      card.lookAt(Math.sin(a) * radius * 2, card.position.y, Math.cos(a) * radius * 2);
      card.userData = { key: it.key, front: front, back: back };
      ring.add(card);
    });
  }

  /* ================================================================ signals: arcs, ripples, labels (immediate mode) */
  var arcVS = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }';
  var arcFS = [
    'uniform vec3 uColor; uniform float uTime; uniform float uHead; uniform float uAlpha; uniform float uSpeed; uniform float uDash;',
    'varying vec2 vUv;',
    'void main(){',
    '  float a = vUv.x;',
    '  float drawn = 1.0 - smoothstep(uHead - 0.015, uHead, a);',
    '  float f = fract(a * uDash - uTime * uSpeed);',
    '  float pulse = smoothstep(0.0, 0.08, f) * (1.0 - smoothstep(0.08, 0.5, f));',
    '  float head = exp(-pow((a - uHead) * 22.0, 2.0)) * step(uHead, 0.995);',
    '  float alpha = uAlpha * (drawn * (0.32 + 0.95 * pulse) + head);',
    '  gl_FragColor = vec4(uColor * (0.9 + pulse * 0.8 + head), alpha);',
    '  #include <colorspace_fragment>',
    '}'].join('\n');
  var arcs = {};
  function arc(key, from, to, opt) {
    opt = opt || {};
    var a = arcs[key];
    if (!a) {
      var h = opt.height != null ? opt.height : Math.min(5, 0.6 + from.distanceTo(to) * 0.32);
      var mid = from.clone().add(to).multiplyScalar(0.5); mid.y = Math.max(from.y, to.y) + h;
      var curve = new THREE.QuadraticBezierCurve3(from.clone(), mid, to.clone());
      var geo = new THREE.TubeGeometry(curve, 48, opt.width || 0.032, 6, false);
      var mat = new THREE.ShaderMaterial({
        vertexShader: arcVS, fragmentShader: arcFS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
        uniforms: { uColor: { value: C(opt.color || '#2FD49B') }, uTime: { value: 0 }, uHead: { value: 0 }, uAlpha: { value: 0 }, uSpeed: { value: opt.speed || 0.6 }, uDash: { value: opt.dash || 2.0 } }
      });
      var m = new THREE.Mesh(geo, mat); m.renderOrder = 10; m.frustumCulled = false;
      scene.add(m);
      a = arcs[key] = { mesh: m, u: mat.uniforms, alpha: 0, head: 0, want: false, curve: curve, delay: opt.delay || 0, born: clock };
    }
    a.want = true; a.alphaT = opt.alpha != null ? opt.alpha : 1;
    if (opt.color) a.u.uColor.value.set(opt.color);
    return a;
  }
  var ripVS = arcVS;
  var ripFS = [
    'uniform vec3 uColor; uniform float uTime; uniform float uAlpha; uniform float uPeriod;',
    'varying vec2 vUv;',
    'float ringAt(float r, float t){ return smoothstep(t - 0.07, t, r) * (1.0 - smoothstep(t, t + 0.025, r)) * (1.0 - t); }',
    'void main(){',
    '  float r = length(vUv * 2.0 - 1.0);',
    '  float t = fract(uTime / uPeriod);',
    '  float v = ringAt(r, t) + ringAt(r, fract(t + 0.5)) * 0.8 + (1.0 - smoothstep(0.0, 0.16, r)) * 0.35;',
    '  gl_FragColor = vec4(uColor, v * uAlpha * step(r, 1.0));',
    '  #include <colorspace_fragment>',
    '}'].join('\n');
  var ripples = {};
  function ripple(key, pos, opt) {
    opt = opt || {};
    var r = ripples[key];
    if (!r) {
      var mat = new THREE.ShaderMaterial({ vertexShader: ripVS, fragmentShader: ripFS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
        uniforms: { uColor: { value: C(opt.color || '#2FD49B') }, uTime: { value: 0 }, uAlpha: { value: 0 }, uPeriod: { value: opt.period || 2.4 } } });
      var m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
      m.rotation.x = -Math.PI / 2; m.renderOrder = 9;
      scene.add(m);
      r = ripples[key] = { mesh: m, u: mat.uniforms, alpha: 0, want: false };
    }
    r.want = true; r.alphaT = opt.alpha != null ? opt.alpha : 1;
    r.mesh.position.copy(pos); r.mesh.position.y += 0.03;
    r.mesh.scale.setScalar((opt.radius || 1.5) * 2);
    return r;
  }
  var labels = {};
  function label(key, text, pos, cls) {
    var l = labels[key];
    if (!l) {
      var el = document.createElement('div'); el.className = 'wl' + (cls ? ' ' + cls : '');
      el.innerHTML = '<span></span><i></i>';
      labelsEl.appendChild(el);
      l = labels[key] = { el: el, span: el.firstChild, pos: new V3(), want: false, text: '' };
    }
    if (l.text !== text) { l.span.textContent = text; l.text = text; }
    l.pos.copy(pos); l.want = true;
    return l;
  }

  /* ================================================================ anchors */
  function attachedPos(obj, y) { var p = new V3(); obj.getWorldPosition(p); p.y += (y || 0); return p; }
  var A = {
    hall: function () { return attachedPos(hall, 0.5); },
    hallGround: function () { return attachedPos(hall, 0.05); },
    vitoHall: function () { return attachedPos(vitoHall, 0.35); },
    vitoGround: function () { return attachedPos(vitoHall, 0.02); },
    home: function () { return attachedPos(home, 0.2); },
    homeGround: function () { return attachedPos(home, 0.01); },
    market: function () { return attachedPos(market, 0.25); },
    falls: function () { return attachedPos(falls, 0.6); },
    cagay: function () { return tilePoint('Cagay', -0.1, -0.35).add(tiles[CAGAY.i].mesh.position).sub(CAGAY.home).setY(CAGAY.top + tiles[CAGAY.i].mesh.position.y + 0.05); },
    tile: function (name, y) { var t = byName[name]; return new V3(t.mesh.position.x, t.top + t.mesh.position.y + (y || 0), t.mesh.position.z); },
    core: function () { return coreGem.position.clone(); },
    org: function () { return orgHub.position.clone(); }
  };

  /* ================================================================ shots */
  var step = { route: 'barangay', scope: 'vito', alert: '1', role: 'captain', chat: null, flow: 'concern', console: 'dashboard', records: 'reports' };
  var VX = VITO.c.x, VZ = VITO.c.z, PX = POB.c.x, PZ = POB.c.z;
  var shots = {
    hero:               { cam: { t: [1.2, 0, 0.4], d: 35, yaw: -30, pitch: 38, fov: 28, sx: 0.2, sy: 0.02 }, phone: 'hero', hover: true, ambient: true },
    'problem-apart':    { cam: { t: [0.5, 0, 0], d: 42, yaw: -18, pitch: 50, sx: 0.14 }, sep: 1, note: true },
    'problem-channels': { cam: { t: [0.5, 0, 0], d: 40, yaw: -8, pitch: 52, sx: 0.14 }, sep: 0.8, channels: true },
    'problem-joined':   { cam: { t: [0.5, 0, 0], d: 36, yaw: -26, pitch: 44, sx: 0.14 }, sep: 0, hub: true, hover: true },
    'objectives-system':{ cam: { t: [0.8, 1.4, 0], d: 38, yaw: -36, pitch: 34, sx: -0.06 }, dim: 0.55, system: true },
    'objectives-list':  { cam: { t: [0.5, 0, 0], d: 44, yaw: 12, pitch: 46, sx: -0.12 }, dim: 0.35, spin: true },
    'resident-home':    { cam: { t: [VX - 0.3, 0.4, VZ - 0.1], d: 18, yaw: -22, pitch: 46, sx: 0.06 }, labels: ['vito', 'home'], focus: 'Vito' },
    'resident-services':{ cam: { t: [VX - 1.2, 0.4, VZ + 1.6], d: 21, yaw: -10, pitch: 44, sx: 0.06 }, labels: ['vito'], focus: 'Vito', services: true },
    'resident-verify':  { cam: { t: [VX, 0.4, VZ], d: 17, yaw: -30, pitch: 48, sx: -0.2 }, dim: 0.4, labels: [], focus: 'Vito', verify: true },
    'concern-start':    { cam: { t: [VX + 0.2, 0.4, VZ + 0.3], d: 13, yaw: -18, pitch: 42, sx: 0.06 }, labels: ['home'], token: 'home', status: 'New concern' },
    'concern-route':    { cam: function () {
                            if (step.route === 'lgu') return { t: [(VX + PX) / 2, 0.4, (VZ + PZ) / 2 - 0.5], d: 30, yaw: -40, pitch: 50, sx: 0.06 };
                            if (step.route === 'org') return { t: [VX + 1.6, 1.6, VZ + 0.4], d: 19, yaw: -22, pitch: 36, sx: 0.06 };
                            return { t: [VX + 0.1, 0.4, VZ + 0.2], d: 13, yaw: -20, pitch: 44, sx: 0.06 }; }, route: true },
    'concern-track':    { cam: { t: [VX + 0.1, 0.4, VZ + 0.2], d: 15, yaw: 8, pitch: 46, sx: 0.0 }, labels: ['vitohall'], token: 'vitoHall', status: 'In Progress', board: true },
    'concern-staff':    { cam: { t: [VX, 0.4, VZ], d: 16, yaw: -36, pitch: 50, sx: -0.22 }, dim: 0.42, token: 'vitoHall', status: 'In Progress' },
    'concern-lifecycle':{ cam: { t: [VX + 0.3, 0.4, VZ], d: 15, yaw: -14, pitch: 40, sx: -0.14, sy: 0.1 }, dim: 0.75, lifecycle: true },
    'concern-complaint':{ cam: { t: [VX + 0.2, 0.4, VZ + 0.2], d: 13, yaw: 20, pitch: 40, sx: 0.06 }, labels: ['private'], complaint: true },
    'announce-scope':   { cam: { t: [0.6, 0, -0.6], d: 31, yaw: -20, pitch: 56, sx: 0.15, sy: 0.13 }, scope: true },
    'announce-feeds':   { cam: { t: [0.6, 0, 0], d: 36, yaw: -10, pitch: 50, sx: 0.02 }, dim: 0.6, scopeAfter: true },
    'announce-calendar':{ cam: { t: [VX, 0.4, VZ], d: 20, yaw: 14, pitch: 46, sx: 0.06 }, labels: ['vitoEvent'], event: true },
    'safety-calm':      { cam: { t: [0.6, 0, 0], d: 34, yaw: -24, pitch: 46, sx: 0.06 }, allClear: true },
    'safety-alert':     { cam: { t: [VX, 0.4, VZ + 1.2], d: 24, yaw: -16, pitch: 52, sx: 0.12, sy: 0.22 }, alert: true },
    'safety-hotlines':  { cam: { t: [(VX + PX) / 2, 0.4, (VZ + PZ) / 2], d: 30, yaw: -28, pitch: 46, sx: 0.06 }, hotlines: true },
    'community-bayanihan': { cam: { t: [VX - 0.8, 0.4, VZ + 1.6], d: 18, yaw: -6, pitch: 44, sx: 0.06 }, bayanihan: true },
    'community-market': { cam: { t: [PX + 0.9, 0.3, PZ - 0.4], d: 20, yaw: -32, pitch: 44, sx: 0.04 }, labels: ['market'], market: true },
    'explore-map':      { cam: { t: [0.6, 0, 0], d: 34, yaw: 0, pitch: 66, sx: 0.06 }, hover: true, interactive: true, note: true, mapNames: true },
    'explore-falls':    { cam: { t: [CAMP.c.x + 0.3, 0.4, CAMP.c.z - 1.6], d: 18, yaw: -14, pitch: 42, sx: -0.03, sy: -0.04 }, labels: ['falls', 'cagay'], route2: true },
    'explore-context':  { cam: { t: [0.6, 0, 0], d: 36, yaw: -30, pitch: 40, sx: 0.0 }, clouds: true, labels: ['hallOfficials'] },
    'assistant-chat':   { cam: { t: [0.6, 0, 0], d: 38, yaw: 20, pitch: 44, sx: -0.18 }, dim: 0.5, guide: true },
    'assistant-bounds': { cam: { t: [0.6, 0, 0], d: 40, yaw: 30, pitch: 46, sx: -0.18 }, dim: 0.4, spin: true },
    'staff-console':    { cam: { t: [VX, 0.4, VZ], d: 18, yaw: -30, pitch: 50, sx: -0.25 }, dim: 0.3, focus: 'Vito' },
    'staff-roles':      { cam: { t: [0.6, 0.4, -0.4], d: 33, yaw: -16, pitch: 52, sx: 0.0, sy: -0.02 }, roles: true },
    'staff-records':    { cam: { t: [0.6, 0, 0], d: 30, yaw: -40, pitch: 50, sx: -0.25 }, dim: 0.3 },
    arch:               { cam: { t: [0.6, 0, 0], d: 46, yaw: 40, pitch: 46, sx: 0 }, dim: 0.12, spin: true },
    'arch-security':    { cam: { t: [0.6, 0, 0], d: 46, yaw: 60, pitch: 46, sx: 0 }, dim: 0.12, spin: true },
    evaluation:         { cam: { t: [0.6, 0, 0], d: 46, yaw: 80, pitch: 46, sx: 0 }, dim: 0.1, spin: true },
    conclusion:         { cam: { t: [0.6, 0, 0], d: 36, yaw: -30, pitch: 44, sx: -0.08, sy: 0 }, dim: 0.55, hub: true, allLit: true },
    finale:             { cam: { t: [0.6, 0.4, 0], d: 40, yaw: -26, pitch: 30, fov: 32, sx: 0.2 }, phone: 'finale', ring: true, hub: true, allLit: true, hover: true, interactive: true }
  };
  var LABELS = {
    vito: function () { label('vito', 'Barangay Vito', A.tile('Vito', 0.35)); },
    home: function () { label('home', 'A resident', A.home(), 'wl--mint'); },
    vitohall: function () { label('vitohall', 'Barangay Vito hall', A.vitoHall()); },
    private: function () { label('private', 'Private · resident ↔ barangay officials', A.vitoHall(), 'wl--mint'); },
    market: function () { label('market', 'Local Market listings', A.market()); },
    falls: function () { label('falls', 'Mantayupan Falls · Campangga', A.falls()); },
    cagay: function () { label('cagay', 'You are here · Cagay', A.cagay(), 'wl--mint'); },
    hallOfficials: function () { label('hallOfficials', 'Municipal Hall · Poblacion', A.hall()); },
    vitoEvent: function () { label('vitoEvent', 'Event · Sports Activity', A.vitoHall(), 'wl--mint'); }
  };

  /* ================================================================ per-frame direction */
  var current = null, shotName = 'hero', shotStart = 0, clock = 0;
  var cam = { tx: 1.2, ty: 0, tz: 0.4, d: 60, yaw: -60, pitch: 62, fov: 28, sx: 0.2, sy: 0 };
  var userYaw = 0, userPitch = 0, parallax = { x: 0, y: 0 }, focusTile = null;
  var worldOpacity = 0, worldOpacityT = 1;
  var sepNow = 0, phoneMode = 'hero', phoneK = 0, coreK = 0, orgK = 0, ringK = 0, cloudK = 0;
  var introT = -1;   // seconds since intro start (-1 = done)
  var calm = function () { return doc.dataset.motion !== 'full'; };
  var anim = 1;      // ambient time scale (0 when calm)

  function setShot(name, forward) {
    if (!shots[name]) name = 'hero';
    if (name !== shotName) { userYaw = 0; userPitch = 0; focusTile = null; }
    shotName = name; current = shots[name]; shotStart = clock; shotStepT = clock;
    if (current.ring) buildRing();
    doc.classList.toggle('world-interactive', !!current.interactive);
    if (noteEl) noteEl.hidden = !current.note;
    if (calm()) snapCamera();
  }
  function camTarget() {
    var c = typeof current.cam === 'function' ? current.cam() : current.cam;
    var st = DECK.state;
    var out = { tx: c.t[0], ty: c.t[1], tz: c.t[2], d: c.d, yaw: c.yaw, pitch: c.pitch, fov: c.fov || 28, sx: c.sx || 0, sy: c.sy || 0 };
    if (focusTile) { out.tx = focusTile.mesh.position.x; out.tz = focusTile.mesh.position.z; out.ty = focusTile.top; out.d = Math.min(out.d, 16); }
    if (!st.scrolly) { out.sx = 0; out.sy = 0; out.d *= 1.15; }
    // scroll-linked drift inside the beat (full motion only)
    if (!calm()) {
      var c0 = DECK.chapters[st.chapter], local = st.chapterProgress * c0.beats.length - st.beat;
      if (shotName === 'hero') { out.d = lerp(35, 27, st.chapterProgress); out.yaw = lerp(-30, -16, st.chapterProgress); out.pitch = lerp(38, 44, st.chapterProgress); }
      else out.yaw += (clamp(local, 0, 1) - 0.5) * 7;
      if (current.spin) out.yaw += clock * 3;
      out.yaw += parallax.x * 2.2; out.pitch += parallax.y * 1.4;
    }
    out.yaw += userYaw; out.pitch = clamp(out.pitch + userPitch, 12, 80);
    return out;
  }
  function snapCamera() { if (!current) return; var t = camTarget(); for (var k in t) cam[k] = t[k]; }

  var _tmp = new V3(), _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler();
  function update(dt) {
    var st = DECK.state;
    anim = calm() ? 0 : 1;
    clock += dt;
    var t = clock;
    var sh = current || shots.hero;

    /* ---------- camera */
    var ct = camTarget();
    var lam = calm() ? 60 : 2.4;
    for (var k in ct) {
      if (k === 'yaw') { var dy = ((ct.yaw - cam.yaw + 540) % 360) - 180; cam.yaw = damp(cam.yaw, cam.yaw + dy, lam, dt); }
      else cam[k] = damp(cam[k], ct[k], lam, dt);
    }
    var cp = Math.cos(cam.pitch * DEG), target = _tmp.set(cam.tx, cam.ty, cam.tz);
    camera.position.set(target.x + cam.d * Math.sin(cam.yaw * DEG) * cp, target.y + cam.d * Math.sin(cam.pitch * DEG), target.z + cam.d * Math.cos(cam.yaw * DEG) * cp);
    camera.lookAt(target);
    if (Math.abs(camera.fov - cam.fov) > 0.01) { camera.fov = cam.fov; camera.updateProjectionMatrix(); }
    var W = renderer.domElement.clientWidth, H = renderer.domElement.clientHeight;
    camera.setViewOffset(W, H, -cam.sx * W, cam.sy * H, W, H);

    /* ---------- world opacity (dimmed behind evidence-heavy beats) */
    worldOpacityT = 1 - (sh.dim || 0) * (st.scrolly ? 1 : 0.3);
    worldOpacity = damp(worldOpacity, worldOpacityT, calm() ? 30 : 3, dt);
    worldEl.style.setProperty('--world-opacity', worldOpacity.toFixed(3));

    /* ---------- tiles: intro, separation, glow, hover lift */
    var sepT = sh.sep || 0;
    if (shotName === 'problem-apart' || shotName === 'problem-channels') { var cpg = st.chapterProgress; sepT = 1 - smooth(0.5, 0.86, cpg); if (shotName === 'problem-channels') sepT = Math.max(sepT, 0.55); }
    sepNow = damp(sepNow, sepT, calm() ? 30 : 2.2, dt);
    var introOn = introT >= 0;
    if (introOn) introT += dt;
    var allLanded = true;
    tiles.forEach(function (tl, i) {
      // baseline glow
      tl.glowT = hover === tl ? 0.3 : 0; tl.glowColorT.set('#2FD49B'); tl.liftT = (hover === tl ? 0.14 : 0); tl.dimT = 0;
    });
    direct(sh, t, dt);
    var moved = false;
    tiles.forEach(function (tl) {
      var p = tl.mesh.position, ox = 0, oy = 0, oz = 0, rx = 0, ry = 0, rz = 0;
      if (sepNow > 0.001) {
        var s = sepNow * tl.sepK;
        ox += tl.sepDir.x * s * 2.4; oz += tl.sepDir.z * s * 2.4; oy += tl.sepY * sepNow * 0.9 + Math.sin(t * 0.8 * anim + tl.phase) * 0.12 * sepNow;
        rx += tl.sepRot.x * 0.22 * sepNow; ry += tl.sepRot.y * 0.25 * sepNow; rz += tl.sepRot.z * 0.22 * sepNow;
      }
      if (introOn) {
        var lt = clamp((introT - tl.introDelay) / 1.1, 0, 1);
        if (lt < 1) allLanded = false;
        var e = easeOutBack(lt);
        oy += (1 - e) * 9; rx += (1 - lt) * tl.sepRot.x * 1.4; rz += (1 - lt) * tl.sepRot.z * 1.4;
        ox += (1 - lt) * tl.sepDir.x * 3; oz += (1 - lt) * tl.sepDir.z * 3;
      }
      tl.lift = damp(tl.lift, tl.liftT, 8, dt); oy += tl.lift;
      var nx = tl.home.x + ox, ny = oy, nz = tl.home.z + oz;
      if (Math.abs(p.x - nx) + Math.abs(p.y - ny) + Math.abs(p.z - nz) + Math.abs(tl.mesh.rotation.x - rx) + Math.abs(tl.mesh.rotation.y - ry) + Math.abs(tl.mesh.rotation.z - rz) > 1e-5) {
        p.set(nx, ny, nz); tl.mesh.rotation.set(rx, ry, rz); moved = true;
      }
      tl.glow = damp(tl.glow, tl.glowT, calm() ? 30 : 4, dt);
      tl.mat.userData.u.uDim.value = damp(tl.mat.userData.u.uDim.value, tl.dimT, calm() ? 30 : 5, dt);
      tl.glowColor.lerp(tl.glowColorT, 1 - Math.exp(-6 * dt));
      tl.mat.userData.u.uGlow.value.copy(tl.glowColor).multiplyScalar(tl.glow);
    });
    if (introOn && allLanded) introT = -1;
    if (moved || needsPropSync) syncProps();

    /* ---------- floating things */
    phoneK = damp(phoneK, sh.phone && st.scrolly ? 1 : 0, calm() ? 30 : 3, dt);
    phone.visible = phoneK > 0.01;
    if (phone.visible) {
      var ph = sh.phone || phoneMode; phoneMode = ph;
      var bob = Math.sin(t * 1.1 * anim) * 0.12;
      var hp = shotName === 'hero' ? st.chapterProgress : 0;
      var pose = ph === 'hero' ? { x: st.scrolly ? 0.66 : 0.5, y: -0.02 + bob * 0.08 - hp * 0.05, d: 17, ry: -0.42 + hp * 0.22, rx: -0.06, s: 1.55 }
                               : { x: 0.6, y: 0.0 + bob * 0.08, d: 18, ry: -0.36, rx: -0.05, s: 1.5 };
      if (!st.scrolly) { pose.x = 0.42; pose.y = -0.3; pose.s *= 0.85; }
      camAnchor(pose.x, pose.y - (1 - phoneK) * 0.6, pose.d, phone.position);
      phone.quaternion.copy(camera.quaternion);
      phone.rotateY(pose.ry + Math.sin(t * 0.4 * anim) * 0.04); phone.rotateX(pose.rx); phone.rotateZ(0.03);
      phone.scale.setScalar(pose.s * easeOutBack(phoneK));
      // cycle the three real screens
      var cyc = calm() ? 0 : (t / 4.2) % 3, idx = Math.floor(cyc), f = smooth(0.82, 1, cyc - idx), nxt = (idx + 1) % 3;
      phoneScreens.forEach(function (m, n) {
        var o = 0;
        if (nxt > idx) { if (n === idx) o = 1; if (n === nxt) o = f; }
        else { if (n === 0) o = 1; if (n === idx) o = 1 - f; }
        m.material.opacity = o; m.visible = o > 0.001;
      });
    }
    coreK = damp(coreK, (sh.system || sh.guide || (sh.hub && shotName !== 'problem-joined')) ? 1 : 0, calm() ? 30 : 3, dt);
    coreGem.scale.setScalar(Math.max(0.001, coreK)); coreGem.visible = coreK > 0.01;
    coreGem.userData.core.rotation.y += dt * 0.6 * anim; coreGem.position.y = 4.6 + Math.sin(t * 0.9 * anim) * 0.15;
    var wantOrg = (sh.route && step.route === 'org') || (sh.roles && step.role === 'org') || sh.system;
    orgK = damp(orgK, wantOrg ? 1 : 0, calm() ? 30 : 3, dt);
    orgHub.scale.setScalar(Math.max(0.001, orgK)); orgHub.visible = orgK > 0.01;
    orgHub.userData.core.rotation.y -= dt * 0.8 * anim;
    if (orgK > 0.6) label('org', 'An approved organization', A.org(), 'wl--mint');
    ringK = damp(ringK, sh.ring ? 1 : 0, calm() ? 30 : 2, dt);
    ring.visible = ringK > 0.01;
    if (ring.visible) {
      ring.rotation.y += dt * 0.05 * anim;
      ring.children.forEach(function (c) { c.userData.front.material.opacity = ringK; c.userData.back.material.opacity = ringK * 0.16; });
    }
    cloudK = damp(cloudK, sh.clouds ? 1 : 0, calm() ? 30 : 2, dt);
    clouds.visible = cloudK > 0.01; clouds.scale.setScalar(Math.max(0.001, cloudK));
    if (clouds.visible) clouds.children.forEach(function (m) { m.position.x += m.userData.speed * dt * anim; if (m.position.x > 9) m.position.x = -9; });
    waterTex.offset.y += dt * 0.9 * anim;
    dust.rotation.y += dt * 0.01 * anim; dust.position.y = Math.sin(t * 0.1) * 0.6 * anim;

    /* ---------- signals bookkeeping */
    Object.keys(arcs).forEach(function (key) {
      var a = arcs[key];
      var target = a.want ? a.alphaT : 0;
      a.alpha = damp(a.alpha, target, calm() ? 30 : 4, dt);
      if (a.want) a.head = calm() ? 1 : Math.min(1, a.head + dt * 0.9 * (clock - a.born > a.delay ? 1 : 0));
      a.u.uAlpha.value = a.alpha; a.u.uHead.value = a.head; a.u.uTime.value = t * anim;
      if (!a.want && a.alpha < 0.01) { scene.remove(a.mesh); a.mesh.geometry.dispose(); a.mesh.material.dispose(); delete arcs[key]; }
      else a.want = false;
    });
    Object.keys(ripples).forEach(function (key) {
      var r = ripples[key];
      r.alpha = damp(r.alpha, r.want ? r.alphaT : 0, calm() ? 30 : 4, dt);
      r.u.uAlpha.value = r.alpha; r.u.uTime.value = calm() ? r.u.uPeriod.value * 0.3 : t;
      r.mesh.visible = r.alpha > 0.01;
      r.want = false;
    });
    projectLabels();
  }

  /* ---------- the direction of each shot, written as plain per-frame instructions */
  var homeHouses = null;
  function direct(sh, t, dt) {
    var anyGlow = function (tl, amt, hex) { tl.glowT = Math.max(tl.glowT, amt); if (hex) tl.glowColorT.set(hex); };
    if (sh.labels) sh.labels.forEach(function (l) { if (LABELS[l]) LABELS[l](); });
    if (sh.focus) anyGlow(byName[sh.focus], 0.16, '#2FD49B');

    if (sh.ambient) {
      // messages travel between barangays and Poblacion: "sugid" — telling and reporting
      var slot = Math.floor(t / 1.6);
      for (var k = 0; k < 4; k++) {
        var idx = Math.abs((slot - k) * 2654435761 % 42) | 0, tl = tiles[idx];
        if (tl === POB) continue;
        var out = ((slot - k) % 2) === 0;
        arc('amb' + ((slot - k) % 6 + 6) % 6 + '_' + idx, out ? A.hall() : A.tile(tl.name, 0.05), out ? A.tile(tl.name, 0.05) : A.hall(), { color: out ? '#E6CB84' : '#2FD49B', alpha: 0.9 });
        anyGlow(tl, 0.22, out ? '#E6CB84' : '#2FD49B');
      }
    }
    if (sh.channels) {
      tiles.forEach(function (tl, i) {
        var p = Math.sin(t * (0.7 + tl.hue) * 1.6 + tl.phase);
        if (p > 0.6) anyGlow(tl, (p - 0.6) * 1.2, ['#F0B04E', '#7DB5EE', '#2FD49B', '#BD98F5'][i % 4]);
      });
    }
    if (sh.hub) {
      var hub = A.hall();
      tiles.forEach(function (tl, i) {
        if (tl === POB) return;
        arc('hub' + i, A.tile(tl.name, 0.05), hub, { color: i % 3 ? '#2FD49B' : '#E6CB84', alpha: sh.allLit ? 0.5 : 0.65, delay: (tl.c.distanceTo(POB.c)) * 0.06, width: 0.02, speed: 0.4, height: 0.35 + tl.c.distanceTo(POB.c) * 0.13 });
        anyGlow(tl, sh.allLit ? 0.1 + 0.08 * Math.sin(t * 1.4 - tl.c.distanceTo(POB.c) * 0.5) : 0.08, '#E6CB84');
      });
      ripple('hub', A.hallGround(), { color: '#E6CB84', radius: 1.4, period: 2.6, alpha: 0.8 });
      if (sh.hub && shotName === 'problem-joined') label('hall', 'Municipal Hall · Poblacion', A.hall());
    }
    if (sh.system) {
      arc('sys1', A.home(), A.core(), { color: '#2FD49B', height: 1.2 });
      arc('sys2', A.core(), A.hall(), { color: '#E6CB84', height: 1.2 });
      arc('sys3', A.core(), A.org(), { color: '#7DB5EE', height: 0.6 });
    }
    if (sh.services) {
      // the services hub: gentle links from Vito to the places services point to
      arc('sv1', A.home(), A.market(), { color: '#F0B04E', alpha: 0.7 });
      arc('sv2', A.home(), A.falls(), { color: '#7DB5EE', alpha: 0.7 });
      arc('sv3', A.home(), A.hall(), { color: '#E6CB84', alpha: 0.7 });
    }
    if (sh.verify) { anyGlow(VITO, 0.25, '#E6CB84'); ripple('verify', A.vitoGround(), { color: '#E6CB84', radius: 1.2 }); }
    if (sh.token || sh.route || sh.lifecycle || sh.complaint) tokenDirect(sh, t, dt); else token.visible = false;
    if (sh.board) {
      // public board: neighbours in Vito can see the report
      anyGlow(VITO, 0.18, '#7DB5EE');
      ripple('board', A.vitoGround(), { color: '#7DB5EE', radius: 1.8, period: 3 });
    }
    if (sh.complaint) {
      tiles.forEach(function (tl) { if (tl !== VITO) tl.dimT = 0.6; });
      arc('private', A.home(), A.vitoHall(), { color: '#BD98F5', height: 0.5, speed: 0.25, dash: 1.2 });
    }
    if (sh.scope || sh.scopeAfter) {
      var all = step.scope === 'all';
      if (all) {
        var src = A.hall();
        ripple('scopeAll', A.hallGround(), { color: '#E6CB84', radius: 9, period: 3.2, alpha: 0.9 });
        tiles.forEach(function (tl) {
          var dd = tl.c.distanceTo(POB.c), w = Math.max(0, Math.sin((t * 2.2 - dd * 0.7)));
          anyGlow(tl, 0.12 + 0.3 * Math.pow(w, 3) * (sh.scope ? 1 : 0.4), '#E6CB84');
        });
        label('scopeLbl', 'All Barangays · from LGU Department of Agriculture', src);
      } else {
        tiles.forEach(function (tl) { if (tl !== VITO) tl.dimT = sh.scope ? 0.65 : 0.3; });
        anyGlow(VITO, 0.38 + 0.12 * Math.sin(t * 2.4 * anim), '#2FD49B');
        ripple('scopeVito', A.vitoGround(), { color: '#2FD49B', radius: 1.9, period: 2.4 });
        label('scopeLbl', 'Recipients: Vito · from Barangay Vito', A.vitoHall(), 'wl--mint');
      }
    }
    if (sh.event) { anyGlow(VITO, 0.2, '#2FD49B'); ripple('event', A.vitoGround(), { color: '#2FD49B', radius: 1.1, period: 3 }); }
    if (sh.allClear) {
      tiles.forEach(function (tl) { anyGlow(tl, 0.06 + 0.04 * Math.sin(t * 1.2 + tl.phase), '#2FD49B'); });
      label('clear', 'All clear · normal safety status', A.tile('Cagay', 0.5), 'wl--mint');
    }
    if (sh.alert) {
      var s3 = step.alert === '3';
      anyGlow(VITO, s3 ? 0.42 + 0.18 * Math.sin(t * 2.2 * anim) : 0.18, s3 ? '#F07C7C' : '#F0B04E');
      if (s3) {
        tiles.forEach(function (tl) { if (tl !== VITO) tl.dimT = 0.55; });
        ripple('alertVito', A.vitoGround(), { color: '#F08A6A', radius: 2.6, period: 2.2, alpha: 1 });
        label('alertLbl', 'Registered residents of Barangay Vito', A.tile('Vito', 0.4), 'wl--alert');
      } else {
        label('alertLbl', step.alert === '1' ? 'Composing · emergency type' : 'Composing · alert message', A.vitoHall(), 'wl--alert');
        ripple('alertHall', A.vitoGround(), { color: '#F0B04E', radius: 0.9, period: 2.6, alpha: 0.7 });
      }
    }
    if (sh.hotlines) {
      arc('hot', A.home(), A.hall(), { color: '#F07C7C', speed: 1.1, dash: 3 });
      label('hotHome', 'Tap to call', A.home(), 'wl--alert');
    }
    if (sh.bayanihan) {
      if (!homeHouses) homeHouses = pickHouses(['Vito', 'Hilasgasan', 'Paril', 'Giloctog'], 7, 5);
      for (var h = 0; h < homeHouses.length - 1; h++) {
        if (h % 2) continue;
        arc('bay' + h, homeHouses[h], homeHouses[h + 1], { color: '#2FD49B', height: 0.5, delay: h * 0.25 });
      }
      label('bayL', 'Neighbors helping neighbors', homeHouses[0].clone().add(new V3(0, 0.2, 0)), 'wl--mint');
    }
    if (sh.market) {
      var sellers = pickHouses(['Japitan', 'Santa Ana', 'Azucena', 'Maghanoy', 'Guibuangan', 'Patupat'], 6, 13);
      sellers.forEach(function (p, i) { arc('mk' + i, p, A.market(), { color: '#F0B04E', height: 0.7, delay: i * 0.18 }); });
    }
    if (sh.mapNames) {
      ['Poblacion', 'Vito', 'Cagay', 'Campangga', 'Mantalongon', 'Mayana'].forEach(function (n) { label('nm' + n, n, A.tile(n, 0.25)); });
    }
    if (sh.route2) {
      routeLine(A.cagay(), A.falls());
    }
    if (sh.guide) {
      // the assistant's guide light: the floating AI button, pointing to existing screens
      arc('g1', A.core(), A.home(), { color: '#2FD49B', height: 0.8 });
      coreGem.userData.core.material.color.set('#2FD49B');
    } else coreGem.userData.core.material.color.set('#E6CB84');
    if (sh.roles) {
      var role = step.role;
      tiles.forEach(function (tl) {
        var on = role === 'it' || role === 'lgu' ? 1 : (tl === VITO ? 1 : 0);
        if (role === 'org') on = 0;
        if (!on) tl.dimT = 0.6;
        else anyGlow(tl, (role === 'captain' || role === 'councilor') ? 0.5 + 0.1 * Math.sin(t * 2 * anim) : role === 'it' ? 0.2 : 0.12, role === 'it' ? '#E6CB84' : '#2FD49B');
      });
      var txt = { captain: 'Scope: own barangay (Vito)', councilor: 'Scope: own barangay · narrower capabilities', lgu: 'Scope: assigned department · any audience', org: 'Scope: the organization · approved service area', it: 'Scope: municipality-wide oversight' }[role];
      var at = role === 'org' ? A.org() : (role === 'captain' || role === 'councilor') ? A.tile('Vito', 0.4) : A.hall();
      label('roleLbl', txt, at, role === 'it' ? '' : 'wl--mint');
      if (role === 'lgu' || role === 'it') ripple('roleHall', A.hallGround(), { color: role === 'it' ? '#E6CB84' : '#2FD49B', radius: 1.4, period: 2.6 });
    }
  }
  var pickCache = {};
  function pickHouses(names, n, seed) {
    var key = names.join() + n + seed; if (pickCache[key]) return pickCache[key];
    var rnd = rng(seed), out = pickCache[key] = [];
    var pool = []; props[2].items.concat(props[3].items).forEach(function (it) { if (names.indexOf(it.tile.name) >= 0) pool.push(it); });
    for (var k = 0; k < n && pool.length; k++) {
      var it = pool.splice(Math.floor(rnd() * pool.length), 1)[0];
      var p = new V3(it.x, it.tile.top + 0.12, it.z).applyMatrix4(it.tile.mesh.matrixWorld);
      out.push(p);
    }
    return out;
  }
  var routeMesh = null;
  function routeLine(a, b) {
    if (!routeMesh) {
      // an illustrative path that hugs the tiles, not the app's computed route
      var pts = [];
      for (var k = 0; k <= 24; k++) {
        var f = k / 24, x = lerp(a.x, b.x, f) + Math.sin(f * Math.PI * 2) * 0.5, z = lerp(a.z, b.z, f) + Math.sin(f * Math.PI) * 0.6;
        var y = 0.3;
        tiles.forEach(function (tl) { if (inPoly(x, -z, tl.ring)) y = tl.top + 0.06; });
        pts.push(new V3(x, y, z));
      }
      routeMesh = arc('route', pts[0], pts[pts.length - 1], { color: '#7DB5EE', height: 0.01 });
      var curve = new THREE.CatmullRomCurve3(pts);
      routeMesh.mesh.geometry.dispose();
      routeMesh.mesh.geometry = new THREE.TubeGeometry(curve, 96, 0.035, 6, false);
      routeMesh.u.uDash.value = 9; routeMesh.u.uSpeed.value = 0.25;
    }
    var r = arcs.route; if (!r) { routeMesh = null; return; }
    r.want = true; r.alphaT = 1;
  }
  var tokenPos = new V3(), tokenStatus = '';
  var _a = new V3();
  function camAnchor(nx, ny, dist, out) {
    _a.set(nx, ny, 0.5).unproject(camera).sub(camera.position).normalize();
    return out.copy(camera.position).addScaledVector(_a, dist);
  }
  function tokenDirect(sh, t, dt) {
    token.visible = true;
    var target, status = sh.status || '', col = '#2FD49B';
    if (sh.route) {
      var dest = step.route === 'lgu' ? A.hall() : step.route === 'org' ? A.org() : A.vitoHall();
      var c = arc('route_' + step.route, A.home(), dest, { color: step.route === 'lgu' ? '#E6CB84' : step.route === 'org' ? '#7DB5EE' : '#2FD49B' });
      var f = calm() ? 1 : clamp((clock - shotStepT) / 1.6, 0, 1);
      target = c.curve.getPoint(smooth(0, 1, f));
      status = f < 1 ? 'Sending…' : (step.route === 'lgu' ? 'To an LGU department' : step.route === 'org' ? 'To an organization' : 'To Barangay Vito');
      label('dest', step.route === 'lgu' ? 'Municipal Hall · Poblacion' : step.route === 'org' ? 'An approved organization' : 'Barangay Vito hall', dest);
    } else if (sh.lifecycle) {
      // Active → In Progress → Awaiting Information → (reply) → In Progress → Resolved
      var cyc = calm() ? 7.5 : (t - shotStart) % 11;
      var hallP = A.vitoHall(), homeP = A.home();
      var c1 = arc('lc', homeP, hallP, { color: '#7DB5EE', height: 0.9, alpha: 0.6 });
      if (cyc < 2) { target = c1.curve.getPoint(smooth(0, 2, cyc)); status = 'Active'; col = '#F0B04E'; }
      else if (cyc < 4) { target = hallP; status = 'In Progress'; col = '#7DB5EE'; }
      else if (cyc < 6) { target = c1.curve.getPoint(1 - smooth(4, 5.4, cyc)); status = 'Awaiting Information'; col = '#BD98F5'; }
      else if (cyc < 7.4) { target = c1.curve.getPoint(smooth(6, 7.4, cyc)); status = 'Resident replies → In Progress'; col = '#7DB5EE'; }
      else if (cyc < 9) { target = c1.curve.getPoint(1 - smooth(7.4, 9, cyc)); status = 'Resolved'; col = '#2FD49B'; }
      else { target = homeP; status = 'Resolved'; col = '#2FD49B'; ripple('resolved', A.homeGround(), { color: '#2FD49B', radius: 0.9, period: 1.6 }); }
    } else if (sh.complaint) {
      target = A.home(); status = 'Complaint · confidential'; col = '#BD98F5';
    } else if (sh.token === 'home') { target = A.home().add(new V3(0, 0.35 + Math.sin(t * 2 * anim) * 0.05, 0)); }
    else { target = A.vitoHall().add(new V3(Math.cos(t * 1.2 * anim) * 0.35, 0.3, Math.sin(t * 1.2 * anim) * 0.35)); col = '#7DB5EE'; }
    tokenPos.lerp(target, sh.lifecycle || sh.route ? 1 : 1 - Math.exp(-6 * dt));
    if (!token.userData.placed) { tokenPos.copy(target); token.userData.placed = true; }
    token.position.copy(tokenPos);
    tokenGlow.material.color.set(col);
    label('token', status, tokenPos.clone().add(new V3(0, 0.25, 0)), 'wl--status');
  }
  var shotStepT = 0;

  /* ---------------------------------------------------------------- props follow tiles */
  var needsPropSync = true;
  function syncProps() {
    needsPropSync = false;
    tiles.forEach(function (tl) { tl.mesh.updateMatrixWorld(true); });
    props.forEach(function (g) {
      g.items.forEach(function (it, k) { _m.multiplyMatrices(it.tile.mesh.matrixWorld, it.local); g.mesh.setMatrixAt(k, _m); });
      g.mesh.instanceMatrix.needsUpdate = true;
    });
    attach.forEach(function (a) {
      var tl = a.tile.mesh; tl.updateMatrixWorld(true);
      a.obj.position.copy(a.local).applyMatrix4(tl.matrixWorld).sub(island.position);
      a.obj.quaternion.copy(tl.quaternion);
      if (a.obj === church) a.obj.rotateY(0.5);
      if (a.obj === market) a.obj.rotateY(-0.4);
    });
  }

  /* ---------------------------------------------------------------- labels projection */
  var _p = new V3();
  function projectLabels() {
    var W = renderer.domElement.clientWidth, H = renderer.domElement.clientHeight, show = DECK.state.scrolly && worldOpacity > 0.5;
    Object.keys(labels).forEach(function (k) {
      var l = labels[k];
      if (!l.want || !show) { l.el.classList.remove('is-on'); l.want = false; return; }
      _p.copy(l.pos).project(camera);
      var x = (_p.x + 1) / 2 * W, y = (1 - _p.y) / 2 * H;
      var vis = _p.z < 1 && x > 40 && x < W - 40 && y > 70 && y < H - 40;
      l.el.style.transform = 'translate3d(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px,0) translate(-50%,-100%)';
      l.el.classList.toggle('is-on', vis);
      l.want = false;
    });
  }

  /* ================================================================ hover, focus and drag */
  var ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), hover = null, pointer = { x: -1, y: -1, moved: false };
  var meshes = tiles.map(function (t) { return t.mesh; });
  function overContent(el) { return el && el.closest && el.closest('.copy, .ev > *, .topbar, .hud, .notes, dialog, .hero, .credits, button, a, .hero-foot'); }
  window.addEventListener('pointermove', function (e) {
    pointer.x = e.clientX; pointer.y = e.clientY; pointer.moved = true; pointer.target = e.target;
    parallax.x = (e.clientX / innerWidth - 0.5) * 2; parallax.y = (e.clientY / innerHeight - 0.5) * 2;
    if (drag) { userYaw = drag.yaw - (e.clientX - drag.x) * 0.25; userPitch = clamp(drag.pitch + (e.clientY - drag.y) * 0.15, -25, 25); }
  }, { passive: true });
  function pick() {
    if (!pointer.moved || !current) return;
    pointer.moved = false;
    var allowed = current.hover && DECK.state.scrolly && worldOpacity > 0.6 && !overContent(pointer.target);
    var hit = null;
    if (allowed) {
      var r = canvas.getBoundingClientRect();
      ndc.set((pointer.x - r.left) / r.width * 2 - 1, -((pointer.y - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ndc, camera);
      var hits = ray.intersectObjects(meshes, false);
      hit = hits.length ? hits[0].object.userData.tile : null;
    }
    if (hit !== hover) {
      hover = hit;
      if (hover) { tipEl.innerHTML = '<b>' + hover.name + '</b><span>' + hover.area.toFixed(2) + ' km² · PSA ' + hover.code + '</span>'; tipEl.hidden = false; }
      else tipEl.hidden = true;
    }
    if (hover) { tipEl.style.transform = 'translate3d(' + pointer.x + 'px,' + pointer.y + 'px,0) translate(-50%, calc(-100% - 16px))'; }
    document.body.style.cursor = hover ? 'pointer' : '';
  }
  var drag = null;
  window.addEventListener('pointerdown', function (e) {
    if (!current || !current.interactive || overContent(e.target) || e.button !== 0) return;
    drag = { x: e.clientX, y: e.clientY, yaw: userYaw, pitch: userPitch, t: performance.now() };
  });
  window.addEventListener('pointerup', function (e) {
    if (!drag) return;
    var click = Math.abs(e.clientX - drag.x) + Math.abs(e.clientY - drag.y) < 6;
    drag = null;
    if (click && hover && current && current.interactive) { focusTile = focusTile === hover ? null : hover; DECK.toast && DECK.toast(focusTile ? focusTile.name + ' — ' + focusTile.area.toFixed(2) + ' km²' : 'Back to the whole municipality'); }
  });

  /* ================================================================ resize, quality, loop */
  function resize() {
    var w = innerWidth, h = innerHeight;
    renderer.setPixelRatio(dpr);
    renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize);
  var frames = 0, slowAcc = 0, lastT = performance.now(), running = false, rafId = 0;
  function frame(now) {
    rafId = requestAnimationFrame(frame);
    var dt = Math.min(0.05, (now - lastT) / 1000); lastT = now;
    if (document.hidden) return;
    // adaptive quality: lower resolution, then shadows, if the laptop struggles
    frames++; slowAcc += dt;
    if (frames === 90) {
      var avg = slowAcc / frames;
      if (avg > 0.026 && dpr > 1) { dpr = Math.max(1, dpr - 0.35); resize(); }
      else if (avg > 0.03 && renderer.shadowMap.enabled) { renderer.shadowMap.enabled = false; scene.traverse(function (o) { if (o.material) o.material.needsUpdate = true; }); }
      frames = 0; slowAcc = 0;
    }
    pick();
    update(dt);
    renderer.render(scene, camera);
  }
  function start() {
    if (running) return; running = true;
    resize(); lastT = performance.now(); rafId = requestAnimationFrame(frame);
    worldEl.classList.add('is-ready');
  }
  function stop() {
    running = false; cancelAnimationFrame(rafId);
    worldEl.classList.remove('is-ready');
    Object.keys(labels).forEach(function (k) { labels[k].el.classList.remove('is-on'); });
    tipEl.hidden = true;
  }

  /* ================================================================ wiring to the deck */
  window.addEventListener('esugid:state', function (e) { setShot(e.detail.shot, e.detail.forward); });
  window.addEventListener('esugid:step', function (e) {
    var d = e.detail; if (!d || d.value == null) return;
    if (step[d.name] !== d.value) { step[d.name] = d.value; shotStepT = clock; }
  });
  window.addEventListener('esugid:motion', function (e) {
    if (e.detail.mode === 'static') stop(); else { start(); if (e.detail.mode === 'calm') snapCamera(); }
  });

  // intro order: barangays land in waves spreading from Poblacion
  tiles.forEach(function (tl) { tl.introDelay = 0.25 + tl.c.distanceTo(POB.c) * 0.09 + (tl.hue * 0.15); });
  setShot(DECK.state.shot || 'hero');
  if (DECK.state.shot === 'hero' && !calm()) { introT = 0; } else snapCamera();
  if (doc.dataset.motion !== 'static') start();
  // first-frame camera: start high and far for the intro sweep
  if (introT === 0) { cam.d = 52; cam.pitch = 58; cam.yaw = -58; }
  // settle(): jump every damped value to its resting state (used by automated screenshots)
  function settle() { var keep = introT; introT = -1; for (var k = 0; k < 90; k++) update(0.05); renderer.render(scene, camera); }
  window.ESUGID.world = { scene: scene, camera: camera, renderer: renderer, tiles: tiles, setShot: setShot, settle: settle };
})();
