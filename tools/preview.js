const sharp=require('sharp');const fs=require('fs');
(async()=>{for(const f of process.argv.slice(2)){const p=`assets/sprites/${f}.png`;const m=await sharp(p).metadata();
 const sc=Math.min(2,1400/m.width);const w=Math.round(m.width*sc),h=Math.round(m.height*sc);
 const cell=require(`../assets/sprites/${f}.json`).meta.cell*sc;
 let svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="100%" height="100%" fill="#7a3a8a"/>`;
 for(let x=0;x<w;x+=cell)for(let y=0;y<h;y+=cell)svg+=`<rect x="${x}" y="${y}" width="${cell}" height="${cell}" fill="none" stroke="#fff3"/>`;svg+='</svg>';
 const img=await sharp(p).resize(w,h,{kernel:'nearest'}).toBuffer();
 await sharp(Buffer.from(svg)).composite([{input:img}]).jpeg({quality:85}).toFile(`preview/${f}.jpg`)}})();
