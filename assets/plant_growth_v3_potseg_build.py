from pathlib import Path
import json, math
from PIL import Image, ImageDraw
import numpy as np
from scipy import ndimage as ndi

input_dir=Path(r'C:\Users\Marco\.openclaw\workspace\Runway Assets\Plant_png')
out_root=Path(r'C:\Users\Marco\.openclaw\workspace\assets\plant_growth_v3_potseg')
aligned_dir=out_root/'aligned_frames'
out_root.mkdir(parents=True, exist_ok=True)
aligned_dir.mkdir(parents=True, exist_ok=True)
CANVAS=2048
COLS=8

files=sorted(input_dir.glob('plant_*.png'), key=lambda p:int(p.stem.split('_')[1]))


def detect_pot_bbox(alpha):
    h,w=alpha.shape
    mask=alpha>0
    # focus lower area where pot lives
    y0=int(h*0.58)
    low=np.zeros_like(mask)
    low[y0:,:]=mask[y0:,:]

    # components in lower area
    labels,n=ndi.label(low)
    if n==0:
        ys,xs=np.where(mask)
        return xs.min(), ys.max()-int((ys.max()-ys.min()+1)*0.2), xs.max(), ys.max()

    # score components: near bottom + near center + wide
    cx=w/2
    best=None
    for i in range(1,n+1):
        ys,xs=np.where(labels==i)
        if ys.size<50: continue
        x0,x1=xs.min(),xs.max(); y0c,y1=ys.min(),ys.max()
        ww=x1-x0+1; hh=y1-y0c+1
        comp_cx=(x0+x1)/2
        near_bottom=1.0-((h-1-y1)/max(1,h))
        center_score=max(0,1-abs(comp_cx-cx)/(w*0.5))
        width_score=min(1.0, ww/(w*0.5))
        # prefer squat/wide lower components
        squat=min(1.0, ww/max(1,hh*1.2))
        score=near_bottom*0.5 + center_score*0.2 + width_score*0.2 + squat*0.1
        if best is None or score>best[0]:
            best=(score,x0,y0c,x1,y1)

    if best is None:
        ys,xs=np.where(mask)
        return xs.min(), ys.max()-int((ys.max()-ys.min()+1)*0.2), xs.max(), ys.max()

    _,x0,y0c,x1,y1=best

    # expand a bit upwards to include pot rim
    pad_up=max(8,int((y1-y0c+1)*0.25))
    y0p=max(0,y0c-pad_up)
    return int(x0), int(y0p), int(x1), int(y1)

frames=[]
for i,fp in enumerate(files,1):
    im=Image.open(fp).convert('RGBA')
    a=np.array(im)[:,:,3]
    ys,xs=np.where(a>0)
    x0,x1=xs.min(),xs.max(); y0,y1=ys.min(),ys.max()
    px0,py0,px1,py1=detect_pot_bbox(a)
    pot_w=px1-px0+1
    pot_c=(px0+px1)/2
    frames.append({'i':i,'fp':fp,'im':im,'w':im.width,'h':im.height,'bbox':(x0,y0,x1,y1),'baseline':y1,'pot_bbox':(px0,py0,px1,py1),'pot_w':pot_w,'pot_c':pot_c})

# robust reference: median pot width over all frames
ref=int(np.median([f['pot_w'] for f in frames]))

scaled=[]
for f in frames:
    s=ref/max(1,f['pot_w'])
    s=max(0.86,min(1.18,s))
    nw=max(1,int(round(f['w']*s))); nh=max(1,int(round(f['h']*s)))
    sim=f['im'].resize((nw,nh), Image.Resampling.LANCZOS)
    a=np.array(sim)[:,:,3]
    ys,xs=np.where(a>0)
    y1=ys.max()
    px0,py0,px1,py1=detect_pot_bbox(a)
    scaled.append({'i':f['i'],'im':sim,'w':nw,'h':nh,'baseline':y1,'pot_c':(px0+px1)/2,'scale':s})

# align by pot center + baseline
lower=max(f['baseline'] for f in scaled)
upper=min(CANVAS-f['h']+f['baseline'] for f in scaled)
baseline_t=int(math.floor(upper))
center_t=CANVAS/2

paths=[]
for f in scaled:
    xo=int(round(center_t-f['pot_c']))
    yo=int(round(baseline_t-f['baseline']))
    if xo<0 or yo<0 or xo+f['w']>CANVAS or yo+f['h']>CANVAS:
        raise ValueError(f"Frame {f['i']} out of bounds")
    cv=Image.new('RGBA',(CANVAS,CANVAS),(0,0,0,0))
    cv.alpha_composite(f['im'],(xo,yo))
    p=aligned_dir/f'frame_{f["i"]:03d}.png'
    cv.save(p)
    paths.append(p)

rows=math.ceil(len(paths)/COLS)
sprite=Image.new('RGBA',(COLS*CANVAS,rows*CANVAS),(0,0,0,0))
for idx,p in enumerate(paths):
    r,c=divmod(idx,COLS)
    sprite.alpha_composite(Image.open(p).convert('RGBA'),(c*CANVAS,r*CANVAS))
sprite.save(out_root/'plant_growth_sprite.png')

def stage(n):
    return ('seed' if n<=3 else 'sprout' if n<=7 else 'seedling' if n<=10 else 'vegetative' if n<=27 else 'preflower' if n<=31 else 'flowering' if n<=38 else 'late_flowering' if n<=43 else 'harvest')
meta={'frameWidth':CANVAS,'frameHeight':CANVAS,'columns':COLS,'rows':rows,'frameCount':len(paths),'potWidthReferencePx':ref,'frames':[{'frame':i+1,'stage':stage(i+1),'scale':round(scaled[i]['scale'],5)} for i in range(len(paths))]}
(out_root/'plant_growth_metadata.json').write_text(json.dumps(meta,indent=2),encoding='utf-8')

# test gif
preview=[]
for p in paths:
    im=Image.open(p).convert('RGBA').resize((512,512),Image.Resampling.LANCZOS)
    bg=Image.new('RGBA',(512,512),(0,0,0,0)); d=ImageDraw.Draw(bg)
    st=32
    for y in range(0,512,st):
        for x in range(0,512,st):
            d.rectangle((x,y,x+st-1,y+st-1), fill=((70,74,82,255) if ((x//st+y//st)%2==0) else (46,50,58,255)))
    bg.alpha_composite(im)
    preview.append(bg.convert('P', palette=Image.Palette.ADAPTIVE, colors=255))
preview[0].save(out_root/'plant_growth_test_potseg.gif', save_all=True, append_images=preview[1:], duration=90, loop=0, optimize=False, disposal=2)

print('done',len(paths),'ref',ref)
