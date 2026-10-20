#!/usr/bin/env python3
"""Build a reproducible 7-slide Verigate PortalDot Hacker House presentation."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
import textwrap

W, H = 1920, 1080
OUT = Path("/root/verigate-portaldot/docs/Verigate-PortalDot-Presentation.pdf")
PREVIEW = Path("/tmp/verigate-portaldot-presentation")
PREVIEW.mkdir(parents=True, exist_ok=True)

BG = "#0D1729"
PANEL = "#14243B"
PANEL2 = "#182C46"
BLUE = "#43B5E8"
CYAN = "#67D5F0"
WHITE = "#F4F7FC"
BODY = "#D2DDED"
MUTED = "#91A7C2"
GREEN = "#75D6A0"
AMBER = "#F6C66B"
RED = "#F28F91"

FONT = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
BOLD = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"

def font(sz, bold=False):
    return ImageFont.truetype(BOLD if bold else FONT, sz)

def rounded(draw, xy, radius=24, fill=PANEL, outline=None, width=2):
    draw.rounded_rectangle(xy, radius=radius, fill=fill, outline=outline, width=width if outline else 1)

def wrap_lines(draw, text, fnt, max_width):
    words = text.split()
    out, line = [], ""
    for word in words:
        trial = word if not line else line + " " + word
        if draw.textbbox((0,0), trial, font=fnt)[2] <= max_width:
            line = trial
        else:
            if line: out.append(line)
            line = word
    if line: out.append(line)
    return out

def paragraph(draw, xy, text, fnt, fill=BODY, max_width=780, leading=1.28, max_lines=None):
    x, y = xy
    lines = wrap_lines(draw, text, fnt, max_width)
    if max_lines: lines = lines[:max_lines]
    step = int(fnt.size * leading)
    for ln in lines:
        draw.text((x,y), ln, font=fnt, fill=fill)
        y += step
    return y

def base(title, subtitle, n):
    im = Image.new("RGB", (W,H), BG)
    d = ImageDraw.Draw(im)
    d.rectangle((0,0,18,H), fill=BLUE)
    d.text((76,46), "VERIGATE  /  PORTALDOT V3", font=font(24, True), fill=CYAN)
    d.text((1595,48), f"HACKER HOUSE 2026  •  {n:02d}/07", font=font(18, True), fill=MUTED)
    d.text((76,112), title, font=font(53, True), fill=WHITE)
    d.line((76,190,1840,190), fill=BLUE, width=3)
    if subtitle:
        paragraph(d,(80,215),subtitle,font(24),MUTED,max_width=1680,leading=1.2,max_lines=2)
    d.text((78,1030),"OPEN-SOURCE AUTHORIZATION MIDDLEWARE  •  TESTNET PROTOTYPE",font=font(17,True),fill=MUTED)
    return im,d

def bullet(draw, x, y, title, desc, width=760, color=BLUE):
    draw.ellipse((x,y+10,x+14,y+24),fill=color)
    draw.text((x+30,y),title,font=font(26,True),fill=WHITE)
    return paragraph(draw,(x+30,y+42),desc,font(20),BODY,max_width=width-30,leading=1.28)+18

slides=[]

# 1. Cover
im,d=base("Verigate PortalDot","Authorization middleware for AI-agent payments on PortalDot V3",1)
rounded(d,(78,330,1145,740),32,fill=PANEL)
d.text((125,380),"A proposal is not authority.",font=font(46,True),fill=WHITE)
paragraph(d,(128,470),"Verigate evaluates the action. The bridge verifies signed evidence. A dedicated Solidity guard enforces the exact approved transfer.",font(29),BODY,max_width=900,leading=1.4)
chips=[("VERIGATE","Ed25519 decision"),("BRIDGE","Exact action binding"),("PORTALDOT","EIP-712 guard")]
x=122
for label,sub in chips:
    rounded(d,(x,640,x+285,710),18,fill=PANEL2,outline="#274261")
    d.text((x+18,651),label,font=font(18,True),fill=CYAN)
    d.text((x+18,679),sub,font=font(16),fill=BODY)
    x+=310
rounded(d,(1240,330,1810,740),30,fill="#102E45",outline=BLUE,width=3)
d.text((1300,390),"TESTNET",font=font(23,True),fill=CYAN)
d.text((1300,445),"420420777",font=font(50,True),fill=WHITE)
paragraph(d,(1300,535),"PortalDot V3 EVM testnet",font(26),BODY,max_width=440)
paragraph(d,(1300,605),"Contract deployed  •  Receipt verified",font(21),GREEN,max_width=450)
d.text((82,805),"Track fit",font=font(22,True),fill=MUTED)
d.text((82,850),"Modular Cloud Solutions and Middleware",font=font(31,True),fill=WHITE)
paragraph(d,(82,910),"Built around a narrow, reusable control point between AI intent and token execution.",font(23),BODY,max_width=1460)
slides.append(im)

# 2. Problem
im,d=base("Preventing unrestricted agent spending","The authorization must bind the decision to the exact thing the executor is allowed to do.",2)
cards=[
    ("01  RECIPIENT SUBSTITUTION","An approved payment must not be reused with a different destination.",RED),
    ("02  AMOUNT TAMPERING","The amount must remain the same from signed intent to contract call.",AMBER),
    ("03  REPLAY OR EXPIRY","A valid authorization should not be usable again or after its deadline.",CYAN),
]
x0=80
for title,desc,col in cards:
    rounded(d,(x0,330,x0+555,590),26,fill=PANEL,outline="#263F5C")
    d.rounded_rectangle((x0,330,x0+555,344),radius=7,fill=col)
    d.text((x0+32,385),title,font=font(24,True),fill=WHITE)
    paragraph(d,(x0+32,440),desc,font(22),BODY,max_width=480,leading=1.42)
    x0+=590
rounded(d,(80,665,1820,870),26,fill="#102E45",outline=BLUE,width=2)
d.text((122,704),"Design principle",font=font(22,True),fill=CYAN)
paragraph(d,(122,756),"A signed ALLOW is necessary but not enough: its authority must be short-lived, narrowly scoped, and bound to a recipient, amount, chain and contract.",font(31,True),WHITE,max_width=1580,leading=1.33)
slides.append(im)

# 3. Architecture
im,d=base("A narrow path from decision to execution","Off-chain verification and on-chain enforcement have separate, explicit trust boundaries.",3)
steps=[
    ("1","AGENT INTENT","Proposed action"),
    ("2","VERIGATE","Signed ALLOW + execution authorization"),
    ("3","BRIDGE","Verify Ed25519; bind exact action"),
    ("4","EIP-712","Chain, guard, recipient, amount, nonce, deadline"),
    ("5","GUARD","Reject invalid/replayed or altered transfer"),
]
x=78
width=330
for i,(num,title,desc) in enumerate(steps):
    rounded(d,(x,350,x+width,650),22,fill=PANEL,outline="#2C4968")
    d.ellipse((x+24,374,x+82,432),fill=BLUE if i<4 else GREEN)
    d.text((x+42,383),num,font=font(25,True),fill=BG)
    d.text((x+24,457),title,font=font(22,True),fill=WHITE)
    paragraph(d,(x+24,505),desc,font(19),BODY,max_width=width-48,leading=1.32)
    if i<4:
        d.line((x+width+8,500,x+width+50,500),fill=CYAN,width=4)
        d.polygon([(x+width+50,500),(x+width+36,490),(x+width+36,510)],fill=CYAN)
    x+=365
rounded(d,(82,720,1818,865),24,fill="#301C2A",outline=RED,width=2)
d.text((118,750),"WARN / BLOCK / invalid signature / mismatched action",font=font(27,True),fill=RED)
paragraph(d,(118,805),"The bridge refuses to sign; the contract cannot independently override this off-chain decision.",font(22),BODY,max_width=1570)
slides.append(im)

# 4. Why PortalDot / track
im,d=base("Why PortalDot V3 — and where this project fits","The project uses PortalDot's execution environment; it does not overstate a cross-chain bridge that is not implemented.",4)
bullet(d,90,320,"EVM-compatible contract execution","The guard is written in Solidity and uses EIP-712 signatures bound to chain ID and contract address.",790,BLUE)
bullet(d,90,495,"Substrate-aware operational checks","The tooling separately checks the configured Substrate WebSocket endpoint and genesis hash before sensitive network operations.",790,CYAN)
bullet(d,90,670,"Reusable middleware contribution","Other agent-enabled applications can reuse a strict authorization boundary instead of giving an agent a direct, unrestricted transfer path.",790,GREEN)
rounded(d,(1030,335,1800,810),28,fill=PANEL,outline="#2C4968")
d.text((1080,385),"TRACK",font=font(20,True),fill=CYAN)
paragraph(d,(1080,435),"Modular Cloud Solutions and Middleware",font(34,True),WHITE,max_width=640,leading=1.25)
d.line((1080,550,1740,550),fill="#2C4968",width=2)
paragraph(d,(1080,585),"Not claiming:",font(22,True),fill=AMBER,max_width=620)
paragraph(d,(1080,632),"A deployed multi-chain asset bridge, verified wallet mapping, production readiness, or an independent audit.",font(22),BODY,max_width=630,leading=1.38)
slides.append(im)

# 5. Deployment
im,d=base("PortalDot V3 testnet deployment evidence","The contract deployment is a real testnet interaction; the full transfer workflow has not yet been shown on the public network.",5)
rounded(d,(80,320,1160,835),28,fill=PANEL,outline="#2C4968")
labels=[
    ("Network","PortalDot V3 EVM testnet"),
    ("Chain ID","420420777"),
    ("Contract","0x3f2f4844...F09655b"),
    ("Deployment tx","0xb1cf9cca...1fcdce3c"),
    ("Receipt","Success • block 116872"),
    ("Runtime code hash","0xb3d71ff8...f7f7671"),
]
y=350
for label,value in labels:
    d.text((118,y),label.upper(),font=font(17,True),fill=MUTED)
    y=paragraph(d,(118,y+30),value,font(21,True if label in ("Contract","Deployment tx") else False),WHITE,max_width=960,leading=1.2)+17
rounded(d,(1210,320,1815,835),28,fill="#102E45",outline=BLUE,width=2)
d.text((1254,365),"READ-BACK",font=font(21,True),fill=CYAN)
paragraph(d,(1254,425),"2,153 bytes",font(36,True),WHITE,max_width=490)
paragraph(d,(1254,480),"Runtime bytecode",font(20),BODY,max_width=480)
d.line((1254,535,1765,535),fill="#2C4968",width=2)
paragraph(d,(1254,570),"authoritySigner()",font(24,True),WHITE,max_width=480)
paragraph(d,(1254,620),"On-chain value matched the configured signer.",font(20),GREEN,max_width=470)
paragraph(d,(1254,710),"Console",font(18,True),fill=MUTED,max_width=450)
paragraph(d,(1254,744),"node-console.portaldot.dev",font(19),BODY,max_width=470)
slides.append(im)

# 6. Tests
im,d=base("What has been verified — and what has not","Tests and local execution evidence are labelled separately from public testnet deployment evidence.",6)
stats=[("156","local tests passed",BLUE),("ALLOW","valid signed artifacts",GREEN),("BLOCK","execution refused",RED)]
x=82
for val,desc,col in stats:
    rounded(d,(x,330,x+530,500),22,fill=PANEL,outline="#2C4968")
    d.text((x+28,360),val,font=font(42,True),fill=col)
    d.text((x+28,430),desc,font=font(21),fill=BODY)
    x+=575
bullet(d,100,565,"Dry-run did not change state","The executor simulated the exact authorized transfer before execution.",790,BLUE)
bullet(d,100,730,"Local EVM transfer matched authorization","TransferExecuted was confirmed and recipient balance delta matched 1,000,000 base units.",790,GREEN)
rounded(d,(1030,580,1800,845),24,fill="#301C2A",outline=RED,width=2)
d.text((1070,620),"IMPORTANT DISTINCTION",font=font(20,True),fill=RED)
paragraph(d,(1070,680),"The end-to-end transfer executed only on a temporary loopback Hardhat EVM configured with the target chain ID. No public PortalDot transfer was sent.",font(24),WHITE,max_width=660,leading=1.4)
slides.append(im)

# 7. Roadmap and limitations
im,d=base("Next steps and ecosystem value","The immediate work is reproducibility and honest evidence, not another deployment.",7)
bullet(d,95,310,"Publish the current implementation branch","Preserve the event-period commit history and run CI on the exact public head.",800,BLUE)
bullet(d,95,475,"Record a short product demo","Show the actual ALLOW/BLOCK path, local simulation, and the public testnet deployment evidence as distinct steps.",800,CYAN)
bullet(d,95,640,"Close operational gaps","Verify the specific H160-to-SS58 mapping before using that wallet pair and plan any live transfer with explicit human approval.",800,GREEN)
rounded(d,(1035,325,1800,800),28,fill=PANEL,outline="#2C4968")
d.text((1080,375),"ECOSYSTEM VALUE",font=font(22,True),fill=CYAN)
paragraph(d,(1080,435),"A reusable spending-control component, a minimal guard contract, deployment evidence, fail-closed network tooling and an operations runbook.",font(23,True),WHITE,max_width=620,leading=1.28)
d.line((1080,580,1745,580),fill="#2C4968",width=2)
d.text((1080,610),"LIMITATIONS",font=font(20,True),fill=AMBER)
paragraph(d,(1080,655),"Testnet prototype. No independent security audit. Specific EVM/SS58 mapping unverified. Public end-to-end transfer demo still pending.",font(18),BODY,max_width=620,leading=1.28)
slides.append(im)

# Save previews and multipage PDF.
for i,im in enumerate(slides,1):
    im.save(PREVIEW / f"slide-{i:02d}.png", optimize=True)
OUT.parent.mkdir(parents=True, exist_ok=True)
rgb = [s.resize((1024, 576), Image.LANCZOS).convert("RGB") for s in slides]
rgb[0].save(OUT, "PDF", resolution=76.8, save_all=True, append_images=rgb[1:])
print(f"PDF={OUT}")
print(f"SLIDES={len(slides)}")
print(f"BYTES={OUT.stat().st_size}")