// Checks that every normal-stage camera angle (its 15 s dolly and a forward
// rush of up to 26 units) keeps clear of the stage geometry (0.12 margin).
// Usage: node tools/check-camera-clearance.cjs   (dev only; needs playwright)
const path=require('path'),http=require('http');
let chromium;try{({chromium}=require('playwright'));}catch{({chromium}=require(path.join(require('child_process').execSync('npm root -g').toString().trim(),'playwright')));}
const root=path.resolve(__dirname,'..');
const fs=require('fs');
const src=fs.readFileSync(path.join(root,'app/digital-abstract-scene.js'),'utf8');
const shots=eval('('+src.match(/const NORMAL_SHOTS = (\{[\s\S]*?\n  \});/)[1]+')');
(async()=>{ const server=http.createServer((q,r)=>{const f=path.join(root,decodeURIComponent(q.url.split('?')[0]));if(!f.startsWith(root)||!fs.existsSync(f)||fs.statSync(f).isDirectory()){r.writeHead(404);r.end();return;}r.writeHead(200);fs.createReadStream(f).pipe(r);}).listen(0); const url=`http://localhost:${server.address().port}/index.html`; let total=0; const b=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader']}); const p=await b.newPage({viewport:{width:1600,height:900}});
 await p.goto(url); await p.waitForTimeout(6000);
 for (const [key,stage] of [['station','橋本駅'],['hall','同人音楽即売会'],['lounge','クラブのラウンジ']]) {
  await p.evaluate(s=>document.querySelector(`[data-debug-stage="${s}"]`).click(), stage); await p.waitForTimeout(3000);
  const res=await p.evaluate(({key,list})=>{
    const sc=window.ShibakuEffects.abstractScene, w=sc.cabinetWorld, T=sc.THREE;
    const root = key==='station' ? w.stationStage : w.structures[key].group;
    root.updateMatrixWorld(true);
    const boxes=[]; const tmp=new T.Matrix4();
    root.traverse(o=>{ if(!o.isMesh||!o.visible) return; const g=o.geometry; if(!g.boundingBox) g.computeBoundingBox();
      const label=(o.material?.color?'#'+o.material.color.getHexString():'?')+(o.isInstancedMesh?' inst':'')+' '+g.type;
      if(o.isInstancedMesh){ for(let i=0;i<o.count;i++){ o.getMatrixAt(i,tmp); const bx=g.boundingBox.clone().applyMatrix4(tmp).applyMatrix4(o.matrixWorld); boxes.push([bx,label]); } }
      else { boxes.push([g.boundingBox.clone().applyMatrix4(o.matrixWorld),label]); } });
    const sx = key==='station'?1:(w.structures[key].group.scale.x||1);
    const hits=[];
    list.forEach((shot,index)=>{ const [px,py,pz,lx,ly,lz,fov,dx,dy,dz]=shot;
      const pts=[];
      for(let t=0;t<=1.0001;t+=0.05){ const e=t*t*(3-2*t); pts.push(['dolly '+t.toFixed(2), new T.Vector3((px+dx*e)*sx, py+dy*e, pz+dz*e)]); }
      for(let k=0;k<=26;k+=0.5){ pts.push(['rush '+k, new T.Vector3(px*sx, py, pz-k)]); }
      const seen=new Set();
      for(const [where,pt] of pts){ for(const [bx,label] of boxes){ const e=bx.clone().expandByScalar(0.12); if(e.containsPoint(pt)){ const k2=index+'|'+label; if(!seen.has(k2)){ seen.add(k2); hits.push(`shot${index} ${where} -> ${label} box[${bx.min.toArray().map(v=>v.toFixed(2))}..${bx.max.toArray().map(v=>v.toFixed(2))}]`);} } } }
    });
    return {boxes:boxes.length, hits};
  },{key,list:shots[key]});
  total+=res.hits.length; console.log('==',key,'boxes',res.boxes,'hits',res.hits.length); res.hits.slice(0,30).forEach(h=>console.log('  '+h));
 }
 await b.close(); server.close(); process.exitCode = total ? 1 : 0; })();
