import * as THREE from 'three';

const NOISE_GLSL = `
  vec2 mod289(vec2 x){ return x - floor(x*(1.0/289.0))*289.0; }
  vec3 mod289(vec3 x){ return x - floor(x*(1.0/289.0))*289.0; }
  vec3 permute(vec3 x){ return mod289(((x*34.0)+1.0)*x); }

  float snoise(vec2 v) {
    const vec4 C = vec4(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);
    vec2 i = floor(v + dot(v, C.yy));
    vec2 x0 = v - i + dot(i, C.xx);
    vec2 i1 = (x0.x > x0.y) ? vec2(1.0,0.0) : vec2(0.0,1.0);
    vec4 x12 = x0.xyxy + C.xxzz;
    x12.xy -= i1;
    i = mod289(i);
    vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
    vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy), dot(x12.zw,x12.zw)), 0.0);
    m = m*m; m = m*m;
    vec3 x = 2.0*fract(p*C.www) - 1.0;
    vec3 h = abs(x) - 0.5;
    vec3 ox = floor(x + 0.5);
    vec3 a0 = x - ox;
    m *= 1.79284291400159 - 0.85373472095314*(a0*a0+h*h);
    vec3 g;
    g.x = a0.x*x0.x + h.x*x0.y;
    g.yz = a0.yz*x12.xz + h.yz*x12.yw;
    return 130.0*dot(m, g);
  }

  float fbm(vec2 p, int octaves) {
    float v = 0.0, amp = 0.5, freq = 1.0;
    for (int i = 0; i < 4; i++) {
      if (i >= octaves) break;
      v += amp*snoise(p*freq);
      freq *= 2.0; amp *= 0.5;
    }
    return v;
  }

  float hash21(vec2 p) {
    p = fract(p*vec2(123.34, 456.21));
    p += dot(p, p+45.32);
    return fract(p.x*p.y);
  }

  // Calcula (d2 - d1) para desenhar o rejunte escuro apenas nas bordas das pedras
  vec2 worley2(vec2 p) {
    vec2 ip = floor(p);
    vec2 fp = fract(p);
    float d1 = 8.0;
    float d2 = 8.0;
    float cellHash = 0.0;
    for (int y = -1; y <= 1; y++) {
      for (int x = -1; x <= 1; x++) {
        vec2 neighbor = vec2(float(x), float(y));
        vec2 cellId = ip + neighbor;
        vec2 pt = vec2(hash21(cellId), hash21(cellId + vec2(37.0, 17.0)));
        vec2 diff = neighbor + pt - fp;
        float d = dot(diff, diff);
        if (d < d1) {
          d2 = d1;
          d1 = d;
          cellHash = hash21(cellId + vec2(91.0, 3.0));
        } else if (d < d2) {
          d2 = d;
        }
      }
    }
    return vec2(sqrt(d2) - sqrt(d1), cellHash);
  }

  float sdSegment(vec2 p, vec2 a, vec2 b) {
    vec2 pa = p - a, ba = b - a;
    float h = clamp(dot(pa,ba)/dot(ba,ba), 0.0, 1.0);
    return length(pa - ba*h);
  }
`;

export class GroundSystem {
  constructor({
    scene,
    position = new THREE.Vector3(0, 0, 0),
    landSize = 250,
    waterLevel = -0.15,
    resolution = 128,
  }) {
    this.scene = scene;
    this.position = position.clone();
    this.landSize = landSize;
    this.waterLevel = waterLevel;
    this.resolution = resolution;

    this.params = {
      landHalf: landSize / 2,
      beachWidth: 16,
      dipDepth: 0.45,
      roadWidth: 3.2,
      roadEdgeWidth: 5.0,
      plazaRadius: 12,
      grassColorA: '#2f7d44',
      grassColorB: '#4e6b28',
      grassColorC: '#728538',
      sandDryColor: '#d8c08a',
      sandWetColor: '#8a7550',
      dirtColor: '#6b5a3d',
      cobbleColor: '#858580',
      groutColor: '#353532',
      rockColor: '#6d6a63',
      manualWetness: 0.0,
      useManualWetness: false,
      bladeSpacing: 2.2,
      bladeHeight: 0.40,
      bladeWidth: 0.12,
      windStrength: 1.0,
      normalStrength: 1.0,
    };

    this._sharedEnv = {
      uTime: { value: 0 },
      uSunDir: { value: new THREE.Vector3(0, 1, 0) },
      uSunColor: { value: new THREE.Color(0xffffff) },
      uSunIntensity: { value: 1.2 },
      uMoonDir: { value: new THREE.Vector3(0, -1, 0) },
      uMoonColor: { value: new THREE.Color(0x9fb4ff) },
      uMoonIntensity: { value: 0.0 },
      uHemiSkyColor: { value: new THREE.Color(0x87ceeb) },
      uHemiGroundColor: { value: new THREE.Color(0x3a2f1e) },
      uHemiIntensity: { value: 1.0 },
      uZenithColor: { value: new THREE.Color(0x2f7fd6) },
      uHorizonColor: { value: new THREE.Color(0xbfe3ff) },
      uFlashPower: { value: 0.0 },
      uWindDir: { value: new THREE.Vector2(1, 0.35) },
      uFogColor: { value: new THREE.Color(0xbfe3ff) },
      uFogNear: { value: 40 },
      uFogFar: { value: 260 },
      uWetness: { value: 0.0 },
      uSpotPos: { value: new THREE.Vector3(0, -999, 0) },
      uSpotDir: { value: new THREE.Vector3(0, -1, 0) },
      uSpotColor: { value: new THREE.Color(0xf5faff) },
      uSpotIntensity: { value: 0.0 },
      uPlayerPos: { value: new THREE.Vector3(0, -999, 0) },
      uMotoPos: { value: new THREE.Vector3(0, -999, 0) },
    };

    this._tmpSpotOffset = new THREE.Vector3();
    this._tmpSpotDir = new THREE.Vector3();

    this._buildGroundMaterial();
    this._buildGroundMesh();
    this._buildGrass();

    this.mesh.position.copy(this.position);
    this.grassMesh.position.copy(this.position);
    scene.add(this.mesh, this.grassMesh);
  }

