// Extracts sprites from the concept sheet into transparent spritesheets + JSON.
const sharp=require('sharp');const fs=require('fs');
const SRC=process.argv[2]||'/data/uploads/29174/mwb27oye-6b9d15a3-grafik.png';
const OUT='assets/sprites';fs.mkdirSync(OUT,{recursive:true});fs.mkdirSync(OUT+'/frames',{recursive:true});
// section: region, mode ('comp' = components, 'grid' = columns from best row), rows/cols naming
const bands=(ys,cols)=>ys.slice(0,-1).map((y,i)=>(typeof cols==='function'?cols(i):cols).map(([a,b])=>[a,y,b,ys[i+1]]));
const SEC={
 characters:{r:[15,62,922,440],names:['vorarbeiter','bauleiterin','maurer','abrissprofi','ingenieur','architektin'],
   anims:[['portrait',0,75],['idle',75,228],['run',228,392],['attack',392,552],['hit',552,660],['death',660,922]]},
 enemies:{r:[950,62,1525,440],names:['pylon','fass','betonblock','bagger','steingolem','felsgolem'],
   anims:[['portrait',0,1030],['walk',1030,1225],['hit',1225,1330],['death',1330,1525]]},
 weapons:{clean:true,r:[130,492,722,705],cells:bands([492,529,565,600,634,668,705],[[130,192],[208,287],[305,414],[424,502],[525,606],[628,722]]),names:['akkuschrauber','nagelpistole','presslufthammer','bauzaunwerfer','betonmischer','kranhaken'],
   anims:[['lv1',0,190],['lv2',210,285],['lv3',305,420],['lv4',420,500],['lv5',525,605],['lv6',628,722]]},
 passive:{r:[750,495,1120,645],names:['helm','weste','werkzeuggurt','plan','kaffee','stiefel','zementsack','massband','magnet','funkgeraet']},
 pickups:{r:[1150,495,1525,645],names:['xp','magnet','herz','klee','muenze','speed','blitz','schild','sanduhr','bombe']},
 particles:{r:[160,755,615,995],grid:true,rowsY:[755,800,848,895,940,995],names:['schuss','explosion','staub','splitter','funken']},
 auras:{r:[650,755,1135,995],darkBg:true,cells:bands([755,838,922,995],i=>[[[650,812],[812,962],[962,1135]],[[650,780],[780,900],[900,1025],[1025,1135]],[[650,760],[760,845],[845,935],[935,1025],[1025,1135]]][i]),names:[],labels:[['absperrung','absperrung','steinring'],['blitzring','blitzring','stacheln','stacheln'],['xpring','xpring','xpring','xpring','xpring']],
   cols:[[650,810],[810,965],[965,1135]],cols3:[[650,760],[760,845],[845,935],[935,1025],[1025,1135]]},
 props:{clean:true,r:[1165,755,1525,995],cells:[[[1170,755,1240,818],[1250,755,1350,815],[1355,755,1430,812],[1435,755,1525,808]],[[1168,825,1242,885],[1250,818,1305,885],[1312,820,1380,885],[1390,812,1445,890],[1452,812,1520,890]],[[1170,890,1272,995],[1285,890,1385,945],[1282,946,1332,995],[1336,944,1412,992],[1414,890,1522,995]]],names:['bake','rohre','ziegel','sand','schalstein','fass','kabeltrommel','baulampe','dixi','geruest','kran','pylon','traeger','bauzaun']},
};
(async()=>{
const {data,info}=await sharp(SRC).removeAlpha().raw().toBuffer({resolveWithObject:true});
const W=info.width,H=info.height;const L=i=>(data[i*3]+data[i*3+1]+data[i*3+2])/3;
const S=i=>Math.max(data[i*3],data[i*3+1],data[i*3+2])-Math.min(data[i*3],data[i*3+1],data[i*3+2]);
let m=new Uint8Array(W*H);for(let i=0;i<W*H;i++)m[i]=(L(i)>72||S(i)>45)?1:0;
const morph=(a,r,dil)=>{const o=new Uint8Array(W*H);for(let y=0;y<H;y++)for(let x=0;x<W;x++){let v=dil?0:1;
  for(let dy=-r;dy<=r&&(dil?!v:v);dy++)for(let dx=-r;dx<=r;dx++){const X=x+dx,Y=y+dy;const q=(X<0||Y<0||X>=W||Y>=H)?0:a[Y*W+X];if(dil&&q){v=1;break}if(!dil&&!q){v=0;break}}o[y*W+x]=v}return o};
m=morph(morph(m,1,false),1,true); // opening: kills 1-2px grid lines
const D=3,d=morph(m,D,true);
// background flood fill -> alpha for a rect
let DARK=false;const bgLike=i=>{const l=L(i);return l>=14&&((DARK&&l<42)||(l<66&&S(i)<32))};
function cutout(x0,y0,x1,y1,keep){const w=x1-x0+1,h=y1-y0+1;const a=new Uint8Array(w*h).fill(255);const st=[];
 const push=(x,y)=>{const k=y*w+x;if(a[k]&&bgLike((y+y0)*W+x+x0)){a[k]=0;st.push(k)}};
 for(let x=0;x<w;x++){push(x,0);push(x,h-1)}for(let y=0;y<h;y++){push(0,y);push(w-1,y)}
 while(st.length){const k=st.pop(),x=k%w,y=(k-x)/w;if(x>0)push(x-1,y);if(x<w-1)push(x+1,y);if(y>0)push(x,y-1);if(y<h-1)push(x,y+1)}
 if(keep==='clean'){const lb=new Int32Array(w*h);const sizes=[0],edge=[0];let n=0;
  for(let k0=0;k0<w*h;k0++){if(!a[k0]||lb[k0])continue;n++;let c=0,e=false;const st=[k0];lb[k0]=n;
   while(st.length){const k=st.pop(),x=k%w,y=(k-x)/w;c++;if(x==0||y==0||x==w-1||y==h-1)e=true;
    for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,-1],[1,-1],[-1,1]]){const X=x+dx,Y=y+dy;if(X<0||Y<0||X>=w||Y>=h)continue;const q=Y*w+X;if(a[q]&&!lb[q]){lb[q]=n;st.push(q)}}}
   sizes.push(c);edge.push(e)}
  const mx=Math.max(...sizes);for(let k=0;k<w*h;k++)if(a[k]){const l=lb[k];if(sizes[l]<mx*0.06||(edge[l]&&sizes[l]<mx*0.3))a[k]=0}
  keep=null}
 if(keep)for(let k=0;k<w*h;k++){const x=k%w,y=(k-x)/w;if(!keep((y+y0)*W+x+x0))a[k]=0}
 // trim
 let bx0=w,by0=h,bx1=-1,by1=-1;for(let k=0;k<w*h;k++)if(a[k]){const x=k%w,y=(k-x)/w;if(x<bx0)bx0=x;if(x>bx1)bx1=x;if(y<by0)by0=y;if(y>by1)by1=y}
 if(bx1<0)return null;const tw=bx1-bx0+1,th=by1-by0+1;const buf=Buffer.alloc(tw*th*4);
 for(let y=0;y<th;y++)for(let x=0;x<tw;x++){const si=((y+by0+y0)*W+x+bx0+x0)*3,o=(y*tw+x)*4,ak=a[(y+by0)*w+x+bx0];
  buf[o]=data[si];buf[o+1]=data[si+1];buf[o+2]=data[si+2];buf[o+3]=ak}
 return {w:tw,h:th,buf}}
