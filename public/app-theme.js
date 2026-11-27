/* Shared palette for the portal and every classic dashboard page. No account or reading data is modified. */
(function(){
"use strict";
const key="durood-app-theme";
const palettes={
 white:{h:215,s:.14,light:true,bar:"#f4f6f9",names:["White – Pearl","سفید","Putih"]},
 blue:{h:217,s:.88,light:false,bar:"#071b3c",names:["Blue – Royal","نیلا","Biru"]},
 pink:{h:331,s:.57,light:true,bar:"#fff0f5",names:["Pink – Rose","گلابی","Merah muda"]},
 red:{h:350,s:.78,light:false,bar:"#300910",names:["Red – Ruby","سرخ","Merah"]},
 emerald:{h:164,s:1,light:false,bar:"#004d3b",names:["Green – Emerald","سبز","Hijau"]}
};
const aliases={"green-gold":"emerald","navy-silver":"blue","maroon-gold":"red","plum-lavender":"pink","teal-copper":"blue","charcoal-amber":"white"};
function normalize(v){return Object.hasOwn(palettes,v)?v:aliases[v]||"emerald";}
function stored(){try{return normalize(localStorage.getItem(key));}catch{return "emerald";}}
const root=document.documentElement, originals=new Map();
let applied="",ready=false;
const status=/period-(?:short|complete)|(?:^|[-_.])(?:pending|complete|completed|missed|success|error|danger|manual|offline|jamat|solo|made|qaza-ada|short|extra|fireworks|status-green|status-red)(?:[-_.:\s,\[]|$)/i;
const colorProperties=/^(?:--|color$|background|border|outline|box-shadow|text-shadow|fill$|stroke$|accent-color|caret-color|scrollbar-color|-webkit-text-fill-color)/;
function hexRgb(token){
 let v=token.slice(1);if(v.length===3||v.length===4)v=[...v].map(x=>x+x).join("");
 if(v.length!==6&&v.length!==8)return null;
 return [parseInt(v.slice(0,2),16),parseInt(v.slice(2,4),16),parseInt(v.slice(4,6),16),v.length===8?parseInt(v.slice(6),16)/255:1];
}
function toHsl(r,g,b){
 r/=255;g/=255;b/=255;const hi=Math.max(r,g,b),lo=Math.min(r,g,b),d=hi-lo,l=(hi+lo)/2;
 let h=0;if(d)h=hi===r?((g-b)/d+6)%6:hi===g?(b-r)/d+2:(r-g)/d+4;
 return [h*60,d?d/(1-Math.abs(2*l-1)):0,l];
}
function rgbToken(token,p,prop,semantic){
 let a=token.startsWith("#")?hexRgb(token):null;
 if(!a){const nums=token.match(/-?\d+(?:\.\d+)?%?/g);if(!nums||nums.length<3||nums.some(x=>x.includes("%")))return token;a=[+nums[0],+nums[1],+nums[2],nums[3]===undefined?1:+nums[3]];}
 if(!a||a.some(x=>!Number.isFinite(x)))return token;
 let [h,s,l]=toHsl(...a);const alpha=a[3];
 if(semantic)return token;
 const cool=s>.10&&h>=85&&h<=255, neutral=s<=.10, gold=s>.15&&h>=28&&h<=68;
 if(!cool&&!neutral&&!gold)return token;
 if(cool){h=p.h;s=Math.min(1,s*p.s);}
 if(p.light){
  const foreground=/^(?:color|fill|stroke|caret-color|-webkit-text-fill-color)$/.test(prop);
  if(alpha<.35)return token;
  if(cool||neutral){
   if(foreground){l=.14+Math.min(.15,l*.12);h=p.h;s=p.h===331?.34:.21;}
   else {l=.89+Math.min(.09,l*.08);h=p.h;s=p.h===331?.45:.14;}
  }else if(gold&&foreground)l=.30;
 }
 if(!p.light&&!cool)return token;
 return "hsl("+h.toFixed(1)+" "+(s*100).toFixed(1)+"% "+(l*100).toFixed(1)+"% / "+alpha.toFixed(3)+")";
}
function convert(value,p,prop,semantic){
 if(semantic)return value;
 // Relative colors retain the existing variable-based palettes, but invert
 // lightness in light mode. Literal legacy colors are also covered.
 let result=value.replace(/#[0-9a-f]{8}\b|#[0-9a-f]{6}\b|#[0-9a-f]{4}\b|#[0-9a-f]{3}\b|rgba?\(\s*[\d.,\s/%]+\)|\b(?:white|black)\b/gi,(token)=>{
  if(token.toLowerCase()==="white")token="#ffffff";else if(token.toLowerCase()==="black")token="#000000";
  return rgbToken(token,p,prop,false);
 });
 // Never depend on relative-color CSS support or blindly invert text and backgrounds.
 return result;
}
function visit(rules,fn){
 for(const r of Array.from(rules||[])){
  if(r.style&&r.selectorText)fn(r);
  if(r.cssRules)visit(r.cssRules,fn);
 }
}
function repaint(theme){
 const p=palettes[theme];
 for(const sheet of Array.from(document.styleSheets)){
  if(sheet.href){const url=new URL(sheet.href,location.href);if(url.origin!==location.origin||url.pathname.endsWith("/theme-contrast.css"))continue;}
  try{visit(sheet.cssRules,r=>{
   if(!originals.has(r)){
    const values=[];for(const prop of Array.from(r.style)){if(colorProperties.test(prop))values.push([prop,r.style.getPropertyValue(prop),r.style.getPropertyPriority(prop)]);}
    originals.set(r,values);
   }
   for(const [prop,value,priority] of originals.get(r)){
    if(/--(?:theme|base|accent)-(?:h|s|hue|saturation)/.test(prop))continue;
    const next=theme==="emerald"?value:convert(value,p,prop,status.test(r.selectorText));
    if(r.style.getPropertyValue(prop)!==next)r.style.setProperty(prop,next,priority);
   }
  });}catch{}
 }
}
function apply(value,save=true){
 const theme=normalize(value),p=palettes[theme];root.dataset.theme=theme;
 if(save)try{localStorage.setItem(key,theme);}catch{}
 root.style.setProperty("--theme-hue",String(p.h));root.style.setProperty("--theme-saturation",String(p.s));root.style.setProperty("--theme-accent",theme==="pink"?"335":"44");
 root.style.setProperty("--base-h",String(p.h));root.style.setProperty("--base-s",String(p.s));root.style.colorScheme=p.light?"light":"dark";
 const meta=document.querySelector('meta[name="theme-color"]');if(meta)meta.content=p.bar;
 if(ready&&applied!==theme){repaint(theme);applied=theme;}
 const select=document.getElementById("portal-theme-select");if(select)select.value=theme;
 return theme;
}
function portalLabels(){
 const select=document.getElementById("portal-theme-select");if(!select)return;
 const i=root.lang==="ur"?1:root.lang==="id"?2:0;
 select.replaceChildren(...Object.entries(palettes).map(([v,p])=>{const o=document.createElement("option");o.value=v;o.textContent=p.names[i];return o;}));
 select.value=normalize(root.dataset.theme);
 const label=select.previousElementSibling;if(label)label.textContent=["Theme","تھیم","Tema"][i];
}
window.duroodTheme={normalize,stored,apply};
apply(stored(),false);
document.addEventListener("DOMContentLoaded",()=>{
 ready=true;applied="";apply(root.dataset.theme,false);portalLabels();
 document.getElementById("portal-theme-select")?.addEventListener("change",e=>apply(e.target.value,true));
 new MutationObserver(portalLabels).observe(root,{attributes:true,attributeFilter:["lang"]});
});
window.addEventListener("load",()=>{if(ready){repaint(normalize(root.dataset.theme));}});
window.addEventListener("storage",e=>{if(e.key===key&&document.getElementById("portal-theme-select"))apply(e.newValue,false);});
})();
