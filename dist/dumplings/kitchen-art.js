/* A quiet after-hours counter: lacquered wood, paper lanterns, and soft city neon. */
(()=>{'use strict';class KitchenArt{
 constructor(g){this.g=g;this.layout={};this.layers=new Map()}
 // Cache static art at the display density; each named layer replaces its old size.
 cached(name,box,key,paint,fixedScale=0){
  const g=this.g,m=g.getTransform(),density=fixedScale||Math.min(3,Math.ceil(Math.max(1,Math.hypot(m.a,m.b),Math.hypot(m.c,m.d))*4)/4);
  const signature=JSON.stringify([box,key,density]);let layer=this.layers.get(name);
  if(!layer||layer.signature!==signature){
   const [x,y,w,h]=box,canvas=document.createElement('canvas');canvas.width=Math.ceil(w*density);canvas.height=Math.ceil(h*density);
   const ctx=canvas.getContext('2d');ctx.setTransform(density,0,0,density,-x*density,-y*density);
   this.g=ctx;try{paint()}finally{this.g=g}
   layer={signature,canvas};this.layers.set(name,layer);
  }
  g.drawImage(layer.canvas,0,0,box[2]*density,box[3]*density,...box);
 }
 oval(x,y,rx,ry,c){const g=this.g;g.beginPath();g.ellipse(x,y,rx,ry,0,0,Math.PI*2);g.fillStyle=c;g.fill()}
 rect(x,y,w,h,r,c){const g=this.g;g.beginPath();g.roundRect(x,y,w,h,r);g.fillStyle=c;g.fill()}
 line(p,c,w=1){const g=this.g;g.beginPath();p.forEach(([x,y],i)=>i?g.lineTo(x,y):g.moveTo(x,y));g.strokeStyle=c;g.lineWidth=w;g.lineCap='round';g.lineJoin='round';g.stroke()}
 at(x,y,k,fn){this.g.save();this.g.translate(x,y);this.g.scale(k,k);fn();this.g.restore()}
 seed(n){return(Math.sin(n*123.43+32.7)*43278.13%1+1)%1}
 coinToken(x,y,k=1){this.at(x,y,k,()=>{this.oval(0,0,6,6,'#d7b16a');this.oval(0,0,4,4,'#efcf89');this.line([[0,-2],[0,2]],'#ad884a',1)})}
 steam(x,y,k,t,alpha=.3){
 const g=this.g;
 // Cache a feathered vapor puff once. No per-frame blur filters or particle allocation.
 if(!this.vapor){const c=document.createElement('canvas');c.width=c.height=96;const v=c.getContext('2d'),mist=v.createRadialGradient(48,48,0,48,48,48);mist.addColorStop(0,'#fffaf0c9');mist.addColorStop(.28,'#f5f3ef9e');mist.addColorStop(.62,'#e9eff14d');mist.addColorStop(1,'#e9eff100');v.fillStyle=mist;v.fillRect(0,0,96,96);this.vapor=c}
 g.save();g.translate(x,y);g.scale(k,k);
 // Staggered wisps expand as they rise. Both ends fade, hiding each recycled puff.
 for(let i=0;i<30;i++){
  const r=this.seed(i+211),age=(t/(4.8+r*2.3)+i*.61803398875)%1;
  const fade=Math.sin(Math.PI*age)**1.7,spread=age*age;
  const source=(i%3-1)*23+(r-.5)*12;
  const px=source+Math.sin(age*5.5+r*6.28+t*.22)*(5+spread*19)+spread*9;
  const py=-age*(106+r*30);
  const width=5+age*(18+r*10),height=13+age*(26+r*17);
  g.save();g.translate(px,py);g.rotate(Math.sin(age*4+r*6.28)*.32);
  g.globalAlpha=alpha*fade*(.18+r*.09);
  g.drawImage(this.vapor,-width,-height,width*2,height*2);g.restore();
 }
 g.restore();
 }
 leaf(x,y,k,r,c){const g=this.g;g.save();g.translate(x,y);g.rotate(r);g.beginPath();g.moveTo(0,0);g.quadraticCurveTo(-12*k,-14*k,0,-25*k);g.quadraticCurveTo(13*k,-13*k,0,0);g.fillStyle=c;g.fill();this.line([[0,-3*k],[0,-19*k]],'#f0efcb50',k);g.restore()}
 filling(x,y,k,kind){this.at(x,y,k,()=>{const color={mushroom:'#9f8570',greens:'#86a36b',ginger:'#d3a46d',meat:'#bb7e6d'}[kind];this.oval(0,1,24,12,color);for(let i=0;i<18;i++){const a=i*2.4,r=Math.sqrt(this.seed(i+16))*21;this.oval(Math.cos(a)*r,Math.sin(a)*r*.5,3.5,2.6,i%3?color:'#d8ca9c');if(i%3===0)this.line([[Math.cos(a)*r,Math.sin(a)*r*.5],[Math.cos(a)*r+3,Math.sin(a)*r*.5-3]],'#6c895b',2)}})}
 dumpling(x,y,k,fold=3,kind='ginger'){this.at(x,y,k,()=>{const paint=()=>{const g=this.g;
 // A long crescent with pinched ends, a plump belly, and a pleated upper seam.
 this.oval(0,16,43,8,'#674a3825');
 const dough=g.createLinearGradient(0,-26,0,24);dough.addColorStop(0,'#fffdf2');dough.addColorStop(.48,({greens:'#e1edcf',mushroom:'#e9dfd7',meat:'#f5ded6',ginger:'#f6e8cb'})[kind]||'#f6e8cb');dough.addColorStop(1,({greens:'#b9c99b',mushroom:'#c6b3a5',meat:'#d6afa0',ginger:'#d9b985'})[kind]||'#d9b985');
 g.beginPath();g.moveTo(-46,4);g.bezierCurveTo(-34,-9,-22,-25,-2,-25);g.bezierCurveTo(20,-27,35,-11,46,3);g.bezierCurveTo(42,18,21,26,0,25);g.bezierCurveTo(-22,25,-40,17,-46,4);g.fillStyle=dough;g.fill();g.strokeStyle='#b79a72';g.lineWidth=1.15;g.stroke();
 // Curved lower lip gives the wrapper thickness without dividing it into bun segments.
 g.beginPath();g.moveTo(-40,10);g.bezierCurveTo(-20,26,23,26,40,9);g.bezierCurveTo(25,30,-26,29,-40,10);g.fillStyle='#bd8e5535';g.fill();
 g.beginPath();g.moveTo(-34,9);g.bezierCurveTo(-19,18,19,19,33,8);g.strokeStyle='#fffaf0a8';g.lineWidth=2.4;g.lineCap='round';g.stroke();
 const count=Math.round(Math.max(0,Math.min(3,fold))*8/3),crest=x=>-24+25*(x/43)**2;
 for(let i=0;i<count;i++){const px=-33+i*9,py=crest(px),lean=px<0?2:-1;
  g.beginPath();g.moveTo(px-6,py+6);g.quadraticCurveTo(px-3,py-5,px+2,py-3);g.quadraticCurveTo(px+1,py+4,px+6+lean,py+12);g.quadraticCurveTo(px-2,py+10,px-6,py+6);g.fillStyle=i%2?'#f9edda':'#fff7e6';g.fill();
  g.beginPath();g.moveTo(px+2,py-3);g.quadraticCurveTo(px-1,py+3,px+6+lean,py+12);g.strokeStyle='#bca07b';g.lineWidth=1.25;g.stroke();
  g.beginPath();g.moveTo(px-4,py+5);g.quadraticCurveTo(px-2,py-1,px,py-1);g.strokeStyle='#fffdf5';g.lineWidth=1.1;g.stroke();
 }
 this.line([[-45,4],[-37,6]],'#e7d1ad',1.5);this.line([[37,5],[45,3]],'#e7d1ad',1.5);
 };if(fold===3)this.cached('gyoza-'+kind,[-48,-33,96,65],'',paint,4);else paint()})}
 bowl(x,y,k,kind){this.at(x,y,k,()=>{const g=this.g;this.oval(0,12,46,15,'#82694712');g.beginPath();g.moveTo(-45,-2);g.bezierCurveTo(-40,47,40,47,45,-2);g.fillStyle='#bdc7b6';g.fill();this.oval(0,-2,46,22,'#e9e8db');this.oval(0,-2,39,16,'#9fae96');this.filling(0,-2,1.4,kind);this.line([[-27,23],[23,23]],'#f4f0df88',1.5)})}
 platedPose(index){return{x:(index%6-2.5)*20,y:-30+Math.floor(index/6)*20,k:.43}}
 rowPose(index,count,k=.43){return{x:(index-(count-1)/2)*46*k,y:-2,k}}
 basket(x,y,k,s,t,hiddenIndex=-1){this.at(x,y,k,()=>{const g=this.g;this.oval(1,31,102,30,'#80674620');this.rect(-101,-7,202,39,6,'#c6a16d');this.oval(0,31,100,30,'#be985f');for(let i=-94;i<96;i+=6)this.line([[i,-7],[i,33]],i%12?'#dec08c80':'#9e774938',1);this.oval(0,0,102,45,'#ddbd89');this.oval(0,0,94,38,'#a78350');this.oval(0,0,88,33,'#f2e8ca');for(let i=-3;i<=3;i++)this.line([[-74,i*8],[74,i*8]],'#c7b98650',1);const items=s.cooking.length?s.cooking:s.basket;items.slice(0,6).forEach((f,i)=>{if(!f||(!s.cooking.length&&i===hiddenIndex))return;const row=Math.floor(i/3),x=(i%3-1)*49,y=-10+row*23;this.dumpling(x,y,.51,3,f);this.oval(x,y+4,1.4,1.4,{greens:'#859b67',ginger:'#c3915d',mushroom:'#a28266',meat:'#bb7e6d'}[f])});
 if(s.cooking.length&&!s.ready){this.lid(0,-10,1);this.steam(0,-27,1,t,.5)}else if(s.ready){this.steam(0,-14,1.3,t,.65)}
 })}
 lid(x,y,k){this.at(x,y,k,()=>{this.cached('lid',[-107,-48,214,100],'',()=>{const g=this.g;this.oval(0,3,104,44,'#b68c58');this.oval(0,-2,104,44,'#dabc87');g.save();g.beginPath();g.ellipse(0,-2,95,36,0,0,Math.PI*2);g.clip();for(let i=-120;i<130;i+=10){this.line([[i,-45],[i+60,44]],'#c7a371',4);this.line([[i,44],[i+60,-45]],'#ecd09d',3)}g.restore();g.strokeStyle='#f0d7a8';g.lineWidth=3;g.beginPath();g.ellipse(0,-2,98,39,0,0,Math.PI*2);g.stroke();this.rect(-17,-16,34,17,8,'#a98251');this.rect(-12,-20,24,13,6,'#d3af77')},3)})}
 guestPose(c,w,phone){const k=Math.min(phone?w/420:w/900,1.45),seat=w*(phone?[.18,.42,.66][c.seat]:[.38,.53,.68][c.seat]),queue=c.takeaway?w*.86:w*.86+c.seat*22*k,ease=u=>{u=Math.max(0,Math.min(1,u));return u*u*(3-2*u)};let x=queue;if(c.phase==='arriving')x=w+45*k+(queue-w-45*k)*ease(c.age/6);if(c.phase==='seating')x=queue+(seat-queue)*ease(c.age/4);if(c.phase==='eating')x=seat;if(c.phase==='leaving'){const from=c.takeaway?queue:seat;x=from+(w+50*k-from)*ease(c.age/6);}return{x,seat,k}}
 customer(c,x,y,k,t){this.at(x,y,k,()=>{const g=this.g,moving=['arriving','seating','leaving'].includes(c.phase),bob=moving?Math.sin(t*4+c.id)*1.2:Math.sin(t*.8+c.id)*.3;g.translate(0,bob);const shirts=['#618f90','#ab7b91','#7f90ad','#b5996c'],skins=['#e8c39d','#c79878','#e6b790','#b78969'],hair=['#6c6350','#755941','#535f58','#655849'],skin=skins[c.kind],shirt=shirts[c.kind];
 // Little neighbors in linen shirts, with soft faces and distinct hats/hair.
 this.line([[-8,-3],[-9+(moving?Math.sin(t*4)*3:0),14]],'#827c69',7);this.line([[8,-3],[9-(moving?Math.sin(t*4)*3:0),14]],'#827c69',7);this.rect(-17,-36,34,39,12,shirt);this.line([[-11,-30],[-11,-21]],c.kind%2?'#eab9c5':'#a9e2da',2);this.line([[-17,-26],[-22,-9]],shirt,8);this.oval(-22,-7,4,5,skin);if(c.phase!=='eating'){this.line([[17,-26],[22,-9]],shirt,8);this.oval(22,-7,4,5,skin)}
 this.oval(0,-54,19,22,hair[c.kind]);this.oval(0,-50,16,18,skin);this.oval(-16,-50,3,5,skin);this.oval(16,-50,3,5,skin);
 if(c.kind===0){this.rect(-20,-72,40,15,7,'#7b9675');this.line([[-19,-58],[19,-58]],'#a7ba93',5);this.oval(0,-76,5,5,'#8fa681')}
 else if(c.kind===1){this.oval(-12,-69,9,9,hair[c.kind]);this.oval(10,-63,10,7,hair[c.kind]);this.line([[-17,-59],[-12,-64]],'#c5b088',2)}
 else if(c.kind===2){this.line([[-17,-63],[-4,-66],[11,-61]],hair[c.kind],7);g.strokeStyle='#6d786b';g.lineWidth=1;for(const ex of [-6,6]){g.beginPath();g.ellipse(ex,-49,5,4,0,0,Math.PI*2);g.stroke()}this.line([[-1,-49],[1,-49]],'#6d786b',1)}
 else{this.oval(0,-67,22,7,'#b99c63');this.rect(-14,-79,28,14,6,'#ccb17a');this.line([[-13,-68],[13,-68]],'#a58b5e',2)}
 const happy=c.phase==='eating'||c.phase==='leaving';for(const ex of [-6,6]){if(happy){g.beginPath();g.moveTo(ex-2,-48);g.quadraticCurveTo(ex,-46,ex+2,-48);g.strokeStyle='#615745';g.lineWidth=1;g.stroke()}else this.oval(ex,-49,1.2,1.6,'#615745')}
 this.oval(-11,-44,3,1.7,'#cf97743b');this.oval(11,-44,3,1.7,'#cf97743b');g.beginPath();g.moveTo(-3,-40);g.quadraticCurveTo(0,-37,3,-40);g.strokeStyle='#9f795d';g.lineWidth=1;g.stroke();
 if(c.phase==='waiting'){this.rect(-19,-106,38,23,9,'#fff9e9ed');if(c.takeaway)this.takeawayBox(0,-93,.6,[],false);else this.dumpling(0,-94,.25)}
 if(c.phase==='paying'){const rise=Math.min(1,c.age/2.5);this.coinToken(24,-28-rise*32);g.fillStyle='#95865e';g.font='9px monospace';g.fillText('+'+(c.takeaway?c.order.length*3:3),31,-28-rise*32)}
 if(c.takeaway&&['paying','leaving'].includes(c.phase)){this.takeawayBox(0,-13,1,c.order||[],c.phase==='leaving'||c.age>1.7);this.oval(-20,-10,4,3,skin);this.oval(20,-10,4,3,skin)}
 if(c.phase==='seating'){this.oval(0,-12,24,7,'#f7efdd');this.dumpling(0,-16,.28,3,c.meal);this.oval(-19,-13,4,3,skin);this.oval(19,-13,4,3,skin)}
 })}
 takeawayBox(x,y,k,items,closed){this.at(x,y,k,()=>{
  this.rect(-22,-8,44,20,3,'#bca580');this.rect(-22,-10,44,12,3,'#ead8b7');
  if(!closed){this.rect(-20,-9,40,10,2,'#f7ebd3');items.forEach((f,i)=>this.dumpling((i%3-1)*12,-5+Math.floor(i/3)*5,.14,3,f))}
  else{this.line([[-20,-5],[20,-5]],'#fff0d1',1);this.rect(-4,-10,8,22,1,'#87a49b');this.oval(0,0,2,2,'#eee4cb')}
 })}
 // Use the same body origin and skin/sleeve colors as the seated customer.
 // The chopsticks rotate around the moving hand, rather than floating on an extra arm.
 eatingHand(c,x,y,k,t){this.at(x,y,k,()=>{const g=this.g,bob=Math.sin(t*.8+c.id)*.3;g.translate(0,bob);
 const skin=['#e8c39d','#c79878','#e6b790','#b78969'][c.kind],shirt=['#618f90','#ab7b91','#7f90ad','#b5996c'][c.kind];
 const phase=c.age%6,lift=(1-Math.cos(phase*Math.PI/3))/2;
 const plateY=19/k-bob,handX=22-4*lift,handY=(plateY-11)*(1-lift)-30*lift,angle=2.66+.93*lift;
 this.line([[17,-26],[24,-16]],shirt,8);
 this.line([[24,-15],[handX,handY]],skin,6);
 this.at(handX,handY,1,()=>{g.rotate(angle);for(const side of [-1,1])this.line([[-10,side*2.3],[23,side*.7]],'#97734e',1.2);if(phase>.7&&phase<3.2)this.oval(23,0,3.5,2.5,'#f7e9cb');
 // Fingers cover the grip, leaving both wooden tips visible.
 this.oval(0,0,4,3.6,skin);this.line([[-1,-1],[2,-1]],'#a7775740',.7);
 });
 })}
 shop(s,w,tableY,t,phone,foreground=false){if(!s.shop)return;const g=this.g;if(!foreground)for(let seat=0;seat<3;seat++){const p=this.guestPose({seat,phase:'eating'},w,phone);this.rect(p.seat-22*p.k,tableY-38*p.k,44*p.k,32*p.k,9*p.k,'#c4ae873d');this.line([[p.seat-20*p.k,tableY-25*p.k],[p.seat-20*p.k,tableY+12*p.k]],'#bba381',3*p.k);this.line([[p.seat+20*p.k,tableY-25*p.k],[p.seat+20*p.k,tableY+12*p.k]],'#bba381',3*p.k)}for(const c of s.shop.guests){const p=this.guestPose(c,w,phone);if(!foreground)this.customer(c,p.x,tableY-7,p.k,t);else if(c.phase==='eating'){this.at(p.x,tableY+12,p.k,()=>{this.oval(0,2,28,9,'#b89e721b');this.oval(0,0,28,9,'#f8f1df');this.oval(0,0,22,6,'#e2e6d0');const eaten=Math.min(3,Math.floor(c.age/6));if(eaten<3){g.save();g.beginPath();g.rect(-30,-30,Math.max(10,60-eaten*18),45);g.clip();this.dumpling(0,-2,.32,3,c.meal);g.restore()}this.oval(38,0,9,4,'#f4eedc');this.rect(31,-12,14,11,4,'#b7c5ac');this.oval(38,-12,7,3,'#e6e8d5')});this.eatingHand(c,p.x,tableY-7,p.k,t)}}
 // A small register and saucer of coins make each purchase visible.
 if(foreground){const k=Math.min(w/650,1),x=w*.91;this.at(x,tableY+5,k,()=>{this.rect(-18,-20,36,26,5,'#394c5c');this.rect(-13,-17,26,12,2,'#8fc5bd');this.line([[-8,-10],[6,-10]],'#395e5a',2);this.oval(0,14,24,7,'#eee1c3');for(let i=0;i<Math.min(4,Math.ceil(s.shop.coins/3));i++)this.coinToken(-10+i*6,12,.65)})}
 }
 neon(x,y,w,h,text,color,size=16){this.cached('neon-'+text,[x-15,y-15,w+30,h+30],[color,size],()=>{const g=this.g;g.save();this.rect(x,y,w,h,3,'#101b2bec');g.shadowColor=color;g.shadowBlur=12;g.strokeStyle=color;g.lineWidth=1.1;g.strokeRect(x+3,y+3,w-6,h-6);g.fillStyle=color;g.font=`${size}px monospace`;g.textAlign='center';g.textBaseline='middle';g.fillText(text,x+w/2,y+h/2);g.restore()})}
 lantern(x,y,k,t){this.at(x,y,k,()=>{const g=this.g;this.line([[0,-45],[0,-8]],'#46515d',2);const glow=g.createRadialGradient(0,25,3,0,25,80);glow.addColorStop(0,'#ef99782f');glow.addColorStop(1,'#ef997800');g.fillStyle=glow;g.fillRect(-80,-55,160,160);g.translate(Math.sin(t*.22)*1.2,0);const paper=g.createLinearGradient(-23,0,23,0);paper.addColorStop(0,'#b35d54');paper.addColorStop(.5,'#f4b785');paper.addColorStop(1,'#c67b62');this.rect(-23,-6,46,63,20,paper);for(let i=2;i<54;i+=7)this.line([[-20,i],[20,i]],'#754c4852',1);this.rect(-11,-10,22,5,2,'#69524c');this.rect(-11,55,22,5,2,'#69524c');g.fillStyle='#553f41';g.textAlign='center';g.font='17px serif';g.fillText('餃',0,20);g.fillText('子',0,42)})}
 cityWindow(win,t,night,rain){const g=this.g;this.cached('city',[win.x-14,win.y-10,win.w+28,win.h+24],night,()=>{const g=this.g;this.rect(win.x-10,win.y-10,win.w+20,win.h+20,3,'#152835');this.rect(win.x-4,win.y-4,win.w+8,win.h+8,1,'#657178');g.save();g.beginPath();g.rect(win.x,win.y,win.w,win.h);g.clip();const sky=g.createLinearGradient(0,win.y,0,win.y+win.h);sky.addColorStop(0,night?'#141c38':'#29324d');sky.addColorStop(1,'#413551');g.fillStyle=sky;g.fillRect(win.x,win.y,win.w,win.h);
 for(let i=0;i<12;i++){const bw=win.w/8,bx=win.x+i*win.w/11-20,by=win.y+win.h*(.10+this.seed(i+20)*.37);this.rect(bx,by,bw,win.h,0,i%2?'#172738':'#203047');for(let r=0;r<8;r++)for(let c=0;c<3;c++)if(this.seed(i*40+r*3+c)>.46)this.rect(bx+7+c*bw/4,by+10+r*15,bw/9,5,i%3?'#c8987060':'#83bfc566')}
 this.neon(win.x+win.w*.13,win.y+win.h*.28,win.w*.18,win.h*.19,'24H','#8fcfd0',Math.max(8,win.w*.035));this.neon(win.x+win.w*.67,win.y+win.h*.17,win.w*.14,win.h*.42,'茶','#dba4c4',Math.max(14,win.w*.07));
 // Still, faint reflected signs keep the glass luminous without flashing.
 for(let i=0;i<9;i++){const px=win.x+this.seed(i+170)*win.w;this.line([[px,win.y+win.h*.64],[px+Math.sin(i)*5,win.y+win.h]],i%2?'#dd9ab51c':'#87d2d221',3+this.seed(i)*7)}
 g.restore();this.line([[win.x+win.w*.48,win.y],[win.x+win.w*.48,win.y+win.h]],'#485763',4);this.rect(win.x-14,win.y+win.h,win.w+28,9,2,'#33454d');this.line([[win.x-9,win.y+win.h+1],[win.x+win.w+9,win.y+win.h+1]],'#85b7b14f',1);
 });if(rain){g.save();g.beginPath();g.rect(win.x,win.y,win.w,win.h);g.clip();rain(g,win,t);g.restore();this.line([[win.x+win.w*.48,win.y],[win.x+win.w*.48,win.y+win.h]],'#485763',4)}
 // Split noren curtains, softly moving at the doorway.
 const curtainH=Math.min(49,win.h*.31),panelW=win.w/4;for(let i=0;i<4;i++){const sway=Math.sin(t*.25+i)*1.3;this.rect(win.x+i*panelW+2,win.y-5,panelW-4,curtainH+sway,1,i%2?'#384457':'#3d485e');this.line([[win.x+i*panelW+5,win.y+curtainH-6+sway],[win.x+(i+1)*panelW-5,win.y+curtainH-6+sway]],'#c58f9a55',1)}g.save();g.fillStyle='#e4c8b7';g.font=`${Math.min(18,win.w*.055)}px serif`;g.textAlign='center';g.fillText('餃',win.x+win.w*.375,win.y+curtainH*.62);g.fillText('子',win.x+win.w*.625,win.y+curtainH*.62);g.restore();
 }
 render(w,h,s,t,{bottom=h-200,pulse=0,flight=null,batch=null,folds=s.folds,rain=null}={}){const g=this.g,phone=w<700,night=s.settings.night;g.clearRect(0,0,w,h);
 const transfers=[];
 if(batch){
  const live=s,old=batch.before,sold=Math.max(0,live.shop.sales-old.shop.sales),loading=batch.age>=1.35,age=loading?batch.age-1.35:batch.age;
  s={...old,basket:[...old.basket],cooking:[...old.cooking],plate:[...old.plate],shop:live.shop,settings:live.settings,ready:true};
  if(!loading)s.plate.push(...old.cooking.map(()=>null));
  if(loading){s.plate.push(...old.cooking);s.cooking=old.basket.slice(0,6).map(()=>null)}
  const items=loading?old.basket.slice(0,6):old.cooking;
  items.forEach((f,i)=>{
   const u=Math.max(0,Math.min(1,(age-i*.09)/.8));
   if(loading){if(u>0)s.basket[i]=null;if(u===1)s.cooking[i]=f}
   else{if(u>0)s.cooking[i]=null;if(u===1)s.plate[old.plate.length+i]=f}
   if(u>0&&u<1)transfers.push({f,i,u,loading,count:items.length,offset:old.plate.length-sold});
  });
  s.plate=s.plate.slice(sold);
 }

 const top=phone?(h<650?140:180):(h<500?100:150),span=Math.max(100,bottom-top),tableY=top+span*.44;
 const win=phone?{x:w*.07,y:top-20,w:w*.86,h:Math.max(65,tableY-top+15)}:{x:w*.36,y:top-20,w:w*.58,h:Math.max(80,tableY-top+15)};
 this.cached('wall',[0,0,w,tableY+12],[h,night],()=>{const g=this.g;const wall=g.createLinearGradient(0,0,0,h);wall.addColorStop(0,night?'#151b2d':'#222a3c');wall.addColorStop(1,night?'#27303c':'#38434a');g.fillStyle=wall;g.fillRect(0,0,w,h);
 // Narrow tiled interior and layered signage, like a small late-night counter.
 for(let y=tableY-96;y<tableY;y+=24)for(let x=0;x<w;x+=48){g.strokeStyle='#9cbbb411';g.lineWidth=1;g.strokeRect(x+(Math.round(y/24)%2)*24,y,47,23)}
 });
 this.cityWindow(win,t,night,rain);
 this.lantern(phone?w*.09:w*.535,phone?win.y+12:win.y+28,phone?.56:.88,t);
 if(!phone){this.lantern(w*.956,win.y+21,.7,t);this.neon(w*.14,top+14,w*.16,34,'LITTLE FOLDS','#d5a0b7',12);const mx=w*.155,my=top+72,names=['MUSHROOM','GREENS','GINGER','MEAT'];for(let i=0;i<4;i++){const compact=tableY-my<104,x=compact?mx+(i%2)*62:mx+i*34,y=compact?tableY-45+Math.floor(i/2)*19:my;this.rect(x,y,compact?57:25,compact?16:92,2,'#e1c99b');g.save();g.fillStyle='#675a50';g.font='8px monospace';g.textAlign='center';if(compact)g.fillText(names[i],x+28.5,y+11);else names[i].split('').forEach((letter,j)=>g.fillText(letter,x+12,y+12+j*10));g.restore()}}
 this.shop(s,w,tableY,t,phone);
 // A continuous walnut worktop: broad boards, fine flowing grain, and a rounded front edge.
 const front=h-(phone?66:48);this.cached('counter',[0,tableY,w,h-tableY],night,()=>{const g=this.g,depth=front-tableY;
 const counter=g.createLinearGradient(0,tableY,0,front);counter.addColorStop(0,night?'#6c5145':'#96765c');counter.addColorStop(.38,night?'#55453e':'#7a5b47');counter.addColorStop(1,night?'#383236':'#514038');g.fillStyle=counter;g.fillRect(0,tableY,w,depth);
 for(let plank=0;plank<3;plank++){
  const py=tableY+depth*(plank/3),ph=depth/3;
  if(plank%2){g.fillStyle='#ddba8410';g.fillRect(0,py,w,ph)}
  if(plank){this.line([[0,py],[w,py]],'#32292559',1.2);this.line([[0,py+2],[w,py+2]],'#e2b58418',1)}
  for(let i=0;i<9;i++){
   const y=py+ph*(.08+i*.103),drift=(this.seed(i+plank*31)-.5)*ph*.28;
   g.beginPath();g.moveTo(-20,y);g.bezierCurveTo(w*.24,y+drift,w*.36,y-drift*.7,w*.6,y+drift*.25);g.bezierCurveTo(w*.78,y+drift*.5,w*.9,y-drift*.3,w+20,y+drift*.2);
   g.strokeStyle=i%3?'#e3bc8610':'#3127221c';g.lineWidth=i%3?.7:1.3;g.stroke();
  }
 }
 const glow=g.createRadialGradient(w*.38,tableY+depth*.45,5,w*.38,tableY+depth*.45,w*.6);glow.addColorStop(0,'#e8c49213');glow.addColorStop(1,'#e8c49200');g.fillStyle=glow;g.fillRect(0,tableY,w,depth);
 this.rect(0,tableY,w,7,0,'#b39675');this.line([[0,tableY+2],[w,tableY+2]],'#f2d6ad65',1);
 const edge=g.createLinearGradient(0,front,0,front+19);edge.addColorStop(0,'#8f6c50');edge.addColorStop(.25,'#674d3d');edge.addColorStop(1,'#342e30');g.fillStyle=edge;g.fillRect(0,front,w,20);this.line([[0,front],[w,front]],'#d1aa7545',1);
 g.fillStyle='#202b35';g.fillRect(0,front+20,w,h-front-20);
 const sun=g.createLinearGradient(win.x,tableY,win.x+50,h);sun.addColorStop(0,night?'#76bfca0f':'#b79ac521');sun.addColorStop(1,'#879cdd00');g.fillStyle=sun;g.beginPath();g.moveTo(win.x,tableY);g.lineTo(win.x+win.w,tableY);g.lineTo(w*.78,h);g.lineTo(w*.20,h);g.fill();
 });

 // Lay out complete object groups together, including the open lid and waiting tray.
 // Reserve the bottom UI strip even when the tray is empty, so cooking never shifts the table.
 const workTop=tableY+(phone?22:26),workBottom=phone?Math.min(front-16,h-(h<650?155:185)):Math.min(front-16,h-(h<500?70:155));
 const room=Math.max(65,workBottom-workTop),unit=Math.min((w-(phone?28:72))/(phone?620:900),room/400);
 const origin=(w-(phone?620:900)*unit)/2,centerY=workTop+room/2;
 const board={x:origin+(phone?172:326)*unit,y:centerY,k:unit*(phone?1:1.06)};
 const basket={x:origin+(phone?496:720)*unit,y:centerY,k:unit*(phone?1:1.2)};
 const ingredient={x:phone?board.x-72*unit:origin+60*unit,y:centerY-(phone?157:49)*unit,k:unit*.87};
 const wrappers={x:phone?board.x+72*unit:ingredient.x,y:phone?ingredient.y+3*unit:centerY+65*unit,k:unit*.68};
 const tray={x:basket.x,y:basket.y+(phone?95*basket.k:136*unit),k:basket.k*.87};
 const plate={x:board.x,y:board.y+150*unit,k:unit*.9};
 this.layout={board,basket,tray,plate,win,workBottom};
 this.shop(s,w,tableY,t,phone,true);
 // Maple prep board on folded linen, with soft contact shadows rather than a striped frame.
 this.at(board.x,board.y,board.k,()=>{
  this.cached('board',[-177,-121,354,225],'',()=>{const g=this.g;
  this.oval(2,68,170,31,'#221b2026');
  g.save();this.rect(-164,-76,332,169,8,'#748680');this.rect(-161,75,326,13,3,'#657973');
  this.line([[-155,83],[155,83]],'#b8c6b366',1);for(let x=-151;x<156;x+=8)this.line([[x,82],[x+3,82]],'#d6d9bc60',.7);g.restore();
  this.rect(-153,-78,306,164,13,'#9c7653');
  const maple=g.createLinearGradient(0,-83,0,77);maple.addColorStop(0,'#e0c6a0');maple.addColorStop(.55,'#d5b38b');maple.addColorStop(1,'#c8a37b');this.rect(-153,-85,306,161,13,maple);
  g.save();g.beginPath();g.roundRect(-150,-82,300,155,11);g.clip();
  for(let i=0;i<13;i++){const y=-75+i*12;g.beginPath();g.moveTo(-155,y);g.lineTo(155,y);g.strokeStyle=i%3?'#fff1d20e':'#976b4312';g.lineWidth=.8;g.stroke()}
  const flour=g.createRadialGradient(0,0,6,0,0,64);flour.addColorStop(0,'#fff8df24');flour.addColorStop(1,'#fff8df00');g.fillStyle=flour;g.fillRect(-65,-65,130,130);
  for(let i=0;i<34;i++){const angle=i*2.4,radius=36+this.seed(i+81)*55;this.oval(Math.cos(angle)*radius,Math.sin(angle)*radius*.55,.6+this.seed(i+16)*1.2,.5,'#fff7dc72')}
  g.restore();this.line([[-136,-83],[136,-83]],'#fff1d64f',1);
  // A narrow wooden rolling pin tucked above the board.
  this.rect(-111.5,-108,223,7,3,'#b28c62');this.oval(-110,-105,4,4,'#d2ad7d');this.oval(110,-105,4,4,'#d2ad7d');
  const pin=g.createLinearGradient(0,-117,0,-96);pin.addColorStop(0,'#efd8ac');pin.addColorStop(.42,'#daba89');pin.addColorStop(1,'#b78c5f');this.rect(-77.5,-116,155,22,11,pin);this.line([[-65,-112],[65,-112]],'#fff1d15c',1);
  });
 const scale=1+Math.sin(Math.max(0,1-pulse)*Math.PI)*.035;
 if(s.stage!=='empty'){this.at(0,-3,scale,()=>{if(s.stage==='wrapper'||folds<.1){this.oval(0,6,67,41,'#b9956330');this.oval(0,0,68,41,'#fff6df');this.oval(0,-2,60,33,'#fffaf0');if(s.stage==='filled')this.filling(0,0,1.25,s.filling)}else{g.save();g.globalAlpha=Math.max(0,1-folds);this.oval(0,0,68,41,'#fff6df');this.filling(0,0,1.25,s.filling);g.restore();this.dumpling(0,0,1.45,folds,s.filling)}})}
 });
 this.bowl(ingredient.x,ingredient.y,ingredient.k,s.filling);
 // A small stack of wrappers beside the clear work area.
 this.at(wrappers.x,wrappers.y,wrappers.k,()=>{this.oval(0,13,44,22,'#302d2929');this.oval(0,9,43,22,'#82948a');this.oval(0,7,38,19,'#bdc6ad');for(let i=3;i>=0;i--)this.oval(0,i*2.5,32,17,i%2?'#f4e4c7':'#fff0d5')});
 // A woven trivet anchors the steamer to the counter.
 this.at(basket.x,basket.y+20*basket.k,basket.k,()=>{this.oval(0,15,117,49,'#1d202533');this.rect(-113,-42,226,92,14,'#596c633b');for(let i=-100;i<=100;i+=9)this.line([[i,-36],[i,42]],'#b9b98b20',2);this.line([[-99,44],[99,44]],'#b6b88d45',1)});
 // Prop the open lid against the back rim; the basket hides its lower edge.
 if(!s.cooking.length||s.ready){this.at(basket.x+(phone?-68:70)*basket.k,basket.y-47*basket.k,basket.k,()=>{g.rotate(phone?-.3:.3);g.scale(.7,1.25);this.lid(0,0,1)})}
 this.basket(basket.x,basket.y,basket.k,s,t,flight?.target==='basket'?flight.index:-1);
 
 if(s.cooking.length&&s.basket.length){this.at(tray.x,tray.y,tray.k,()=>{
  this.rect(-105,-27,210,62,12,'#242d2938');this.rect(-106,-31,212,61,12,'#64776b');this.rect(-101,-29,202,55,10,'#a5b09a');this.rect(-94,-24,188,44,8,'#e2dfc7');
  s.basket.slice(0,6).forEach((f,i)=>{if(!f||(flight?.target==='tray'&&i===flight.index))return;const p=this.rowPose(i,s.basket.length);this.dumpling(p.x,p.y,p.k,3,f)});
 })}

 // A permanent ceramic serving tray keeps all cooked stock on the counter.
 this.at(plate.x,plate.y,plate.k,()=>{
  this.rect(-115,-52,230,116,12,'#222a2930');
  this.rect(-115,-58,230,114,12,'#738b83');this.rect(-110,-56,220,105,10,'#c2cdc0');
  this.rect(-103,-49,206,90,8,'#f0ecdb');
  s.plate.slice(0,24).forEach((f,i)=>{if(!f)return;const p=this.platedPose(i);this.dumpling(p.x,p.y,p.k,3,f)});
 });

 // Soy, chili oil, and a chopstick jar sit along the back of the counter.
 if(!phone)this.at(w*.23,tableY-2,Math.min(w/1200,1),()=>{this.rect(-40,-36,21,36,4,'#483f36');this.rect(-36,-51,13,16,2,'#55453a');this.rect(-38,-27,17,16,1,'#c6a57c');this.rect(-35,-55,11,6,2,'#9c6b5e');this.rect(-7,-25,24,25,5,'#ad7954');this.rect(-9,-29,28,5,2,'#38434a');this.rect(33,-41,28,41,5,'#728987');for(let i=0;i<5;i++)this.line([[38+i*4,-36],[35+i*5,-80+(i%2)*8]],'#c3a27d',2)});
 if(flight){
  const index=flight.index??s.basket.length-1,u=Math.min(1,flight.age/.85),ease=u*u*(3-2*u);
  const pose=flight.target==='tray'?this.rowPose(index,s.basket.length):{x:(index%3-1)*49,y:-10+Math.floor((index%6)/3)*23,k:.51};
  const destination=flight.target==='tray'?tray:basket,tx=destination.x+pose.x*destination.k,ty=destination.y+pose.y*destination.k;
  const x=board.x+(tx-board.x)*ease,y=board.y+(ty-board.y)*ease-Math.sin(u*Math.PI)*55;
  this.dumpling(x,y,board.k*1.45*(1-ease)+destination.k*pose.k*ease,3,s.basket[index]);
 }
 for(const move of transfers){
  const {i,u,loading,f,count,offset}=move,e=u*u*(3-2*u);
  const slot={x:(i%3-1)*49,y:-10+Math.floor(i/3)*23,k:.51};
  const start=loading?tray:basket,end=loading?basket:plate;
  const a=loading?this.rowPose(i,count):slot;
  const b=loading?slot:this.platedPose(offset+i);
  const x0=start.x+a.x*start.k,y0=start.y+a.y*start.k,x1=end.x+b.x*end.k,y1=end.y+b.y*end.k;
  this.dumpling(x0+(x1-x0)*e,y0+(y1-y0)*e-Math.sin(u*Math.PI)*32,start.k*a.k*(1-e)+end.k*b.k*e,3,f);
 }
 this.cached('lighting',[0,0,w,h],[tableY,night],()=>{const g=this.g;
 // Cyan and plum light spill gently across the room's edges.
 for(const [x,color] of [[w*.95,'#76c6ce'],[w*.08,'#bf86a5']]){const glow=g.createRadialGradient(x,tableY,5,x,tableY,w*.42);glow.addColorStop(0,color+'12');glow.addColorStop(1,color+'00');g.fillStyle=glow;g.fillRect(0,0,w,h)}

 if(night){const glow=g.createRadialGradient(w*.36,tableY,0,w*.36,tableY,h*.7);glow.addColorStop(0,'#efb97c16');glow.addColorStop(1,'#101b3033');g.fillStyle=glow;g.fillRect(0,0,w,h)}});return this.layout
 }
}globalThis.KitchenArt=KitchenArt;
})();
