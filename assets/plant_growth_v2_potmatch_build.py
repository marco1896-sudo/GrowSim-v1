from pathlib import Path
import json, math
from PIL import Image, ImageDraw
import numpy as np

input_dir=Path(r'C:\Users\Marco\.openclaw\workspace\Runway Assets\Plant_png')
out_root=Path(r'C:\Users\Marco\.openclaw\workspace\assets\plant_growth_v2_potmatch')
aligned_dir=out_root/'aligned_frames'
out_root.mkdir(parents=True, exist_ok=True)
aligned_dir.mkdir(parents=True, exist_ok=True)
CANVAS=2048
COLS=8

files=sorted(input_dir.glob('plant_*.png'), key=lambda p:int(p.stem.split('_')[1]))

frames=[]
for i,fp in enumerate(files,1):
    im=Image.open(fp).convert('RGBA')
    a=np.array(im)[:,:,3]
    ys,xs=np.where(a>0)
    x0,x1=xs.min(),xs.max(); y0,y1=ys.min(),ys.max()
    # estimate pot width from bottom 18% of alpha bbox
    h=y1-y0+1
    band_top=int(y1 - 0.18*h)
    band=(a[band_top:y1+1,:]>0)
    cols=np.where(band.any(axis=0))[0]
    pot_w=(cols.max()-cols.min()+1) if cols.size else (x1-x0+1)
    frames.append({'i':i,'fp':fp,'im':im,'w':im.width,'h':im.height,'x0':x0,'x1':x1,'y0':y0,'y1':y1,'center':(x0+x1)/2,'baseline':y1,'pot_w':pot_w})

# reference pot width: median of first 10 frames (stable early pot)
ref = int(np.median([f['pot_w'] for f in frames[:10]]))

scaled=[]
for f in frames:
    s=ref/max(1,f['pot_w'])
    # clamp to avoid extreme distortions
    s=max(0.88,min(1.14,s))
    nw=max(1, int(round(f['w']*s)))
    nh=max(1, int(round(f['h']*s)))
    sim=f['im'].resize((nw,nh), Image.Resampling.LANCZOS)
    a=np.array(sim)[:,:,3]
    ys,xs=np.where(a>0)
    x0,x1=xs.min(),xs.max(); y0,y1=ys.min(),ys.max()
    scaled.append({'i':f['i'],'im':sim,'w':nw,'h':nh,'center':(x0+x1)/2,'baseline':y1,'scale':s})

lower=max(f['baseline'] for f in scaled)
upper=min(CANVAS-f['h']+f['baseline'] for f in scaled)
baseline_t=int(math.floor(upper))
center_t=CANVAS/2

paths=[]
for f in scaled:
    xo=int(round(center_t-f['center']))
    yo=int(round(baseline_t-f['baseline']))
    if xo<0 or yo<0 or xo+f['w']>CANVAS or yo+f['h']>CANVAS:
        raise ValueError(f"Frame {f['i']} out of bounds after potmatch")
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

# metadata with scales

def stage(n):
    return ('seed' if n<=3 else 'sprout' if n<=7 else 'seedling' if n<=10 else 'vegetative' if n<=27 else 'preflower' if n<=31 else 'flowering' if n<=38 else 'late_flowering' if n<=43 else 'harvest')
meta={'frameWidth':CANVAS,'frameHeight':CANVAS,'columns':COLS,'rows':rows,'frameCount':len(paths),'potWidthReferencePx':ref,'frames':[{'frame':i+1,'stage':stage(i+1),'scale':round(scaled[i]['scale'],5)} for i in range(len(paths))]}
(out_root/'plant_growth_metadata.json').write_text(json.dumps(meta,indent=2),encoding='utf-8')

# test gif checker
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
preview[0].save(out_root/'plant_growth_test_potmatch.gif', save_all=True, append_images=preview[1:], duration=90, loop=0, optimize=False, disposal=2)

print('done', len(paths), 'frames, ref pot', ref)
