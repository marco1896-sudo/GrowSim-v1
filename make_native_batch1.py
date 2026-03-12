from PIL import Image, ImageDraw
from pathlib import Path
import math

out=Path(r'C:\Users\Marco\.openclaw\workspace\media_out\app_icons_dark_native_v1_batch1')
out.mkdir(parents=True,exist_ok=True)

SIZE=512
CENTER=SIZE//2

def canvas():
    return Image.new('RGBA',(SIZE,SIZE),(0,0,0,0))

def glow(d,x,y,r,c):
    for i in range(5,0,-1):
        a=int(c[3]*(i/8))
        d.ellipse((x-r-i*6,y-r-i*6,x+r+i*6,y+r+i*6),fill=(c[0],c[1],c[2],a))

def draw_leaf(d,ox=0,oy=0,scale=1.0):
    pts=[(CENTER-150*scale+ox,CENTER+40*scale+oy),(CENTER-10*scale+ox,CENTER-130*scale+oy),(CENTER+150*scale+ox,CENTER-10*scale+oy),(CENTER+30*scale+ox,CENTER+130*scale+oy)]
    d.polygon(pts,fill=(111,214,65,255),outline=(21,86,37,255),width=10)
    d.line((CENTER-80*scale+ox,CENTER+60*scale+oy,CENTER+90*scale+ox,CENTER-40*scale+oy),fill=(33,120,50,255),width=8)
    d.line((CENTER-20*scale+ox,CENTER+20*scale+oy,CENTER-75*scale+ox,CENTER-20*scale+oy),fill=(44,140,60,230),width=5)
    d.line((CENTER+20*scale+ox,CENTER-10*scale+oy,CENTER+85*scale+ox,CENTER+20*scale+oy),fill=(44,140,60,230),width=5)

def draw_drop(d,x,y,s=1.0,color=(49,186,244,255)):
    r=34*s
    d.polygon([(x,y-r*1.5),(x-r,y+r*0.2),(x+r,y+r*0.2)],fill=color)
    d.ellipse((x-r,y-r*0.3,x+r,y+r*1.5),fill=color,outline=(0,97,154,255),width=5)

def draw_warn(d,x,y,s=1.0,color=(255,86,62,255)):
    w=90*s
    pts=[(x,y-w),(x-w*0.95,y+w*0.7),(x+w*0.95,y+w*0.7)]
    d.polygon(pts,fill=color,outline=(120,28,20,255),width=6)
    d.rounded_rectangle((x-8*s,y-30*s,x+8*s,y+20*s),radius=3,fill=(255,242,220,255))
    d.ellipse((x-8*s,y+30*s,x+8*s,y+46*s),fill=(255,242,220,255))

def draw_cloud_storm(d):
    d.ellipse((130,130,270,240),fill=(150,170,185,255),outline=(60,80,95,255),width=8)
    d.ellipse((220,110,360,245),fill=(160,180,195,255),outline=(60,80,95,255),width=8)
    d.ellipse((290,135,430,245),fill=(145,165,180,255),outline=(60,80,95,255),width=8)
    d.polygon([(250,250),(210,345),(275,345),(245,420),(330,305),(270,305)],fill=(255,205,44,255),outline=(160,120,10,255),width=6)
    for i in range(6):
        x=150+i*45
        d.line((x,270,x-12,325),fill=(100,170,215,230),width=6)

def draw_clock_arrow(d):
    d.ellipse((90,90,422,422),fill=(230,244,255,255),outline=(40,90,120,255),width=14)
    for i in range(12):
        a=math.radians(i*30-90)
        x1=CENTER+math.cos(a)*140; y1=CENTER+math.sin(a)*140
        x2=CENTER+math.cos(a)*155; y2=CENTER+math.sin(a)*155
        d.line((x1,y1,x2,y2),fill=(30,60,85,255),width=4)
    d.line((CENTER,CENTER,CENTER+0,CENTER-80),fill=(30,60,85,255),width=10)
    d.line((CENTER,CENTER,CENTER+55,CENTER+25),fill=(30,60,85,255),width=10)
    d.ellipse((242,242,270,270),fill=(30,60,85,255))
    d.arc((60,60,452,452),start=210,end=20,fill=(70,170,230,255),width=16)
    d.polygon([(405,110),(445,90),(430,132)],fill=(70,170,230,255))

def draw_gauge(d):
    d.arc((80,80,432,432),start=135,end=45,fill=(74,194,248,255),width=30)
    d.arc((80,80,432,432),start=20,end=45,fill=(255,134,54,255),width=30)
    d.line((CENTER,CENTER,CENTER+95,CENTER-45),fill=(35,65,90,255),width=12)
    d.ellipse((230,230,282,282),fill=(230,245,255,255),outline=(35,65,90,255),width=8)

def draw_bell(d):
    d.ellipse((165,120,347,370),fill=(255,205,36,255),outline=(130,85,20,255),width=10)
    d.rounded_rectangle((175,310,337,360),radius=20,fill=(246,166,42,255),outline=(130,85,20,255),width=8)
    d.ellipse((230,355,282,405),fill=(246,166,42,255),outline=(130,85,20,255),width=8)


