/* Generates extension PNG icons (16/48/128) — run: node gen-icons.js */
const zlib = require('zlib');
const fs = require('fs');
const path = require('path');

function crc32(buf){
  let c, table=crc32.t||(crc32.t=(()=>{const t=[];for(let n=0;n<256;n++){c=n;for(let k=0;k<8;k++)c=c&1?0xEDB88320^(c>>>1):c>>>1;t[n]=c>>>0;}return t;})());
  let crc=0xFFFFFFFF; for(let i=0;i<buf.length;i++) crc=table[(crc^buf[i])&0xFF]^(crc>>>8);
  return (crc^0xFFFFFFFF)>>>0;
}
function chunk(type, data){
  const len=Buffer.alloc(4); len.writeUInt32BE(data.length,0);
  const t=Buffer.from(type,'ascii');
  const crc=Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([t,data])),0);
  return Buffer.concat([len,t,data,crc]);
}
function png(w,h,rgba){
  const sig=Buffer.from([137,80,78,71,13,10,26,10]);
  const ihdr=Buffer.alloc(13);
  ihdr.writeUInt32BE(w,0); ihdr.writeUInt32BE(h,4); ihdr[8]=8; ihdr[9]=6; // 8-bit RGBA
  const raw=Buffer.alloc((w*4+1)*h);
  for(let y=0;y<h;y++){ raw[y*(w*4+1)]=0; rgba.copy(raw,y*(w*4+1)+1,y*w*4,(y+1)*w*4); }
  const idat=zlib.deflateSync(raw,{level:9});
  return Buffer.concat([sig,chunk('IHDR',ihdr),chunk('IDAT',idat),chunk('IEND',Buffer.alloc(0))]);
}

function hex(c){ return [parseInt(c.slice(1,3),16),parseInt(c.slice(3,5),16),parseInt(c.slice(5,7),16)]; }
function draw(size){
  const w=size,h=size,buf=Buffer.alloc(w*h*4,0);
  const bg=hex('#1f6feb'), bg2=hex('#0d3a86'), bar=hex('#ffffff'), bar2=hex('#9fd0ff');
  const r=Math.round(size*0.22);
  const set=(x,y,rgb,a)=>{ if(x<0||y<0||x>=w||y>=h)return; const i=(y*w+x)*4; buf[i]=rgb[0];buf[i+1]=rgb[1];buf[i+2]=rgb[2];buf[i+3]=a; };
  const inRound=(x,y)=>{ // rounded-rect mask
    const cx=Math.min(Math.max(x,r),w-1-r), cy=Math.min(Math.max(y,r),h-1-r);
    const dx=x-cx, dy=y-cy; return dx*dx+dy*dy<=r*r || (x>=r&&x<=w-1-r) || (y>=r&&y<=h-1-r);
  };
  // background with vertical gradient
  for(let y=0;y<h;y++) for(let x=0;x<w;x++){
    if(!inRound(x,y)) continue;
    const t=y/h; const rgb=[Math.round(bg[0]*(1-t)+bg2[0]*t),Math.round(bg[1]*(1-t)+bg2[1]*t),Math.round(bg[2]*(1-t)+bg2[2]*t)];
    set(x,y,rgb,255);
  }
  // "river" bars: a few indented lines with a leading-comma dot, suggesting formatted SQL
  const pad=Math.round(size*0.20), unit=Math.max(1,Math.round(size*0.085));
  const rows=[ {indent:0,len:0.34,dot:false},
               {indent:1,len:0.42,dot:true},
               {indent:1,len:0.30,dot:true},
               {indent:0,len:0.24,dot:false} ];
  const gap=Math.round((h-2*pad)/rows.length);
  rows.forEach((row,ri)=>{
    const y0=pad+ri*gap+Math.round(gap*0.18);
    const bh=Math.max(1,Math.round(size*0.10));
    const x0=pad+row.indent*unit;
    const dotw=row.dot?Math.round(unit*0.6):0;
    if(row.dot){ for(let y=y0;y<y0+bh;y++) for(let x=x0;x<x0+dotw;x++) set(x,y,bar2,255); }
    const bx=x0+(row.dot?dotw+Math.round(unit*0.4):0);
    const bw=Math.round((w-2*pad)*row.len);
    for(let y=y0;y<y0+bh;y++) for(let x=bx;x<bx+bw;x++) set(x,y,ri%2?bar2:bar,255);
  });
  return png(w,h,buf);
}

const dir=path.join(__dirname,'icons');
fs.mkdirSync(dir,{recursive:true});
[16,48,128].forEach(s=>{ fs.writeFileSync(path.join(dir,`icon${s}.png`),draw(s)); console.log('wrote icon'+s+'.png'); });

// Edge Add-ons store logo — 300x300, written to store-assets (NOT bundled in the zip)
const sa=path.join(__dirname,'store-assets');
fs.mkdirSync(sa,{recursive:true});
fs.writeFileSync(path.join(sa,'store-logo-300.png'),draw(300));
console.log('wrote store-assets/store-logo-300.png');
