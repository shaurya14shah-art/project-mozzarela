import { weaponVariant } from '../src/rendering/EntityForge.js';
const N=5000;
// SPEAR: pole spans [0.15+(L-1.1)/2 - L/2 , ... ] ; bottom is constant
let below=0;
for(let i=0;i<N;i++){
  const v=weaponVariant(`s${i}`); const L=1.1*v.bladeLen;
  const bottom = 0.15+(L-1.1)*0.5 - L/2;
  const wrapY=[-0.28,-0.37,-0.46,-0.55];
  const n = wrapY.filter(y=>y+0.035 < bottom).length;   // torus outer edge fully below the pole
  below += n;
}
console.log('SPEAR: pole bottom y (constant) =', (0.15-0.55).toFixed(3), '| mean grip wraps entirely below the shaft:', (below/N).toFixed(2), 'of 4');

// DAGGER: _weaponGrip thong y vs the plan's own hard-coded thong y (-0.26), and pommel bottom
let dup=0, floatBelow=0;
for(let i=0;i<N;i++){
  const v=weaponVariant(`s${i}`); const len=0.2*v.gripLen;
  const pommelY = -len-0.03, pommelBottom = pommelY-0.045;
  if (v.thong) { const gy = -len-0.06; if (Math.abs(gy - (-0.26)) < 0.03) dup++; }
  if (-0.26 - 0.008 < pommelBottom) floatBelow++;         // plan thong sits below the pommel
}
console.log('DAGGER: hard-coded thong within 3cm of _weaponGrip\'s thong (doubled ring):', (100*dup/N).toFixed(1)+'%');
console.log('DAGGER: hard-coded thong hangs BELOW the pommel (detached):', (100*floatBelow/N).toFixed(1)+'%');

// DAGGER bevel vs the 4/9-gon cone
for (const sides of [4,9,11]) {
  const apo = Math.cos(Math.PI/sides);            // apothem factor
  // bevel inner corner distance from the blade axis
  const d = Math.hypot(0.028-0.008, 0.024-0.006);
  // cone radius at y: 0.05*(0.39-y)/0.4 ; contained while apo*r(y) >= d
  const yDetach = 0.39 - (d/(apo*0.05))*0.4;
  const frac = Math.max(0, (0.37 - yDetach) / 0.36);
  console.log(`DAGGER bevel: at seg=${sides} it leaves the blade above y=${yDetach.toFixed(3)} — ${(100*frac).toFixed(0)}% of its length floats free`);
}