  _buildGroundMesh() {
    const geo = new THREE.PlaneGeometry(
      this.landSize * 1.15, this.landSize * 1.15, this.resolution, this.resolution
    );
    geo.rotateX(-Math.PI / 2);
    this.geometry = geo;
    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.receiveShadow = true;
  }

  _buildGroundMaterial() {
    const roadStartZ = Math.max(20, this.params.landHalf - this.params.beachWidth - 6);
    const u = {
      uLandHalf: { value: this.params.landHalf },
      uBeachWidth: { value: this.params.beachWidth },
      uDipDepth: { value: this.params.dipDepth },
      uWaterLevel: { value: this.waterLevel },
      uRoadWidth: { value: this.params.roadWidth },
      uRoadEdgeWidth: { value: this.params.roadEdgeWidth },
      uPlazaRadius: { value: this.params.plazaRadius },
      uRoadStart: { value: new THREE.Vector2(0, roadStartZ) },
      uRoadEnd: { value: new THREE.Vector2(0, 0) },
      uGrassColorA: { value: new THREE.Color(this.params.grassColorA) },
      uGrassColorB: { value: new THREE.Color(this.params.grassColorB) },
      uGrassColorC: { value: new THREE.Color(this.params.grassColorC) },
      uSandDryColor: { value: new THREE.Color(this.params.sandDryColor) },
      uSandWetColor: { value: new THREE.Color(this.params.sandWetColor) },
      uDirtColor: { value: new THREE.Color(this.params.dirtColor) },
      uCobbleColor: { value: new THREE.Color(this.params.cobbleColor) },
      uGroutColor: { value: new THREE.Color(this.params.groutColor) },
      uRockColor: { value: new THREE.Color(this.params.rockColor) },
      uNormalStrength: { value: this.params.normalStrength },
    };
    this.groundUniforms = { ...this._sharedEnv, ...u };

    const vertexShader = `
      uniform float uLandHalf, uBeachWidth, uDipDepth;
      varying vec3 vWorldPos;
      varying vec3 vBigNormal;

      float coastDistAt(vec2 xz) { return max(abs(xz.x), abs(xz.y)); }

      float dipHeight(vec2 xz) {
        float d = coastDistAt(xz);
        float dipStart = uLandHalf - uBeachWidth;
        float t = smoothstep(dipStart, uLandHalf + uBeachWidth * 0.6, d);
        return -uDipDepth * t;
      }

      void main() {
        vec2 worldXZ = position.xz + modelMatrix[3].xz;

        float eps = 0.75;
        float hC = dipHeight(worldXZ);
        float hX = dipHeight(worldXZ + vec2(eps, 0.0));
        float hZ = dipHeight(worldXZ + vec2(0.0, eps));
        vBigNormal = normalize(vec3(-(hX - hC) / eps, 1.0, -(hZ - hC) / eps));

        vec3 displaced = position;
        displaced.y += hC;

        vWorldPos = (modelMatrix * vec4(displaced, 1.0)).xyz;
        gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(displaced, 1.0);
      }
    `;

    const fragmentShader = `
      precision highp float;
      ${NOISE_GLSL}

      uniform float uTime;
      uniform float uLandHalf, uBeachWidth, uDipDepth, uWaterLevel;
      uniform float uRoadWidth, uRoadEdgeWidth, uPlazaRadius;
      uniform vec2 uRoadStart, uRoadEnd;
      uniform vec2 uWindDir;
      uniform float uWetness, uNormalStrength;

      uniform vec3 uGrassColorA, uGrassColorB, uGrassColorC;
      uniform vec3 uSandDryColor, uSandWetColor, uDirtColor;
      uniform vec3 uCobbleColor, uGroutColor, uRockColor;

      uniform vec3 uSunDir, uSunColor; uniform float uSunIntensity;
      uniform vec3 uMoonDir, uMoonColor; uniform float uMoonIntensity;
      uniform vec3 uHemiSkyColor, uHemiGroundColor; uniform float uHemiIntensity;
      uniform vec3 uZenithColor, uHorizonColor;
      uniform float uFlashPower;
      uniform vec3 uFogColor; uniform float uFogNear, uFogFar;

      uniform vec3 uSpotPos, uSpotDir, uSpotColor; uniform float uSpotIntensity;

      varying vec3 vWorldPos;
      varying vec3 vBigNormal;

      void main() {
        vec2 xz = vWorldPos.xz;
        float coastDist = max(abs(xz.x), abs(xz.y));

        // 1. Transição Costeira (Praia Seca -> Molhada -> Submersa)
        float dipStart = uLandHalf - uBeachWidth;
        float drySand = smoothstep(dipStart - 2.0, dipStart + 3.0, coastDist)
                        * (1.0 - smoothstep(uLandHalf - 1.0, uLandHalf + 2.0, coastDist));
        float wetSand = smoothstep(uLandHalf - 3.0, uLandHalf + 0.5, coastDist)
                        * (1.0 - smoothstep(uLandHalf + 2.5, uLandHalf + 8.0, coastDist));
        float underwater = smoothstep(uLandHalf + 2.0, uLandHalf + 8.0, coastDist);
        float beachTotal = clamp(drySand + wetSand + underwater, 0.0, 1.0);

        // 2. Ruídos Principais
        float nLow = fbm(xz * 0.05, 2);
        float nMid = fbm(xz * 0.18 + vec2(nLow * 1.5), 2);
        float nHigh = snoise(xz * 0.85);

        // 3. Estrada e Praça Central (Confinadas dentro da ilha, sem invadir a praia/mar!)
        vec2 warpedXZ = xz + vec2(nLow * 4.0, 0.0);
        float roadDist = sdSegment(warpedXZ, uRoadStart, uRoadEnd);
        float plazaDist = length(xz) - uPlazaRadius;

        float roadCore = 1.0 - smoothstep(uRoadWidth - 0.6, uRoadWidth + 0.6, roadDist);
        float plazaCore = 1.0 - smoothstep(-0.5, 2.0, plazaDist);
        float coreFactor = clamp(max(roadCore, plazaCore), 0.0, 1.0) * (1.0 - beachTotal);

        float roadEdge = smoothstep(uRoadWidth - 0.6, uRoadWidth + 0.6, roadDist)
                         * (1.0 - smoothstep(uRoadWidth + uRoadEdgeWidth - 1.0, uRoadWidth + uRoadEdgeWidth + 1.0, roadDist));
        float plazaEdge = smoothstep(-0.5, 2.0, plazaDist)
                         * (1.0 - smoothstep(uRoadEdgeWidth - 1.0, uRoadEdgeWidth + 3.0, plazaDist));
        float edgeFactor = clamp(max(roadEdge, plazaEdge), 0.0, 1.0) * (1.0 - beachTotal);
        float pathTotal = clamp(coreFactor + edgeFactor, 0.0, 1.0);

        // 4. Rocha e Grama
        float rockFactor = smoothstep(0.35, 0.55, nLow) * (1.0 - beachTotal) * (1.0 - pathTotal);
        float mixA = clamp(nLow * 0.5 + 0.5, 0.0, 1.0);
        float mixB = clamp(nMid * 0.5 + 0.5, 0.0, 1.0);
        vec3 grassColor = mix(uGrassColorA, uGrassColorB, mixA);
        grassColor = mix(grassColor, uGrassColorC, mixB * 0.35);

        vec3 base = grassColor;
        base = mix(base, uRockColor, rockFactor);
        base = mix(base, uSandDryColor, drySand);
        base = mix(base, uSandWetColor, wetSand);
        base = mix(base, uSandWetColor * 0.75, underwater);

        // 5. Calçamento de Pedras (Worley)
        float cobbleHeight = 0.0;
        if (coreFactor > 0.001) {
          vec2 wc = worley2(xz * 1.35);
          float stoneMask = smoothstep(0.02, 0.09, wc.x);
          cobbleHeight = stoneMask;
          float stoneShade = 0.80 + wc.y * 0.40;
          vec3 cobbleFinal = mix(uGroutColor, uCobbleColor * stoneShade, stoneMask);
          base = mix(base, cobbleFinal, coreFactor);
        }
        base = mix(base, uDirtColor, edgeFactor * (1.0 - coreFactor));

        float grassMask = clamp(1.0 - rockFactor - beachTotal - pathTotal, 0.0, 1.0);

        // 6. Normal 3D rápida via derivadas de hardware (dFdx / dFdy)
        float sandRipple = sin(dot(xz, normalize(uWindDir)) * 2.2 + nMid * 2.0);
        float heightField = (nMid * 0.08 + nHigh * 0.03) * grassMask
                          + sandRipple * 0.025 * (drySand + wetSand)
                          + cobbleHeight * 0.06 * coreFactor;

        float dhdx = dFdx(heightField) * uNormalStrength;
        float dhdy = dFdy(heightField) * uNormalStrength;

        vec3 detailNormal = normalize(vec3(-dhdx * 12.0, 1.0, -dhdy * 12.0));
        vec3 N = normalize(mix(vBigNormal, detailNormal, 0.55));

        // 7. Poças de Chuva Reflexivas
        float puddleNoise = nMid * 0.5 + 0.5;
        float puddleBase = smoothstep(0.54, 0.62, puddleNoise) * (1.0 - beachTotal) * mix(0.5, 1.3, pathTotal);
        float puddleMask = clamp(puddleBase * uWetness, 0.0, 1.0);

        vec3 V = normalize(cameraPosition - vWorldPos);

        if (puddleMask > 0.001) {
          float ringPhase = length(xz * 0.6) - uTime * 1.4;
          float rings = sin(ringPhase * 3.0 + nMid * 4.0) * 0.5 + 0.5;
          vec3 rippleN = normalize(vec3(sin(ringPhase) * 0.12, 1.0, cos(ringPhase) * 0.12));
          vec3 puddleN = normalize(mix(vec3(0.0, 1.0, 0.0), rippleN, 0.35 * rings));

          float NdotV = max(dot(puddleN, V), 0.0);
          float fres = 0.02 + 0.98 * pow(1.0 - NdotV, 5.0);
          vec3 reflDir = reflect(-V, puddleN);
          float skyH = smoothstep(-0.1, 0.5, reflDir.y);
          vec3 skyRefl = mix(uHorizonColor, uZenithColor, skyH);
          float sunSpec = pow(max(dot(reflDir, normalize(uSunDir)), 0.0), 220.0);
          float moonSpec = pow(max(dot(reflDir, normalize(uMoonDir)), 0.0), 80.0);
          vec3 puddleColor = mix(vec3(0.03, 0.06, 0.08), skyRefl, fres);
          puddleColor += uSunColor * sunSpec * uSunIntensity * 4.0;
          puddleColor += uMoonColor * moonSpec * uMoonIntensity * 2.0;
          puddleColor += vec3(1.0) * uFlashPower * 0.8;
          base = mix(base, puddleColor, puddleMask);
        }

        base *= mix(1.0, 0.62, uWetness * (1.0 - puddleMask));

        // 8. Iluminação do Farol da Moto
        vec3 toFrag = vWorldPos - uSpotPos;
        float distSpot = length(toFrag);
        vec3 toFragDir = toFrag / max(distSpot, 0.0001);
        float cosAngle = dot(toFragDir, normalize(uSpotDir));
        float cone = smoothstep(cos(radians(32.0)), cos(radians(14.0)), cosAngle);
        float atten = 1.0 / (1.0 + 0.03 * distSpot + 0.004 * distSpot * distSpot);
        float spot = cone * atten * uSpotIntensity;
        float wetBoost = mix(1.0, 2.2, clamp(uWetness + puddleMask, 0.0, 1.0));
        vec3 spotContribution = uSpotColor * spot * wetBoost;

        // 9. Iluminação Sol + Lua + Hemisférica
        vec3 hemi = mix(uHemiGroundColor, uHemiSkyColor, N.y * 0.5 + 0.5) * uHemiIntensity;
        vec3 sunDiff = max(dot(N, uSunDir), 0.0) * uSunColor * uSunIntensity;
        vec3 moonDiff = max(dot(N, uMoonDir), 0.0) * uMoonColor * uMoonIntensity;

        vec3 halfV = normalize(V + uSunDir);
        float sheen = pow(max(dot(N, halfV), 0.0), 24.0) * grassMask * uSunIntensity * 0.25;

        vec3 lit = base * (hemi + sunDiff + moonDiff) + vec3(sheen) + spotContribution;
        lit += vec3(1.0) * uFlashPower * 0.35;

        // 10. Fog Dinâmico
        float fogDist = length(cameraPosition - vWorldPos);
        float fogFactor = clamp((uFogFar - fogDist) / max(uFogFar - uFogNear, 0.001), 0.0, 1.0);
        vec3 finalColor = mix(uFogColor, lit, fogFactor);

        gl_FragColor = vec4(finalColor, 1.0);
      }
    `;

    this.material = new THREE.ShaderMaterial({
      uniforms: this.groundUniforms,
      vertexShader,
      fragmentShader,
      fog: false,
    });
  }

