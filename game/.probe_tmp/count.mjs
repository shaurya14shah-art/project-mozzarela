import * as THREE from '../node_modules/three/build/three.module.js';
import { forgeWeapon, weaponVariant } from '../src/rendering/EntityForge.js';
import { quality } from '../src/rendering/Quality.js';
import { seg } from '../src/rendering/GeoForge.js';

console.log('quality tier:', quality.tier, 'propDetail:', quality.settings.propDetail, 'isHD:', quality.isHD);
for (const d of [0,1,2,3]) {
  quality.settings.propDetail = d;
  console.log(`  propDetail ${d}: seg(3)=${seg(3)} seg(4)=${seg(4)} seg(5)=${seg(5)} seg(6)=${seg(6)} seg(8)=${seg(8)} seg(12)=${seg(12)}`);
}
quality.settings.propDetail = 2; // 'high' — the Apple-Silicon auto tier

const TYPES = ['dagger','sword','dualblades','axe','greatsword','warhammer','spear','scythe','bow','staff','grimoire'];
const N = 200;
const rows = [];
for (const t of TYPES) {
  let meshMin=1e9, meshMax=0, meshSum=0, triSum=0, geoSum=0, matSet=new Set();
  for (let i=0;i<N;i++){
    const g = forgeWeapon(t, 'fire', 3, `seed${i}`);
    let m=0, tri=0, geo=0;
    g.traverse(o=>{ if(o.isMesh){ m++; geo++;
      const p=o.geometry.attributes.position; const idx=o.geometry.index;
      tri += idx ? idx.count/3 : p.count/3;
      matSet.add(o.material.uuid);
    }});
    meshMin=Math.min(meshMin,m); meshMax=Math.max(meshMax,m); meshSum+=m; triSum+=tri; geoSum+=geo;
  }
  rows.push({type:t, meshMin, meshMax, meshAvg:+(meshSum/N).toFixed(1), triAvg:Math.round(triSum/N), uniqMats:matSet.size});
}
console.table(rows);
