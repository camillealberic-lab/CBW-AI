// Génère les 3 variantes SVG de l'icône Dock (CBW AI). node design/icon/gen.mjs
import { writeFileSync } from 'node:fs';
const dir = new URL('.', import.meta.url).pathname;
const O='#FF5A1F', B='#2B3BFF', V='#1FD26A', G='#1C1C1E';
// Squircle Apple (coins continus) : bords plats + coins en quart de superellipse
// (étendue 1,528 × 185,4 px, exposant 2,2 → même diagonale qu'un rx 185,4, courbure continue)
function squircle(cx=512, cy=512, half=412, rx=185.4*half/412, n=2.2, steps=90){
  const R=1.52866*rx, k=half-R, pts=[];
  const corners=[[1,1],[-1,1],[-1,-1],[1,-1]];
  corners.forEach(([sx,sy],ci)=>{
    for(let i=0;i<=steps;i++){
      const t=(ci*90+i*90/steps)*Math.PI/180, c=Math.cos(t), s=Math.sin(t);
      pts.push([cx+sx*k+R*Math.sign(c)*Math.abs(c)**(2/n), cy+sy*k+R*Math.sign(s)*Math.abs(s)**(2/n)]);
    }
  });
  return pts.map((p,i)=>(i?'L':'M')+p[0].toFixed(1)+' '+p[1].toFixed(1)).join('')+'Z';
}
const SQ=squircle(), SQ_IN=squircle(512,512,409);
// 3 barres : largeur 172, écart 62, centrées ; bleu la plus haute
const W=156, GAP=68, X0=512-(3*W+2*GAP)/2;
const bars=[{c:O,h:408,id:'o'},{c:B,h:600,id:'b'},{c:V,h:288,id:'v'}].map((b,i)=>({...b,x:X0+i*(W+GAP),y:512-b.h/2}));
const barClips=()=>bars.map(b=>`<clipPath id="c${b.id}"><rect x="${b.x}" y="${b.y}" width="${W}" height="${b.h}"/></clipPath>`).join('');
const barGrads=bars.map(b=>`<linearGradient id="g${b.id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${b.c}" stop-opacity="1"/><stop offset="1" stop-color="${b.c}"/></linearGradient>`).join('');
const commonDefs=()=>`${barClips()}
  <linearGradient id="shine" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".38"/><stop offset=".06" stop-color="#fff" stop-opacity=".10"/><stop offset=".45" stop-color="#fff" stop-opacity="0"/></linearGradient>
  <linearGradient id="shade" x1="0" y1="0" x2="0" y2="1"><stop offset=".55" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".16"/></linearGradient>
  <filter id="inner" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="9"/></filter>`;
function barsSVG(dropOpacity){
  return `<g filter="url(#drop)">${bars.map(b=>`<rect x="${b.x}" y="${b.y}" width="${W}" height="${b.h}" fill="${b.c}"/>`).join('')}</g>
  <g>${bars.map(b=>`<rect x="${b.x}" y="${b.y}" width="${W}" height="${b.h}" fill="${b.c}"/>
    <g clip-path="url(#c${b.id})"><rect x="${b.x}" y="${b.y}" width="${W}" height="${b.h}" fill="none" stroke="#000" stroke-opacity=".30" stroke-width="22" filter="url(#inner)"/></g>
    <rect x="${b.x}" y="${b.y}" width="${W}" height="${b.h}" fill="url(#shade)"/>
    <rect x="${b.x}" y="${b.y}" width="${W}" height="${b.h}" fill="url(#shine)"/>
    <rect x="${b.x}" y="${b.y}" width="${W}" height="6" fill="#fff" fill-opacity=".55"/>`).join('')}</g>`;
}
const drop=(o)=>`<filter id="drop" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur in="SourceAlpha" stdDeviation="14"/><feOffset dy="16"/><feComponentTransfer><feFuncA type="linear" slope="${o}"/></feComponentTransfer><feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge></filter>`;
const shadowOuter=`<filter id="tile" x="-10%" y="-10%" width="120%" height="125%"><feGaussianBlur in="SourceAlpha" stdDeviation="12"/><feOffset dy="10"/><feComponentTransfer><feFuncA type="linear" slope=".30"/></feComponentTransfer><feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge></filter>`;
const head=(t)=>`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024"><title>CBW AI — ${t}</title>`;

