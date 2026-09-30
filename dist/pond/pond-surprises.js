/* Temporary groups of visitors with independently timed, randomized routes. */
(()=>{
  const clamp=v=>Math.max(0,Math.min(1,v));
  const counts={frog:4,dragonfly:6,leaf:12,petals:32};
  function create(kind,pads,random=Math.random){
    const range=(a,b)=>a+(b-a)*random(),pick=items=>items[Math.floor(random()*items.length)];
    const duration=kind==='frog'?65:kind==='dragonfly'?75:70;
    const edge=()=>{const side=Math.floor(random()*4),v=range(.1,.9);return side===0?{x:-.04,y:v}:side===1?{x:1.04,y:v}:side===2?{x:v,y:-.05}:{x:v,y:1.05}};
    const firstPad=Math.floor(random()*pads.length);
    const actors=Array.from({length:counts[kind]},(_,i)=>{
      const delay=range(0,5),life=duration-delay,phase=range(0,Math.PI*2),scale=range(.8,1.2);
      if(kind==='leaf'||kind==='petals'){
        const start=edge(),end={x:1-start.x,y:1-start.y};
        return{delay,life,phase,scale,points:[start,{x:range(.05,.95),y:range(.1,.9)},{x:range(.05,.95),y:range(.1,.9)},end]};
      }
      let pad=(firstPad+i)%pads.length,at=3;
      const route=[{at:0,point:edge()},{at,point:{pad}}];
      while(at<life-13){
        at+=range(3,6);route.push({at,point:{pad}});
        const next=pads.map((p,j)=>({j,d:(p.x-pads[pad].x)**2+(p.y-pads[pad].y)**2})).filter(p=>p.j!==pad).sort((a,b)=>a.d-b.d).slice(0,4);
        if(!next.length)break;
        pad=pick(next).j;at+=kind==='frog'?range(1.2,1.8):range(2.8,4.2);route.push({at,point:{pad}});
      }
      route.push({at:life,point:edge()});return{delay,life,phase,scale,route};
    });
    return{kind,age:0,duration,actors};
  }
  function pose(event,actor,pads,w,h){
    const age=event.age-actor.delay;
    if(age<0||age>actor.life)return null;
    const fade=Math.min(1,age/2,(actor.life-age)/2),p=clamp(age/actor.life);
    if(actor.points){
      const [a,b,c,d]=actor.points,q=1-p;
      return{x:w*(q*q*q*a.x+3*q*q*p*b.x+3*q*p*p*c.x+p*p*p*d.x)+Math.sin(age*.45+actor.phase)*14,
        y:h*(q*q*q*a.y+3*q*q*p*b.y+3*q*p*p*c.y+p*p*p*d.y)+Math.sin(age*.3+actor.phase)*9,
        angle:actor.phase+age*.16,fade,flying:true};
    }
    let segment=1;while(segment<actor.route.length-1&&age>actor.route[segment].at)segment++;
    const a=actor.route[segment-1],b=actor.route[segment],u=clamp((age-a.at)/(b.at-a.at));
    const point=p=>p.pad===undefined?{x:p.x*w,y:p.y*h}:pads[p.pad];
    const from=point(a.point),to=point(b.point),moving=a.point.pad===undefined||a.point.pad!==b.point.pad;
    const eased=u*u*(3-2*u),arc=moving?Math.sin(u*Math.PI):0;
    return{x:from.x+(to.x-from.x)*eased+(event.kind==='dragonfly'?Math.sin(u*Math.PI*2+actor.phase)*arc*22:0),
      y:from.y+(to.y-from.y)*eased-arc*(event.kind==='frog'?Math.min(65,h*.08):25),
      angle:moving?Math.atan2(to.y-from.y,to.x-from.x)+Math.PI/2:actor.phase*.15,fade,flying:moving};
  }
  const api={create,pose,counts};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else globalThis.PondSurprises=api;
})();
