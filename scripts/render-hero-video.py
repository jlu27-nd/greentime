"""Render a silent 15-second product film from real MVP screenshot captures.
Input: .data/film/{kid-full,photo,parent-full,rewards-full}.jpg
Requires Pillow and imageio-ffmpeg. No AI-generated UI or text.
"""
from PIL import Image, ImageDraw, ImageFont
from pathlib import Path
import imageio_ffmpeg, subprocess, math, base64
ROOT=Path(__file__).resolve().parents[1]
SRC=ROOT/'.data/film'; OUT=ROOT/'public/welcome'
W,H,FPS=1280,720,30
INK='#193527'; PAPER='#fffef8'; GREEN='#82e615'
font=lambda size,bold=False: ImageFont.truetype('C:/Windows/Fonts/'+('arialbd.ttf' if bold else 'arial.ttf'),size)
large=font(46,True); small=font(21); label=font(14,True)
scenes=[('kid-full.jpg',(90,340,1174,935),['Little chores.','Real credit.'],'A clear balance of earned minutes.'),('photo.jpg',(349,36,901,644),['Show the','little wins.'],'Snap a photo. Send it for review.'),('parent-full.jpg',(90,780,635,1120),['Your family.','Your standards.'],'Parents review and stay in control.'),('rewards-full.jpg',(90,635,1174,990),['Big pride.','Little badges.'],'Celebrate every milestone.')]
panels=[Image.open(SRC/name).convert('RGB').crop(crop) for name,crop,_,_ in scenes]
logo=Image.open(ROOT/'public/brand/greentime-logo.png').convert('RGB')
# Keep the supplied logo artwork intact, including its original white background.
ffmpeg=imageio_ffmpeg.get_ffmpeg_exe()
proc=subprocess.Popen([ffmpeg,'-y','-loglevel','error','-f','rawvideo','-vcodec','rawvideo','-pix_fmt','rgb24','-s','1280x720','-r',str(FPS),'-i','-','-an','-c:v','libx264','-preset','medium','-crf','20','-pix_fmt','yuv420p','-movflags','+faststart',str(OUT/'greentime-hero.mp4')],stdin=subprocess.PIPE)
def frame(t):
    end=t>=12; im=Image.new('RGB',(W,H),'white' if end else PAPER); d=ImageDraw.Draw(im)
    if not end:
        idx=min(3,int(t//3)); p=(t%3)/3; shot=panels[idx]; lines=scenes[idx][2]
        d.ellipse((980,-220,1470,270),fill='#edf6dc'); d.ellipse((-180,570,180,930),fill='#e9e1f8')
        d.text((48,48),'GREENTIME / LITTLE CHORES. BIG WINS.',font=label,fill=INK)
        d.rounded_rectangle((48,190,124,225),radius=17,fill=GREEN); d.text((66,198),f'0{idx+1} / 04',font=label,fill=INK)
        for j,line in enumerate(lines):d.text((48,258+j*56),line,font=large,fill=INK)
        # Exact text is typeset once; only the screenshot panel moves gently into place.
        words=scenes[idx][3].split(); out=[]; line=''
        for word in words:
            if d.textlength((line+' '+word).strip(),font=small)>310:out.append(line);line=word
            else:line=(line+' '+word).strip()
        out.append(line)
        for j,line in enumerate(out):d.text((48,400+j*29),line,font=small,fill='#59695e')
        ratio=min(790/shot.width,510/shot.height); size=(round(shot.width*ratio),round(shot.height*ratio)); panel=shot.resize(size,Image.Resampling.LANCZOS)
        x=438+(790-size[0])//2; y=115+(510-size[1])//2+round(14*(1-min(p*6,1))**3)
        d.rounded_rectangle((x-8,y-8,x+size[0]+8,y+size[1]+12),radius=19,fill='#dfe7d7')
        im.paste(panel,(x,y)); d=ImageDraw.Draw(im)
        d.text((48,657),'ACTUAL MVP SCREENS  /  SAMPLE FAMILY',font=label,fill='#59695e')
        for k in range(4):d.rounded_rectangle((1048+k*46,659,1080+k*46,664),radius=3,fill=GREEN if k<=idx else '#dce4d6')
    else:
        p=min(1,(t-12)/.9); ease=1-(1-p)**3; scale=.84+.16*ease+.025*math.sin(p*math.pi)
        lw=round(900*scale); lh=round(lw*logo.height/logo.width); pic=logo.resize((lw,lh),Image.Resampling.LANCZOS)
        im.paste(pic,((W-lw)//2,round(50+(1-ease)*35)));d=ImageDraw.Draw(im)
        # Confetti grows outward while the original logo eases into place.
        for k,(x,y,c) in enumerate([(175,180,GREEN),(1100,200,'#baa3df'),(180,500,'#f4b278'),(1120,510,GREEN)]):
            r=round(8+7*ease);d.line((x-r,y,x+r,y),fill=c,width=5);d.line((x,y-r,x,y+r),fill=c,width=5)
        text='Little chores. Big wins.';d.text(((W-d.textlength(text,font=large))/2,555),text,font=large,fill=INK)
        d.rounded_rectangle((433,630,847,686),radius=28,fill=GREEN);text='Get started with GreenTime';d.text(((W-d.textlength(text,font=small))/2,646),text,font=small,fill=INK)
    return im
for n in range(15*FPS):
    im=frame(n/FPS)
    if n in [30,120,210,300,435]:im.save(SRC/f'frame-{n}.jpg',quality=94)
    proc.stdin.write(im.tobytes())
proc.stdin.close()
if proc.wait()!=0:raise RuntimeError('Video encoding failed')
frame(14.5).save(OUT/'poster.jpg',quality=92)
for name in ['greentime-hero.mp4','poster.jpg']:(OUT/(name+'.b64')).write_text(base64.b64encode((OUT/name).read_bytes()).decode())
print('Rendered 15 seconds, 1280x720, 30 fps. MP4 bytes:',(OUT/'greentime-hero.mp4').stat().st_size)
