"""Generate original standard-pattern tile SVGs. Requires fontTools and Noto Serif CJK.
Glyph outlines use Noto Serif CJK (SIL OFL; see public/tiles/LICENSE.txt).
"""
from pathlib import Path
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
font=TTFont('/usr/share/fonts/opentype/noto/NotoSerifCJK-Bold.ttc',fontNumber=0)
glyphs=font.getGlyphSet(); cmap=font.getBestCmap(); units=font['head'].unitsPerEm
out=Path(__file__).resolve().parents[1]/'public'/'tiles'; out.mkdir(exist_ok=True)
ink='#000000'; red='#c00000'; green='#00451b'; blue=ink
def glyph(char,x,y,size,color):
    pen=SVGPathPen(glyphs);glyphs[cmap[ord(char)]].draw(pen)
    return f'<path fill="{color}" transform="translate({x},{y}) scale({size/units},-{size/units})" d="{pen.getCommands()}"/>'
def save(name,content):
    (out/(name+'.svg')).write_text(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 70 100"><rect width="70" height="100" rx="5" fill="#fff"/>{content}</svg>')
def circle(x,y,r,c):
    petals=''.join(f'<ellipse cx="0" cy="{-r*.55}" rx="{r*.16}" ry="{r*.27}" fill="{c}" transform="translate({x} {y}) rotate({a})"/>' for a in range(0,360,45))
    return f'<circle cx="{x}" cy="{y}" r="{r}" fill="none" stroke="{c}" stroke-width="2.7"/><circle cx="{x}" cy="{y}" r="{r*.75}" fill="none" stroke="{c}" stroke-width="1.1"/>{petals}<circle cx="{x}" cy="{y}" r="{r*.19}" fill="{c}"/>'
def bamboo(x,y,c=green):
    return f'<g transform="translate({x},{y})"><path d="M-4-8Q0-10 4-8L3 8Q0 10-3 8Z" fill="{c}"/><path d="M-5-6H5M-5 0H5M-5 6H5" stroke="{c}" stroke-width="3.6" stroke-linecap="round"/><path d="M0-5V-2M0 2V5" stroke="#fff" stroke-width=".7"/></g>'
for n,c in enumerate('一二三四五六七八九',1):save('m'+str(n),glyph(c,11,43,48,ink)+glyph('萬',10,88,50,ink))
positions={2:[(35,28),(35,72)],3:[(18,25),(35,50),(52,75)],4:[(20,28),(50,28),(20,72),(50,72)],5:[(18,25),(52,25),(35,50),(18,75),(52,75)],6:[(20,22),(50,22),(20,50),(50,50),(20,78),(50,78)],7:[(16,20),(35,30),(54,40),(20,60),(50,60),(20,83),(50,83)],8:[(20,y) for y in [17,39,61,83]]+[(50,y) for y in [17,39,61,83]],9:[(x,y) for y in [22,50,78] for x in [16,35,54]]}
for n in range(1,10):
    if n==1: face=circle(35,50,24,ink)+circle(35,50,9,red)
    else:
        colors={2:[ink]*2,3:[ink,red,ink],4:[ink]*4,5:[ink,ink,red,ink,ink],6:[ink]*2+[red]*4,7:[ink]*3+[red]*4,8:[ink]*8,9:[ink]*3+[red]*3+[ink]*3}[n]
        face=''.join(circle(x,y,8 if n>=7 else 10,c) for (x,y),c in zip(positions[n],colors))
    save('p'+str(n),face)
# One bamboo is the traditional bird, not a single stick.
bird='''<path d="M33 61L17 87L32 77L38 65M42 64L46 88L51 83L48 61" fill="#00451b"/><path d="M20 42Q10 61 30 70Q49 77 55 50L46 31Q30 28 20 42Z" fill="#00451b"/><path d="M24 42Q19 61 37 64Q48 57 47 45Q35 53 24 42" fill="#fff"/><path d="M24 43Q35 45 44 37M25 50L41 44M28 57L43 49" fill="none" stroke="#00451b" stroke-width="3"/><path d="M39 36Q24 33 29 21Q34 12 45 18Q54 23 47 35Z" fill="#000000"/><path d="M45 23L59 28L47 30" fill="#c00000"/><circle cx="43" cy="23" r="2.4" fill="#fff"/><circle cx="43.5" cy="23" r="1.2" fill="#000000"/><path d="M30 30Q39 35 47 31L45 38Q36 40 30 35" fill="#c00000"/><path d="M28 73L26 82L20 84M43 73L42 82L36 84" stroke="#c00000" stroke-width="2.5" fill="none"/>'''
save('s1',bird)
for n in range(2,10):
    pts=positions[n]
    if n==7:pts=[(35,18)]+[(x,y) for y in [43,63,83] for x in [20,50]]
    if n==8:pts=[(x,y) for y in [17,39,61,83] for x in [21,49]]
    save('s'+str(n),''.join(bamboo(x,y,red if (n==5 and i==2) or (n==7 and i==0) or (n==9 and i%3==1) else green) for i,(x,y) in enumerate(pts)))
for n,c in enumerate('東南西北白發中',1):
    save('z'+str(n),'' if c=='白' else glyph(c,7,73,56,green if c=='發' else red if c=='中' else ink))