function comps([x0,y0,x1,y1]){const lab=new Int32Array(W*H);let n=0;const res=[];
 for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++){if(!d[y*W+x]||lab[y*W+x])continue;n++;const st=[y*W+x];lab[y*W+x]=n;const b=[x,y,x,y];let c=0;
  while(st.length){const p=st.pop(),px=p%W,py=(p-px)/W;if(m[p])c++;b[0]=Math.min(b[0],px);b[1]=Math.min(b[1],py);b[2]=Math.max(b[2],px);b[3]=Math.max(b[3],py);
   for(const q of [p-1,p+1,p-W,p+W]){const qx=q%W,qy=(q-qx)/W;if(qx<x0||qx>=x1||qy<y0||qy>=y1)continue;if(d[q]&&!lab[q]){lab[q]=n;st.push(q)}}}
  const bb=[b[0]+D,b[1]+D,b[2]-D,b[3]-D];if(c>20&&bb[2]-bb[0]>=4&&bb[3]-bb[1]>=4)res.push({b:bb,c,id:n})}
 return {res,lab}}
function rowsOf(list){list.sort((a,b)=>(a.b[1]+a.b[3])-(b.b[1]+b.b[3]));const rows=[];
 for(const o of list){const cy=(o.b[1]+o.b[3])/2;const r=rows.find(r=>Math.abs(r.cy-cy)<22);if(r){r.items.push(o)}else rows.push({cy,items:[o]})}
 rows.sort((a,b)=>a.cy-b.cy);rows.forEach(r=>r.items.sort((a,b)=>a.b[0]-b.b[0]));return rows}
