import * as THREE from 'three';

export class WaterSystem {
  constructor({
    scene,
    position = new THREE.Vector3(-35, 0.38, 125),
    size = 90,
    resolution = 128
  }) {
    this.scene = scene;
    this.size = size;
    this.position = position.clone();
    this.elapsedTime = 0;

    this.maxRipples = 16;
    this.rippleWriteIndex = 0;
    this._lastRipplePos = new THREE.Vector3(1e6, 1e6, 1e6);

    this._baseSteep = [0.55, 0.5, 0.45, 0.4, 0.35, 0.3];
    this._baseAmps = [0.55, 0.32, 0.18, 0.09, 0.05, 0.025];
    this._baseSpeeds = [1.0, 1.3, 1.6, 2.0, 2.6, 3.2];
    this._currentSteepBoost = 0;
    this._waveDir0 = new THREE.Vector2(1, 0.3).normalize();
    this._targetWaveDir = this._waveDir0.clone();

    this.params = {
      waveSpeedMultiplier: 1.0,
      amplitudeMultiplier: 0.28, // Escala ideal para não encobrir a personagem/moto
      shallowColor: '#3fd0c9',
      deepColor: '#0a3050',
      foamColor: '#eafcff',
      sssColor: '#2be0a0',
      causticIntensity: 1.15,
      crestFoamIntensity: 1.0,
      shoreFoamIntensity: 1.2,
      mobilePerfMode: false,
      timeOfDay: 12,
      stormActive: false,
    };

    this._buildGeometry(resolution);
    this._buildMaterial();
    this._buildSeabed();

    this.mesh.position.copy(this.position);
    // Posiciona a bacia de areia logo acima do chão (y = 0.03) para não conflitar com a grama
    this.seabed.position.set(this.position.x, 0.03, this.position.z);
    scene.add(this.mesh, this.seabed);
  }

  _buildGeometry(resolution) {
    const geometry = new THREE.PlaneGeometry(this.size, this.size, resolution, resolution);
    geometry.rotateX(-Math.PI / 2);
    this.geometry = geometry;
  }

  _makeWaveDirections() {
    const offsets = [0, 25, -40, 80, -110, 160];
    const wavelengths = [22, 14, 9, 5.5, 3.2, 1.8];

    const dirs = offsets.map((deg) => {
      const rad = THREE.MathUtils.degToRad(deg);
      return new THREE.Vector2(Math.cos(rad), Math.sin(rad));
    });
    return { dirs, wavelengths };
  }

