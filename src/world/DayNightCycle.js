import * as THREE from 'three';

// ============================================================
// MODO DE TESTE — deixe true durante o desenvolvimento: o ciclo
// fica mais lento (mais tempo real de luz do dia por sessão) e o
// jogo já começa ao meio-dia. Troque para false quando for testar
// o ciclo completo dia/noite de verdade, ou publicar.
// ============================================================
const TEST_MODE = true;

export class DayNightCycle {
  constructor(scene, { autoCreateFog = true, autoStorms = true } = {}) {
    this.scene = scene;

    this.time = TEST_MODE ? 12 : 8;
    this.timeSpeed = TEST_MODE ? 0.035 : 0.1;

    this.autoStorms = autoStorms;
    this._stormActive = false;
    this._stormTimeLeft = 0;
    this._nextAutoStormCheck = this.time + 3;
    this._flashPower = 0;
    this._nextLightning = 0;

    if (!scene.fog && autoCreateFog) {
      scene.fog = new THREE.Fog('#87CEEB', 40, 220);
    }

    this._buildKeyframes();
    this._buildSky();
    this._buildLights();
    this._buildStars();
    this._buildSunAndMoon();
    this._buildClouds();
    this._buildGodRays();
    this._buildAurora();
    this._buildRain();

    this.scene.background = null;

    this._tmpZenith = new THREE.Color();
    this._tmpHorizon = new THREE.Color();
    this._tmpSunColor = new THREE.Color();
    this._tmpHemiSky = new THREE.Color();
    this._tmpHemiGround = new THREE.Color();
    this._tmpCloudColor = new THREE.Color();
    this._sunWorldPos = new THREE.Vector3();
    this._groundBelowSun = new THREE.Vector3();
  }

  // ============================================================
  // KEYFRAMES
  //
  // O QUE MUDOU NESTA VERSÃO:
  // 1) DIA MAIS LONGO: o núcleo de luz plena (11h–16h antes) agora
  //    vai de 7h a 19h — mais de metade do relógio inteiro fica com
  //    céu claro e boa visibilidade.
  // 2) NOITE MAIS CURTA: comprimida para ~21h–5h30 (era ~20h30–5h30).
  // 3) NOITE MAIS CLARA: as cores de zênite/horizonte deixaram de
  //    ser quase pretas (0x020208) e viraram um azul-marinho visível
  //    (0x0c1230/0x141c40) — ainda claramente "noite", só não cega.
  // 4) Luar (moon) e luz hemisférica (hemi) bem mais fortes à noite,
  //    e o alcance de neblina à noite aumentou também (antes ficava
  //    mais curto justamente na hora mais escura, piorando tudo).
  // 5) Estrelas com opacidade um pouco menor (0.7 em vez de 1.0) —
  //    ainda bonitas, mas não competem tanto com a claridade nova.
  // ============================================================
  _buildKeyframes() {
    this.keyframes = [
      { t: 0.0,  zenith: 0x0c1230, horizon: 0x141c40, sun: 0.0,  sunColor: 0x9db4ff, moon: 0.55, hemiSky: 0x1a2350, hemiGround: 0x181410, hemi: 0.45, star: 0.7, fog: [50, 260], cloud: [0.20, 0x2a3050] },
      { t: 4.0,  zenith: 0x0c1230, horizon: 0x141c40, sun: 0.0,  sunColor: 0x9db4ff, moon: 0.55, hemiSky: 0x1a2350, hemiGround: 0x181410, hemi: 0.45, star: 0.7, fog: [50, 260], cloud: [0.20, 0x2a3050] },
      { t: 5.5,  zenith: 0x162045, horizon: 0x3a3160, sun: 0.05, sunColor: 0xffb37a, moon: 0.4,  hemiSky: 0x263566, hemiGround: 0x1e1a14, hemi: 0.5,  star: 0.4, fog: [55, 280], cloud: [0.25, 0x554a70] },
      { t: 6.5,  zenith: 0x2a4a78, horizon: 0xff8a56, sun: 0.9,  sunColor: 0xffa04d, moon: 0.1,  hemiSky: 0x3c5d8e, hemiGround: 0x281f14, hemi: 0.65, star: 0.0, fog: [60, 320], cloud: [0.38, 0xffc095] },
      { t: 7.0,  zenith: 0x4a90c0, horizon: 0xffd27a, sun: 1.2,  sunColor: 0xfff0c0, moon: 0.0,  hemiSky: 0x6fb1e0, hemiGround: 0x2e2416, hemi: 0.9,  star: 0.0, fog: [65, 380], cloud: [0.45, 0xfff2d8] },
      { t: 9.0,  zenith: 0x2f7fd6, horizon: 0xbfe3ff, sun: 1.4,  sunColor: 0xffffff, moon: 0.0,  hemiSky: 0x8fc4ec, hemiGround: 0x3a2f1e, hemi: 1.0,  star: 0.0, fog: [70, 440], cloud: [0.5,  0xffffff] },
      { t: 13.0, zenith: 0x1f6fd0, horizon: 0xd9f0ff, sun: 1.5,  sunColor: 0xffffff, moon: 0.0,  hemiSky: 0x9fd0f2, hemiGround: 0x3d3220, hemi: 1.05, star: 0.0, fog: [70, 440], cloud: [0.5,  0xffffff] },
      { t: 17.0, zenith: 0x2f7fd6, horizon: 0xd8e8ff, sun: 1.35, sunColor: 0xfff4e0, moon: 0.0,  hemiSky: 0x8fc4ec, hemiGround: 0x3a2f1e, hemi: 0.95, star: 0.0, fog: [65, 400], cloud: [0.48, 0xfff0e0] },
      { t: 19.0, zenith: 0x35507a, horizon: 0xff8a4c, sun: 1.1,  sunColor: 0xffaa5c, moon: 0.0,  hemiSky: 0x4d6f9a, hemiGround: 0x2e2214, hemi: 0.8,  star: 0.0, fog: [60, 340], cloud: [0.45, 0xffb98a] },
      { t: 20.0, zenith: 0x2a3560, horizon: 0xff5d5d, sun: 0.3,  sunColor: 0xff6a4d, moon: 0.15, hemiSky: 0x38366a, hemiGround: 0x201812, hemi: 0.6,  star: 0.15,fog: [55, 290], cloud: [0.35, 0xd08a8a] },
      { t: 21.0, zenith: 0x14204a, horizon: 0x2c2a58, sun: 0.0,  sunColor: 0xff8a5c, moon: 0.45, hemiSky: 0x202c58, hemiGround: 0x181410, hemi: 0.48, star: 0.5, fog: [50, 270], cloud: [0.22, 0x30345a] },
      { t: 24.0, zenith: 0x0c1230, horizon: 0x141c40, sun: 0.0,  sunColor: 0x9db4ff, moon: 0.55, hemiSky: 0x1a2350, hemiGround: 0x181410, hemi: 0.45, star: 0.7, fog: [50, 260], cloud: [0.20, 0x2a3050] },
    ];
  }

