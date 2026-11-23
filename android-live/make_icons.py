#!/usr/bin/env python3
import sys
from pathlib import Path
from PIL import Image

src=Path(sys.argv[1]); res=Path(sys.argv[2])
icon=Image.open(src).convert("RGB")
for dpi,size in [("mdpi",48),("hdpi",72),("xhdpi",96),("xxhdpi",144),("xxxhdpi",192)]:
    d=res/("mipmap-"+dpi)
    d.mkdir(parents=True,exist_ok=True)
    img=icon.resize((size,size),Image.Resampling.LANCZOS)
    img.save(d/"ic_launcher.png")
    img.save(d/"ic_launcher_round.png")
