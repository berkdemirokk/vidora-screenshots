"""Reproduce the original app mark and a four-second, rights-cleared studio exercise."""
from pathlib import Path
import subprocess
from PIL import Image, ImageDraw, ImageFilter
import numpy as np

root = Path(__file__).resolve().parents[2]
assets = root / "apps/mobile/assets"
web = root / "apps/web/public"
assets.mkdir(parents=True, exist_ok=True)
web.mkdir(parents=True, exist_ok=True)
icon = Image.new("RGB", (1024, 1024), "#d3ff77")
mark = ImageDraw.Draw(icon)
for points in [[(222,260),(315,260),(315,764),(222,764)],[(370,510),(614,260),(763,260),(516,510),(773,764),(619,764)]]:
    mark.polygon(points, fill="#172519")
icon.save(assets/"icon.png")
icon.resize((192,192),Image.Resampling.LANCZOS).save(web/"icon.png")
w,h=960,540
y,x=np.mgrid[:h,:w]
rng=np.random.default_rng(29)
grain=rng.normal(0,1.6,(h,w))
def frame(t):
    sky=np.clip(y/h*1.35,0,1)
    col=lambda a,b,f: np.array(a)[None,None,:]*(1-f[:,:,None])+np.array(b)[None,None,:]*f[:,:,None]
    rgb=col((39,46,57),(241,159,100),sky)
    sun=(x-(w*.59+18*t))**2+(y-h*.43)**2 < (h*.162)**2
    rgb[sun]=(255,213,147)
    for j,(top,hue) in enumerate([(0.59,(116,86,76)),(.65,(88,69,62)),(.73,(62,66,63)),(.82,(39,51,49)),(.94,(23,37,35))]):
        xx=x/w
        base=h*(top+.075*np.sin(xx*(6+j*.3)+j*.9+t*.028*(j+1))+.035*np.sin(xx*12.9+j*1.2)+.013*np.sin(xx*25.4+.88*j))
        mask=y>base
        light=np.clip((y-base)/75,0,1)
        slope=np.gradient(base,axis=1)
        tint=np.maximum(-1,np.minimum(1.8,slope))*10+(1-light)*13
        rgb[mask]=(np.array(hue)[None,None,:]+tint[:,:,None])[mask]
    return Image.fromarray(np.uint8(np.clip(rgb+grain[:,:,None],0,255)))
preview=frame(1.5)
preview.save(web/"dunes.jpg",quality=91)
preview.save(assets/"dunes.jpg",quality=88)
cmd=["ffmpeg","-y","-loglevel","error","-f","rawvideo","-pix_fmt","rgb24","-s",f"{w}x{h}","-r","12","-i","-","-an","-c:v","libx264","-preset","fast","-crf","22","-pix_fmt","yuv420p","-movflags","+faststart",str(web/"dunes.mp4")]
with subprocess.Popen(cmd,stdin=subprocess.PIPE) as proc:
    for i in range(48):
        proc.stdin.write(frame(i/12).tobytes())
    proc.stdin.close()
    if proc.wait(): raise RuntimeError("ffmpeg export failed")
