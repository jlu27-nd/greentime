"""Composite real mobile MVP captures into the original family-film phone.
Output is silent; audio is never mapped. Sample-family captures only.
Requires opencv-python, numpy, Pillow and imageio-ffmpeg.
"""
from pathlib import Path
import cv2,numpy as np,subprocess,imageio_ffmpeg,base64
from PIL import Image,ImageDraw,ImageFont
R=Path(__file__).resolve().parents[1]; D=R/'.data/film'; O=R/'public/welcome'; F=imageio_ffmpeg.get_ffmpeg_exe()
source=R.parent/'GreenTime-hero/dist/assets/greentime-hero.mp4'
c=cv2.VideoCapture(str(source));fps=c.get(cv2.CAP_PROP_FPS);frames=[]
while True:
 ok,a=c.read()
 if not ok:break
 frames.append(a)
c.release()
ref=frames[120];gray=cv2.cvtColor(ref,cv2.COLOR_BGR2GRAY)
quad=np.float32([[439,75],[731,27],[884,636],[576,692]])
mask=np.zeros(gray.shape,np.uint8);cv2.fillConvexPoly(mask,quad.astype(np.int32),255)
sift=cv2.SIFT_create(nfeatures=1800);kp,des=sift.detectAndCompute(gray,mask);matcher=cv2.BFMatcher()
# The actual app viewport is cropped by scrolling position, never retyped or redrawn.
parent=Image.open(D/'mobile-parent.jpg').convert('RGB').crop((0,724,414,1590)).resize((430,900),Image.Resampling.LANCZOS)
rewards=Image.open(D/'mobile-rewards.jpg').convert('RGB').crop((0,186,414,1052)).resize((430,900),Image.Resampling.LANCZOS)
screenmask=Image.new('L',(430,900),0);md=ImageDraw.Draw(screenmask);md.rounded_rectangle((0,0,429,899),radius=48,fill=255);# A matching opaque notch covers every pixel of the generated status area.
for pic in [parent,rewards]:
 content=pic.resize((430,850),Image.Resampling.LANCZOS);pic.paste('#fffef8',(0,0,430,900));pic.paste(content,(0,50));header=ImageDraw.Draw(pic);header.rounded_rectangle((81,-18,338,35),radius=15,fill='#17201c')
sm=np.array(screenmask);srcq=np.float32([[0,0],[429,0],[429,899],[0,899]])
logo=Image.open(R/'public/brand/greentime-logo.png').convert('RGB');font=lambda n,b=False:ImageFont.truetype('C:/Windows/Fonts/'+('arialbd.ttf' if b else 'arial.ttf'),n)
writer=subprocess.Popen([F,'-y','-loglevel','error','-f','rawvideo','-pix_fmt','rgb24','-s','1280x720','-r','24','-i','-','-an','-c:v','libx264','-preset','medium','-crf','18','-pix_fmt','yuv420p','-movflags','+faststart',str(O/'greentime-family.mp4')],stdin=subprocess.PIPE)
tracking=[]
for n in range(360):
 t=n/24
 if t<3:a=frames[round(t*.60*fps)].copy()
 elif t<9:
  st=7+(t-3)*3.5/6;a=frames[round(st*fps)].copy();g=cv2.cvtColor(a,cv2.COLOR_BGR2GRAY);k2,d2=sift.detectAndCompute(g,None)
  pairs=matcher.knnMatch(des,d2,k=2);good=[m for m,other in pairs if m.distance<.72*other.distance]
  h,inliers=cv2.findHomography(np.float32([kp[m.queryIdx].pt for m in good]),np.float32([k2[m.trainIdx].pt for m in good]),cv2.RANSAC,3)
  if h is None:raise RuntimeError('Phone tracking failed')
  dest=cv2.perspectiveTransform(quad[None],h)[0];tracking.append((t,int(inliers.sum())))
  transform=cv2.getPerspectiveTransform(srcq,dest);pic=parent if t<6.5 else rewards
  warped=cv2.warpPerspective(np.array(pic),transform,(1280,720),flags=cv2.INTER_CUBIC)
  alpha=cv2.warpPerspective(sm,transform,(1280,720)).astype(float)/255
  rgb=cv2.cvtColor(a,cv2.COLOR_BGR2RGB);rr,gg,bb=[rgb[:,:,i].astype(int) for i in range(3)]
  rgb=(warped*alpha[:,:,None]+rgb*(1-alpha[:,:,None])).clip(0,255).astype(np.uint8)
  im=Image.fromarray(rgb);dr=ImageDraw.Draw(im)
  if t>=4.6:
   # Cover the original generated badge, replacing it with exact typeset text.
   dr.rounded_rectangle((195,95,409,297),radius=36,fill='#fff6d5',outline='#d7aa4b',width=3)
   cx,cy=302,147;pts=[]
   import math
   for j in range(10):ang=-math.pi/2+j*math.pi/5;r=30 if j%2==0 else 14;pts.append((cx+math.cos(ang)*r,cy+math.sin(ang)*r))
   dr.polygon(pts,fill='#eeb936')
   for text,y in [('Helping',195),('Hand',229)]:dr.text((302-dr.textlength(text,font=font(28,True))/2,y),text,font=font(28,True),fill='#193527')
  a=cv2.cvtColor(np.array(im),cv2.COLOR_RGB2BGR)
 elif t<12:a=frames[round((11+(t-9)*.5)*fps)].copy()
 else:
  im=Image.new('RGB',(1280,720),'white');p=min(1,(t-12)/.8);ease=1-(1-p)**3;w=round(900*(.84+.16*ease));pic=logo.resize((w,round(w*logo.height/logo.width)),Image.Resampling.LANCZOS);im.paste(pic,((1280-w)//2,round(50+30*(1-ease))));dr=ImageDraw.Draw(im)
  for x,y,col in [(175,180,'#82e615'),(1100,200,'#baa3df'),(180,500,'#f4b278'),(1120,510,'#82e615')]:
   r=round(8+7*ease);dr.line((x-r,y,x+r,y),fill=col,width=5);dr.line((x,y-r,x,y+r),fill=col,width=5)
  text='Little chores. Big wins.';ft=font(46,True);dr.text(((1280-dr.textlength(text,font=ft))/2,555),text,font=ft,fill='#193527');dr.rounded_rectangle((433,630,847,686),radius=28,fill='#82e615');text='Get started with GreenTime';ft=font(21);dr.text(((1280-dr.textlength(text,font=ft))/2,646),text,font=ft,fill='#193527');a=cv2.cvtColor(np.array(im),cv2.COLOR_RGB2BGR)
 im=Image.fromarray(cv2.cvtColor(a,cv2.COLOR_BGR2RGB))
 if t<12:
  dr=ImageDraw.Draw(im);dr.rounded_rectangle((24,672,394,708),radius=10,fill='#193527');dr.text((36,682),'MVP SCREENS  /  SAMPLE FAMILY',font=font(15,True),fill='white')
 if n in [24,84,108,132,156,180,204,240,300,348]:im.save(D/f'family-{n}.jpg',quality=95)
 writer.stdin.write(im.tobytes())
writer.stdin.close();assert writer.wait()==0
(O/'greentime-family.mp4.b64').write_text(base64.b64encode((O/'greentime-family.mp4').read_bytes()).decode())
print('Rendered 15s family film; no audio. Minimum phone tracking inliers:',min(x[1] for x in tracking))