  _bladeGeometry() {
    const w = this.params.bladeWidth;
    const h = this.params.bladeHeight;
    const positions = [];
    const bend = [];
    const indices = [];

    const angles = [0, Math.PI / 2];
    angles.forEach((ang, idx) => {
      const c = Math.cos(ang);
      const s = Math.sin(ang);

      positions.push(
        (-w / 2) * c, 0, (-w / 2) * s,
        ( w / 2) * c, 0, ( w / 2) * s,
        (-w * 0.15) * c, h, (-w * 0.15) * s,
        ( w * 0.15) * c, h, ( w * 0.15) * s
      );
      bend.push(0, 0, 1, 1);

      const base = idx * 4;
      indices.push(base, base + 1, base + 2, base + 2, base + 1, base + 3);
    });

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
    geo.setAttribute('aBend', new THREE.BufferAttribute(new Float32Array(bend), 1));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    return geo;
  }

  _isGrassZone(x, z) {
    const p = this.params;
    const coastDist = Math.max(Math.abs(x), Math.abs(z));
    if (coastDist > p.landHalf - p.beachWidth - 1.0) return false;

    const roadStartZ = Math.max(20, p.landHalf - p.beachWidth - 6);
    const roadStart = { x: 0, z: roadStartZ };
    const roadEnd = { x: 0, z: 0 };
    const abx = roadEnd.x - roadStart.x, abz = roadEnd.z - roadStart.z;
    const t = THREE.MathUtils.clamp(((x - roadStart.x) * abx + (z - roadStart.z) * abz) / (abx * abx + abz * abz), 0, 1);
    const projX = roadStart.x + abx * t, projZ = roadStart.z + abz * t;
    const roadDist = Math.hypot(x - projX, z - projZ);
    if (roadDist < p.roadWidth + p.roadEdgeWidth + 1.5) return false;

    const plazaDist = Math.hypot(x, z) - p.plazaRadius;
    if (plazaDist < p.roadEdgeWidth + 1.5) return false;

    return true;
  }

