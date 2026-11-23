#!/usr/bin/env python3
"""Iris 3D 로고 GLB 를 웹용으로 가볍게 만듦 (랜딩 페이지용)

실행: python3 -I design/logo/pack-web-glb.py <블렌더에서 내보낸 .glb> public/landing/iris-steel.glb.gz

- 형태는 그대로: 정점 · 삼각형 수를 줄이지 않음 (단순화하면 매끈함이 깨짐)
- 위치 · 노멀: float32 → int16 정규화 (KHR_mesh_quantization, three.js 기본 지원)
  위치 오차 ≈ 로고 높이의 0.003%, 노멀도 16비트라 반사 줄무늬가 생기지 않음
- TANGENT 는 뺌 (three.js 가 노멀맵 · 이방성 반사를 화면 미분으로 계산)
- 텍스처: 4K PNG/JPEG → 2K JPEG (macOS sips)
- 마지막에 gzip. 브라우저가 DecompressionStream 으로 풀어서 읽음
"""
import gzip
import json
import math
import os
import struct
import subprocess
import sys
import tempfile
from array import array

src, dst = sys.argv[1], sys.argv[2]
TEX = 2048
JPEG_Q = 90

raw = open(src, 'rb').read()
jlen = struct.unpack('<I', raw[12:16])[0]
gl = json.loads(raw[20:20 + jlen])
bin_start = 20 + jlen + 8
BIN = raw[bin_start:bin_start + struct.unpack('<I', raw[20 + jlen:24 + jlen])[0]]


def view_bytes(vi):
    v = gl['bufferViews'][vi]
    o = v.get('byteOffset', 0)
    return BIN[o:o + v['byteLength']]


def read(ai):
    a = gl['accessors'][ai]
    v = gl['bufferViews'][a['bufferView']]
    comp = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4}[a['type']]
    code = {5126: 'f', 5125: 'I', 5123: 'H'}[a['componentType']]
    size = array(code).itemsize
    stride = v.get('byteStride', comp * size)
    data = view_bytes(a['bufferView'])
    off = a.get('byteOffset', 0)
    out = array(code)
    if stride == comp * size:
        out.frombytes(data[off:off + a['count'] * stride])
    else:
        for i in range(a['count']):
            s = off + i * stride
            out.frombytes(data[s:s + comp * size])
    return out, comp, a['componentType']


# ── 새 버퍼 쌓기 ──────────────────────────────────────────────
out = bytearray()
views, accessors = [], []


def push(blob, target=None, stride=None):
    while len(out) % 4:
        out.append(0)
    v = {'buffer': 0, 'byteOffset': len(out), 'byteLength': len(blob)}
    if target:
        v['target'] = target
    if stride:
        v['byteStride'] = stride
    out.extend(blob)
    views.append(v)
    return len(views) - 1


def acc(view, ctype, count, typ, normalized=False, mn=None, mx=None):
    a = {'bufferView': view, 'componentType': ctype, 'count': count, 'type': typ}
    if normalized:
        a['normalized'] = True
    if mn is not None:
        a['min'], a['max'] = mn, mx
    accessors.append(a)
    return len(accessors) - 1


# 모든 쐐기를 같은 기준(가운데 c, 반지름 h)으로 양자화 → 노드 변환도 하나로 같음
lo, hi = [math.inf] * 3, [-math.inf] * 3
for m in gl['meshes']:
    for p in m['primitives']:
        a = gl['accessors'][p['attributes']['POSITION']]
        lo = [min(x, y) for x, y in zip(lo, a['min'])]
        hi = [max(x, y) for x, y in zip(hi, a['max'])]
c = [(x + y) / 2 for x, y in zip(lo, hi)]
h = max((y - x) / 2 for x, y in zip(lo, hi)) * 1.0001
Q = 32767

