/* Gentle floating plants: shared collision rules for plain and flowering pads. */
(()=>{
  'use strict';
  const GAP=5;
  const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
  function contain(body,w,h){
    const edge=body.radius+3;
    if(body.x<edge){body.x=edge;body.vx=Math.abs(body.vx)}
    if(body.x>w-edge){body.x=w-edge;body.vx=-Math.abs(body.vx)}
    if(body.y<edge){body.y=edge;body.vy=Math.abs(body.vy)}
    if(body.y>h-edge){body.y=h-edge;body.vy=-Math.abs(body.vy)}
  }
  function separate(bodies,w,h){
    // Several passes settle groups and plants against the bank, including on resize.
    for(let pass=0;pass<32;pass++){
      let overlap=0;
      for(let i=0;i<bodies.length;i++)for(let j=i+1;j<bodies.length;j++){
        const a=bodies[i],b=bodies[j],dx=b.x-a.x,dy=b.y-a.y;
        const distance=Math.hypot(dx,dy),space=a.radius+b.radius+GAP;
        if(distance>=space)continue;
        const angle=(i*2.4+j)*2.39996;
        const nx=distance>1e-6?dx/distance:Math.cos(angle),ny=distance>1e-6?dy/distance:Math.sin(angle);
        const push=(space-distance+.001)/2;overlap=Math.max(overlap,space-distance);
        a.x-=nx*push;a.y-=ny*push;b.x+=nx*push;b.y+=ny*push;
        // Reflect only the component moving into the other plant; keep sideways drift.
        const av=a.vx*nx+a.vy*ny,bv=b.vx*nx+b.vy*ny;
        if(av>0){a.vx-=2*av*nx;a.vy-=2*av*ny}
        if(bv<0){b.vx-=2*bv*nx;b.vy-=2*bv*ny}
      }
      for(const body of bodies)contain(body,w,h);
      if(overlap<.01)break;
    }
  }
  function resize(previous,definitions,w,h,oldW=w,oldH=h){
    const scale=clamp(Math.min(w,h)/700,.65,1.35);
    const bodies=definitions.map((pad,i)=>{
      const r=Math.min(w,h)*pad.r,old=previous[i],angle=pad.phase+1.1,speed=(4+i%3)*scale;
      // Flowers are offset from the pad centre and can extend beyond small leaves.
      const radius=Math.max(r*1.03,pad.flower?21+r*.19:0);
      const body={x:old?old.x*w/oldW:pad.x*w,y:old?old.y*h/oldH:pad.y*h,
        vx:old?old.vx:Math.cos(angle)*speed,vy:old?old.vy:Math.sin(angle)*speed,radius,phase:pad.phase};
      contain(body,w,h);return body;
    });
    separate(bodies,w,h);return bodies;
  }
  function update(bodies,dt,time,w,h){
    // Small steps keep contact stable at low frame rates too.
    const steps=Math.max(1,Math.ceil(dt/(1/60))),step=dt/steps;
    for(let n=0;n<steps;n++){
      for(const body of bodies){
        const turn=Math.sin((time-dt+step*(n+1))*.16+body.phase)*.035*step;
        const c=Math.cos(turn),s=Math.sin(turn),vx=body.vx;
        body.vx=vx*c-body.vy*s;body.vy=vx*s+body.vy*c;
        body.x+=body.vx*step;body.y+=body.vy*step;contain(body,w,h);
      }
      separate(bodies,w,h);
    }
  }
  const api={GAP,resize,update};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else globalThis.PondPlants=api;
})();