  _valueNoise2D(x, z) {
    const s = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453;
    return s - Math.floor(s);
  }

  _buildGrass() {
    const p = this.params;
    const half = p.landHalf - p.beachWidth - 2.0;
    const spacing = p.bladeSpacing;
    const matrix = new THREE.Matrix4();
    const quat = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    const euler = new THREE.Euler();
    const maxInstances = 12000;

    const candidateMatrices = [];
    for (let gx = -half; gx <= half; gx += spacing) {
      for (let gz = -half; gz <= half; gz += spacing) {
        const jitterX = gx + (Math.random() - 0.5) * spacing * 0.85;
        const jitterZ = gz + (Math.random() - 0.5) * spacing * 0.85;

        const patch = this._valueNoise2D(jitterX * 0.08, jitterZ * 0.08);
        if (patch < 0.35) continue;

        if (!this._isGrassZone(jitterX, jitterZ)) continue;

        const s = 0.8 + Math.random() * 0.6;
        scale.set(s, 0.75 + Math.random() * 0.55, s);
        euler.set(0, Math.random() * Math.PI * 2, 0);
        quat.setFromEuler(euler);
        matrix.compose(new THREE.Vector3(jitterX, 0.0, jitterZ), quat, scale);
        candidateMatrices.push(matrix.clone());

        if (candidateMatrices.length >= maxInstances) break;
      }
      if (candidateMatrices.length >= maxInstances) break;
    }

    const geo = this._bladeGeometry();
    const count = candidateMatrices.length;

    const uGrass = {
      uWindStrength: { value: p.windStrength },
      uBladeHeight: { value: p.bladeHeight },
    };
    this.grassUniforms = { ...this._sharedEnv, ...uGrass };

    const vertexShader = `
      attribute float aBend;
      uniform float uTime, uWindStrength;
      uniform vec2 uWindDir;
      uniform vec3 uPlayerPos, uMotoPos;

      varying vec3 vWorldPos;
      varying float vShade;
      varying float vBend;

      void main() {
        vec4 worldBase = modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);

        vec3 wind = normalize(vec3(uWindDir.x, 0.0, uWindDir.y));
        float phase = dot(worldBase.xz, wind.xz) * 0.5 + uTime * 2.2;
        float gust = sin(phase) * 0.5 + sin(phase * 2.3 + 1.7) * 0.25;
        vec3 windBend = wind * gust * uWindStrength * 0.35 * aBend;

        vec3 pushBend = vec3(0.0);
        float pushRadius = 2.2;
        vec2 toPlayer = worldBase.xz - uPlayerPos.xz;
        float distPlayer = length(toPlayer);
        if (distPlayer < pushRadius) {
          float f = (1.0 - distPlayer / pushRadius) * aBend;
          pushBend += vec3(normalize(toPlayer + 1e-5).x, -0.5, normalize(toPlayer + 1e-5).y) * f * 0.9;
        }
        vec2 toMoto = worldBase.xz - uMotoPos.xz;
        float distMoto = length(toMoto);
        if (distMoto < pushRadius) {
          float f = (1.0 - distMoto / pushRadius) * aBend;
          pushBend += vec3(normalize(toMoto + 1e-5).x, -0.5, normalize(toMoto + 1e-5).y) * f * 0.9;
        }

        vec3 localPos = position + windBend + pushBend;
        vec4 worldPos = modelMatrix * instanceMatrix * vec4(localPos, 1.0);

        vWorldPos = worldPos.xyz;
        vShade = 0.7 + 0.3 * fract(sin(dot(worldBase.xz, vec2(12.9898, 78.233))) * 43758.5453);
        vBend = aBend;

        gl_Position = projectionMatrix * viewMatrix * worldPos;
      }
    `;

    const fragmentShader = `
      precision highp float;
      uniform vec3 uSunDir, uSunColor; uniform float uSunIntensity;
      uniform vec3 uMoonDir, uMoonColor; uniform float uMoonIntensity;
      uniform vec3 uHemiSkyColor, uHemiGroundColor; uniform float uHemiIntensity;
      uniform float uFlashPower, uWetness;
      uniform vec3 uFogColor; uniform float uFogNear, uFogFar;
      uniform vec3 uSpotPos, uSpotDir, uSpotColor; uniform float uSpotIntensity;

      varying vec3 vWorldPos;
      varying float vShade;
      varying float vBend;

      void main() {
        vec3 tipGreen = mix(vec3(0.18, 0.46, 0.22), vec3(0.38, 0.56, 0.22), vShade);
        vec3 rootGreen = vec3(0.11, 0.28, 0.13);
        vec3 baseGreen = mix(rootGreen, tipGreen, vBend);
        baseGreen *= mix(1.0, 0.65, uWetness);

        vec3 hemi = mix(uHemiGroundColor, uHemiSkyColor, 0.75) * uHemiIntensity;
        vec3 sunDiff = max(uSunDir.y, 0.0) * uSunColor * uSunIntensity;
        vec3 moonDiff = max(uMoonDir.y, 0.0) * uMoonColor * uMoonIntensity;

        vec3 toFrag = vWorldPos - uSpotPos;
        float distSpot = length(toFrag);
        vec3 toFragDir = toFrag / max(distSpot, 0.0001);
        float cosAngle = dot(toFragDir, normalize(uSpotDir));
        float cone = smoothstep(cos(radians(32.0)), cos(radians(14.0)), cosAngle);
        float atten = 1.0 / (1.0 + 0.03 * distSpot + 0.004 * distSpot * distSpot);
        vec3 spot = uSpotColor * cone * atten * uSpotIntensity;

        vec3 lit = baseGreen * (hemi + sunDiff + moonDiff) + spot + vec3(1.0) * uFlashPower * 0.3;

        float fogDist = length(cameraPosition - vWorldPos);
        float fogFactor = clamp((uFogFar - fogDist) / max(uFogFar - uFogNear, 0.001), 0.0, 1.0);
        vec3 finalColor = mix(uFogColor, lit, fogFactor);

        gl_FragColor = vec4(finalColor, 1.0);
      }
    `;

    this.grassMaterial = new THREE.ShaderMaterial({
      uniforms: this.grassUniforms,
      vertexShader,
      fragmentShader,
      side: THREE.DoubleSide,
      fog: false,
    });

    this.grassMesh = new THREE.InstancedMesh(geo, this.grassMaterial, Math.max(count, 1));
    candidateMatrices.forEach((m, i) => this.grassMesh.setMatrixAt(i, m));
    this.grassMesh.count = count;
    this.grassMesh.instanceMatrix.needsUpdate = true;
    this.grassMesh.frustumCulled = false;
  }