const meta={};
for(const [sec,cfg] of Object.entries(SEC)){
 DARK=!!cfg.darkBg;let {res,lab}=comps(cfg.r);
 if(sec==='weapons')res=res.filter(o=>!(o.b[2]-o.b[0]<24&&o.b[3]-o.b[1]<20&&[200,297,513,618].some(c=>Math.abs((o.b[0]+o.b[2])/2-c)<14)));
 if(!cfg.maskCrop){const big=res.filter(o=>o.c>=150),small=res.filter(o=>o.c<150);
  for(const o of small){const t=big.find(b=>o.b[0]>=b.b[0]-8&&o.b[2]<=b.b[2]+8&&o.b[1]>=b.b[1]-8&&o.b[3]<=b.b[3]+8);
   if(t){t.b=[Math.min(t.b[0],o.b[0]),Math.min(t.b[1],o.b[1]),Math.max(t.b[2],o.b[2]),Math.max(t.b[3],o.b[3])];o.merged=1}}
  if(!cfg.grid)res=res.filter(o=>!o.merged)}
 let rows;if(cfg.rowsY){rows=cfg.rowsY.slice(0,-1).map((a,i)=>({cy:a,items:res.filter(o=>{const c=(o.b[1]+o.b[3])/2;return c>=a&&c<cfg.rowsY[i+1]}).sort((p,q)=>p.b[0]-q.b[0])}))}else rows=rowsOf(res);
 if(cfg.grid){ // merge components into column cells
  rows=rows.map((r,ri)=>{let cols;
   if(sec==='auras')cols=ri<2?cfg.cols:cfg.cols3;else if(sec==='weapons')cols=cfg.anims.map(a=>[a[1]||130,a[2]]);
   else{const ref=rows[1];
     const cs=ref.items.map(o=>(o.b[0]+o.b[2])/2);cols=cs.map((c,i)=>[i?(cs[i-1]+c)/2:cfg.r[0],i<cs.length-1?(c+cs[i+1])/2:cfg.r[2]])}
   const items=cols.map(([a,b])=>{const g=r.items.filter(o=>{const c=(o.b[0]+o.b[2])/2;return c>=a&&c<b});if(!g.length)return null;
     return {b:[Math.min(...g.map(o=>o.b[0])),Math.min(...g.map(o=>o.b[1])),Math.max(...g.map(o=>o.b[2])),Math.max(...g.map(o=>o.b[3]))]}}).filter(Boolean);
   return {cy:r.cy,items}})}
 const frames=[];
 if(cfg.cells){rows=cfg.cells.map((r,ri)=>({items:r.map(c=>({b:c,cell:1}))}))}
 rows.forEach((r,ri)=>{r.items.forEach((o,ci)=>{const P=o.cell?0:2;const [x0,y0,x1,y1]=[Math.max(0,o.b[0]-P),Math.max(0,o.b[1]-P),Math.min(W-1,o.b[2]+P),Math.min(H-1,o.b[3]+P)];
   const keep=cfg.clean?'clean':cfg.maskCrop?(i=>lab[i]===o.id):null;const c=cutout(x0,y0,x1,y1,keep);if(!c)return;
   let name;if(cfg.anims){const cx=(o.b[0]+o.b[2])/2;const an=cfg.anims.find(([n,a,b])=>cx>=a&&cx<b);c.anim=an?an[0]:'x'}
   c.row=ri;c.col=ci;c.src=[o.b[0],o.b[1]];frames.push(c)})});
 // naming
 const rowName=ri=>cfg.names[ri]||('row'+ri);
 if(sec==='passive'||sec==='pickups'||sec==='props'){let k=0;frames.forEach(f=>{f.name=cfg.names[k++]||('item'+k)})}
 else{const cnt={};frames.forEach(f=>{const base=cfg.labels?cfg.labels[f.row][f.col]:rowName(f.row)+(f.anim?'_'+f.anim:'');cnt[base]=(cnt[base]||0);f.name=base+'_'+cnt[base]++})}
 // pack: one row per sprite row, uniform cell
 let cw=Math.max(...frames.map(f=>f.w)),ch=Math.max(...frames.map(f=>f.h));
 const snap=v=>v<=32?32:v<=48?48:v<=64?64:Math.ceil(v/16)*16;cw=snap(cw);ch=snap(ch);const cell=Math.max(cw,ch);
 const nrows=Math.max(...frames.map(f=>f.row))+1;const perRow=r=>frames.filter(f=>f.row===r);
 let cols=Math.max(...Array.from({length:nrows},(_,r)=>perRow(r).length));
 if(['passive','pickups','props'].includes(sec)){cols=Math.min(frames.length,8);frames.forEach((f,i)=>{f.gr=Math.floor(i/cols);f.gc=i%cols})}
 else frames.forEach(f=>{f.gr=f.row;f.gc=perRow(f.row).indexOf(f)});
 const gr=Math.max(...frames.map(f=>f.gr))+1;const comp=[];const fm={};
 for(const f of frames){const x=f.gc*cell+Math.floor((cell-f.w)/2),y=f.gr*cell+(cell-f.h)- (['characters','enemies'].includes(sec)?2:Math.floor((cell-f.h)/2));
  comp.push({input:f.buf,raw:{width:f.w,height:f.h,channels:4},left:x,top:y});
  fm[f.name]={frame:{x:f.gc*cell,y:f.gr*cell,w:cell,h:cell},trimmed:{x,y,w:f.w,h:f.h},source:{x:f.src[0],y:f.src[1]}};
  await sharp(f.buf,{raw:{width:f.w,height:f.h,channels:4}}).png().toFile(`${OUT}/frames/${sec}_${f.name}.png`)}
 await sharp({create:{width:cols*cell,height:gr*cell,channels:4,background:{r:0,g:0,b:0,alpha:0}}}).composite(comp).png().toFile(`${OUT}/${sec}.png`);
 // animations index
 const anims={};for(const n of Object.keys(fm)){const k=n.replace(/_\d+$/,'');(anims[k]=anims[k]||[]).push(n)}
 fs.writeFileSync(`${OUT}/${sec}.json`,JSON.stringify({meta:{image:`${sec}.png`,cell,size:{w:cols*cell,h:gr*cell}},frames:fm,animations:anims},null,1));
 meta[sec]={cell,frames:frames.length,rows:rows.map(r=>r.items.length).join(',')};
}
console.table(meta);
})();
