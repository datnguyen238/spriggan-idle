/* Shared canvas artwork for meadow visitors and their controller portraits. */
((root)=>{
  'use strict';
  const palettes={
    sprout:{body:'#88b180',shade:'#658e65',light:'#adc994',ink:'#304e40',blush:'#c6ae85'},
    mochi:{body:'#d7a3ad',shade:'#b97e91',light:'#e9bfbd',ink:'#594650',blush:'#c68d92'},
    truffle:{body:'#dfbf87',shade:'#bc985f',light:'#eed5a3',ink:'#594d3c',blush:'#cba579'},
    puddle:{body:'#80b7bd',shade:'#5b94a2',light:'#acd4cf',ink:'#304e54',blush:'#baacaa'},
  };
  const paths={
    sprout:[['M',-9.5,-1],['C',-13,-5,-12.2,-16,-7,-20.8],['C',-3,-25,4,-24,8,-20],['C',12,-15,12.4,-6,8.7,-1],['C',5,2,-5,2,-9.5,-1]],
    sproutShade:[['M',8,-20],['C',12,-15,12.4,-6,8.7,-1],['C',5,2,-5,2,-9.5,-1],['C',0,1,8,-6,8,-20]],
    leafLeft:[['M',0,-25],['C',-7,-24,-11,-28,-10,-32],['C',-4,-33,0,-29,0,-25]],
    leafRight:[['M',0,-26],['C',-1,-32,4,-35,9,-34],['C',9,-29,5,-26,0,-26]],
    mochi:[['M',-10,-2],['C',-13,-7,-12,-16,-6,-20],['C',-2,-23,5,-22,9,-17],['C',12,-12,12,-5,8,-1],['C',3,2,-6,2,-10,-2]],
    mochiShade:[['M',9,-17],['C',12,-12,12,-5,8,-1],['C',3,2,-6,2,-10,-2],['C',1,0,8,-6,9,-17]],
    floppyEar:[['M',2.7,-18],['C',1,-25,3,-34,7,-34],['C',12,-34,13,-30,10,-28],['C',7,-28,9,-22,8,-18]],
    earInside:[['M',5,-22],['C',4,-27,5,-32,7.5,-32],['C',10,-32,10.5,-30,8,-30],['C',6.5,-29,8,-24,6.5,-22]],
    cap:[['M',-16,-17.5],['C',-15,-24,-9,-29,0,-29],['C',9,-29,15,-24,16,-18],['C',13,-14.5,-11,-14.5,-16,-17.5]],
    capLight:[['M',-13,-20],['C',-10,-26,-4,-28,2,-27],['C',-4,-27,-9,-23,-13,-20]],
    tail:[['M',8,-5],['C',15,-5,17,-12,20,-10],['C',20,-3,16,1,8,-1]],
    gillLeft:[['M',-10,-16],['C',-16,-21,-19,-19,-15,-15],['C',-21,-15,-20,-11,-15,-11],['C',-18,-7,-14,-6,-10,-10]],
    gillRight:[['M',10,-16],['C',16,-21,19,-19,15,-15],['C',21,-15,20,-11,15,-11],['C',18,-7,14,-6,10,-10]],
    puddle:[['M',-12,-3],['C',-15,-8,-12,-18,-5,-20],['C',3,-24,13,-18,13,-9],['C',16,-1,5,2,-3,1],['C',-7,1,-10,0,-12,-3]],
    puddleShade:[['M',11,-16],['C',15,-11,14,-5,12,-2],['C',8,2,-2,2,-9,0],['C',3,1,10,-4,11,-16]],
    carrot:[['M',6,-8],['Q',10,-10,14,-7.5],['Q',13,-2,9,1],['Q',6,-3,6,-8]],
    carrotLeaf:[['M',10,-8],['Q',7,-15,11,-12],['Q',13,-16,13,-10],['Q',18,-13,14,-8]],
  };
  const tops={sprout:35,mochi:37,truffle:30,puddle:23};
  const ellipse=(ctx,x,y,rx,ry,color,angle=0)=>{
    ctx.beginPath();ctx.ellipse(x,y,rx,ry,angle,0,Math.PI*2);ctx.fillStyle=color;ctx.fill();
  };
  function shape(ctx,color,commands) {
    ctx.beginPath();
    for(const c of commands) {
      if(c[0]==='M')ctx.moveTo(c[1],c[2]);
      else if(c[0]==='C')ctx.bezierCurveTo(c[1],c[2],c[3],c[4],c[5],c[6]);
      else if(c[0]==='Q')ctx.quadraticCurveTo(c[1],c[2],c[3],c[4]);
    }
    ctx.closePath();ctx.fillStyle=color;ctx.fill();
  }
  function face(ctx,p,y,blink) {
    ctx.strokeStyle=p.ink;ctx.lineWidth=1.1;ctx.lineCap='round';
    for(const x of [-3.8,3.8]) {
      if(blink){ctx.beginPath();ctx.moveTo(x-1.1,y);ctx.lineTo(x+1.1,y);ctx.stroke();}
      else {ellipse(ctx,x,y,1.2,1.65,p.ink);ellipse(ctx,x-.3,y-.55,.35,.45,'#fff8e8');}
    }
    ellipse(ctx,-7,y+3.3,1.8,.85,p.blush);ellipse(ctx,7,y+3.3,1.8,.85,p.blush);
    ctx.beginPath();ctx.moveTo(-1.35,y+4.2);ctx.quadraticCurveTo(0,y+5.5,1.5,y+4.1);ctx.lineWidth=.8;ctx.stroke();
  }
  function draw(ctx,type,options={}) {
    type=palettes[type]?type:'sprout';
    const p=palettes[type],time=Number.isFinite(options.time)?options.time:0,phase=Number.isFinite(options.phase)?options.phase:0;
    const still=!!options.reducedMotion,chewing=!!options.chewing,moving=!!options.moving&&!chewing&&!still;
    // The simulation clock freezes on pause, keeping every part in the same pose.
    const stride=moving?Math.sin(time*7+phase):0,bob=moving?(1-Math.cos(time*7+phase))*.4:0;
    const chew=chewing&&!still?Math.sin(time*9+phase):0,hit=Number.isFinite(options.hit)?Math.max(0,options.hit):0;
    ctx.save();
    ellipse(ctx,0,1.6,type==='truffle'?12:10.5,type==='puddle'?3.2:3.5,'#29483d28');
    if(type==='puddle') {
      ctx.beginPath();ctx.ellipse(0,2,16+(still?0:Math.sin(time*2+phase)*.6),5,0,0,Math.PI*2);
      ctx.strokeStyle='#d2e9db99';ctx.lineWidth=.75;ctx.stroke();
    }
    ctx.save();ctx.translate(0,type==='puddle'?-bob*.3:-bob);
    ctx.scale(options.facing===-1?-1:1,1);
    // One transform moves the face, ears, leaves and cap with the body while eating.
    ctx.scale(1+chew*.012,1-chew*.018);
    if(type==='puddle') {
      shape(ctx,p.shade,paths.tail);shape(ctx,'#add1cd',paths.gillLeft);shape(ctx,'#add1cd',paths.gillRight);
    } else if(type==='mochi') {
      ellipse(ctx,-5.2,-27,3.6,9.5,p.body,-.17);ellipse(ctx,-5.2,-27,1.35,6.2,p.shade,-.17);
      shape(ctx,p.body,paths.floppyEar);shape(ctx,p.shade,paths.earInside);
    }
    ellipse(ctx,-6.5,-.2-Math.max(0,stride)*.8,3.8,2.25,p.shade);
    ellipse(ctx,6.5,-.2-Math.max(0,-stride)*.8,3.8,2.25,p.shade);
    if(type==='truffle') {
      ellipse(ctx,0,-10,10.7,11.1,hit>0?'#f4dfb7':p.body);
      ellipse(ctx,-4,-12,3.2,5.5,p.light);
      ellipse(ctx,0,-16.8,15.8,3.3,'#785d49');shape(ctx,'#a47755',paths.cap);shape(ctx,'#bf976b',paths.capLight);
      ellipse(ctx,-6,-23.5,3.1,1.8,'#e8d0a0',-.2);ellipse(ctx,5.5,-21.8,2.3,1.5,'#e8d0a0',.2);
      ellipse(ctx,10,-18.8,1.5,1,'#d9b88b');
    } else {
      shape(ctx,hit>0?'#f4e7c8':p.body,paths[type]);shape(ctx,p.shade,paths[type+'Shade']);
      ellipse(ctx,-4,-15,2.8,3.7,p.light,-.3);
      if(type==='sprout') {
        ctx.beginPath();ctx.moveTo(0,-21);ctx.quadraticCurveTo(1,-25,0,-28);ctx.strokeStyle='#537a55';ctx.lineWidth=1.5;ctx.stroke();
        shape(ctx,'#557f55',paths.leafLeft);shape(ctx,'#88ae69',paths.leafRight);
      }
    }
    face(ctx,p,type==='puddle'?-10.3:-10.8,!still&&(time+phase)%6.2>6.05);
    if(chewing) {
      shape(ctx,'#bc8e5f',paths.carrot);shape(ctx,'#7f9c63',paths.carrotLeaf);
      ellipse(ctx,6,-5,2.6,2.5,p.body);ellipse(ctx,12,-4.5,2.4,2.4,p.body);
    }
    ctx.restore();
    if(options.status!==false&&Number.isFinite(options.hp)&&options.hp<options.maxHp) {
      for(let i=0;i<options.maxHp;i++)ellipse(ctx,(i-(options.maxHp-1)/2)*4.5,-tops[type]-5,1.35,1.35,
        i<options.hp?(options.night?'#ead5a2':'#426445'):(options.night?'#ead5a244':'#42644544'));
    }
    ctx.restore();
  }
  function portrait(canvas,type,dpr=1) {
    const ratio=Math.min(2,Math.max(1,Number.isFinite(dpr)?dpr:1)),size=Math.round(38*ratio);
    canvas.width=size;canvas.height=size;
    const ctx=canvas.getContext('2d');if(!ctx)return;
    ctx.setTransform(size/48,0,0,size/48,0,0);ctx.translate(24,40);
    draw(ctx,type,{reducedMotion:true,status:false});
  }
  const api={draw,portrait};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  else root.HexCreatures=api;
})(globalThis);