  _rebuildGrass() {
    this.scene.remove(this.grassMesh);
    this.grassMesh.geometry.dispose();
    this._buildGrass();
    this.grassMesh.position.copy(this.position);
    this.scene.add(this.grassMesh);
  }

  setLandSize(newSize, water = null) {
    this.landSize = newSize;
    this.params.landHalf = newSize / 2;
    this.groundUniforms.uLandHalf.value = this.params.landHalf;
    const roadStartZ = Math.max(20, this.params.landHalf - this.params.beachWidth - 6);
    this.groundUniforms.uRoadStart.value.set(0, roadStartZ);

    this.scene.remove(this.mesh);
    this.geometry.dispose();
    this._buildGroundMesh();
    this.mesh.position.copy(this.position);
    this.scene.add(this.mesh);

    this._rebuildGrass();

    if (water && typeof water.setWorldSize === 'function') {
      const nextOceanSize = Math.max(water.oceanSize || 600, newSize * 2.2);
      water.params.landSize = newSize;
      water.params.oceanSize = nextOceanSize;
      water.setWorldSize(newSize, nextOceanSize);
    }
  }

  exportPreset() {
    const p = this.params;
    const preset = {
      landHalf: p.landHalf, beachWidth: p.beachWidth, dipDepth: p.dipDepth,
      roadWidth: p.roadWidth, roadEdgeWidth: p.roadEdgeWidth, plazaRadius: p.plazaRadius,
      grassColorA: p.grassColorA, grassColorB: p.grassColorB, grassColorC: p.grassColorC,
      sandDryColor: p.sandDryColor, sandWetColor: p.sandWetColor,
      dirtColor: p.dirtColor, cobbleColor: p.cobbleColor, groutColor: p.groutColor, rockColor: p.rockColor,
      bladeSpacing: p.bladeSpacing, bladeHeight: p.bladeHeight, bladeWidth: p.bladeWidth,
      windStrength: p.windStrength, normalStrength: p.normalStrength,
    };
    console.log('📋 Preset GroundSystem:', JSON.stringify(preset, null, 2));
  }