  _findKeyframePair() {
    const kf = this.keyframes;
    for (let i = 0; i < kf.length - 1; i++) {
      if (this.time >= kf[i].t && this.time <= kf[i + 1].t) {
        const span = kf[i + 1].t - kf[i].t;
        const t = span > 0 ? (this.time - kf[i].t) / span : 0;
        return { a: kf[i], b: kf[i + 1], t: THREE.MathUtils.smoothstep(t, 0, 1) };
      }
    }
    return { a: kf[0], b: kf[0], t: 0 };
  }

  // ============================================================
  // CÉU
  // ============================================================
  _buildSky() {
    const geometry = new THREE.SphereGeometry(500, 32, 16);

    this._skyUniforms = {
      uZenithColor: { value: new THREE.Color(0x87ceeb) },
      uHorizonColor: { value: new THREE.Color(0xffffff) },
      uSunDirection: { value: new THREE.Vector3(0, 1, 0) },
      uSunColor: { value: new THREE.Color(0xffffff) },
      uSunIntensity: { value: 1.0 },
      uFlash: { value: 0.0 },
    };

    const material = new THREE.ShaderMaterial({
      uniforms: this._skyUniforms,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      vertexShader: `
        varying vec3 vWorldPosition;
        void main() {
          vec4 worldPos = modelMatrix * vec4(position, 1.0);
          vWorldPosition = worldPos.xyz;
          gl_Position = projectionMatrix * viewMatrix * worldPos;
        }
      `,
      fragmentShader: `
        uniform vec3 uZenithColor;
        uniform vec3 uHorizonColor;
        uniform vec3 uSunDirection;
        uniform vec3 uSunColor;
        uniform float uSunIntensity;
        uniform float uFlash;
        varying vec3 vWorldPosition;

        void main() {
          vec3 dir = normalize(vWorldPosition);
          float heightFactor = smoothstep(-0.12, 0.55, dir.y);
          vec3 skyColor = mix(uHorizonColor, uZenithColor, heightFactor);

          float sunAmount = max(dot(dir, uSunDirection), 0.0);
          vec3 sunGlow = uSunColor * pow(sunAmount, 10.0) * uSunIntensity * 0.6;
          vec3 sunHalo = uSunColor * pow(sunAmount, 3.0) * uSunIntensity * 0.15;

          vec3 finalColor = skyColor + sunGlow + sunHalo;
          finalColor = mix(finalColor, vec3(1.0), uFlash * 0.5);

          gl_FragColor = vec4(finalColor, 1.0);
        }
      `,
    });

    this.skyMesh = new THREE.Mesh(geometry, material);
    this.skyMesh.frustumCulled = false;
    this.scene.add(this.skyMesh);
  }

