import { weaponVariant } from '../src/rendering/EntityForge.js';
const N = 5000;
let axeBitPast=0, axeBitBuried=0, hamGap=0, hamPierce=0, bandsHidden=0, langetBuried=0, spearWrapFloat=0;
let bowGapSum=0, bowGapMax=0;
for(let i=0;i<N;i++){
  const v = weaponVariant(`s${i}`);
  // AXE: head tip x = 0.13 + hH/2 ; bit x = 0.07 + hR
  const hR = 0.22*v.bladeWide, hH = 0.3*v.bladeLen;
  const tipX = 0.13 + hH/2, bitX = 0.07 + hR;
  if (bitX > tipX + 0.01) axeBitPast++;
  if (bitX < tipX - 0.03) axeBitBuried++;
  // WARHAMMER: shaft top = 0.95*hl ; head bottom = top - 0.10*gw ; top = 0.41+hl*0.5
  const hl = 0.78*v.bladeLen, top = 0.41 + hl*0.5;
  const shaftTop = 0.95*hl, headBot = top - 0.10*v.guardWide;
  if (headBot > shaftTop) hamGap++;
  if (shaftTop > top + 0.10*v.guardWide) hamPierce++;
  if (0.10 >= 0.10*v.guardWide) {} // band radius vs head half-height
  if (0.10 < 0.10*v.guardWide) bandsHidden++;
  // SWORD langets at |x|=0.045 half-w 0.01 vs blade half W/2=0.045*bladeWide
  if (0.055 <= 0.045*v.bladeWide) langetBuried++;
  // BOW: last limb segment top vs nock
  const limbLen = 0.24*v.bladeLen, curve = 0.18 + v.guardWide*0.22;
  const lastCentreY = 0.16 + 2*limbLen*0.92;
  const lastAng = curve + 2*curve*1.4;              // 3.8*curve
  const limbTopY = lastCentreY + Math.cos(lastAng)*limbLen/2;
  const nockY = 0.16 + 3*limbLen*0.92;
  const gap = nockY - limbTopY;
  bowGapSum += gap; bowGapMax = Math.max(bowGapMax, gap);
}
const pct=(n)=>`${(100*n/N).toFixed(1)}%`;
console.log('axe honed bit lands PAST the head tip (>1cm) :', pct(axeBitPast));
console.log('axe honed bit BURIED inside the head (>3cm)  :', pct(axeBitBuried));
console.log('warhammer head FLOATS off the haft           :', pct(hamGap));
console.log('warhammer haft PIERCES through the head top  :', pct(hamPierce));
console.log('warhammer bands fully INSIDE the head        :', pct(bandsHidden));
console.log('sword langets fully BURIED in the blade      :', pct(langetBuried));
console.log('bow limb-tip -> nock gap  mean/max (units)   :', (bowGapSum/N).toFixed(3), '/', bowGapMax.toFixed(3));
// variant field distribution sanity (trap #3)
const cnt={guard:[0,0,0,0],pommel:[0,0,0],wraps:{},fuller:0,langets:0,chip:0,thong:0};
for(let i=0;i<N;i++){const v=weaponVariant(`s${i}`);cnt.guard[v.guardStyle]++;cnt.pommel[v.pommelStyle]++;cnt.wraps[v.wraps]=(cnt.wraps[v.wraps]||0)+1;if(v.fuller)cnt.fuller++;if(v.langets)cnt.langets++;if(v.chip)cnt.chip++;if(v.thong)cnt.thong++;}
console.log('guardStyle', cnt.guard, 'pommelStyle', cnt.pommel, 'wraps', cnt.wraps);
console.log('fuller',pct(cnt.fuller),'langets',pct(cnt.langets),'chip',pct(cnt.chip),'thong',pct(cnt.thong));