  attachGUI(gui, dayNight = null, water = null) {
    const p = this.params;
    const gu = this.groundUniforms;

    const fGroundRoot = gui.addFolder('🏝️ Solo, Estradas & Grama 3D');

    const fWorld = fGroundRoot.addFolder('🗺️ Geometria da Ilha & Estradas');
    fWorld.add({ landSize: this.landSize }, 'landSize', 100, 1200, 10)
      .name('Tamanho da ilha')
      .onFinishChange((v) => this.setLandSize(v, water));
    fWorld.add(p, 'beachWidth', 4, 40, 1).name('Largura da praia')
      .onFinishChange((v) => {
        gu.uBeachWidth.value = v;
        gu.uRoadStart.value.set(0, Math.max(20, p.landHalf - v - 6));
        this._rebuildGrass();
      });
    fWorld.add(p, 'roadWidth', 1, 8, 0.2).name('Largura estrada (pedra)')
      .onFinishChange((v) => { gu.uRoadWidth.value = v; this._rebuildGrass(); });
    fWorld.add(p, 'roadEdgeWidth', 1, 12, 0.5).name('Largura borda de terra')
      .onFinishChange((v) => { gu.uRoadEdgeWidth.value = v; this._rebuildGrass(); });
    fWorld.add(p, 'plazaRadius', 4, 30, 1).name('Raio da praça central')
      .onFinishChange((v) => { gu.uPlazaRadius.value = v; this._rebuildGrass(); });

    const fColor = fGroundRoot.addFolder('🎨 Cores do Bioma');
    fColor.addColor(p, 'grassColorA').name('Grama A').onChange((v) => gu.uGrassColorA.value.set(v));
    fColor.addColor(p, 'grassColorB').name('Grama B').onChange((v) => gu.uGrassColorB.value.set(v));
    fColor.addColor(p, 'grassColorC').name('Grama C').onChange((v) => gu.uGrassColorC.value.set(v));
    fColor.addColor(p, 'sandDryColor').name('Areia seca').onChange((v) => gu.uSandDryColor.value.set(v));
    fColor.addColor(p, 'sandWetColor').name('Areia molhada').onChange((v) => gu.uSandWetColor.value.set(v));
    fColor.addColor(p, 'dirtColor').name('Terra').onChange((v) => gu.uDirtColor.value.set(v));
    fColor.addColor(p, 'cobbleColor').name('Pedra').onChange((v) => gu.uCobbleColor.value.set(v));
    fColor.addColor(p, 'groutColor').name('Rejunte').onChange((v) => gu.uGroutColor.value.set(v));
    fColor.addColor(p, 'rockColor').name('Rocha').onChange((v) => gu.uRockColor.value.set(v));

    const fWet = fGroundRoot.addFolder('💧 Poças & Relevo');
    fWet.add(p, 'useManualWetness').name('Forçar poças manualmente');
    fWet.add(p, 'manualWetness', 0, 1, 0.05).name('Nível de umidade');
    fWet.add(p, 'normalStrength', 0, 2, 0.05).name('Força do relevo 3D').onChange((v) => (gu.uNormalStrength.value = v));

    const fGrass = fGroundRoot.addFolder('🌾 Grama 3D (GPU)');
    fGrass.add(p, 'bladeSpacing', 0.9, 4.0, 0.1).name('Espaçamento').onFinishChange(() => this._rebuildGrass());
    fGrass.add(p, 'bladeHeight', 0.15, 1.0, 0.02).name('Altura da folha').onFinishChange(() => this._rebuildGrass());
    fGrass.add(p, 'windStrength', 0, 3, 0.05).name('Força do vento').onChange((v) => (this.grassUniforms.uWindStrength.value = v));

    fGroundRoot.add({ exportar: () => this.exportPreset() }, 'exportar').name('📋 Exportar Preset Solo');
  }

