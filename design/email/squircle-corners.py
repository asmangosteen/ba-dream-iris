"""
메일용 corner smoothing 60% 모서리 그림 만들기.
메일 앱(Gmail 등)은 clip-path 를 지워서, 모서리를 작은 PNG 로 그려 표의 네 귀퉁이에 붙입니다(가운데는 곧은 칸).
공식은 app/plugins/squircle.client.ts 와 같아요(figma-squircle). 3배 해상도로 그려서 레티나에서도 선명해요.

실행: python3 design/email/squircle-corners.py   → public/email/sq-<이름>-<tl|tr|bl|br>.png
"""
import math
import os
from PIL import Image, ImageDraw

S = 0.6          # corner smoothing 60%
SCALE = 3        # 3배 해상도
SS = 4           # 안티에일리어싱용 확대
OUT = os.path.join(os.path.dirname(__file__), '..', '..', 'public', 'email')

# 이름: (모서리 반지름, 높이(짧은 변) — 둥근 정도 한도, 채우기, 선 색, 선 두께)
SHAPES = {
    'card': (16, 400, '#FFFFFF', '#E9EBED', 1),   # 메일 카드(흰 바탕 + 1px 선)
    'code': (12, 76, '#F1F2F3', None, 0),         # 코드 칸
}


def corner(r, budget):
    sm = min(S, budget / r - 1)
    p = min((1 + S) * r, budget)
    arc = 90 * (1 - sm)
    L = math.sin(math.radians(arc / 2)) * r * math.sqrt(2)
    p34 = r * math.tan(math.radians((90 - arc) / 4))
    beta = math.radians(45 * sm)
    c = p34 * math.cos(beta)
    d = c * math.tan(beta)
    b = (p - L - c - d) / 3
    a = 2 * b
    return dict(r=r, a=a, b=b, c=c, d=d, p=p, L=L)


def outline(w, h, rad):
    """squircle.client.ts 의 path() 를 점 목록으로(왼쪽 위가 0,0)"""
    budget = min(w, h) / 2
    k = corner(min(rad, budget), budget)
    r, a, b, c, d, p, L = (k[x] for x in 'r a b c d p L'.split())
    A = a + b + c
    pts = []
    cur = [w - p, 0.0]
    pts.append(tuple(cur))

    def cubic(c1, c2, e):
        x0, y0 = cur
        for i in range(1, 25):
            t = i / 24
            mt = 1 - t
            x = mt**3 * x0 + 3 * mt * mt * t * (x0 + c1[0]) + 3 * mt * t * t * (x0 + c2[0]) + t**3 * (x0 + e[0])
            y = mt**3 * y0 + 3 * mt * mt * t * (y0 + c1[1]) + 3 * mt * t * t * (y0 + c2[1]) + t**3 * (y0 + e[1])
            pts.append((x, y))
        cur[0] += e[0]; cur[1] += e[1]

    def arc_to(dx, dy):
        # 반지름 r, 시계 방향(sweep=1)의 짧은 호
        x0, y0 = cur
        x1, y1 = x0 + dx, y0 + dy
        mx, my = (x0 + x1) / 2, (y0 + y1) / 2
        q = math.hypot(dx, dy)
        hgt = math.sqrt(max(r * r - (q / 2) ** 2, 0))
        # 시계 방향 쪽 중심
        ux, uy = -dy / q, dx / q
        cx, cy = mx + ux * hgt, my + uy * hgt
        a0 = math.atan2(y0 - cy, x0 - cx)
        a1 = math.atan2(y1 - cy, x1 - cx)
        while a1 < a0:
            a1 += 2 * math.pi
        for i in range(1, 17):
            t = a0 + (a1 - a0) * i / 16
            pts.append((cx + r * math.cos(t), cy + r * math.sin(t)))
        cur[0], cur[1] = x1, y1

    def line(x, y):
        cur[0], cur[1] = x, y
        pts.append((x, y))

    cubic((a, 0), (a + b, 0), (A, d)); arc_to(L, L); cubic((d, c), (d, b + c), (d, A))
    line(w, h - p)
    cubic((0, a), (0, a + b), (-d, A)); arc_to(-L, L); cubic((-c, d), (-(b + c), d), (-A, d))
    line(p, h)
    cubic((-a, 0), (-(a + b), 0), (-A, -d)); arc_to(-L, -L); cubic((-d, -c), (-d, -(b + c)), (-d, -A))
    line(0, p)
    cubic((0, -a), (0, -(a + b)), (d, -A)); arc_to(L, -L); cubic((c, -d), (b + c, -d), (A, -d))
    return pts, p


def render(name, r, short, fill, stroke, sw):
    # 높이가 실제 짧은 변인 상자를 그린 뒤 네 귀퉁이(p×p)를 잘라요 — 짧은 변이 작으면 둥근 정도가 줄어드는 것까지 같게
    budget = short / 2
    pc = corner(min(r, budget), budget)['p']
    P = math.ceil(pc)  # 귀퉁이 그림 크기(px)
    h = short
    w = max(short, P * 2 + 40)
    k = SCALE * SS
    img = Image.new('RGBA', (int(w * k), int(h * k)), (0, 0, 0, 0))
    dr = ImageDraw.Draw(img)
    outer, _ = outline(w, h, r)
    dr.polygon([(x * k, y * k) for x, y in outer], fill=stroke or fill)
    if stroke and sw:
        inner, _ = outline(w - 2 * sw, h - 2 * sw, max(r - sw, 0))
        dr.polygon([((x + sw) * k, (y + sw) * k) for x, y in inner], fill=fill)
    img = img.resize((int(w * SCALE), int(h * SCALE)), Image.LANCZOS)
    c = P * SCALE
    W, H = img.size
    boxes = {'tl': (0, 0, c, c), 'tr': (W - c, 0, W, c), 'bl': (0, H - c, c, H), 'br': (W - c, H - c, W, H)}
    for k2, b in boxes.items():
        img.crop(b).save(os.path.join(OUT, f'sq-{name}-{k2}.png'), optimize=True)
    return P


if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    for n, (r, short, fill, stroke, sw) in SHAPES.items():
        print(n, '귀퉁이', render(n, r, short, fill, stroke, sw), 'px')
