import * as THREE from '../node_modules/three/build/three.module.js';
import { forgeWeapon } from '../src/rendering/EntityForge.js';
import { quality } from '../src/rendering/Quality.js';
quality.settings.propDetail = 2;

const TYPES = ['dagger','sword','dualblades','axe','greatsword','warhammer','spear','scythe','bow','staff','grimoire'];
const N = 300;

function analyse(g){
  g.updateMatrixWorld(true);
  const parts = [];
  g.traverse(o=>{ if(o.isMesh){
    const b = new THREE.Box3().setFromObject(o);
    parts.push({o, b, tag:`${o.geometry.type}${o.geometry.parameters?.radius!==undefined?`(r=${(+o.geometry.parameters.radius).toFixed(3)})`:''}@${o.position.toArray().map(v=>+v.toFixed(3)).join(',')}`});
  }});
  // union-find on AABB overlap (with tiny tolerance)
  const p = parts.map((_,i)=>i);
  const find=(a)=>{while(p[a]!==a){p[a]=p[p[a]];a=p[a];}return a;};
  const uni=(a,b)=>{a=find(a);b=find(b);if(a!==b)p[a]=b;};
  const eps=0.004;
  for(let i=0;i<parts.length;i++)for(let j=i+1;j<parts.length;j++){
    const A=parts[i].b,B=parts[j].b;
    if(A.min.x-eps<=B.max.x&&B.min.x-eps<=A.max.x&&
       A.min.y-eps<=B.max.y&&B.min.y-eps<=A.max.y&&
       A.min.z-eps<=B.max.z&&B.min.z-eps<=A.max.z) uni(i,j);
  }
  const comp=new Map();
  for(let i=0;i<parts.length;i++){const r=find(i); if(!comp.has(r))comp.set(r,[]); comp.get(r).push(i);}
  return {parts, comps:[...comp.values()]};
}

for (const t of TYPES){
  let broken=0; const isolatedTags=new Map();
  for(let i=0;i<N;i++){
    const g=forgeWeapon(t,'fire',3,`seed${i}`);
    const {parts,comps}=analyse(g);
    if(comps.length>1){
      broken++;
      comps.sort((a,b)=>b.length-a.length);
      for(const c of comps.slice(1)) for(const idx of c){
        const tag=parts[idx].tag;
        isolatedTags.set(tag,(isolatedTags.get(tag)||0)+1);
      }
    }
  }
  const top=[...isolatedTags.entries()].sort((a,b)=>b[1]-a[1]).slice(0,4);
  console.log(`${t.padEnd(11)} disconnected in ${String(broken).padStart(3)}/${N}  ` + top.map(([k,v])=>`${v}× ${k}`).join('  |  '));
}