  update(delta, elapsed, activePlayerPos = null, dayNight = null, moto = null) {
    const env = this._sharedEnv;
    env.uTime.value = elapsed;

    const sunDir = dayNight?.getSunDirection ? dayNight.getSunDirection() : new THREE.Vector3(0.4, 0.8, 0.3).normalize();
    env.uSunDir.value.copy(sunDir);
    if (dayNight?._skyUniforms?.uSunColor?.value) env.uSunColor.value.copy(dayNight._skyUniforms.uSunColor.value);
    env.uSunIntensity.value = dayNight?.dirLight?.intensity ?? 1.2;

    const moonDir = dayNight?.moonLight?.position ? dayNight.moonLight.position.clone().normalize() : sunDir.clone().negate();
    env.uMoonDir.value.copy(moonDir);
    if (dayNight?.moonLight?.color) env.uMoonColor.value.copy(dayNight.moonLight.color);
    env.uMoonIntensity.value = dayNight?.moonLight?.intensity ?? 0.0;

    if (dayNight?.hemiLight?.color) env.uHemiSkyColor.value.copy(dayNight.hemiLight.color);
    if (dayNight?.hemiLight?.groundColor) env.uHemiGroundColor.value.copy(dayNight.hemiLight.groundColor);
    env.uHemiIntensity.value = dayNight?.hemiLight?.intensity ?? 1.0;

    if (dayNight?._skyUniforms?.uZenithColor?.value) env.uZenithColor.value.copy(dayNight._skyUniforms.uZenithColor.value);
    if (dayNight?._skyUniforms?.uHorizonColor?.value) env.uHorizonColor.value.copy(dayNight._skyUniforms.uHorizonColor.value);

    env.uFlashPower.value = dayNight?._flashPower ?? 0.0;

    if (dayNight?._windDir) env.uWindDir.value.set(dayNight._windDir.x, dayNight._windDir.z);

    if (this.scene.fog) {
      env.uFogColor.value.copy(this.scene.fog.color);
      env.uFogNear.value = this.scene.fog.near;
      env.uFogFar.value = this.scene.fog.far;
    }

    const raining = dayNight?.isRaining ? dayNight.isRaining() : false;
    const wetnessTarget = this.params.useManualWetness ? this.params.manualWetness : (raining ? 1.0 : 0.0);
    env.uWetness.value += (wetnessTarget - env.uWetness.value) * Math.min(delta * 1.2, 1);

    if (activePlayerPos) env.uPlayerPos.value.copy(activePlayerPos);
    else env.uPlayerPos.value.set(0, -999, 0);

    // Integração com o Farol Dianteiro (+Z) da Honda Twister 300
    if (moto?.group?.position) {
      env.uMotoPos.value.copy(moto.group.position);
      if (moto.headlightOn) {
        this._tmpSpotOffset.set(0, 0.78, 0.82).applyQuaternion(moto.group.quaternion);
        env.uSpotPos.value.copy(moto.group.position).add(this._tmpSpotOffset);
        this._tmpSpotDir.set(0, -0.14, 1.0).applyQuaternion(moto.group.quaternion).normalize();
        env.uSpotDir.value.copy(this._tmpSpotDir);
        env.uSpotIntensity.value = 2.6;
      } else {
        env.uSpotIntensity.value = 0.0;
      }
    } else {
      env.uMotoPos.value.set(0, -999, 0);
      env.uSpotIntensity.value = 0.0;
    }
  }
}