for m in gl['meshes']:
    for p in m['primitives']:
        at = p['attributes']
        pos, _, _ = read(at['POSITION'])
        nor, _, _ = read(at['NORMAL'])
        uv, _, _ = read(at['TEXCOORD_0'])
        idx, _, ictype = read(p['indices'])
        n = len(pos) // 3

        qp = array('h')
        qmin, qmax = [Q] * 3, [-Q] * 3
        for i in range(n):
            for k in range(3):
                q = max(-Q, min(Q, round((pos[3 * i + k] - c[k]) / h * Q)))
                qp.append(q)
                qmin[k] = min(qmin[k], q)
                qmax[k] = max(qmax[k], q)
            qp.append(0)  # 4바이트 정렬용 빈 칸
        qn = array('h')
        for i in range(n):
            x, y, z = nor[3 * i], nor[3 * i + 1], nor[3 * i + 2]
            l = math.sqrt(x * x + y * y + z * z) or 1
            qn.extend((round(x / l * Q), round(y / l * Q), round(z / l * Q), 0))

        new = {
            'POSITION': acc(push(qp.tobytes(), 34962, 8), 5122, n, 'VEC3', True, qmin, qmax),
            'NORMAL': acc(push(qn.tobytes(), 34962, 8), 5122, n, 'VEC3', True),
            'TEXCOORD_0': acc(push(uv.tobytes(), 34962), 5126, n, 'VEC2'),
        }
        p['attributes'] = new
        p['indices'] = acc(push(idx.tobytes(), 34963), ictype, len(idx), 'SCALAR')


# 노드: 원래 회전 R 은 두고, 양자화를 되돌리는 평행이동(R·c) · 균일 크기(h)를 더함
def rotate(q, v):
    x, y, z, w = q
    ux, uy, uz = v
    tx, ty, tz = 2 * (y * uz - z * uy), 2 * (z * ux - x * uz), 2 * (x * uy - y * ux)
    return [ux + w * tx + (y * tz - z * ty), uy + w * ty + (z * tx - x * tz), uz + w * tz + (x * ty - y * tx)]


for nd in gl['nodes']:
    if 'mesh' not in nd:
        continue
    r = nd.get('rotation', [0, 0, 0, 1])
    t = nd.get('translation', [0, 0, 0])
    s = nd.get('scale', [1, 1, 1])
    assert s == [1, 1, 1], '노드 크기가 1이 아니면 이 스크립트를 고쳐야 해요'
    rc = rotate(r, c)
    nd['translation'] = [t[k] + rc[k] for k in range(3)]
    nd['scale'] = [h, h, h]

# 텍스처: 2K JPEG
with tempfile.TemporaryDirectory() as tmp:
    for i, im in enumerate(gl['images']):
        ext = '.png' if im.get('mimeType') == 'image/png' else '.jpg'
        a = os.path.join(tmp, f'{i}{ext}')
        b = os.path.join(tmp, f'{i}-2k.jpg')
        open(a, 'wb').write(view_bytes(im['bufferView']))
        subprocess.run(['sips', '-Z', str(TEX), '-s', 'format', 'jpeg', '-s', 'formatOptions', str(JPEG_Q), a, '--out', b],
                       check=True, capture_output=True)
        im['bufferView'] = push(open(b, 'rb').read())
        im['mimeType'] = 'image/jpeg'

gl['accessors'] = accessors
gl['bufferViews'] = views
while len(out) % 4:
    out.append(0)
gl['buffers'] = [{'byteLength': len(out)}]
for key in ('extensionsUsed', 'extensionsRequired'):
    gl[key] = sorted(set(gl.get(key, [])) | {'KHR_mesh_quantization'})

js = json.dumps(gl, separators=(',', ':')).encode()
js += b' ' * (-len(js) % 4)
glb = struct.pack('<III', 0x46546C67, 2, 12 + 8 + len(js) + 8 + len(out))
glb += struct.pack('<II', len(js), 0x4E4F534A) + js + struct.pack('<II', len(out), 0x004E4942) + bytes(out)

os.makedirs(os.path.dirname(dst) or '.', exist_ok=True)
if dst.endswith('.gz'):
    open(dst, 'wb').write(gzip.compress(glb, 9, mtime=0))
else:
    open(dst, 'wb').write(glb)
print(f'원본 {len(raw) / 1e6:.1f}MB → glb {len(glb) / 1e6:.1f}MB → 저장 {os.path.getsize(dst) / 1e6:.1f}MB ({dst})')
