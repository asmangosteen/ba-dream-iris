"""
Supabase 로그인 메일 템플릿 두 개(로그인 코드 · 처음 로그인)를 같은 틀로 만듭니다.
실행: python3 design/email/build-templates.py → supabase/templates/*.html

- 모서리는 corner smoothing 60%: 메일 앱이 clip-path 를 지워서, 귀퉁이를 그림(public/email/sq-*.png)으로 붙이는 3×3 표로 그려요
  (귀퉁이 그림은 design/email/squircle-corners.py 가 만들어요)
- 바로 들어가기는 버튼 대신 문장 속 링크(this link)예요
- 그림 주소는 배포된 사이트(BASE)예요. 배포가 끝나야 메일에 보여요
- 글꼴은 Pretendard 웹폰트(영어 · 숫자만 든 작은 조각, public/email/fonts)를 불러와요.
  웹폰트를 받아 주는 메일 앱(애플 메일 · 아이폰 메일 등)에서만 적용되고, 지우는 앱(Gmail 등)은 기본 글꼴로 보여요
"""
import os

BASE = 'https://ba-dream-iris.vercel.app/email'
ROOT = os.path.join(os.path.dirname(__file__), '..', '..')
FONT = "'Pretendard',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif"
# 글자 있는 줄마다 직접 붙여요(표 안에서 글꼴을 물려받지 않는 앱이 있어서)
FF = f'font-family:{FONT};'
FONT_FACE = '<style>' + ''.join(
    f"@font-face{{font-family:'Pretendard';font-style:normal;font-weight:{w};font-display:swap;"
    f"src:url('{BASE}/fonts/Pretendard-{n}-latin.woff2') format('woff2'),url('{BASE}/fonts/Pretendard-{n}-latin.woff') format('woff')}}"
    for w, n in ((400, 'Regular'), (500, 'Medium'), (600, 'SemiBold'))
) + '</style>'
EDGE = 'font-size:0;line-height:0'


def corner(name, k, p):
    return f'<td width="{p}" height="{p}" style="width:{p}px;height:{p}px;{EDGE};vertical-align:top"><img src="{BASE}/sq-{name}-{k}.png" width="{p}" height="{p}" alt="" style="display:block;border:0;width:{p}px;height:{p}px"></td>'


def box(name, p, fill, inner, line=None, pad='0'):
    """귀퉁이 그림 4장 + 곧은 변으로 된 상자. line 이 있으면 1px 테두리(귀퉁이 그림에도 같은 선이 그려져 있어요)"""
    b = (lambda side: f'border-{side}:1px solid {line};') if line else (lambda side: '')
    h = p - 1 if line else p
    return f'''<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate">
  <tr>{corner(name, 'tl', p)}<td height="{h}" style="height:{h}px;background:{fill};{b('top')}{EDGE}">&nbsp;</td>{corner(name, 'tr', p)}</tr>
  <tr><td style="background:{fill};{b('left')}{EDGE}">&nbsp;</td><td style="background:{fill};padding:{pad}">{inner}</td><td style="background:{fill};{b('right')}{EDGE}">&nbsp;</td></tr>
  <tr>{corner(name, 'bl', p)}<td height="{h}" style="height:{h}px;background:{fill};{b('bottom')}{EDGE}">&nbsp;</td>{corner(name, 'br', p)}</tr>
</table>'''


def mail(comment, title, lead):
    code = box('code', 20, '#F1F2F3',
               f'<div style="{FF}text-align:center;padding-left:10px;font-size:32px;line-height:40px;font-weight:600;letter-spacing:10px;font-variant-numeric:tabular-nums;color:#202837">{{{{ .Token }}}}</div>')
    content = f'''
            <img src="{BASE}/iris-logo.png" width="69" height="28" alt="Iris" style="display:block;border:0;height:28px;width:auto">
            <h1 style="{FF}margin:32px 0 8px;font-size:22px;line-height:30px;font-weight:600;color:#202837">{title}</h1>
            <p style="{FF}margin:0 0 24px;font-size:14px;line-height:22px;color:#454C58">{lead}</p>
            {code}
            <p style="{FF}margin:24px 0 0;font-size:14px;line-height:22px;color:#202837">Or click <a href="{{{{ .ConfirmationURL }}}}" style="{FF}color:#2C7BE2;font-weight:500;text-decoration:none">this link</a> to sign in right away.</p>
            <p style="{FF}margin:32px 0 0;padding-top:20px;border-top:1px solid #F1F2F3;font-size:12px;line-height:18px;color:#8C9199">This code expires in 1 hour. If you didn't request it, you can safely ignore this email.</p>
'''
    card = box('card', 26, '#FFFFFF', content, line='#E9EBED', pad='14px 10px 10px')
    return f'''<!-- {comment}
     이 파일은 design/email/build-templates.py 로 만들어요(직접 고치지 말고 스크립트를 고쳐서 다시 실행) -->
{FONT_FACE}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#F6F7F7;padding:40px 16px;font-family:{FONT};color:#202837">
  <tr>
    <td align="center">
      <div style="max-width:440px;margin:0 auto;text-align:left">
{card}
      </div>
    </td>
  </tr>
</table>
'''


TEMPLATES = {
    'magic_link.html': ('Supabase › Authentication › Emails › Templates › Magic link or OTP\n     Subject: Your Iris sign-in code: {{ .Token }}',
                        'Sign in to Iris', 'Enter this code on the Iris sign-in screen.'),
    'confirmation.html': ('Supabase › Authentication › Emails › Templates › Confirm signup (처음 로그인하는 사람이 받는 메일)\n     Subject: Welcome to Iris — your sign-in code: {{ .Token }}',
                          'Welcome to Iris', 'Enter this code on the Iris sign-in screen to finish signing in for the first time.'),
}

if __name__ == '__main__':
    for name, args in TEMPLATES.items():
        with open(os.path.join(ROOT, 'supabase', 'templates', name), 'w', encoding='utf-8') as f:
            f.write(mail(*args))
        print('ok', name)