const A=`${head('icône A (graphite, trois barres)')}
 <defs>${commonDefs()}${drop(.45)}${shadowOuter}
  <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#34343A"/><stop offset=".5" stop-color="${G}"/><stop offset="1" stop-color="#121214"/></linearGradient>
  <radialGradient id="glow" cx=".5" cy="0" r=".9"><stop offset="0" stop-color="#fff" stop-opacity=".07"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
  <linearGradient id="edge" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".22"/><stop offset=".25" stop-color="#fff" stop-opacity=".04"/><stop offset="1" stop-color="#fff" stop-opacity=".02"/></linearGradient>
  <clipPath id="clip"><path d="${SQ}"/></clipPath></defs>
 <path d="${SQ}" fill="url(#bg)" filter="url(#tile)"/>
 <path d="${SQ}" fill="url(#glow)"/>
 <path d="${SQ_IN}" fill="none" stroke="url(#edge)" stroke-width="4"/>
 <g clip-path="url(#clip)">${barsSVG()}</g>
</svg>`;

const Bv=`${head('icône B (blanche, trois barres)')}
 <defs>${commonDefs()}${drop(.18)}${shadowOuter}
  <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFFFFF"/><stop offset="1" stop-color="#ECECE8"/></linearGradient>
  <clipPath id="clip"><path d="${SQ}"/></clipPath></defs>
 <path d="${SQ}" fill="url(#bg)" filter="url(#tile)"/>
 <path d="${squircle(512,512,409)}" fill="none" stroke="${G}" stroke-width="6"/>
 <g clip-path="url(#clip)">${barsSVG()}</g>
</svg>`;

let grid='';
for(let p=100+412%46; p<924; p+=46){ grid+=`M${p} 100V924M100 ${p}H924`; }
const C=`${head('icône C (graphite, halo coloré)')}
 <defs>${commonDefs()}${drop(.40)}${shadowOuter}
  <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2C2C31"/><stop offset="1" stop-color="#141416"/></linearGradient>
  <filter id="bloom" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="70"/></filter>
  <radialGradient id="fade" cx=".5" cy=".5" r=".55"><stop offset=".35" stop-color="#fff"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
  <mask id="gm"><rect x="100" y="100" width="824" height="824" fill="url(#fade)"/></mask>
  <linearGradient id="edge" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".22"/><stop offset=".25" stop-color="#fff" stop-opacity=".04"/><stop offset="1" stop-color="#fff" stop-opacity=".02"/></linearGradient>
  <clipPath id="clip"><path d="${SQ}"/></clipPath></defs>
 <path d="${SQ}" fill="url(#bg)" filter="url(#tile)"/>
 <g clip-path="url(#clip)">
  <path d="${grid}" stroke="#fff" stroke-opacity=".07" stroke-width="2" mask="url(#gm)"/>
  <g filter="url(#bloom)" opacity=".75">${bars.map(b=>`<rect x="${b.x-30}" y="${b.y+40}" width="${W+60}" height="${b.h-80}" fill="${b.c}"/>`).join('')}</g>
  ${barsSVG()}
 </g>
 <path d="${SQ_IN}" fill="none" stroke="url(#edge)" stroke-width="4"/>
</svg>`;

writeFileSync(dir+'icon-a-graphite.svg', A);
writeFileSync(dir+'icon-b-blanc.svg', Bv);
writeFileSync(dir+'icon-c-halo.svg', C);
console.log('ok', bars.map(b=>[b.x,b.y,b.h]));
