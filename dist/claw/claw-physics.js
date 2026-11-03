import RAPIER from './vendor/rapier.mjs';
const L=globalThis.ClawLife;
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const smooth=t=>{t=clamp(t,0,1);return t*t*(3-2*t);};
const angles={frog:-.32,koi:-.5,chick:-.3,bunny:-.26,dumpling:-.4,cat:-.29,moonfox:-.08};
export function clawPose(s){return {x:(s.x-330)/100,y:(713-s.y)/100+.18-.61*clamp((407-s.y)/222,0,1),z:s.z??0};}
export function gripAngle(s){const close=s.phase==='grip'?smooth(s.elapsed/L.durations.grip):['up','carry'].includes(s.phase)?1:s.phase==='release'?1-smooth(s.elapsed/L.durations.release/.35):0;return -.88+((s.target?angles[s.target.type]??-.32:.12)+.88)*close;}
// The same finger centerlines drive the rendered steel and the moving colliders.
export function fingerPoints(s,i){const c=clawPose(s),a=gripAngle(s),yaw=i*Math.PI*2/3+Math.PI/3;return [[.015,-.025],[.22,-.26],[.17,-.48],[.04,-.59]].map(([z,y])=>{const yy=y*Math.cos(a)-z*Math.sin(a)-.18,zz=y*Math.sin(a)+z*Math.cos(a)+.16;return {x:c.x+zz*Math.sin(yaw),y:c.y+yy,z:c.z+zz*Math.cos(yaw)};});}
function between(a,b){const dx=b.x-a.x,dy=b.y-a.y,dz=b.z-a.z,len=Math.hypot(dx,dy,dz),dot=dy/len;if(dot<-.99999)return {x:1,y:0,z:0,w:0};const q={x:dz/len,y:0,z:-dx/len,w:1+dot},n=Math.hypot(q.x,q.z,q.w);return {x:q.x/n,y:0,z:q.z/n,w:q.w/n};}
export class ClawPhysics{
static async create(s){await RAPIER.init();return new ClawPhysics(s);}
constructor(s){this.world=new RAPIER.World({x:0,y:-9.81,z:0});this.world.timestep=1/60;this.bodies=new Map();this.joint=null;this.heldId=null;this.released=false;this.fingers=[];
const wall=(x,y,z,w,h,d)=>this.world.createCollider(RAPIER.ColliderDesc.cuboid(w,h,d).setTranslation(x,y,z).setFriction(.7));
// Leave a real opening under the prize chute on the left.
wall(.7,1.87,0,1.9,.1,1.4);wall(-1.95,1.87,.94,.75,.1,.46);wall(-1.95,1.87,-1.34,.75,.1,.06);
wall(-2.5,3.5,0,.08,1.6,1.4);wall(2.5,3.5,0,.08,1.6,1.4);wall(0,3.5,-1.4,2.5,1.6,.06);wall(0,3.5,1.4,2.5,1.6,.06);
// A low lip keeps uncaught toys from falling into the chute.
wall(-1.23,2.04,0,.04,.16,1.35);
this.anchor=this.world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(0,4.5,0));
for(let i=0;i<9;i++){const body=this.world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(0,6,0));const col=this.world.createCollider(RAPIER.ColliderDesc.capsule(.11,.032).setCollisionGroups(0x00020001).setFriction(.8),body);this.fingers.push({body,col});}
for(const t of s.toys)this.add(t);for(let i=0;i<90;i++)this.step(s,1/60);}
add(t){const x=(t.x-330)/100,z=-.75+(t.depth??0)*.7;const b=this.world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(x,2.8+(t.id%3)*.12,z).setLinearDamping(1.8).setAngularDamping(4).setCcdEnabled(true));const sizes={frog:[.35,.37,.28],bunny:[.31,.47,.28],chick:[.35,.39,.3],cat:[.33,.41,.29],koi:[.44,.27,.26],dumpling:[.4,.3,.26],moonfox:[.27,.34,.23]},[rx,ry,rz]=sizes[t.type];const points=[];for(let row=0;row<=8;row++){const lat=row/8*Math.PI;for(let j=0;j<12;j++){const a=j/12*Math.PI*2;points.push(Math.sin(lat)*Math.cos(a)*rx*1.12,Math.cos(lat)*ry*1.12,Math.sin(lat)*Math.sin(a)*rz*1.12);}}const desc=RAPIER.ColliderDesc.convexHull(new Float32Array(points));desc.setDensity(.4).setFriction(t.type==='moonfox'?.3:.65).setRestitution(.08).setCollisionGroups(0x00010003);this.world.createCollider(desc,b);this.bodies.set(t.id,b);}
target(s){const c=clawPose(s);return s.toys.map(t=>({t,p:this.bodies.get(t.id)?.translation()})).filter(({p})=>p&&Math.hypot(p.x-c.x,p.z-c.z)<.72).sort((a,b)=>b.p.y-a.p.y)[0]?.t||null;}
grab(s){const c=clawPose(s),desired={x:c.x,y:c.y-.57,z:c.z};const candidates=s.toys.map(t=>({t,b:this.bodies.get(t.id)})).filter(x=>x.b).map(x=>({...x,p:x.b.translation()})).filter(({t,p})=>Math.hypot(p.x-desired.x,p.z-desired.z)<(t.type==='moonfox'?.10:.22)&&Math.abs(p.y-desired.y)<(t.type==='moonfox'?.22:.30)).sort((a,b)=>Math.hypot(a.p.x-desired.x,a.p.z-desired.z)-Math.hypot(b.p.x-desired.x,b.p.z-desired.z));const match=candidates[0];if(!match)return null;
// Gentle assistance only after a centered grab. Rotation remains free to sway.
this.anchor.setTranslation(desired,true);this.anchor.setNextKinematicTranslation(desired);this.joint=this.world.createImpulseJoint(RAPIER.JointData.spherical({x:0,y:0,z:0},{x:0,y:0,z:0}),this.anchor,match.b,true);this.heldId=match.t.id;this.released=false;match.b.collider(0).setCollisionGroups(0x00010001);return match.t;}
step(s,dt){this.world.timestep=dt;const c=clawPose(s);this.anchor.setNextKinematicTranslation({x:c.x,y:c.y-.57,z:c.z});
if(s.phase==='release'&&s.elapsed>=L.durations.release*.25&&this.joint){this.world.removeImpulseJoint(this.joint,true);this.joint=null;this.released=true;const toy=this.bodies.get(this.heldId);toy?.setLinearDamping(.2);toy?.setLinvel({x:0,y:0,z:0},true);}
for(let i=0;i<3;i++){const pts=fingerPoints(s,i);for(let j=0;j<3;j++){const {body,col}=this.fingers[i*3+j],a=pts[j],b=pts[j+1],len=Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);col.setHalfHeight(len/2);body.setNextKinematicTranslation({x:(a.x+b.x)/2,y:(a.y+b.y)/2,z:(a.z+b.z)/2});body.setNextKinematicRotation(between(a,b));}}
const alive=new Set(s.toys.map(t=>t.id));if(s.held)alive.add(s.held.id);for(const [id,b]of this.bodies)if(!alive.has(id)){if(this.heldId===id){if(this.joint)this.world.removeImpulseJoint(this.joint,true);this.joint=null;this.heldId=null;}this.world.removeRigidBody(b);this.bodies.delete(id);}for(const t of s.toys)if(!this.bodies.has(t.id))this.add(t);
this.world.step();for(const t of [...s.toys,...(s.held?[s.held]:[])]){const b=this.bodies.get(t.id);if(!b)continue;const p=b.translation(),q=b.rotation();t.pose={x:p.x,y:p.y,z:p.z,q:{x:q.x,y:q.y,z:q.z,w:q.w}};if(t!==s.held){t.x=p.x*100+330;t.y=713-(p.y+.14)*100;}}
}
isMoving(){return [...this.bodies.values()].some(b=>!b.isSleeping());}
dispose(){this.world.free();}
}
