(()=>{'use strict';
const Life=HexLife,canvas=document.querySelector('#meadow'),ctx=canvas.getContext('2d'),$=s=>document.querySelector(s);
let state=Life.create(),selected='sprout',paused=false,showRanges=false,W=1000,H=550,S=30,zoom=1,pan={x:0,y:0},hover=null,last=0,pointer=null,noteUntil=0;
let night=false;try{night=localStorage.getItem('spriggan.hex.moonlight')==='true'}catch{}
const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
const tiles=[];for(let q=-Life.SIZE;q<=Life.SIZE;q++)for(let r=-Life.SIZE;r<=Life.SIZE;r++)tiles.push({q,r});tiles.sort((a,b)=>a.q+a.r-b.q-b.r||a.q-b.q);
const hash=(q,r,n=0)=>{const x=Math.sin(q*127.1+r*311.7+n*43.3)*43758.5453;return x-Math.floor(x)};
function poly(points,fill,stroke=null,width=1){ctx.beginPath();points.forEach((p,i)=>i?ctx.lineTo(...p):ctx.moveTo(...p));ctx.closePath();if(fill){ctx.fillStyle=fill;ctx.fill()}if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=width;ctx.stroke()}}
function line(points,color,width=1){ctx.beginPath();points.forEach((p,i)=>i?ctx.lineTo(...p):ctx.moveTo(...p));ctx.strokeStyle=color;ctx.lineWidth=width;ctx.lineCap='round';ctx.lineJoin='round';ctx.stroke()}
function ellipse(x,y,rx,ry,color){ctx.beginPath();ctx.ellipse(x,y,Math.max(.1,rx),Math.max(.1,ry),0,0,Math.PI*2);ctx.fillStyle=color;ctx.fill()}
function rect(x,y,w,h,color){ctx.fillStyle=color;ctx.fillRect(x,y,w,h)}
function text(value,x,y,size,color,font='Georgia'){ctx.fillStyle=color;ctx.font=`${size}px ${font}`;ctx.textAlign='center';ctx.fillText(value,x,y)}
function project(q,r,z=0){return{x:W/2+pan.x+(q-r)*1.5*S*zoom,y:H*.52+pan.y+(q+r)*.8660254*S*.6*zoom-(z+9)*zoom}}
function vertices(p,scale=1){return Array.from({length:6},(_,i)=>[p.x+Math.cos(i*Math.PI/3)*S*zoom*scale,p.y+Math.sin(i*Math.PI/3)*S*.6*zoom*scale])}
function at(q,r,draw,extra=0){const p=project(q,r);ctx.save();ctx.translate(p.x,p.y-extra);const scale=(S/30)*zoom;ctx.scale(scale,scale);draw();ctx.restore()}
function shadow(x,y,rx=15,ry=6){ellipse(x,y,rx,ry,'#425d4924')}
function tile(t){
 const p=project(t.q,t.r),v=vertices(p,.984),edge=Math.abs(t.q)===Life.SIZE||Math.abs(t.r)===Life.SIZE,depth=(edge?25:13)*zoom*Math.max(.5,S/30);
 poly([v[0],v[1],[v[1][0],v[1][1]+depth],[v[0][0],v[0][1]+depth]],'#b1bc95');
 poly([v[1],v[2],[v[2][0],v[2][1]+depth],[v[1][0],v[1][1]+depth]],'#96ab85');
 poly([v[2],v[3],[v[3][0],v[3][1]+depth],[v[2][0],v[2][1]+depth]],'#859f7e');
 const farm=Life.farm(t.q,t.r),guard=Life.tower(t.q,t.r),colors=['#b9ce9e','#b1c896','#c1d2a4','#b6cb9c','#bcd0a2'];
 poly(v,Life.river(t.q,t.r)?'#83b7b0':farm?((t.q+t.r)%2?'#dfca91':'#e7d49e'):guard?'#d7d3af':colors[Math.floor(hash(t.q,t.r)*colors.length)],'#e1e9c15e',.8);
 if(edge){line([[v[1][0],v[1][1]+depth*.7],[v[2][0],v[2][1]+depth*.7]],'#778e6c40',1);if(hash(t.q,t.r,5)>.6)ellipse(p.x,p.y+depth+1,2.5*zoom,1.8*zoom,'#8da17c')}
 if(Life.river(t.q,t.r)){
  for(let i=0;i<3;i++){const drift=reduced?0:Math.sin(state.time*.7+t.q+i)*S*.09;const x=p.x+drift+(i-1)*S*.3*zoom,y=p.y+(i-1)*S*.17*zoom;line([[x-S*.12*zoom,y],[x+S*.12*zoom,y]],'#d9f2df75',1*zoom)}
 }
 if(!farm&&!guard&&!Life.river(t.q,t.r)){
  for(let i=0;i<3;i++){const x=p.x+(hash(t.q,t.r,i+2)-.5)*S*zoom*1.3,y=p.y+(hash(t.q,t.r,i+6)-.5)*S*zoom*.6;line([[x-2*zoom,y],[x,y-3*zoom],[x+zoom,y]],'#95ae7a85',.8)}
  if(hash(t.q,t.r,9)>.72){const x=p.x+S*.28*zoom,y=p.y-S*.15*zoom;ellipse(x,y,2.3*zoom,1.4*zoom,'#f8f3d3');ellipse(x,y,1*zoom,.8*zoom,'#d4b967')}
 }
}
function bridge(q,r){at(q,r,()=>{for(let y=-16;y<=16;y+=4){poly([[-18,y-2],[18,y-2],[18,y+1],[-18,y+1]],'#c8b590','#847d6155')}line([[-19,-17],[-19,17]],'#eee0b9',2);line([[19,-17],[19,17]],'#eee0b9',2)})}
function tree(q,r,kind){at(q,r,()=>{
 const fit=Math.min(1,(S/30)/(S/30));ctx.scale(fit,fit);
 shadow(0,2,14,6);rect(-2,-23,4,24,'#9e9575');
 if(kind<.45){poly([[-17,-17],[0,-53],[17,-17]],'#7b9d7e');poly([[-14,-29],[0,-62],[14,-29]],'#95b391');poly([[0,-62],[14,-29],[0,-33]],'#819f81');}
 else{ellipse(0,-32,20,23,'#91ad83');ellipse(-11,-26,12,13,'#9ab78b');ellipse(9,-33,12,17,'#809e76');ellipse(-5,-43,12,11,'#a9c097');ellipse(2,-34,4,5,'#c0cc9950')}
 })}
function crops(q,r){at(q,r,()=>{
 for(let y=-8;y<=7;y+=7){line([[-17,y],[17,y+5]],'#ac9a6780',3);for(let x=-12;x<=13;x+=9){const yy=y+(x+17)*.14;ellipse(x,yy,3.2,2,'#d6a367');line([[x,yy],[x-3,yy-5],[x,yy-2],[x+3,yy-6]],'#7b9859',2)}}
 })}
function barn(){at(0,0,()=>{
 shadow(0,7,51,18);
 poly([[-33,-2],[6,17],[36,0],[-3,-19]],'#c2b783');
 poly([[-31,-4],[6,13],[6,-26],[-31,-43]],'#d8b598','#b69d8160');
 poly([[6,13],[34,-3],[34,-42],[6,-26]],'#f2dfb6','#b69d8160');
 for(let i=0;i<5;i++)line([[-28,-10-i*6],[3,4-i*6]],'#bfa08360',1);
 poly([[6,-26],[34,-42],[21,-63]],'#f1dfba');
 poly([[-38,-44],[4,-24],[21,-63],[-22,-81]],'#91a497');
 poly([[21,-63],[4,-24],[40,-44]],'#69877b');
 line([[-22,-81],[21,-63],[40,-44]],'#c5cfb7',2.5);
 for(let i=1;i<5;i++){const f=i/5;line([[-38+42*f,-44+20*f],[-22+43*f,-81+18*f]],'#6a887d6b',1)}
 poly([[14,8],[26,1],[26,-20],[14,-13]],'#8a9170');line([[20,4],[20,-16]],'#657c6155',1);ellipse(23,-6,1,1,'#eed496');
 poly([[-19,-20],[-8,-15],[-8,-29],[-19,-34]],'#6e9489');line([[-13.5,-17],[-13.5,-31]],'#ecddb5',1.5);line([[-19,-27],[-8,-22]],'#ecddb5',1.5);
 ellipse(21,-42,4,4.7,'#7a9681');ellipse(21,-42,2.3,3,'#d2dcb5');
 rect(-14,-78,8,15,'#ceba9a');poly([[-16,-80],[-6,-80],[-3,-76],[-13,-76]],'#f0dec1');
 ellipse(-8,-95,5,4,'#f6f7e3a0');ellipse(-5,-105,7,4,'#f6f7e375');
 // Carrot baskets, little hay bales, and the farm sign.
 ellipse(-36,11,9,5,'#b8a270');rect(-44,4,16,7,'#c7b382');ellipse(-36,4,8,4,'#dec48a');for(let i=0;i<3;i++)line([[-41+i*5,6],[-41+i*5,12]],'#ac9864',1);
 ellipse(37,8,7,4,'#c5aa7b');for(let i=0;i<3;i++){ellipse(33+i*4,3,2,4,'#d99567');line([[33+i*4,0],[31+i*4,-3],[35+i*4,-4]],'#83995d',1.5)}
 rect(5,27,2,14,'#9d9974');poly([[-6,25],[18,25],[18,34],[-6,34]],'#f2e5bd','#b9b48b',.7);text('CARROTS',6,31.5,4.7,'#81916a','monospace');
 })}
const fenceEdges=[];{
 const edges=new Map();for(const t of tiles.filter(t=>Life.farm(t.q,t.r))){const x=(t.q-t.r)*1.5,y=(t.q+t.r)*.8660254;const v=Array.from({length:6},(_,i)=>[x+Math.cos(i*Math.PI/3),y+Math.sin(i*Math.PI/3)]);for(let i=0;i<6;i++){const a=v[i],b=v[(i+1)%6],key=[a.map(n=>n.toFixed(4)).join(','),b.map(n=>n.toFixed(4)).join(',')].sort().join('|');if(edges.has(key))edges.delete(key);else edges.set(key,{a,b})}}fenceEdges.push(...edges.values());
}
function fence(front){const scale=(S/30)*zoom;for(const edge of fenceEdges){if(((edge.a[1]+edge.b[1])>0)!==front)continue;const p=point=>({x:W/2+pan.x+point[0]*S*zoom,y:H*.52+pan.y+point[1]*S*.6*zoom-9*zoom});const a=p(edge.a),b=p(edge.b);line([[a.x,a.y-6*scale],[b.x,b.y-6*scale]],'#c4b48b',2.5*scale);line([[a.x,a.y-12*scale],[b.x,b.y-12*scale]],'#edddae',2.5*scale);line([[a.x,a.y],[a.x,a.y-17*scale]],'#b6a983',3*scale);ellipse(a.x,a.y-17*scale,2*scale,1.2*scale,'#f5e7be')}}
function tower(t){at(t.q,t.r,()=>{
 shadow(0,3,27,10);poly([[-22,0],[0,11],[22,0],[0,-11]],'#bfb794');
 poly([[-15,-2],[0,6],[0,-52],[-15,-60]],'#b6ad96');poly([[0,6],[15,-2],[15,-60],[0,-52]],'#cfc8ad');
 for(let i=0;i<5;i++){line([[-15,-10-i*9],[0,-2-i*9],[15,-10-i*9]],'#8c958160',1);line([[i%2?-8:-12,-16-i*9],[i%2?-8:-12,-10-i*9]],'#87917d50',1)}
 poly([[-23,-55],[0,-43],[23,-55],[0,-67]],'#dce0ba');poly([[-23,-55],[0,-43],[0,-51],[-23,-63]],'#b7b894');poly([[0,-43],[23,-55],[23,-63],[0,-51]],'#c9ccaa');
 // Guard: tiny cloak, round face, soft helmet and a visible bow.
 const colors=['#839e83','#92a9ad','#b69882','#9a9db1'],cape=colors[t.id];
 ellipse(0,-61,8,4,'#617a6240');poly([[-7,-58],[-5,-74],[5,-74],[8,-58]],cape);ellipse(0,-78,6.7,7.3,'#f0d3ad');ellipse(0,-82,8,5.8,cape);rect(-8,-83,16,3,cape);ellipse(6,-79,2,4,cape);const facing=Math.cos(t.aim)-Math.sin(t.aim)>0?-1:1;ellipse(-2*facing,-78,1,1.4,'#435449');ctx.save();ctx.scale(facing,1);
 line([[-5,-67],[-11,-66],[-13,-71]],'#eed4af',3);ctx.beginPath();ctx.ellipse(-14,-70,5,11,-.3,-1.4,1.4);ctx.strokeStyle='#967d5a';ctx.lineWidth=2;ctx.stroke();line([[-15,-80],[-11,-60]],'#efe1b1',.8);
 if(t.flash>0){line([[-16,-69],[-28,-66]],'#f9edb8',2);ellipse(-28,-66,2,1,'#fff7dc')}
 ctx.restore();
 for(const [x,y] of [[-19,-58],[0,-49],[19,-58]]){poly([[x-3,y],[x+3,y+3],[x+3,y-5],[x-3,y-8]],'#e1dfbd')}
 line([[15,-64],[15,-102]],'#889a7c',1.5);const sway=reduced?0:Math.sin(state.time*1.9+t.id)*2;poly([[15,-102],[33,-98+sway],[27,-91+sway],[15,-93]],cape);line([[18,-100],[18,-95]],'#e9e9cf',1);
 text(['I','II','III','IV'][t.id],7,-28,7,'#7c8e76');
 })}
function creature(c){at(c.q,c.r,()=>{
 const moving=!c.chew&&!paused&&!reduced,bob=moving?Math.abs(Math.sin(state.time*5+c.phase))*3:0,chew=c.chew?Math.sin(state.time*16)*1.5:0;
 shadow(0,1,12,5);if(c.type==='puddle'){ctx.save();ctx.globalAlpha=.55;ctx.strokeStyle='#e4fff2';ctx.lineWidth=1;ctx.beginPath();ctx.ellipse(0,1,17+Math.sin(state.time*2),6,0,0,Math.PI*2);ctx.stroke();ctx.restore()}ctx.translate(0,c.type==='puddle'?-bob*.35:-bob);
 const body=Life.TYPES[c.type].color;
 if(c.type==='mochi'){ellipse(-5,-21,3,10,body);ellipse(4,-22,3,11,body);ellipse(-5,-22,1.3,6,'#dbaba8');ellipse(4,-23,1.3,7,'#dbaba8')}
 ellipse(-7,0,4,2.5,body);ellipse(7,0,4,2.5,body);ellipse(0,-10+chew,c.type==='truffle'?13:12,c.type==='truffle'?12:11,c.hit>0?'#f8edcf':body);ellipse(-3,-14,6,5,'#fff8e62b');
 if(c.type==='puddle'){ellipse(-13,-9,5,3,'#80afbd');ellipse(13,-9,5,3,'#80afbd');line([[-7,-20],[-11,-25],[-7,-24],[0,-27],[7,-24],[11,-25],[7,-20]],'#b4ded7',2)}
 if(c.type==='sprout'){line([[0,-20],[0,-27]],'#6f9766',2);ctx.save();ctx.translate(0,-26);ctx.rotate(-.4);ellipse(-5,0,6,2.8,'#7ca970');ellipse(4,-2,5,2.6,'#8fb37a');ctx.restore()}
 if(c.type==='truffle'){ellipse(0,-20,16,7,'#b99a7d');ellipse(-4,-24,7,3,'#e6d1a9');ellipse(7,-21,3,2,'#ecdabc');ellipse(-9,-19,2,1.5,'#ecdabc')}
 ellipse(-4,-11,1.3,1.8,'#45594c');ellipse(4,-11,1.3,1.8,'#45594c');ellipse(-8,-7,2.5,1.2,'#dba79599');ellipse(8,-7,2.5,1.2,'#dba79599');
 line([[-1.5,-6],[0,-5],[1.5,-6]],'#707b60',.8);
 if(c.chew){poly([[8,-8],[17,-10],[12,-1]],'#e0a478');line([[16,-9],[20,-13],[17,-12],[17,-15]],'#86a16e',1.5);text('♥',0,-31,10,'#cfaa88')}
 else if(c.hp<c.maxHp)for(let i=0;i<c.maxHp;i++)ellipse((i-(c.maxHp-1)/2)*5,-36,1.6,1.6,i<c.hp?'#789663':'#78966333');
 })}
function torch(t){at(t.q,t.r,()=>{
 const flicker=reduced||paused?0:Math.sin(state.time*7+t.id*2)*.9+Math.sin(state.time*11+t.id)*.4;
 const x=8,y=-39;
 const glow=ctx.createRadialGradient(x,y-7,0,x,y-7,34+flicker*2);glow.addColorStop(0,'#ffc77385');glow.addColorStop(.4,'#f4b86235');glow.addColorStop(1,'#f4b86200');ellipse(x,y-7,34+flicker*2,34+flicker*2,glow);
 line([[x-3,y+11],[x,y+5],[x,y-1]],'#645640',3);line([[x,y+5],[x,y-1]],'#bd8c57',2);
 poly([[x-4,y],[x-5,y-6],[x-1+flicker,y-16],[x+1,y-8],[x+4,y-12+flicker],[x+5,y-4],[x+3,y]],'#eeb565');
 ellipse(x,y-4,2.6,5,'#ffe9a4');ellipse(x,y-2,1.3,2.7,'#fff5cf');
 })}
function arrow(a){
 const scale=(S/30)*zoom,start=project(a.from.q,a.from.r),end=project(a.to.q,a.to.r),p=Math.min(1,a.age/a.duration);
 const x=start.x+(end.x-start.x)*p,y=start.y-72*scale+(end.y-10*scale-start.y+72*scale)*p-Math.sin(p*Math.PI)*27*scale;
 const dx=end.x-start.x,dy=end.y-start.y+62*scale-Math.cos(p*Math.PI)*Math.PI*27*scale;
 ctx.save();ctx.translate(x,y);ctx.rotate(Math.atan2(dy,dx));line([[-12*scale,0],[4*scale,0]],'#7f7455',1.3*scale);poly([[7*scale,0],[1*scale,-2.7*scale],[1*scale,2.7*scale]],'#f7eccb');line([[-10*scale,0],[-14*scale,-3*scale]],'#f9f3d8',1.7*scale);line([[-10*scale,0],[-14*scale,3*scale]],'#f9f3d8',1.7*scale);ctx.restore();
}
function effect(p){const pos=project(p.q,p.r),scale=(S/30)*zoom;ctx.save();ctx.globalAlpha=1-p.age/.7;for(let i=0;i<6;i++){const a=i*Math.PI/3+p.seed;ellipse(pos.x+Math.cos(a)*p.age*25*scale,pos.y-10*scale+Math.sin(a)*p.age*18*scale-p.age*12*scale,(3-p.age*2)*scale,(3-p.age*2)*scale,p.color)}ctx.restore()}
function backdrop(){
 const g=ctx.createLinearGradient(0,0,0,H);g.addColorStop(0,night?'#142b3e':'#64856a');g.addColorStop(.6,night?'#27475b':'#91a47a');g.addColorStop(1,night?'#122d36':'#516f56');rect(0,0,W,H,g);
 ctx.strokeStyle='#aebfa015';ctx.lineWidth=1;for(let i=0;i<3;i++){ctx.beginPath();ctx.ellipse(W*.5,H*.68+i*13,W*.42+i*31,H*.23+i*10,0,0,7);ctx.stroke()}
 ellipse(W*.82,H*.19,24,24,'#f8f1ce77');if(night)ellipse(W*.83,H*.18,18,18,'#193747');
 // Soft cloud clusters drift beyond the island.
 for(let i=0;i<4;i++){const x=W*(.08+i*.29)+Math.sin((reduced?0:state.time)*.025+i)*12,y=H*(.23+(i%2)*.48);ellipse(x,y,31,8,'#d9edcd12');ellipse(x-11,y-5,15,8,'#d9edcd12');ellipse(x+8,y-4,17,9,'#d9edcd12')}
 for(let i=0;i<18;i++){const x=(hash(i,2)*W+Math.sin((reduced?0:state.time)*.1+i)*14),y=hash(i,5)*H+Math.cos((reduced?0:state.time)*.12+i)*10;ellipse(x,y,1.1,1.1,'#e8e7b03d')}
 const center=project(0,0);ctx.save();ctx.filter='blur(15px)';ellipse(center.x,center.y+37*zoom,S*zoom*13.5,S*zoom*4.2,'#70896526');ctx.restore();
}
function render(){
 ctx.clearRect(0,0,W,H);backdrop();tiles.forEach(tile);for(const t of tiles)if(Life.bridge(t.q,t.r))bridge(t.q,t.r);
 if(showRanges){ctx.save();ctx.setLineDash([4,5]);for(const t of state.towers){const p=project(t.q,t.r);ctx.beginPath();ctx.ellipse(p.x,p.y,4.4*Math.sqrt(3)*S*zoom,4.4*Math.sqrt(3)*S*.6*zoom,0,0,7);ctx.strokeStyle='#6d877354';ctx.lineWidth=1;ctx.stroke()}ctx.restore()}
 for(const tile of tiles)if(Life.farm(tile.q,tile.r)&&(tile.q!==0||tile.r!==0))crops(tile.q,tile.r);
 fence(false);
 if(hover){const p=project(hover.q,hover.r),valid=Life.habitat(hover.q,hover.r,selected);poly(vertices(p,.9),valid?'#f4efd270':'#dab3a580',valid?'#f8f5d5':'#b48c80',1.8);if(valid){ctx.save();ctx.globalAlpha=.5;creature({...hover,type:selected,hp:99,maxHp:0,phase:0,chew:0,hit:0});ctx.restore()}}
 const objects=[{q:0,r:0,draw:barn},...state.towers.map(t=>({...t,draw:()=>tower(t)})),...state.creatures.map(c=>({...c,draw:()=>creature(c)}))];
 for(const tile of tiles){if(Life.farm(tile.q,tile.r)||Life.tower(tile.q,tile.r)||Life.river(tile.q,tile.r))continue;const value=hash(tile.q,tile.r,12);if((Math.abs(tile.q)===Life.SIZE||Math.abs(tile.r)===Life.SIZE)&&value>.57&&!state.towers.some(t=>Life.distance(tile,t)<1.5))objects.push({...tile,draw:()=>tree(tile.q,tile.r,value)})}
 objects.sort((a,b)=>(a.q+a.r)-(b.q+b.r));objects.forEach(o=>o.draw());fence(true);state.arrows.forEach(arrow);state.effects.forEach(effect);
 if(night){rect(0,0,W,H,'#12285845');for(const t of state.towers)torch(t)}
 else{const sunlight=ctx.createRadialGradient(W*.82,H*.12,0,W*.65,H*.2,W*.8);sunlight.addColorStop(0,'#ffe8a338');sunlight.addColorStop(.5,'#ffe9b014');sunlight.addColorStop(1,'#ffe9b000');rect(0,0,W,H,sunlight)}

}
function resize(){const r=canvas.getBoundingClientRect(),dpr=Math.min(devicePixelRatio||1,2);W=r.width;H=r.height;S=Math.min(W/(W<600?30:46),Math.max(12,(H-180)/17),42);canvas.width=Math.round(W*dpr);canvas.height=Math.round(H*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);render()}
function note(message){$('#map-note').textContent=message;noteUntil=performance.now()+4200}
function ui(){ $('#visitors').textContent=state.creatures.length;$('#shooed').textContent=state.shooed;$('#snacks').textContent=state.snacks;$('#crowd').disabled=state.creatures.length>=Life.LIMIT;$('#zoom-in').disabled=zoom>=2.3;$('#zoom-out').disabled=zoom<=.85;if(performance.now()>noteUntil)$('#map-note').textContent=paused?'The meadow is resting. Resume whenever you like.':`Tap a ${Life.TYPES[selected].aquatic?'river':'grass'} tile to invite ${Life.TYPES[selected].name}.`}
function invite(q,r){const result=Life.spawn(state,q,r,selected);note(result.ok?`${Life.TYPES[selected].name} is off to find a snack.`:result.reason);ui();render();return result}
function crowd(count=3){const options=tiles.filter(t=>Life.habitat(t.q,t.r,selected));for(let i=0;i<count;i++){const tile=options[Math.floor(Math.random()*options.length)];Life.spawn(state,tile.q,tile.r,selected)}note('A little company for the carrot patch.');ui();render()}
function point(event){const r=canvas.getBoundingClientRect();return{x:event.clientX-r.left,y:event.clientY-r.top}}
function tileAt(p){for(const t of tiles){const c=project(t.q,t.r),x=Math.abs(p.x-c.x)/(S*zoom),y=Math.abs(p.y-c.y)/(S*.6*zoom);if(x<=1&&y<=.8660254&&.8660254*x+.5*y<=.8660254)return t}return null}
canvas.addEventListener('pointerdown',e=>{if(!e.isPrimary)return;const p=point(e);pointer={id:e.pointerId,start:p,last:p,moved:false};canvas.setPointerCapture(e.pointerId);canvas.focus({preventScroll:true})});
canvas.addEventListener('pointermove',e=>{const p=point(e);if(pointer&&pointer.id===e.pointerId){if(Math.hypot(p.x-pointer.start.x,p.y-pointer.start.y)>6)pointer.moved=true;if(pointer.moved){pan.x=Math.max(-W,Math.min(W,pan.x+p.x-pointer.last.x));pan.y=Math.max(-H*.6,Math.min(H*.6,pan.y+p.y-pointer.last.y));hover=null;canvas.style.cursor='grabbing'}pointer.last=p}else hover=tileAt(p);render()});
canvas.addEventListener('pointerup',e=>{if(!pointer||pointer.id!==e.pointerId)return;const moved=pointer.moved;pointer=null;canvas.style.cursor='crosshair';if(!moved){hover=tileAt(point(e));if(hover)invite(hover.q,hover.r);else note('Tap one of the hex tiles to invite a friend.')}if(canvas.hasPointerCapture(e.pointerId))canvas.releasePointerCapture(e.pointerId)});
canvas.addEventListener('pointercancel',()=>{pointer=null;canvas.style.cursor='crosshair'});canvas.addEventListener('pointerleave',()=>{if(!pointer){hover=null;render()}});
canvas.addEventListener('keydown',e=>{const directions={ArrowUp:[-1,0],ArrowDown:[1,0],ArrowLeft:[0,1],ArrowRight:[0,-1]};if(directions[e.key]){e.preventDefault();const [q,r]=directions[e.key];hover||={q:3,r:0};hover={q:Math.max(-Life.SIZE,Math.min(Life.SIZE,hover.q+q)),r:Math.max(-Life.SIZE,Math.min(Life.SIZE,hover.r+r))};render()}else if(e.key==='Enter'||e.key===' '){e.preventDefault();if(!e.repeat){hover||={q:3,r:0};invite(hover.q,hover.r)}}});
const icons={puddle:'<path d="m15 27-7-6 3 13m34-7 7-6-3 13M20 20l-3-8 8 5 5-8 5 8 8-5-3 8" fill="#a8d9d1" stroke="#80afbd"/>',sprout:'<path d="M30 22v-9m0 1c-12 0-13-9-13-9 10 0 13 6 13 9Zm0 0c0-9 12-11 12-11 0 10-12 11-12 11" fill="#83a76e" stroke="#6e9364"/>',mochi:'<ellipse cx="22" cy="18" rx="5" ry="13" fill="#eccbc4"/><ellipse cx="38" cy="16" rx="5" ry="14" fill="#eccbc4"/><path d="M22 11v10m16-12v11" stroke="#d5a6a0" stroke-width="2"/>',truffle:'<ellipse cx="30" cy="23" rx="23" ry="12" fill="#b99a7d"/><ellipse cx="24" cy="18" rx="8" ry="4" fill="#e6d1a9"/><ellipse cx="42" cy="24" rx="4" ry="3" fill="#e6d1a9"/>'};
for(const el of document.querySelectorAll('[data-icon]')){const type=el.dataset.icon;el.innerHTML=`<svg viewBox="0 0 60 60" aria-hidden="true"><ellipse cx="30" cy="49" rx="20" ry="5" fill="#71866420"/>${type==='mochi'?icons[type]:''}<ellipse cx="30" cy="35" rx="19" ry="17" fill="${Life.TYPES[type].color}"/>${type!=='mochi'?icons[type]:''}<g fill="#435949"><ellipse cx="24" cy="34" rx="1.7" ry="2.2"/><ellipse cx="36" cy="34" rx="1.7" ry="2.2"/></g><path d="m28 41 2 1 2-1" fill="none" stroke="#66745b" stroke-linecap="round"/><g fill="#dba79599"><ellipse cx="18" cy="40" rx="4" ry="1.8"/><ellipse cx="42" cy="40" rx="4" ry="1.8"/></g></svg>`}
for(const button of document.querySelectorAll('[data-creature]'))button.onclick=()=>{selected=button.dataset.creature;document.querySelectorAll('[data-creature]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));note(`${Life.TYPES[selected].name} is ready. Pick a ${Life.TYPES[selected].aquatic?'river':'grass'} tile.`);render()};
const controls=$('.hex-controls'),trigger=$('#toggle-controls'),panel=$('#hex-panel');
function setControls(open){trigger.setAttribute('aria-expanded',String(open));trigger.setAttribute('aria-label',`${open?'Close':'Open'} meadow controls`);controls.classList.toggle('is-open',open);panel.inert=!open}
trigger.onclick=()=>setControls(trigger.getAttribute('aria-expanded')!=='true');
document.addEventListener('click',event=>{if(!controls.contains(event.target))setControls(false)});
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&controls.classList.contains('is-open')){setControls(false);trigger.focus()}});
function syncLight(){document.body.dataset.night=String(night);$('#light-mode').setAttribute('aria-pressed',String(night));$('#light-mode').textContent=night?'☾ Moonlight':'☀ Daylight';render()}
$('#light-mode').onclick=()=>{night=!night;try{localStorage.setItem('spriggan.hex.moonlight',String(night))}catch{}syncLight()};syncLight();
$('#crowd').onclick=()=>crowd();$('#pause').onclick=()=>{paused=!paused;$('#pause').setAttribute('aria-pressed',String(paused));$('#pause').textContent=paused?'▶ Resume':'Ⅱ Pause';note(paused?'The meadow is resting.':'The carrot patrol is back on duty.');render()};$('#ranges').onclick=()=>{showRanges=!showRanges;$('#ranges').setAttribute('aria-pressed',String(showRanges));render()};$('#reset').onclick=()=>{state=Life.create();note('A fresh meadow. Invite someone new.');ui();render()};
$('#zoom-in').onclick=()=>{zoom=Math.min(2.3,zoom+.2);ui();render()};$('#zoom-out').onclick=()=>{zoom=Math.max(.85,zoom-.2);ui();render()};$('#recenter').onclick=()=>{zoom=1;pan={x:0,y:0};ui();render()};
function frame(now){requestAnimationFrame(frame);const dt=Math.min(.05,Math.max(0,(now-last)/1000));last=now;if(document.hidden)return;if(!paused)Life.step(state,dt);ui();render()}
document.addEventListener('visibilitychange',()=>{last=performance.now()});new ResizeObserver(resize).observe(canvas);resize();
// A short, mixed welcome party demonstrates the playground. Further visitors are user-invited.
for(const [q,r,type] of [[-5,-2,'sprout'],[5,2,'mochi'],[-2,4,'truffle'],[4,-1,'sprout'],[0,-4,'mochi'],[-5,-4,'puddle'],[5,4,'puddle']])Life.spawn(state,q,r,type);
ui();note('The first visitors have caught the scent of carrots.');requestAnimationFrame(frame);
if(globalThis.SprigganRuntime)SprigganRuntime.runBackground(dt=>Life.step(state,dt),ui,()=>paused);
})();