def draw_chip(d):
    d.rounded_rectangle((130,130,382,382),radius=45,fill=(131,214,246,255),outline=(35,80,105,255),width=10)
    d.rounded_rectangle((190,190,322,322),radius=20,fill=(255,236,200,255),outline=(160,110,60,255),width=8)
    d.ellipse((232,232,280,280),outline=(170,80,50,255),width=8)
    for i in range(8):
        x=95+i*40
        d.rounded_rectangle((x,95,x+20,130),radius=5,fill=(80,110,130,255))
        d.rounded_rectangle((x,382,x+20,417),radius=5,fill=(80,110,130,255))
        d.rounded_rectangle((95,x,130,x+20),radius=5,fill=(80,110,130,255))
        d.rounded_rectangle((382,x,417,x+20),radius=5,fill=(80,110,130,255))

def draw_seed_check(d):
    d.ellipse((150,170,320,360),fill=(255,191,46,255),outline=(160,110,20,255),width=10)
    d.polygon([(220,150),(250,115),(285,130),(245,170)],fill=(109,210,68,255),outline=(36,92,44,255),width=7)
    d.line((330,330,370,370,435,285),fill=(55,205,110,255),width=18)
    d.line((330,330,370,370,435,285),fill=(20,90,50,255),width=4)

def draw_flask_check(d):
    d.rounded_rectangle((210,90,302,135),radius=15,fill=(204,238,255,255),outline=(40,90,120,255),width=8)
    d.polygon([(170,130),(342,130),(300,390),(212,390)],fill=(93,194,246,255),outline=(40,90,120,255),width=10)
    d.line((190,315,320,265),fill=(180,235,255,190),width=6)
    d.line((328,334,365,370,430,290),fill=(55,205,110,255),width=18)
    d.line((328,334,365,370,430,290),fill=(20,90,50,255),width=4)

def draw_leaf_up(d):
    draw_leaf(d,ox=-20,oy=40,scale=0.85)
    d.polygon([(320,150),(350,95),(380,150)],fill=(80,220,90,255),outline=(26,100,40,255),width=6)
    d.polygon([(380,180),(410,125),(440,180)],fill=(80,220,90,255),outline=(26,100,40,255),width=6)
    d.rectangle((343,150,357,220),fill=(26,100,40,255))
    d.rectangle((403,180,417,250),fill=(26,100,40,255))

def draw_dna(d):
    for i in range(0,260,20):
        y=120+i
        x1=190+int(35*math.sin(i/30))
        x2=322-int(35*math.sin(i/30))
        d.line((x1,y,x2,y),fill=(55,155,200,255),width=5)
    d.line([(190+int(35*math.sin(i/30)),120+i) for i in range(0,260,10)],fill=(65,180,235,255),width=10)
    d.line([(322-int(35*math.sin(i/30)),120+i) for i in range(0,260,10)],fill=(65,180,235,255),width=10)
    draw_leaf(d,ox=120,oy=140,scale=0.35)

icons={
'rain_event':lambda d:(draw_leaf(d,ox=-60,oy=30,scale=0.75),draw_drop(d,300,290,1.0),draw_drop(d,360,340,0.7)),
'storm_event':draw_cloud_storm,
'strong_wind':lambda d:(draw_leaf(d,ox=20,oy=10,scale=0.8),d.arc((80,130,460,420),210,300,fill=(85,190,230,220),width=8),draw_warn(d,390,365,0.55)),
'humidity_high':lambda d:(draw_leaf(d,ox=-40,oy=20,scale=0.8),draw_drop(d,305,290,0.95),d.line((360,345,380,345),fill=(70,210,110,255),width=14),d.line((370,335,370,355),fill=(70,210,110,255),width=14)),
'harvest_ready':draw_seed_check,
'research_complete':draw_flask_check,
'plant_stage_up':draw_leaf_up,
'genetic_trait':draw_dna,
'time_skip':draw_clock_arrow,
'simulation_speed':draw_gauge,
'event_trigger':draw_bell,
'system_alert':draw_chip,
}

for name,fn in icons.items():
    im=canvas(); d=ImageDraw.Draw(im)
    glow(d,CENTER,CENTER,180,(70,170,220,85))
    fn(d)
    im.save(out/f'{name}.png')

# preview
items=list(icons.keys())
cols=4
rows=(len(items)+cols-1)//cols
sheet=Image.new('RGBA',(cols*280,rows*280),(13,16,22,255))
d=ImageDraw.Draw(sheet)
for i,name in enumerate(items):
    x=(i%cols)*280+20; y=(i//cols)*280+20
    # checker
    for yy in range(y,y+200,20):
        for xx in range(x,x+200,20):
            c=(70,76,86,255) if ((xx+yy)//20)%2==0 else (40,44,52,255)
            d.rectangle((xx,yy,xx+19,yy+19),fill=c)
    im=Image.open(out/f'{name}.png').resize((200,200),Image.Resampling.LANCZOS)
    sheet.alpha_composite(im,(x,y))
    d.text((x,y+210),name,fill=(225,235,245,255))
sheet.save(out/'_preview_batch1.png')
print('created',len(icons),'icons')
