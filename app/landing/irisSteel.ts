// 랜딩(/welcome)의 Iris 3D 로고 장면 — 브러시드 스틸, 배경 없음(투명)
// - 조명: 블렌더 파일(iris_01_brushed_steel_360.blend)의 면광원 4개 그대로
// - 끌어서 어느 방향으로든 360도 + 관성. 손을 떼고 3초 뒤 천천히 기본 자세로 돌아와 살짝 흔들림
// - 위아래 스크롤(휠 · 트랙패드 · 두 손가락)로 커서 위치 기준 확대 · 축소
// - 위아래로 천천히 떠 있고, 바닥에 아주 옅은 그림자(로고를 아래에서 본 실루엣을 흐리게 깐 것)
// 모델: public/landing/iris-steel.glb.gz — design/logo/pack-web-glb.py 로 만듦
import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js'
import { HorizontalBlurShader } from 'three/addons/shaders/HorizontalBlurShader.js'
import { VerticalBlurShader } from 'three/addons/shaders/VerticalBlurShader.js'

// 블렌더 장면 조명 (GLB 의 irisStudio 메타데이터와 같음)
const LIGHT = {
  exposure: 0.35,
  world: [0.23, 0.25, 0.28] as const,
  worldStrength: 0.25,
  lights: [
    { energy: 950, w: 4, h: 2.8, color: [1, 1, 1], pos: [-3.8, 4.1, 5], quat: [0.14904403686523438, -0.38006913661956787, -0.8498603701591492, 0.3332727551460266] },
    { energy: 800, w: 1, h: 4.5, color: [0.93, 0.97, 1], pos: [4.1, 0.6, 2.8], quat: [0.30675068497657776, 0.354908287525177, 0.6681613922119141, 0.5774985551834106] },
    { energy: 650, w: 3.2, h: 0.7, color: [1, 1, 1], pos: [-0.3, 4.7, 0.9], quat: [0.02030833438038826, -0.6369739770889282, -0.7702264189720154, 0.024556640535593033] },
    { energy: 180, w: 3.5, h: 2.5, color: [1, 1, 1], pos: [-1.4, -3.8, 4], quat: [0.37954404950141907, -0.06769207119941711, -0.16200685501098633, 0.908360004425] },
  ],
}

export type IrisSteelOptions = {
  url: string
  frame?: number // 화면 세로에 담을 장면 높이 (작을수록 로고가 큼)
  camY?: number
  rest?: [number, number] // 기본 자세 [좌우, 위아래] (라디안)
  sway?: number
  bob?: number
  shadow?: number // 그림자 진하기
  shadowColor?: THREE.ColorRepresentation // 그림자 색 (흰 바탕: 검정, 다크 바탕: 밝은 색)
  exposure?: number
  env?: number
  zoomMin?: number
  zoomMax?: number
  onProgress?: (p: number) => void
  onChange?: (changed: boolean) => void // 처음 모습에서 바뀌었는지 (Reset 버튼 보이기용)
}