  // ============================================================
  // LUZES
  // ============================================================
  _buildLights() {
    this.hemiLight = new THREE.HemisphereLight(0x87ceeb, 0x3a2f1e, 1.0);
    this.scene.add(this.hemiLight);
    this.ambientLight = this.hemiLight;

    this.dirLight = new THREE.DirectionalLight(0xfffaed, 1.4);
    this.dirLight.castShadow = true;
    this.dirLight.shadow.mapSize.set(2048, 2048);
    this.dirLight.shadow.bias = -0.001;
    const cam = this.dirLight.shadow.camera;
    cam.left = -150; cam.right = 150; cam.top = 150; cam.bottom = -150;
    cam.near = 1; cam.far = 500;
    this.dirLight.target.position.set(0, 0, 0);
    this.scene.add(this.dirLight, this.dirLight.target);

    this.moonLight = new THREE.DirectionalLight(0x9fb4ff, 0.0);
    this.moonLight.target.position.set(0, 0, 0);
    this.scene.add(this.moonLight, this.moonLight.target);
  }

  // ============================================================
  // ESTRELAS
  // ============================================================
  _buildStars() {
    const count = 800;
    const positions = new Float32Array(count * 3);
    const phases = new Float32Array(count);
    const sizes = new Float32Array(count);

    for (let i = 0; i < count; i++) {
      const v = new THREE.Vector3(
        Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1
      ).normalize();
      if (v.y < 0.05) v.y = Math.abs(v.y) + 0.05;

      const r = 480;
      positions[i * 3] = v.x * r;
      positions[i * 3 + 1] = v.y * r;
      positions[i * 3 + 2] = v.z * r;
      phases[i] = Math.random();
      sizes[i] = 1.5 + Math.random() * 2.5;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1));
    geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));

    this._starUniforms = {
      uTime: { value: 0 },
      uOpacity: { value: 0 },
      uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
    };

    const material = new THREE.ShaderMaterial({
      uniforms: this._starUniforms,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: `
        attribute float aPhase;
        attribute float aSize;
        uniform float uTime;
        uniform float uPixelRatio;
        varying float vTwinkle;
        void main() {
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          vTwinkle = 0.55 + 0.45 * sin(uTime * 2.0 + aPhase * 6.2831);
          gl_PointSize = aSize * uPixelRatio * (300.0 / -mvPosition.z);
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: `
        uniform float uOpacity;
        varying float vTwinkle;
        void main() {
          vec2 uv = gl_PointCoord - vec2(0.5);
          float d = length(uv);
          float alpha = smoothstep(0.5, 0.0, d);
          gl_FragColor = vec4(vec3(1.0), alpha * vTwinkle * uOpacity);
        }
      `,
    });

    this.stars = new THREE.Points(geometry, material);
    this.stars.frustumCulled = false;
    this.scene.add(this.stars);
  }

  // ============================================================
  // SOL / LUA
  // ============================================================
  _createGlowTexture() {
    const size = 128;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d');
    const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    gradient.addColorStop(0, 'rgba(255,255,255,1)');
    gradient.addColorStop(0.4, 'rgba(255,255,255,0.7)');
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  _buildSunAndMoon() {
    this._glowTexture = this._createGlowTexture();

    this.sunGlowSprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map: this._glowTexture, color: 0xffcc88, transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
    }));
    this.sunGlowSprite.scale.set(60, 60, 1);
    this.scene.add(this.sunGlowSprite);

    this.sunSprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map: this._glowTexture, color: 0xffffff, transparent: true,
      blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
    }));
    this.sunSprite.scale.set(18, 18, 1);
    this.scene.add(this.sunSprite);

    this.moonSprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map: this._glowTexture, color: 0xe6ecff, transparent: true,
      blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
    }));
    this.moonSprite.scale.set(14, 14, 1);
    this.scene.add(this.moonSprite);
  }

  // ============================================================
  // NUVENS
  // ============================================================
  _buildClouds() {
    this.clouds = [];
    this._windDir = new THREE.Vector3(1, 0, 0.3).normalize();

    for (let i = 0; i < 26; i++) {
      const material = new THREE.SpriteMaterial({
        map: this._glowTexture, color: 0xffffff, transparent: true,
        opacity: 0, depthWrite: false,
      });
      const sprite = new THREE.Sprite(material);
      const scale = 40 + Math.random() * 55;
      sprite.scale.set(scale, scale * 0.45, 1);
      sprite.position.set(
        (Math.random() - 0.5) * 500, 85 + Math.random() * 45, (Math.random() - 0.5) * 500
      );
      this.scene.add(sprite);
      this.clouds.push({ sprite, baseOpacity: 0.5 + Math.random() * 0.5, speed: 2 + Math.random() * 3 });
    }
  }

  // ============================================================
  // GOD RAYS
  // ============================================================
  _buildGodRays() {
    this._godRays = [];
    const count = 7;

    for (let i = 0; i < count; i++) {
      const material = new THREE.SpriteMaterial({
        map: this._glowTexture, color: 0xffdca8, transparent: true,
        opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
      });
      const sprite = new THREE.Sprite(material);
      this.scene.add(sprite);
      this._godRays.push({ sprite, t: i / (count - 1) });
    }
  }

  // ============================================================
  // AURORA
  // ============================================================
  _buildAurora() {
    const uniforms = { uTime: { value: 0 }, uOpacity: { value: 0 } };
    this._auroraUniforms = uniforms;

    const geometry = new THREE.PlaneGeometry(400, 120, 64, 16);
    const material = new THREE.ShaderMaterial({
      uniforms,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      fog: false,
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform float uTime;
        uniform float uOpacity;
        varying vec2 vUv;
        void main() {
          float wave1 = sin(vUv.x * 6.0 + uTime * 0.4) * 0.5 + 0.5;
          float wave2 = sin(vUv.x * 3.0 - uTime * 0.25 + 2.0) * 0.5 + 0.5;
          float band = smoothstep(0.0, 0.5, vUv.y) * smoothstep(1.0, 0.5, vUv.y);
          vec3 colorA = vec3(0.1, 0.9, 0.6);
          vec3 colorB = vec3(0.5, 0.2, 0.9);
          vec3 color = mix(colorA, colorB, wave2);
          float alpha = band * (wave1 * 0.6 + 0.2) * uOpacity;
          gl_FragColor = vec4(color, alpha);
        }
      `,
    });

    this.aurora = new THREE.Mesh(geometry, material);
    this.aurora.position.set(0, 160, -200);
    this.aurora.rotation.x = Math.PI * 0.05;
    this.scene.add(this.aurora);
  }

  // ============================================================
  // CHUVA
  // ============================================================
  _buildRain() {
    const count = 600;
    const positions = new Float32Array(count * 2 * 3);
    this._rainDrops = new Float32Array(count * 3);

    const spread = 90;
    for (let i = 0; i < count; i++) {
      const x = (Math.random() - 0.5) * spread * 2;
      const y = Math.random() * 40;
      const z = (Math.random() - 0.5) * spread * 2;
      this._rainDrops[i * 3] = x;
      this._rainDrops[i * 3 + 1] = y;
      this._rainDrops[i * 3 + 2] = z;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    const material = new THREE.LineBasicMaterial({
      color: 0xaad4ff, transparent: true, opacity: 0, fog: false,
    });

    this.rain = new THREE.LineSegments(geometry, material);
    this.rain.visible = false;
    this.scene.add(this.rain);
  }

  _updateRain(delta, center) {
    const opacityTarget = this._stormActive ? 0.55 : 0;
    this.rain.material.opacity += (opacityTarget - this.rain.material.opacity) * Math.min(delta * 3, 1);
    this.rain.visible = this.rain.material.opacity > 0.01;
    if (!this.rain.visible) return;

    const positions = this.rain.geometry.attributes.position.array;
    const count = this._rainDrops.length / 3;
    const speed = 28;
    const dropLength = 0.8;

    for (let i = 0; i < count; i++) {
      let x = this._rainDrops[i * 3];
      let y = this._rainDrops[i * 3 + 1];
      let z = this._rainDrops[i * 3 + 2];

      y -= speed * delta;
      if (y < 0) {
        y = 40;
        x = center.x + (Math.random() - 0.5) * 180;
        z = center.z + (Math.random() - 0.5) * 180;
      }

      this._rainDrops[i * 3] = x;
      this._rainDrops[i * 3 + 1] = y;
      this._rainDrops[i * 3 + 2] = z;

      const idx = i * 6;
      positions[idx] = x;
      positions[idx + 1] = y;
      positions[idx + 2] = z;
      positions[idx + 3] = x;
      positions[idx + 4] = y - dropLength;
      positions[idx + 5] = z;
    }

    this.rain.geometry.attributes.position.needsUpdate = true;
  }

  // ============================================================
  // API PÚBLICA DE TEMPESTADE
  // ============================================================
  triggerStorm(durationHours = 1.5) {
    this._stormActive = true;
    this._stormTimeLeft = durationHours;
    this._nextLightning = 1 + Math.random() * 3;
  }

  stopStorm() {
    this._stormActive = false;
    this._stormTimeLeft = 0;
  }

  isRaining() {
    return this._stormActive;
  }

  _updateStorm(delta) {
    if (this._stormActive) {
      this._stormTimeLeft -= delta * this.timeSpeed;
      if (this._stormTimeLeft <= 0) this.stopStorm();

      this._nextLightning -= delta * this.timeSpeed;
      if (this._nextLightning <= 0) {
        this._flashPower = 1.0;
        this._nextLightning = 2 + Math.random() * 6;
        this.scene.dispatchEvent?.({ type: 'thunder' });
      }
    } else if (this.autoStorms && this.time >= this._nextAutoStormCheck) {
      this._nextAutoStormCheck = this.time + 2 + Math.random() * 6;
      if (Math.random() < 0.12) this.triggerStorm(1 + Math.random() * 2);
    }

    this._flashPower *= Math.pow(0.02, Math.min(delta * 4, 1));
  }

  // ============================================================
  // UPDATE
  // ============================================================
  update(delta, followTarget = null) {
    this.time += delta * this.timeSpeed;
    if (this.time >= 24) this.time -= 24;

    this._updateStorm(delta);

    const { a, b, t } = this._findKeyframePair();

    this._tmpZenith.copy(new THREE.Color(a.zenith)).lerp(new THREE.Color(b.zenith), t);
    this._tmpHorizon.copy(new THREE.Color(a.horizon)).lerp(new THREE.Color(b.horizon), t);
    this._tmpSunColor.copy(new THREE.Color(a.sunColor)).lerp(new THREE.Color(b.sunColor), t);
    this._tmpHemiSky.copy(new THREE.Color(a.hemiSky)).lerp(new THREE.Color(b.hemiSky), t);
    this._tmpHemiGround.copy(new THREE.Color(a.hemiGround)).lerp(new THREE.Color(b.hemiGround), t);
    this._tmpCloudColor.copy(new THREE.Color(a.cloud[1])).lerp(new THREE.Color(b.cloud[1]), t);

    let sunIntensity = THREE.MathUtils.lerp(a.sun, b.sun, t);
    let moonIntensity = THREE.MathUtils.lerp(a.moon, b.moon, t);
    let hemiIntensity = THREE.MathUtils.lerp(a.hemi, b.hemi, t);
    const starOpacity = THREE.MathUtils.lerp(a.star, b.star, t);
    let fogNear = THREE.MathUtils.lerp(a.fog[0], b.fog[0], t);
    let fogFar = THREE.MathUtils.lerp(a.fog[1], b.fog[1], t);
    let cloudOpacity = THREE.MathUtils.lerp(a.cloud[0], b.cloud[0], t);

    if (this._stormActive) {
      fogFar *= 0.45;
      cloudOpacity = Math.min(1, cloudOpacity + 0.5);
      sunIntensity *= 0.5;
      hemiIntensity *= 0.7;
    }

    sunIntensity += this._flashPower * 1.5;
    hemiIntensity += this._flashPower * 1.0;
    moonIntensity += this._flashPower * 0.5;

    this._skyUniforms.uZenithColor.value.copy(this._tmpZenith);
    this._skyUniforms.uHorizonColor.value.copy(this._tmpHorizon);
    this._skyUniforms.uSunColor.value.copy(this._tmpSunColor);
    this._skyUniforms.uSunIntensity.value = sunIntensity;
    this._skyUniforms.uFlash.value = this._flashPower;

    if (this.scene.fog) {
      this.scene.fog.color.copy(this._tmpHorizon);
      this.scene.fog.near = fogNear;
      this.scene.fog.far = fogFar;
    }

    const sunAngle = ((this.time - 6) / 12) * Math.PI;
    const radius = 300;
    const sunDir = new THREE.Vector3(Math.cos(sunAngle), Math.sin(sunAngle), Math.sin(sunAngle) * 0.3).normalize();
    const moonDir = sunDir.clone().negate();

    this._sunWorldPos.copy(sunDir).multiplyScalar(radius);
    this.dirLight.position.copy(sunDir).multiplyScalar(150);
    this.dirLight.intensity = sunIntensity;

    this.moonLight.position.copy(moonDir).multiplyScalar(150);
    this.moonLight.intensity = moonIntensity;

    this._skyUniforms.uSunDirection.value.copy(sunDir);

    this.sunSprite.position.copy(sunDir).multiplyScalar(280);
    this.sunSprite.material.opacity = THREE.MathUtils.clamp(sunIntensity, 0, 1);
    this.sunSprite.material.color.copy(this._tmpSunColor);
    this.sunSprite.visible = sunDir.y > -0.05;

    const horizonFactor = 1 - THREE.MathUtils.clamp(Math.abs(sunDir.y) * 2, 0, 1);
    this.sunGlowSprite.position.copy(this.sunSprite.position);
    this.sunGlowSprite.scale.setScalar(60 + horizonFactor * 90);
    this.sunGlowSprite.material.opacity = THREE.MathUtils.clamp(sunIntensity, 0, 1) * (0.3 + horizonFactor * 0.7);
    this.sunGlowSprite.material.color.copy(this._tmpSunColor);
    this.sunGlowSprite.visible = this.sunSprite.visible;

    this.moonSprite.position.copy(moonDir).multiplyScalar(280);
    this.moonSprite.material.opacity = THREE.MathUtils.clamp(moonIntensity * 2.0, 0, 1);
    this.moonSprite.visible = moonDir.y > -0.05;

    this._groundBelowSun.copy(sunDir).setY(0.05).normalize().multiplyScalar(60);
    const rayOpacity = horizonFactor * THREE.MathUtils.clamp(sunIntensity, 0, 1) * (1 - this._stormActive * 0.7);
    this._godRays.forEach((ray) => {
      ray.sprite.position.lerpVectors(this.sunSprite.position, this._groundBelowSun, ray.t);
      const scale = THREE.MathUtils.lerp(35, 90, ray.t);
      ray.sprite.scale.set(scale, scale * 1.6, 1);
      ray.sprite.material.opacity = rayOpacity * (1 - ray.t * 0.5) * 0.5;
      ray.sprite.material.color.copy(this._tmpSunColor);
    });

    this.hemiLight.color.copy(this._tmpHemiSky);
    this.hemiLight.groundColor.copy(this._tmpHemiGround);
    this.hemiLight.intensity = hemiIntensity;

    this._starUniforms.uTime.value += delta;
    this._starUniforms.uOpacity.value = starOpacity * (1 - this._flashPower);
    this.stars.visible = this._starUniforms.uOpacity.value > 0.01;

    this._auroraUniforms.uTime.value += delta;
    const auroraTarget = starOpacity > 0.6 ? 0.3 : 0;
    this._auroraUniforms.uOpacity.value += (auroraTarget - this._auroraUniforms.uOpacity.value) * Math.min(delta, 1);
    this.aurora.visible = this._auroraUniforms.uOpacity.value > 0.01;

    this.clouds.forEach((c) => {
      c.sprite.position.addScaledVector(this._windDir, c.speed * delta * (this._stormActive ? 2.5 : 1));
      if (c.sprite.position.x > 300) c.sprite.position.x = -300;
      if (c.sprite.position.z > 300) c.sprite.position.z = -300;
      c.sprite.material.opacity = cloudOpacity * c.baseOpacity;
      c.sprite.material.color.copy(this._tmpCloudColor);
    });

    this._updateRain(delta, followTarget || new THREE.Vector3(0, 0, 0));
  }

  isNight() {
    return this.time < 5.5 || this.time > 21.0;
  }

  getTimeString() {
    const h = Math.floor(this.time);
    const m = Math.floor((this.time - h) * 60);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  getSunDirection() {
    return this._skyUniforms.uSunDirection.value.clone();
  }
}