  _buildMaterial() {
    const { dirs, wavelengths } = this._makeWaveDirections();
    const rippleArray = [];
    for (let i = 0; i < this.maxRipples; i++) {
      rippleArray.push(new THREE.Vector4(0, 0, -999, 0));
    }

    this.uniforms = {
      uTime: { value: 0 },
      uSize: { value: this.size },
      uCenter: { value: new THREE.Vector2(this.position.x, this.position.z) },

      uWaveDir: { value: dirs },
      uWaveLength: { value: wavelengths },
      uWaveAmp: { value: this._baseAmps.map((a) => a * this.params.amplitudeMultiplier) },
      uWaveSpeed: { value: this._baseSpeeds.slice() },
      uWaveSteep: { value: this._baseSteep.slice() },

      uRipples: { value: rippleArray },
      uRippleSpeed: { value: 5.5 },

      uRainIntensity: { value: 0.0 },
      uFlashPower: { value: 0.0 },

      uZenithColor: { value: new THREE.Color(0x2f7fd6) },
      uHorizonColor: { value: new THREE.Color(0xbfe3ff) },
      uSunDir: { value: new THREE.Vector3(0, 1, 0) },
      uSunColor: { value: new THREE.Color(0xffffff) },
      uSunIntensity: { value: 1.2 },
      uMoonDir: { value: new THREE.Vector3(0, -1, 0) },
      uMoonColor: { value: new THREE.Color(0x9fb4ff) },
      uMoonIntensity: { value: 0.0 },
      uAuroraOpacity: { value: 0.0 },

      uFogColor: { value: new THREE.Color(0xbfe3ff) },
      uFogNear: { value: 50 },
      uFogFar: { value: 300 },

      uShallowColor: { value: new THREE.Color(this.params.shallowColor) },
      uDeepColor: { value: new THREE.Color(this.params.deepColor) },
      uFoamColor: { value: new THREE.Color(this.params.foamColor) },
      uSSSColor: { value: new THREE.Color(this.params.sssColor) },
      uCausticIntensity: { value: this.params.causticIntensity },
      uCrestFoamIntensity: { value: this.params.crestFoamIntensity },
      uShoreFoamIntensity: { value: this.params.shoreFoamIntensity },
      uDetailNormals: { value: 1.0 },
    };

    const vertexShader = `
      const int NUM_WAVES = 6;
      uniform float uTime;
      uniform float uSize;
      uniform vec2 uCenter;
      uniform vec2 uWaveDir[NUM_WAVES];
      uniform float uWaveLength[NUM_WAVES];
      uniform float uWaveAmp[NUM_WAVES];
      uniform float uWaveSpeed[NUM_WAVES];
      uniform float uWaveSteep[NUM_WAVES];
      uniform vec4 uRipples[16];
      uniform float uRippleSpeed;

      varying vec3 vWorldPos;
      varying vec3 vNormal;
      varying float vJacobian;
      varying float vRippleFoam;
      varying float vCrestHeight;

      const float PI = 3.14159265359;

      vec3 gerstner(vec2 worldXZ, float edgeDamping, out vec3 normalOut, out float jacobianOut) {
        vec3 offset = vec3(0.0);
        vec3 tangent = vec3(1.0, 0.0, 0.0);
        vec3 binormal = vec3(0.0, 0.0, 1.0);
        float sumSin = 0.0;

        for (int i = 0; i < NUM_WAVES; i++) {
          float w = 2.0 * PI / uWaveLength[i];
          vec2 d = normalize(uWaveDir[i]);
          float A = uWaveAmp[i] * edgeDamping;
          float Q = (A > 0.0001) ? (uWaveSteep[i] / (w * A * float(NUM_WAVES))) : 0.0;
          float phase = w * dot(d, worldXZ) + uWaveSpeed[i] * uTime * w;
          float c = cos(phase);
          float s = sin(phase);

          offset.x += Q * A * d.x * c;
          offset.z += Q * A * d.y * c;
          offset.y += A * s;

          tangent.x -= Q * d.x * d.x * w * A * s;
          tangent.y += d.x * w * A * c;
          tangent.z -= Q * d.x * d.y * w * A * s;

          binormal.x -= Q * d.x * d.y * w * A * s;
          binormal.y += d.y * w * A * c;
          binormal.z -= Q * d.y * d.y * w * A * s;

          sumSin += Q * A * w * s;
        }

        normalOut = normalize(cross(binormal, tangent));
        jacobianOut = 1.0 - sumSin;
        return offset;
      }

      void main() {
        vec2 worldXZ = position.xz + modelMatrix[3].xz;

        // Reduz a altura das ondas suavemente perto da margem da praia
        float radialDist = length(worldXZ - uCenter) / (uSize * 0.5);
        float edgeDamping = 1.0 - smoothstep(0.65, 0.98, radialDist);

        vec3 waveNormal;
        float jacobian;
        vec3 waveOffset = gerstner(worldXZ, edgeDamping, waveNormal, jacobian);

        // Ondulações interativas (esteira da personagem e da moto)
        float rippleHeight = 0.0;
        float rippleFoam = 0.0;
        for (int i = 0; i < 16; i++) {
          vec4 r = uRipples[i];
          if (r.w <= 0.0) continue;
          float age = uTime - r.z;
          if (age < 0.0 || age > 4.0) continue;
          float dist = length(worldXZ - r.xy);
          float ringRadius = age * uRippleSpeed;
          float ringWidth = 0.5 + age * 0.30;
          float ringMask = exp(-pow((dist - ringRadius) / ringWidth, 2.0));
          float amp = r.w * 0.18 * exp(-age * 1.4) * exp(-dist * 0.05);
          float phase = (dist - ringRadius) * 10.0;
          rippleHeight += amp * ringMask * sin(phase);
          rippleFoam += r.w * exp(-age * 1.3) * ringMask;
        }

        vec3 displaced = position + waveOffset;
        displaced.y += rippleHeight;

        vWorldPos = (modelMatrix * vec4(displaced, 1.0)).xyz;
        vNormal = normalize(mat3(modelMatrix) * waveNormal);
        vJacobian = jacobian;
        vRippleFoam = clamp(rippleFoam, 0.0, 1.0);
        vCrestHeight = max(waveOffset.y, 0.0);

        gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(displaced, 1.0);
      }
    `;

    const fragmentShader = `
      precision highp float;

      uniform float uTime;
      uniform float uSize;
      uniform vec2 uCenter;
      uniform float uRainIntensity;
      uniform float uFlashPower;

      uniform vec3 uZenithColor, uHorizonColor;
      uniform vec3 uSunDir, uSunColor;
      uniform float uSunIntensity;
      uniform vec3 uMoonDir, uMoonColor;
      uniform float uMoonIntensity;
      uniform float uAuroraOpacity;

      uniform vec3 uFogColor;
      uniform float uFogNear, uFogFar;

      uniform vec3 uShallowColor, uDeepColor, uFoamColor, uSSSColor;
      uniform float uCausticIntensity, uCrestFoamIntensity, uShoreFoamIntensity;
      uniform float uDetailNormals;

      varying vec3 vWorldPos;
      varying vec3 vNormal;
      varying float vJacobian;
      varying float vRippleFoam;
      varying float vCrestHeight;

      vec2 mod289(vec2 x) { return x - floor(x * (1.0/289.0)) * 289.0; }
      vec3 mod289(vec3 x) { return x - floor(x * (1.0/289.0)) * 289.0; }
      vec3 permute(vec3 x) { return mod289(((x*34.0)+1.0)*x); }

      float snoise(vec2 v) {
        const vec4 C = vec4(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);
        vec2 i = floor(v + dot(v, C.yy));
        vec2 x0 = v - i + dot(i, C.xx);
        vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
        vec4 x12 = x0.xyxy + C.xxzz;
        x12.xy -= i1;
        i = mod289(i);
        vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
        vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy), dot(x12.zw,x12.zw)), 0.0);
        m = m*m; m = m*m;
        vec3 x = 2.0 * fract(p * C.www) - 1.0;
        vec3 h = abs(x) - 0.5;
        vec3 ox = floor(x + 0.5);
        vec3 a0 = x - ox;
        m *= 1.79284291400159 - 0.85373472095314 * (a0*a0 + h*h);
        vec3 g;
        g.x = a0.x * x0.x + h.x * x0.y;
        g.yz = a0.yz * x12.xz + h.yz * x12.yw;
        return 130.0 * dot(m, g);
      }

      float fbm(vec2 p, int octaves) {
        float value = 0.0, amp = 0.5, freq = 1.0;
        for (int i = 0; i < 8; i++) {
          if (i >= octaves) break;
          value += amp * snoise(p * freq);
          freq *= 2.0;
          amp *= 0.5;
        }
        return value;
      }

      float hash21(vec2 p) {
        p = fract(p * vec2(123.34, 456.21));
        p += dot(p, p + 45.32);
        return fract(p.x * p.y);
      }

      float worley(vec2 p, float time) {
        vec2 ip = floor(p);
        vec2 fp = fract(p);
        float minDist = 1.0;
        for (int y = -1; y <= 1; y++) {
          for (int x = -1; x <= 1; x++) {
            vec2 neighbor = vec2(float(x), float(y));
            vec2 pt = vec2(hash21(ip + neighbor), hash21(ip + neighbor + vec2(37.0, 17.0)));
            pt = 0.5 + 0.5 * sin(time * 0.3 + 6.2831 * pt);
            vec2 diff = neighbor + pt - fp;
            minDist = min(minDist, length(diff));
          }
        }
        return minDist;
      }

      void main() {
        // Distância em relação ao centro real da lagoa no mapa
        vec2 relXZ = vWorldPos.xz - uCenter;
        float edgeNoise = snoise(relXZ * 0.06) * 0.04;
        float distFromCenterN = (length(relXZ) / (uSize * 0.48)) + edgeNoise;

        // Recorta as quinas do plano para formar uma lagoa natural
        if (distFromCenterN > 1.0) discard;

        vec3 V = normalize(cameraPosition - vWorldPos);
        vec3 N = normalize(vNormal);

        if (uDetailNormals > 0.5) {
          float eps = 0.4;
          float hL = fbm((vWorldPos.xz + vec2(-eps, 0.0)) * 0.15 + uTime * 0.05, 2);
          float hR = fbm((vWorldPos.xz + vec2( eps, 0.0)) * 0.15 + uTime * 0.05, 2);
          float hD = fbm((vWorldPos.xz + vec2(0.0, -eps)) * 0.15 + uTime * 0.05, 2);
          float hU = fbm((vWorldPos.xz + vec2(0.0,  eps)) * 0.15 + uTime * 0.05, 2);
          vec3 noiseNormal = normalize(vec3(hL - hR, 2.0 * eps, hD - hU));
          N = normalize(mix(N, noiseNormal, 0.35));
        }

        float shallowFactor = smoothstep(0.45, 0.96, distFromCenterN);
        vec3 baseWaterColor = mix(uDeepColor, uShallowColor, shallowFactor);

        // Cáusticas Worley
        float causticPattern = worley(vWorldPos.xz * 0.8 + vec2(uTime * 0.15, -uTime * 0.1), uTime);
        float caustic = smoothstep(0.05, 0.25, causticPattern) - smoothstep(0.25, 0.4, causticPattern);
        caustic *= shallowFactor * uCausticIntensity * clamp(uSunIntensity + uMoonIntensity * 0.5, 0.0, 1.5);
        baseWaterColor += vec3(0.4, 0.9, 0.8) * caustic;

        // Subsurface Scattering (SSS)
        float sssSun = pow(max(dot(V, -uSunDir), 0.0), 4.0) * smoothstep(0.0, 0.6, vCrestHeight) * uSunIntensity;
        float sssMoon = pow(max(dot(V, -uMoonDir), 0.0), 4.0) * smoothstep(0.0, 0.6, vCrestHeight) * uMoonIntensity;
        baseWaterColor += uSSSColor * (sssSun * 0.6 + sssMoon * 0.3);

        // Fresnel (Schlick)
        float NdotV = max(dot(N, V), 0.0);
        float F0 = 0.02;
        float fresnel = F0 + (1.0 - F0) * pow(1.0 - NdotV, 5.0);

        vec3 reflDir = reflect(-V, N);
        float skyH = smoothstep(-0.12, 0.55, reflDir.y);
        vec3 skyReflColor = mix(uHorizonColor, uZenithColor, skyH);

        float sunSpec = pow(max(dot(reflDir, normalize(uSunDir)), 0.0), 180.0);
        float moonSpec = pow(max(dot(reflDir, normalize(uMoonDir)), 0.0), 60.0);
        vec3 reflection = skyReflColor
          + uSunColor * sunSpec * uSunIntensity * 3.0
          + uMoonColor * moonSpec * uMoonIntensity * 1.5;

        // Reflexo da Aurora Boreal à noite
        float auroraBand = smoothstep(0.3, 0.9, reflDir.y);
        float auroraWave = sin(vWorldPos.x * 0.05 + uTime * 0.6) * 0.5 + 0.5;
        vec3 auroraColor = mix(vec3(0.1, 0.9, 0.6), vec3(0.5, 0.2, 0.9), auroraWave);
        reflection += auroraColor * uAuroraOpacity * auroraBand * 0.6;

        vec3 color = mix(baseWaterColor, reflection, clamp(fresnel, 0.0, 1.0));

        // Espuma Tripla: Crista, Margem e Pingos de Chuva
        float crestFoam = smoothstep(0.55, 0.15, vJacobian) * uCrestFoamIntensity;
        float shoreBand = smoothstep(0.84, 0.98, distFromCenterN);
        float shoreNoise = fbm(vWorldPos.xz * 0.6 - vec2(uTime * 0.4, 0.0), 3) * 0.5 + 0.5;
        float shoreFoam = shoreBand * smoothstep(0.25, 0.7, shoreNoise) * uShoreFoamIntensity;
        float rainFoam = uRainIntensity * (fbm(vWorldPos.xz * 3.0 + uTime * 2.0, 2) * 0.5 + 0.5) * 0.4;

        float foamMask = clamp(crestFoam + shoreFoam + rainFoam + vRippleFoam * 0.75, 0.0, 1.0);
        float foamPattern = fbm(vWorldPos.xz * 8.0 - uTime * 0.5, 3) * 0.5 + 0.5;
        color = mix(color, uFoamColor * (0.7 + 0.3 * foamPattern), foamMask);

        // Relâmpago
        color += vec3(1.0) * uFlashPower * 0.6;

        // Integração com a Névoa Dinâmica (scene.fog)
        float fogDist = length(cameraPosition - vWorldPos);
        float fogFactor = clamp((uFogFar - fogDist) / max(uFogFar - uFogNear, 0.001), 0.0, 1.0);
        color = mix(uFogColor, color, fogFactor);

        // Transição suave de transparência nos últimos centímetros da praia
        float shorelineAlphaFade = 1.0 - smoothstep(0.95, 1.0, distFromCenterN);
        float alpha = mix(0.92, 0.80, shallowFactor);
        alpha = max(alpha, foamMask) * shorelineAlphaFade;

        gl_FragColor = vec4(color, alpha);
      }
    `;

    this.material = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader,
      fragmentShader,
      transparent: true,
      side: THREE.DoubleSide,
      fog: false,
    });

    this.mesh = new THREE.Mesh(this.geometry, this.material);
  }

  _createSandTexture() {
    const size = 512;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#d8c08a';
    ctx.fillRect(0, 0, size, size);
    for (let i = 0; i < 6000; i++) {
      const shade = Math.random() > 0.5 ? '#cbb079' : '#e6d19a';
      ctx.fillStyle = shade;
      ctx.fillRect(Math.random() * size, Math.random() * size, 2, 2);
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(6, 6);
    return tex;
  }

  _buildSeabed() {
    // Disco de areia ao redor e no fundo da lagoa
    const geo = new THREE.CircleGeometry(this.size * 0.53, 64);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshStandardMaterial({
      map: this._createSandTexture(),
      roughness: 0.95,
      metalness: 0.0,
      polygonOffset: true,
      polygonOffsetFactor: -1,
    });
    this.seabed = new THREE.Mesh(geo, mat);
    this.seabed.receiveShadow = true;
  }

  addRipple(worldX, worldZ, intensity = 1.0) {
    const idx = this.rippleWriteIndex;
    this.uniforms.uRipples.value[idx].set(worldX, worldZ, this.elapsedTime, intensity);
    this.rippleWriteIndex = (idx + 1) % this.maxRipples;
  }

  exportPreset() {
    const p = this.params;
    const preset = {
      waveSpeedMultiplier: p.waveSpeedMultiplier,
      amplitudeMultiplier: p.amplitudeMultiplier,
      shallowColor: p.shallowColor,
      deepColor: p.deepColor,
      foamColor: p.foamColor,
      sssColor: p.sssColor,
      causticIntensity: p.causticIntensity,
      crestFoamIntensity: p.crestFoamIntensity,
      shoreFoamIntensity: p.shoreFoamIntensity,
    };
    console.log('📋 Preset WaterSystem:', JSON.stringify(preset, null, 2));
  }

  attachGUI(gui, dayNight) {
    const p = this.params;

    const fWave = gui.addFolder('🌊 Ondas');
    fWave.add(p, 'waveSpeedMultiplier', 0.1, 3.0, 0.05).name('Velocidade');
    fWave.add(p, 'amplitudeMultiplier', 0.05, 2.0, 0.02).name('Amplitude');

    const fColor = gui.addFolder('🎨 Cores');
    fColor.addColor(p, 'shallowColor').name('Raso').onChange((v) => this.uniforms.uShallowColor.value.set(v));
    fColor.addColor(p, 'deepColor').name('Profundo').onChange((v) => this.uniforms.uDeepColor.value.set(v));
    fColor.addColor(p, 'foamColor').name('Espuma').onChange((v) => this.uniforms.uFoamColor.value.set(v));
    fColor.addColor(p, 'sssColor').name('SSS (crista)').onChange((v) => this.uniforms.uSSSColor.value.set(v));

    const fSurf = gui.addFolder('✨ Superfície');
    fSurf.add(p, 'causticIntensity', 0, 3, 0.05).name('Cáusticas').onChange((v) => (this.uniforms.uCausticIntensity.value = v));
    fSurf.add(p, 'crestFoamIntensity', 0, 3, 0.05).name('Espuma de crista').onChange((v) => (this.uniforms.uCrestFoamIntensity.value = v));
    fSurf.add(p, 'shoreFoamIntensity', 0, 3, 0.05).name('Espuma de margem').onChange((v) => (this.uniforms.uShoreFoamIntensity.value = v));

    if (dayNight) {
      const fSky = gui.addFolder('🌅 Ambiente & Clima');
      fSky.add(p, 'timeOfDay', 0, 24, 0.1).name('Hora do dia').onChange((v) => (dayNight.time = v));
      fSky.add(p, 'stormActive').name('Tempestade / Chuva').onChange((v) => (v ? dayNight.triggerStorm(3) : dayNight.stopStorm()));
      fSky.add({ lightning: () => { dayNight._flashPower = 1.0; } }, 'lightning').name('⚡ Disparar Relâmpago');
    }

    const fPerf = gui.addFolder('⚙️ Performance');
    fPerf.add(p, 'mobilePerfMode').name('Modo Mobile').onChange((v) => (this.uniforms.uDetailNormals.value = v ? 0.0 : 1.0));

    gui.add({ exportar: () => this.exportPreset() }, 'exportar').name('📋 Exportar Preset JSON');
  }

  update(delta, elapsed, activePlayerPos = null, dayNight = null) {
    this.elapsedTime = elapsed;
    const u = this.uniforms;
    u.uTime.value = elapsed;
    u.uCenter.value.set(this.position.x, this.position.z);

    // Sincroniza Céu, Sol, Lua e Aurora com o DayNightCycle
    const zenith = dayNight?._skyUniforms?.uZenithColor?.value;
    const horizon = dayNight?._skyUniforms?.uHorizonColor?.value;
    if (zenith) u.uZenithColor.value.copy(zenith);
    if (horizon) u.uHorizonColor.value.copy(horizon);

    const sunDir = dayNight?.getSunDirection ? dayNight.getSunDirection() : new THREE.Vector3(0.4, 0.8, 0.3).normalize();
    u.uSunDir.value.copy(sunDir);
    const sunColor = dayNight?._skyUniforms?.uSunColor?.value;
    if (sunColor) u.uSunColor.value.copy(sunColor);
    u.uSunIntensity.value = dayNight?.dirLight?.intensity ?? 1.2;

    const moonDir = dayNight?.moonLight?.position ? dayNight.moonLight.position.clone().normalize() : sunDir.clone().negate();
    u.uMoonDir.value.copy(moonDir);
    if (dayNight?.moonLight?.color) u.uMoonColor.value.copy(dayNight.moonLight.color);
    u.uMoonIntensity.value = dayNight?.moonLight?.intensity ?? 0.0;

    u.uAuroraOpacity.value = dayNight?._auroraUniforms?.uOpacity?.value ?? 0.0;

    // Tempestade, chuva e relâmpago
    const raining = dayNight?.isRaining ? dayNight.isRaining() : false;
    u.uRainIntensity.value += ((raining ? 1.0 : 0.0) - u.uRainIntensity.value) * Math.min(delta * 1.5, 1);
    u.uFlashPower.value = dayNight?._flashPower ?? 0.0;

    const stormBoost = u.uRainIntensity.value;
    this._currentSteepBoost += (stormBoost * 0.6 - this._currentSteepBoost) * Math.min(delta, 1);
    for (let i = 0; i < 6; i++) {
      u.uWaveSteep.value[i] = this._baseSteep[i] * (1.0 + this._currentSteepBoost);
      u.uWaveAmp.value[i] = this._baseAmps[i] * this.params.amplitudeMultiplier;
      u.uWaveSpeed.value[i] = this._baseSpeeds[i] * this.params.waveSpeedMultiplier;
    }

    // Alinha com o vento do DayNightCycle
    const wind = dayNight?._windDir;
    if (wind) this._targetWaveDir.set(wind.x, wind.z).normalize();
    this._waveDir0.lerp(this._targetWaveDir, Math.min(delta * 0.5, 1));
    u.uWaveDir.value[0].copy(this._waveDir0);

    // Névoa dinâmica
    if (this.scene.fog) {
      u.uFogColor.value.copy(this.scene.fog.color);
      u.uFogNear.value = this.scene.fog.near;
      u.uFogFar.value = this.scene.fog.far;
    }

    // Gera esteira de ondas (Wake) quando a personagem ou a moto passam pela água
    if (activePlayerPos) {
      const dx = activePlayerPos.x - this.position.x;
      const dz = activePlayerPos.z - this.position.z;
      const distFromCenter = Math.hypot(dx, dz);
      if (distFromCenter < this.size * 0.48) {
        const moved = this._lastRipplePos.distanceTo(activePlayerPos);
        if (moved > 0.35) {
          this.addRipple(activePlayerPos.x, activePlayerPos.z, 1.2);
          this._lastRipplePos.copy(activePlayerPos);
        }
      }
    }
  }
}