export async function mountIrisSteel(host: HTMLElement, o: IrisSteelOptions) {
  const opt = { frame: 6, camY: -0.35, rest: [0, 0] as [number, number], sway: 0.32, bob: 0.07, shadow: 0.1, shadowColor: 0x000000 as THREE.ColorRepresentation, exposure: 1, env: 1, zoomMin: 0.6, zoomMax: 1.6, onProgress: () => {}, onChange: () => {}, ...o }
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches
  const ac = new AbortController()
  const on = { signal: ac.signal }
  let raf = 0
  let alive = true

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' })
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.AgXToneMapping
  renderer.toneMappingExposure = 2 ** LIGHT.exposure * opt.exposure
  renderer.setClearColor(0, 0)
  host.appendChild(renderer.domElement)
  const el = renderer.domElement

  const scene = new THREE.Scene()
  RectAreaLightUniformsLib.init()
  for (const l of LIGHT.lights) {
    const a = new THREE.RectAreaLight(0xffffff, 1, l.w, l.h)
    a.color.setRGB(l.color[0]!, l.color[1]!, l.color[2]!)
    a.position.fromArray(l.pos)
    a.quaternion.fromArray(l.quat)
    a.power = l.energy
    scene.add(a)
  }
  const envScene = new THREE.Scene()
  envScene.background = new THREE.Color().setRGB(...LIGHT.world).multiplyScalar(LIGHT.worldStrength * opt.env)
  const pm = new THREE.PMREMGenerator(renderer)
  const envRT = pm.fromScene(envScene, 0, 0.1, 100)
  scene.environment = envRT.texture
  pm.dispose()

  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.05, 100)
  camera.position.set(0, opt.camY, 11)
  function resize() {
    const w = host.clientWidth
    const h = host.clientHeight
    if (!w || !h) return
    const a = w / h
    const f = opt.frame * Math.max(1, 1 / a)
    camera.left = (-f * a) / 2
    camera.right = (f * a) / 2
    camera.top = f / 2
    camera.bottom = -f / 2
    camera.updateProjectionMatrix()
    renderer.setSize(w, h)
  }
  const ro = new ResizeObserver(resize)
  ro.observe(host)
  resize()

  const pivot = new THREE.Group()
  scene.add(pivot)
  let changed = false
  const markChanged = () => {
    if (changed) return
    changed = true
    opt.onChange(true)
  }

  // ── 바닥 그림자 ─────────────────────────────────────────────
  const S = { w: 7, d: 5, floor: -2.25, height: 4.6, res: 512, blur: 3.4, squash: 0.2 }
  const rt = new THREE.WebGLRenderTarget(S.res, S.res)
  rt.texture.generateMipmaps = false
  const rtBlur = rt.clone()
  const shCam = new THREE.OrthographicCamera(-S.w / 2, S.w / 2, S.d / 2, -S.d / 2, 0, S.height)
  shCam.position.set(0, S.floor, 0)
  shCam.rotation.x = Math.PI / 2 // 바닥에서 위를 올려다봄
  const depthMat = new THREE.MeshDepthMaterial()
  depthMat.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace(
      'gl_FragColor = vec4( vec3( 1.0 - fragCoordZ ), opacity );',
      // 색은 흰색으로 찍고(진하기는 알파), 실제 색은 바닥 판 재질 색(shadowColor)이 정해요 — 다크 바탕에선 밝은 그림자
      'gl_FragColor = vec4( vec3( 1.0 ), pow( 1.0 - fragCoordZ, 1.6 ) * 1.6 );',
    )
  }
  depthMat.depthTest = false
  depthMat.depthWrite = false
  const blurPlane = new THREE.Mesh(new THREE.PlaneGeometry(S.w, S.d).rotateX(Math.PI / 2))
  blurPlane.position.set(0, S.floor + 0.5, 0)
  const hBlur = new THREE.ShaderMaterial(HorizontalBlurShader)
  const vBlur = new THREE.ShaderMaterial(VerticalBlurShader)
  hBlur.depthTest = vBlur.depthTest = false
  function blur(amount: number) {
    blurPlane.material = hBlur
    hBlur.uniforms.tDiffuse!.value = rt.texture
    hBlur.uniforms.h!.value = amount / 256
    renderer.setRenderTarget(rtBlur)
    renderer.render(blurPlane, shCam)
    blurPlane.material = vBlur
    vBlur.uniforms.tDiffuse!.value = rtBlur.texture
    vBlur.uniforms.v!.value = amount / 256
    renderer.setRenderTarget(rt)
    renderer.render(blurPlane, shCam)
  }
  // 화면을 향한 판에 납작하게 펼쳐서, 살짝 위에서 내려다본 바닥처럼
  const shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(S.w, S.d),
    new THREE.MeshBasicMaterial({ map: rt.texture, color: opt.shadowColor, transparent: true, opacity: opt.shadow, depthWrite: false, toneMapped: false, side: THREE.DoubleSide }),
  )
  const shadowMat = shadow.material as THREE.MeshBasicMaterial
  shadow.scale.set(1, -S.squash, 1) // 뒤쪽(-z)이 화면 위로
  shadow.position.set(0, S.floor, -4)
  shadow.renderOrder = -1
  scene.add(shadow)

  // ── 회전: 쿼터니언이라 어느 방향으로든 360도 ──────────────────
  const X = new THREE.Vector3(1, 0, 0)
  const Y = new THREE.Vector3(0, 1, 0)
  const qStep = new THREE.Quaternion()
  const qRest = new THREE.Quaternion()
  const eRest = new THREE.Euler()
  pivot.quaternion.setFromEuler(new THREE.Euler(opt.rest[1], opt.rest[0] - 1.1, 0))
  function turn(dx: number, dy: number) {
    pivot.quaternion.premultiply(qStep.setFromAxisAngle(Y, dx))
    pivot.quaternion.premultiply(qStep.setFromAxisAngle(X, dy))
  }
  let vy = 0
  let vp = 0
  let last = -1e9
  let mx = 0
  let my = 0

  // ── 크기: 커서(두 손가락이면 그 가운데) 기준 ───────────────────
  let zoomTo = 1
  let panX = 0
  let panY = 0
  const anchor = { x: 0, y: 0 }
  const setAnchor = (cx: number, cy: number) => {
    const r = el.getBoundingClientRect()
    anchor.x = ((cx - r.left) / r.width) * 2 - 1
    anchor.y = -(((cy - r.top) / r.height) * 2 - 1)
  }
  const setZoom = (z: number) => { zoomTo = THREE.MathUtils.clamp(z, opt.zoomMin, opt.zoomMax) }
  window.addEventListener(
    'wheel',
    (e: WheelEvent) => {
      e.preventDefault()
      const k = e.deltaMode === 1 ? 16 : 1
      const dx = e.deltaX * k
      const dy = e.deltaY * k
      // 트랙패드는 가로 · 세로가 섞여 오므로, 옆으로 쓸기는 무시
      if (!e.ctrlKey && Math.abs(dx) > Math.abs(dy)) return
      markChanged()
      setAnchor(e.clientX, e.clientY)
      setZoom(zoomTo * Math.exp(-dy * (e.ctrlKey ? 0.012 : 0.0016)))
    },
    { passive: false, signal: ac.signal },
  )

  el.style.touchAction = 'none'
  el.style.cursor = 'grab'
  const pts = new Map<number, { x: number; y: number }>()
  let pinch = 0
  const two = () => [...pts.values()] as [{ x: number; y: number }, { x: number; y: number }]
  el.addEventListener('pointerdown', (e) => {
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY })
    el.setPointerCapture(e.pointerId)
    el.style.cursor = 'grabbing'
    if (pts.size === 2) { const [a, b] = two(); pinch = Math.hypot(a.x - b.x, a.y - b.y) }
    vy = vp = 0
  }, on)
  el.addEventListener('pointermove', (e) => {
    const p = pts.get(e.pointerId)
    if (!p) return
    const dx = (e.clientX - p.x) * 0.0085
    const dy = (e.clientY - p.y) * 0.0085
    p.x = e.clientX
    p.y = e.clientY
    last = performance.now()
    if (dx || dy) markChanged() // 누르기만 하면 그대로
    if (pts.size === 2) {
      const [a, b] = two()
      const s = Math.hypot(a.x - b.x, a.y - b.y)
      setAnchor((a.x + b.x) / 2, (a.y + b.y) / 2)
      if (pinch) setZoom(zoomTo * (s / pinch))
      pinch = s
      return
    }
    turn(dx, dy)
    vy = dx
    vp = dy
  }, on)
  const up = (e: PointerEvent) => {
    pts.delete(e.pointerId)
    pinch = 0
    if (!pts.size) el.style.cursor = 'grab'
    last = performance.now()
  }
  el.addEventListener('pointerup', up, on)
  el.addEventListener('pointercancel', up, on)
  window.addEventListener('pointermove', (e: PointerEvent) => {
    mx = (e.clientX / innerWidth) * 2 - 1
    my = (e.clientY / innerHeight) * 2 - 1
  }, on)

  let t0 = performance.now()
  let prev = t0
  let ease = 0.03
  function frame(now: number) {
    if (!alive) return
    const dt = Math.min((now - prev) / 16.67, 3)
    prev = now
    const t = (now - t0) / 1000
    if (!pts.size) {
      turn(vy * dt, vp * dt)
      vy *= Math.pow(0.94, dt)
      vp *= Math.pow(0.94, dt)
      if (now - last > 3000) {
        const ty = opt.rest[0] + (reduce ? 0 : Math.sin(t * 0.32) * opt.sway + mx * 0.12)
        const tp = opt.rest[1] + (reduce ? 0 : Math.sin(t * 0.23) * 0.06 + my * 0.08)
        // 가장 가까운 쪽으로 돌아옴 (뒤집혀 있어도)
        qRest.setFromEuler(eRest.set(tp, ty, 0))
        pivot.quaternion.slerp(qRest, 1 - Math.pow(1 - ease, dt))
      } else ease = 0.03
    }
    if (Math.abs(camera.zoom - zoomTo) > 1e-4) {
      const z0 = camera.zoom
      const z1 = z0 + (zoomTo - z0) * (1 - Math.pow(1 - 0.14, dt))
      const hw = (camera.right - camera.left) / 2
      const hh = (camera.top - camera.bottom) / 2
      // 커서 아래 지점이 제자리에 있도록 화면을 옮기고, 원래 화면 밖으로는 못 나가게 (1배 이하에선 항상 가운데)
      panX += anchor.x * hw * (1 / z0 - 1 / z1)
      panY += anchor.y * hh * (1 / z0 - 1 / z1)
      const lx = Math.max(0, hw * (1 - 1 / z1))
      const ly = Math.max(0, hh * (1 - 1 / z1))
      panX = THREE.MathUtils.clamp(panX, -lx, lx)
      panY = THREE.MathUtils.clamp(panY, -ly, ly)
      camera.zoom = z1
      camera.position.x = panX
      camera.position.y = opt.camY + panY
      camera.updateProjectionMatrix()
    }
    pivot.position.y = reduce ? 0 : Math.sin(t * 0.9) * opt.bob

    // 그림자: 로고만 바닥 카메라로 찍어서 흐리게
    shadow.visible = false
    scene.overrideMaterial = depthMat
    renderer.setRenderTarget(rt)
    renderer.setClearColor(0xffffff, 0) // 흐리게 할 때 가장자리가 어둡게 번지지 않게 바깥도 흰색(투명)
    renderer.clear()
    renderer.setClearColor(0, 0)
    renderer.render(scene, shCam)
    scene.overrideMaterial = null
    blur(S.blur)
    blur(S.blur * 0.45)
    renderer.setRenderTarget(null)
    shadow.visible = true

    renderer.render(scene, camera)
    raf = requestAnimationFrame(frame)
  }

  // 모델 받기: 진행률을 세면서 받고, gzip 이면 브라우저 내장 DecompressionStream 으로 풂
  // (서버가 이미 풀어서 보냈으면 그대로 읽음)
  ;(async () => {
    try {
      const res = await fetch(opt.url, { signal: ac.signal })
      if (!res.ok || !res.body) throw new Error(`모델을 받지 못했어요 (${res.status})`)
      const total = Number(res.headers.get('content-length')) || 0
      const reader = res.body.getReader()
      const parts: Uint8Array[] = []
      let got = 0
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        parts.push(value)
        got += value.byteLength
        if (total) opt.onProgress(Math.min(got / total, 0.99))
      }
      let buf: ArrayBuffer = await new Blob(parts as BlobPart[]).arrayBuffer()
      const head = new Uint8Array(buf, 0, 2)
      if (head[0] === 0x1f && head[1] === 0x8b) {
        buf = await new Response(new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer()
      }
      if (!alive) return
      const g = await new GLTFLoader().parseAsync(buf, '')
      if (!alive) return
      const m = g.scene
      const box = new THREE.Box3().setFromObject(m)
      m.position.sub(box.getCenter(new THREE.Vector3()))
      pivot.add(m)
      opt.onProgress(1)
      host.dataset.ready = '1'
      t0 = performance.now()
      last = t0 - 3000
      raf = requestAnimationFrame(frame)
    } catch (err) {
      if (alive) console.error(err)
    }
  })()

  return {
    // 화면 모드가 바뀔 때 그림자 색 · 진하기 바꾸기
    setShadow(color: THREE.ColorRepresentation, amount: number) {
      shadowMat.color.set(color)
      shadowMat.opacity = amount
    },
    // 정면 · 기본 크기로 부드럽게 되돌리기
    reset() {
      vy = vp = 0
      last = -1e9
      ease = 0.08
      zoomTo = 1
      changed = false
      opt.onChange(false)
    },
    // 페이지를 떠날 때: 그리기 · 이벤트(스크롤 가로채기 포함) · GPU 자원 정리
    dispose() {
      alive = false
      cancelAnimationFrame(raf)
      ac.abort()
      ro.disconnect()
      scene.traverse((obj) => {
        const mesh = obj as THREE.Mesh
        if (!mesh.isMesh) return
        mesh.geometry?.dispose()
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
        for (const mat of mats) {
          for (const v of Object.values(mat)) if (v instanceof THREE.Texture) v.dispose()
          mat.dispose()
        }
      })
      ;[rt, rtBlur, envRT].forEach((r) => r.dispose())
      ;[depthMat, hBlur, vBlur].forEach((m) => m.dispose())
      blurPlane.geometry.dispose()
      renderer.dispose()
      el.remove()
    },
  }
}
