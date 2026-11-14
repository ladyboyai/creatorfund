from PIL import Image, ImageDraw, ImageFont
import json, re
B='/usr/share/fonts/truetype/dejavu/DejaVuSansCondensed-Bold.ttf'
big=ImageFont.truetype(B,34); small=ImageFont.truetype(B,22); title=ImageFont.truetype(B,52)
bal=json.load(open('/tmp/frames/balances.json'))
YEL=(255,214,10); W,H=1280,720
ICON=["..KKKKKK..",".KWWWWWWK.","KWWKWWKWWK","KWWKWWKWWK","KWWWWWWWWK","KWWRRRRWWK","KWWWWWWWWK",".KKKWWKKK.","..KWWWWK..",".KWWWWWWK."]
COL={'K':(20,20,20),'W':(235,235,235),'R':(220,60,60)}
def icon(d,x,y,s=8):
    for j,row in enumerate(ICON):
        for i,c in enumerate(row):
            if c in COL: d.rectangle([x+i*s,y+j*s,x+i*s+s-1,y+j*s+s-1],fill=COL[c])
def caption(d,text):
    x0,y0,x1,y1=40,548,W-40,H-24
    d.rectangle([x0-6,y0-6,x1+6,y1+6],fill=YEL)      # pixel border
    d.rectangle([x0-2,y0-2,x1+2,y1+2],fill=(0,0,0))
    d.rectangle([x0+2,y0+2,x1-2,y1-2],fill=(18,18,40))
    icon(d,x0+18,y0+22,8)
    tx=x0+130; ty=y0+18; maxw=x1-tx-24
    # **word** = yellow highlight
    toks=re.findall(r'\*\*.+?\*\*|\S+',text); line=[]; lines=[]; w=0
    for t in toks:
        hl=t.startswith('**'); s=t.strip('*')
        for part in ([s] if not hl else s.split(' ')):
            tw=d.textlength(part+' ',font=big)
            if w+tw>maxw: lines.append(line); line=[]; w=0
            line.append((part,hl)); w+=tw
    lines.append(line)
    for k,l in enumerate(lines):
        x=tx
        for idx,(part,hl) in enumerate(l):
            d.text((x,ty+k*44),part,font=big,fill=YEL if hl else (255,255,255))
            nxt=l[idx+1][0] if idx+1<len(l) else ''
            x+=d.textlength(part,font=big)+(0 if (nxt and not any(c.isalnum() for c in nxt)) else d.textlength(' ',font=big))
def slide(name,shot,text,badge=True):
    im=Image.new('RGB',(W,H),(10,10,24)); d=ImageDraw.Draw(im)
    if shot:
        s=Image.open(shot).convert('RGB'); h=520; s=s.resize((int(s.width*h/s.height),h)) if s.height>h else s
        # crop to 520 tall from top
        s=Image.open(shot).convert('RGB').crop((0,0,1000,820)).resize((int(1000*520/820),520))
        im.paste(s,((W-s.width)//2,12))
    if badge:
        d.rectangle([0,0,W,0]); d.rectangle([W-500,H-60-1,W-500,H-60-1])
    caption(d,text); im.save(f'/tmp/vid/{name}.png')
def card(name,lines):
    im=Image.new('RGB',(W,H),(10,10,24)); d=ImageDraw.Draw(im)
    y=150
    for t,f,c in lines: d.text((80,y),t,font=f,fill=c); y+=80 if f==title else 48
    icon(d,W-260,H-240,14); im.save(f'/tmp/vid/{name}.png')
card('00',[('ladyboyai',title,YEL),('Milestone escrow for creator funding',big,(255,255,255)),('Real contract, real local NEAR chain.',big,(255,255,255)),('NOT testnet. Demo data.',big,(255,120,120))])
F='/tmp/frames/'
slide('01',F+'01-campaigns-empty.png','Fresh **local sandbox chain**. No campaigns yet. This is **not testnet**.')
slide('02',F+'02-created.png','Creator makes a **10 NEAR** campaign with 2 milestones and **2 named approvers**.')
slide('03',F+'03-funded.png','Backers fund it. The contract **holds the NEAR**. Funding can never exceed the target.')
slide('04',F+'04-evidence.png','Creator submits **evidence**. Nothing is payable yet. **0 of 1** approvals.')
slide('04b',F+'04-evidence.png','Real on-chain attacks: creator **approving own work**, a stranger **claiming payout**. Both **rejected**.')
slide('05',F+'05-approved.png','A named approver signs off. Milestone 1 is **approved**. **4 NEAR** becomes claimable.')
slide('06',F+'06-paid.png',f'Creator claims. Balance **{bal["before"]} to {bal["after"]} NEAR**. Only the approved **4 NEAR** moved.')
card('07',[('What is verified',title,YEL),('35 contract tests + 4 end-to-end chain tests',big,(255,255,255)),('Not yet: testnet deploy, wallet signing in a browser',big,(255,120,120)),('Evidence is not verified by the contract.',big,(255,255,255)),('Unaudited demo. NEAR only.',big,(255,255,255))])
