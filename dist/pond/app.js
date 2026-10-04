(()=>{
  const Life=globalThis.PondLife,Runtime=globalThis.SprigganRuntime;
  let stored=null;
  try{stored=Life.decode(localStorage.getItem(Life.KEY))}catch{}
  const pond=stored||Life.create();
  const SLOT_GOLDEN_ID='spriggan-golden-seed-koi';
  const seenSlotGolden=new Set(pond.fish.map(f=>f.id)),pendingSlotGolden=new Map();
  const memoryLine=document.querySelector('#pond-memory'),momentLine=document.querySelector('#pond-moment');
  const koiPicker=document.querySelector('#koi-picker'),koiTag=document.querySelector('#koi-tag'),nameInput=document.querySelector('#koi-name'),renameForm=document.querySelector('#rename-koi'),renameBtn=document.querySelector('#start-rename');
  const koiLink=document.querySelector('#koi-link'),koiLinkLine=document.querySelector('#koi-link-line'),koiLinkHalo=document.querySelector('#koi-link-halo'),koiLinkDot=document.querySelector('#koi-link-dot');
  let tagPosition=null,tagSide=-1,tagPressed=false;
  let selectedKoi=null,saveTimer=null,momentTimer=null,sceneEvent=null,surpriseIn=45+Math.random()*45;
  const canvas=document.querySelector('#pond');
  // Opaque canvas: the browser can skip alpha blending against the page.
  const mainCtx=canvas.getContext('2d',{alpha:false});
  let ctx=mainCtx;
  // Cache the water and individual plants; animate only their positions and angles.
  const bgCanvas=document.createElement('canvas');
  const bgCtx=bgCanvas.getContext('2d',{alpha:false});
  let decorSprites=[],plantBodies=[],goldenAuraSprite=null;
  const LILY_PADS=[
    {x:.89,y:.28,r:.060,angle:-.6,flower:'ivory',phase:.3},
    {x:.96,y:.34,r:.048,angle:.8,phase:1.6},
    {x:.95,y:.20,r:.038,angle:2.1,phase:2.9},
    {x:.08,y:.64,r:.048,angle:.3,phase:4.1},
    {x:.035,y:.72,r:.063,angle:1.6,phase:5.5},
    {x:.14,y:.73,r:.033,angle:-.6,flower:'ivory',phase:2.2},
    {x:.69,y:.065,r:.032,angle:2.2,flower:'rose',phase:3.7},
    {x:.58,y:.77,r:.037,angle:1.1,flower:'rose',phase:5.9},
    {x:.40,y:.46,r:.036,angle:-1.3,flower:'ivory',phase:1.1},
    {x:.48,y:.84,r:.026,angle:.5,phase:4.8}
  ];
  const BRANCHES=[
    {x:1,y:.55,angle:2.9,scale:1.25,phase:.4},
    {x:1,y:.58,angle:2.1,scale:.9,phase:2.1},
    {x:0,y:.87,angle:-.55,scale:1.05,phase:4.2}
  ];
  const feedBtn=document.querySelector('#feed'),addBtn=document.querySelector('#add'),removeBtn=document.querySelector('#remove'),pauseBtn=document.querySelector('#pause'),nightBtn=document.querySelector('#night'),speedInput=document.querySelector('#speed'),speedValue=document.querySelector('#speed-value'),status=document.querySelector('#status'),instruction=document.querySelector('#instruction');
  const toggleControlsBtn=document.querySelector('#toggle-controls'),panelContent=document.querySelector('#panel-content'),panel=document.querySelector('.panel');
  let w=0,h=0,dpr=1,t=0,last=0,paused=window.matchMedia('(prefers-reduced-motion: reduce)').matches,night=pond.settings.night,removing=false,pace=pond.settings.pace,fish=[],food=[],ripples=[],glints=[],ambientTimer=2;
  // Adaptive effects: simplify decorative detail on slow devices without blurring the canvas.
  let quality=0,dirty=true,ema=16.7,qStamp=0;
  let raining=pond.settings.raining,rainMix=raining?1:0,rainDrops=[];
  const SIDES=[-1,1];
  const MAX_FOOD=100;
  const feedingStatus=document.querySelector('#feeding-status');
  let displayedFoodCount=-1;
  // Render at up to 2× density for crisp edges while bounding fill cost on 3× phones.
  const renderDensity=()=>Math.max(1,Math.min(devicePixelRatio||1,2));
  const palette=[
    {base:'#f7eee0',patch:'#df633d',accent:'#a94431',fin:'#ead4bb'},
    {base:'#e9e8d9',patch:'#333d3b',accent:'#697b70',fin:'#ddd9cc'},
    {base:'#e8bd84',patch:'#c75432',accent:'#8d3827',fin:'#d9a670'},
    {base:'#f1e9d7',patch:'#d16c3e',accent:'#374c47',fin:'#e6d9c4'},
    {base:'#ecd7bb',patch:'#44534b',accent:'#b95b3c',fin:'#dac4aa'},
    {base:'#f7f1e4',patch:'#bb4b32',accent:'#cc7544',fin:'#e9d7bf'}
  ];
  // Offset organic markings give each koi its own identifiable pattern (hoisted so it is not rebuilt every frame).
  const PATTERNS=[
    [[-.31,-.055,.19,.19,.3],[.05,.105,.16,.14,-.5],[.43,-.015,.14,.16,.3]],
    [[-.39,.01,.23,.20,-.2],[.01,-.13,.13,.16,.3],[.28,.14,.13,.12,-.4]],
    [[-.25,-.11,.16,.18,.1],[.03,.115,.22,.13,-.4],[.38,-.05,.12,.15,.6]],
    [[-.37,-.05,.14,.13,.2],[-.08,.10,.15,.17,-.7],[.25,-.08,.20,.17,.2]],
    [[-.29,.095,.21,.15,.5],[.13,-.12,.18,.14,-.3],[.43,.08,.10,.12,.2]],
    [[-.46,0,.14,.14,0],[-.12,-.08,.19,.19,.2],[.18,.12,.16,.13,-.4],[.48,-.02,.10,.12,0]]
  ];
  const rand=(a,b)=>a+Math.random()*(b-a); const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  function resize(force){
    const r=canvas.getBoundingClientRect(),nd=renderDensity();
    if(!force&&r.width===w&&r.height===h&&nd===dpr)return;
    const oldW=w,oldH=h;w=r.width;h=r.height;dpr=nd;
    canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);mainCtx.setTransform(dpr,0,0,dpr,0,0);
    glints=Array.from({length:38},()=>({x:Math.random()*w,y:Math.random()*h,r:rand(1,3),phase:rand(0,7)}));
    for(const f of fish){
      f.x=clamp(f.x*w/(oldW||w),30,w-30);f.y=clamp(f.y*h/(oldH||h),30,h-30);
      f.tx=f.tx*w/(oldW||w);f.ty=f.ty*h/(oldH||h);f.size=f.baseSize*(1+f.growth)*(w<=720?.72:1);f.grad=null;
    }
    plantBodies=PondPlants.resize(plantBodies,LILY_PADS,w,h,oldW||w,oldH||h);
    buildLayers();dirty=true;
  }
  function setQuality(q,now){quality=q;ema=16.7;qStamp=now;dirty=true}
  function buildLayers(){
    bgCanvas.width=canvas.width;bgCanvas.height=canvas.height;
    bgCtx.setTransform(dpr,0,0,dpr,0,0);
    ctx=bgCtx;
    try{drawBase()}finally{ctx=mainCtx}
    buildDecorSprites();
  }
  function spawn(x=rand(w*(w<=720?.2:.34),w*.83),y=rand(h*.39,h*.64),record=null){
    if(fish.length>=Life.MAX_KOI)return null;
    const data=record||Life.makeFish(fish.length);
    if(!record)data.name=Life.NAMES.find(name=>!fish.some(f=>f.name===name))||data.name;
    const size=data.baseSize*(1+data.growth)*(w<=720?.72:1);
    const f={...data,x,y,a:rand(-Math.PI,Math.PI),v:rand(.53,.88),size,phase:rand(0,7),
      tx:rand(w*.12,w*.88),ty:rand(h*.36,h*.68),wander:rand(1,5),burst:0,turnRate:rand(.75,1.45),
      color:data.golden?{base:'#f3d88b',patch:'#cb9439',accent:'#b08026',fin:'#d2b568'}:palette[data.pattern],grad:null};
    fish.push(f);updateStatus();return f;
  }
  function updateStatus(){status.textContent=`${fish.length} koi ${paused?'resting':'swimming'}`;addBtn.disabled=fish.length>=12;removeBtn.disabled=!fish.length&&!removing;refreshKoiPicker();queueSave();dirty=true}
  function setRemoveMode(value){
    removing=value;removeBtn.setAttribute('aria-pressed',value);
    removeBtn.querySelector('span').textContent=value?'Cancel removal':'Remove a koi';
    canvas.style.cursor=value?'pointer':'crosshair';
    instruction.innerHTML=value?'<strong>Choose a koi</strong> to remove. Select Cancel removal or press Escape to finish.':'<strong>Touch the water</strong> to feed. Tap a koi to meet them.';
  }
  function syncFeedingStatus(){
    if(displayedFoodCount===food.length)return;
    displayedFoodCount=food.length;
    const full=food.length>=MAX_FOOD;
    feedBtn.disabled=full;
    feedBtn.querySelector('span').textContent=full?'Food limit reached':'Feed the koi';
    feedingStatus.textContent=full?'100 / 100 food pieces. Let the koi eat.':`Food in pond: ${food.length} / ${MAX_FOOD}`;
  }
  function drop(x,y,count=5){
    const added=Math.min(count,MAX_FOOD-food.length);
    if(added<=0)return 0;
    ripples.push({x,y,r:2,life:1});
    for(let i=0;i<added;i++)food.push({x:x+rand(-15,15),y:y+rand(-15,15),life:1,r:rand(2,3.5)});
    syncFeedingStatus();dirty=true;
    return added;
  }
  // Static water: base gradient, sun / moon glow. Rendered into an offscreen layer.
  function drawBase(){
    let g=ctx.createRadialGradient(w*.46,h*.44,10,w*.5,h*.5,Math.max(w,h)*.8);
    if(night){g.addColorStop(0,'#204045');g.addColorStop(.55,'#103037');g.addColorStop(1,'#09232a')}
    else{g.addColorStop(0,'#3c7862');g.addColorStop(.55,'#23584b');g.addColorStop(1,'#112f2d')}
    ctx.fillStyle=g;ctx.fillRect(0,0,w,h);
    if(!night){
      const light=ctx.createRadialGradient(w*.67,h*.25,0,w*.67,h*.25,w*.48);
      light.addColorStop(0,'rgba(185,191,121,.14)');light.addColorStop(1,'rgba(155,180,130,0)');ctx.fillStyle=light;ctx.fillRect(0,0,w,h);
    }else{
      const mx=w*.79,my=h*.22,halo=ctx.createRadialGradient(mx,my,0,mx,my,Math.min(w,h)*.39);
      halo.addColorStop(0,'rgba(223,229,205,.16)');halo.addColorStop(1,'rgba(223,229,205,0)');ctx.fillStyle=halo;ctx.fillRect(0,0,w,h);
    }
  }
  // Animated water: slow current bands, refracted light mesh, glints.
  function drawCaustics(){
    const q=quality;
    ctx.save();ctx.globalAlpha=night?.035:.045;
    const step=q===0?20:q===1?28:40;
    for(let j=0;j<7;j++){
      const yy=h*(j+.5)/7+Math.sin(t*.22+j)*16;
      ctx.beginPath();
      for(let x=-40;x<=w+40;x+=step){
        const y=yy+Math.sin(x*.012+t*.42+j)*9+Math.sin(x*.026-t*.28+j)*4;
        if(x===-40)ctx.moveTo(x,y);else ctx.lineTo(x,y);
      }
      ctx.strokeStyle=j%2?'#b3d2b7':'#082f32';ctx.lineWidth=12+j%3*4;ctx.stroke();
    }
    ctx.restore();
    // Mesh strokes are grouped into 4 alpha buckets = 4 stroke calls instead of hundreds.
    const spacing=q===0?110:q===1?150:200,cols=Math.ceil(w/spacing)+1,rows=Math.ceil(h/spacing)+1;
    const maxA=night?.035:.065,paths=[new Path2D(),new Path2D(),new Path2D(),new Path2D()];
    for(let row=0;row<rows;row++)for(let col=0;col<cols;col++){
      const seed=row*2.19+col*1.73;
      const x=col*spacing-45+Math.sin(t*.31+seed)*13;
      const y=row*spacing-35+Math.cos(t*.27+seed)*15;
      const sway=Math.sin(t*.58+seed)*11;
      const k=.5+.5*Math.sin(t*.67+seed*2),p=paths[Math.min(3,(k*4)|0)];
      p.moveTo(x-38,y+sway*.3);
      p.bezierCurveTo(x-17,y-18+sway,x+13,y-12-sway,x+32,y+9);
      p.moveTo(x+30,y+8);
      p.quadraticCurveTo(x+43,y+26+sway*.5,x+72,y+24);
    }
    ctx.save();ctx.lineCap='round';ctx.lineWidth=1.4;
    for(let b=0;b<4;b++){ctx.strokeStyle=`rgba(205,236,213,${maxA*(b+.5)/4})`;ctx.stroke(paths[b])}
    ctx.restore();
    const gn=q===0?38:q===1?16:0;
    for(let i=0;i<gn;i++){
      const gl=glints[i];
      const gx=gl.x+Math.sin(t*.3+gl.phase)*12;
      const a=Math.max(0,Math.sin(t*.8+gl.phase))*(night?.08:.18);
      ctx.fillStyle=`rgba(224,240,211,${a})`;
      ctx.beginPath();ctx.ellipse(gx,gl.y,gl.r*4,gl.r*.55,-.35,0,Math.PI*2);ctx.fill();
    }
  }
  function drawLilypad(x,y,r,angle,flower=false){
    ctx.save();ctx.translate(x,y);ctx.rotate(angle);
    ctx.shadowColor='rgba(3,25,21,.4)';ctx.shadowBlur=12;ctx.shadowOffsetY=8;
    const leaf=ctx.createLinearGradient(-r,-r,r,r);leaf.addColorStop(0,night?'#426a5b':'#849a61');leaf.addColorStop(.5,night?'#294f43':'#577d50');leaf.addColorStop(1,night?'#1f423a':'#345d42');ctx.fillStyle=leaf;
    ctx.beginPath();ctx.moveTo(-r*.07,0);
    for(let i=0;i<=56;i++){const a=.22+(Math.PI*2-.44)*i/56,rr=r*(1+Math.sin(a*7)*.024);ctx.lineTo(Math.cos(a)*rr,Math.sin(a)*rr*.9)}
    ctx.closePath();ctx.fill();ctx.shadowColor='transparent';ctx.strokeStyle='rgba(214,225,158,.22)';ctx.lineWidth=.8;ctx.stroke();
    for(let i=0;i<10;i++){let a=.4+i*(Math.PI*2-.8)/10;ctx.beginPath();ctx.moveTo(-r*.07,0);ctx.quadraticCurveTo(Math.cos(a+.14)*r*.45,Math.sin(a+.14)*r*.4,Math.cos(a)*r*.88,Math.sin(a)*r*.78);ctx.stroke()}
    if(flower){
      ctx.save();ctx.translate(-r*.16,-r*.1);ctx.shadowColor='#102c2544';ctx.shadowBlur=5;ctx.shadowOffsetY=3;
      for(let layer=0;layer<2;layer++)for(let i=0;i<8;i++){const a=i*Math.PI/4+layer*.4,reach=layer?5:9;ctx.fillStyle=flower==='rose'?(layer?'#f4dfdb':'#c999a3'):(layer?'#f5ebdc':'#d8c9c0');ctx.beginPath();ctx.ellipse(Math.cos(a)*reach,Math.sin(a)*reach,layer?8:11,layer?3.7:4.8,a,0,Math.PI*2);ctx.fill()}
      ctx.shadowColor='transparent';ctx.fillStyle='#d8ba70';ctx.beginPath();ctx.arc(0,0,4,0,Math.PI*2);ctx.fill();ctx.restore();
    }
    ctx.restore();
  }
  function drawBranch(x,y,angle,scale){
    ctx.save();ctx.translate(x,y);ctx.rotate(angle);ctx.scale(scale,scale);
    ctx.strokeStyle=night?'#0b2628':'#143d31';ctx.lineWidth=2;
    ctx.beginPath();ctx.moveTo(0,0);ctx.quadraticCurveTo(70,30,135,0);ctx.stroke();
    for(let i=0;i<7;i++)for(const side of SIDES){
      const x=18+i*16,y=Math.sin(x/135*Math.PI)*13;
      ctx.save();ctx.translate(x,y);ctx.rotate(side*.65-.1);ctx.fillStyle=night?'#123633':'#244e39';ctx.beginPath();ctx.moveTo(0,0);ctx.bezierCurveTo(5,-9,23,-10,34,-2);ctx.bezierCurveTo(23,6,9,8,0,0);ctx.fill();ctx.restore();
    }
    ctx.restore();
  }
  // Rasterize detailed leaves and shadows only when size, theme, or pixel density changes.
  function makeDecorSprite(width,height,originX,originY,paint){
    const image=document.createElement('canvas');
    image.width=Math.ceil(width*dpr);image.height=Math.ceil(height*dpr);
    const spriteCtx=image.getContext('2d');spriteCtx.setTransform(dpr,0,0,dpr,originX*dpr,originY*dpr);
    ctx=spriteCtx;
    try{paint()}finally{ctx=mainCtx}
    return{image,width:image.width/dpr,height:image.height/dpr,originX,originY};
  }
  function buildDecorSprites(){
    // Cache the soft halo; no per-frame blur filters or glow textures.
    goldenAuraSprite=makeDecorSprite(240,240,120,120,()=>{
      const glow=ctx.createRadialGradient(0,0,0,0,0,120);
      glow.addColorStop(0,'rgba(255,223,132,.64)');
      glow.addColorStop(.3,'rgba(255,213,100,.46)');
      glow.addColorStop(.62,'rgba(243,188,66,.22)');
      glow.addColorStop(1,'rgba(243,188,66,0)');
      ctx.fillStyle=glow;ctx.fillRect(-120,-120,240,240);
    });
    const s=Math.min(w,h);
    decorSprites=LILY_PADS.map((pad,index)=>{
      const r=s*pad.r,padding=r+26;
      return{...pad,kind:'pad',body:plantBodies[index],radius:r,...makeDecorSprite(padding*2,padding*2,padding,padding,()=>drawLilypad(0,0,r,0,pad.flower))};
    });
    for(const branch of BRANCHES){
      decorSprites.push({...branch,kind:'branch',...makeDecorSprite(196,100,12,50,()=>drawBranch(0,0,0,1))});
    }
  }
  function drawDecor(){
    for(const sprite of decorSprites){
      const {x,y,angle}=decorPose(sprite);
      ctx.save();ctx.translate(x,y);ctx.rotate(angle);
      if(sprite.kind==='branch')ctx.scale(sprite.scale,sprite.scale);else ctx.globalAlpha=night?.66:.76;
      ctx.drawImage(sprite.image,-sprite.originX,-sprite.originY,sprite.width,sprite.height);ctx.restore();
    }
  }
  function koiBodyPath(S,bend){
    ctx.beginPath();ctx.moveTo(S*.62,-S*.055);
    ctx.bezierCurveTo(S*.47,-S*.16,S*.20,-S*.28,-S*.12,-S*.25);
    ctx.bezierCurveTo(-S*.36,-S*.22,-S*.52,-S*.10+bend*.45,-S*.66,bend);
    ctx.bezierCurveTo(-S*.52,S*.10+bend*.45,-S*.36,S*.22,-S*.12,S*.25);
    ctx.bezierCurveTo(S*.20,S*.28,S*.47,S*.16,S*.62,S*.055);
    ctx.quadraticCurveTo(S*.69,0,S*.62,-S*.055);ctx.closePath();
  }
  function koiMark(x,y,rx,ry,angle){
    ctx.save();ctx.translate(x,y);ctx.rotate(angle);ctx.beginPath();
    ctx.moveTo(rx,0);
    ctx.bezierCurveTo(rx*.9,-ry*.72,rx*.22,-ry*1.17,-rx*.28,-ry*.84);
    ctx.bezierCurveTo(-rx*.94,-ry*.95,-rx*1.12,-ry*.17,-rx*.83,ry*.35);
    ctx.bezierCurveTo(-rx*.58,ry*1.15,rx*.28,ry*.96,rx*.76,ry*.56);
    ctx.quadraticCurveTo(rx*1.11,ry*.23,rx,0);ctx.fill();ctx.restore();
  }
  function drawGoldenAura(f){
    if(!goldenAuraSprite)return;
    const S=f.size,pulse=1+Math.sin(t*.9+f.phase)*.055;
    ctx.save();ctx.translate(f.x,f.y);ctx.rotate(f.a);
    ctx.globalAlpha=night?.92:.76;
    ctx.drawImage(goldenAuraSprite.image,-S*1.65*pulse,-S*1.02*pulse,S*3.3*pulse,S*2.04*pulse);
    // A few slow firefly-like glints orbit the halo, following Kin as he swims.
    const count=quality<2?5:3;
    for(let i=0;i<count;i++){
      const angle=t*.24+f.phase+i*Math.PI*2/count;
      const x=Math.cos(angle)*S*1.18-S*.12,y=Math.sin(angle)*S*.65;
      const shimmer=.5+.5*Math.sin(t*1.3+i*2.4+f.phase),r=1.1+shimmer*1.2;
      ctx.globalAlpha=(night?.9:.8)*(.3+shimmer*.7);ctx.fillStyle='#ffe6a4';
      ctx.beginPath();ctx.moveTo(x-r*1.8,y);ctx.quadraticCurveTo(x,y-r*.25,x,y-r*1.8);
      ctx.quadraticCurveTo(x+r*.25,y,x+r*1.8,y);ctx.quadraticCurveTo(x,y+r*.25,x,y+r*1.8);
      ctx.quadraticCurveTo(x-r*.25,y,x-r*1.8,y);ctx.fill();
    }
    ctx.restore();
  }
  function drawKoi(f){
    const S=f.size,beat=t*(4.4+f.v*2)+f.phase,bend=Math.sin(beat)*S*.115;
    // Cheap offset shadow instead of canvas shadowBlur (which is very slow in many browsers).
    ctx.save();ctx.translate(f.x+2,f.y+10);ctx.rotate(f.a);ctx.fillStyle='rgba(0,17,20,.2)';koiBodyPath(S,bend);ctx.fill();ctx.restore();
    if(f.golden)drawGoldenAura(f);
    ctx.save();ctx.translate(f.x,f.y);ctx.rotate(f.a+Math.sin(beat*.5)*.024);
    // The tail and paired fins move independently of the body.
    ctx.save();ctx.translate(-S*.61,bend);ctx.rotate(Math.sin(beat)*.23);
    ctx.fillStyle=f.color.fin;ctx.globalAlpha=.93;
    ctx.beginPath();ctx.moveTo(0,0);ctx.bezierCurveTo(-S*.17,-S*.10,-S*.26,-S*.34,-S*.49,-S*.36);
    ctx.quadraticCurveTo(-S*.38,-S*.12,-S*.35,0);
    ctx.quadraticCurveTo(-S*.38,S*.12,-S*.49,S*.36);
    ctx.bezierCurveTo(-S*.26,S*.34,-S*.17,S*.10,0,0);ctx.fill();
    if(quality<2){
      ctx.strokeStyle='rgba(255,249,225,.32)';ctx.lineWidth=.8;
      ctx.beginPath();
      for(const side of SIDES){ctx.moveTo(-S*.06,0);ctx.quadraticCurveTo(-S*.29,side*S*.16,-S*.44,side*S*.32)}
      ctx.stroke();
    }
    ctx.restore();
    for(const side of SIDES){
      ctx.save();ctx.translate(S*.08,side*S*.19);ctx.rotate(side*(Math.sin(beat+side)*.16));
      ctx.fillStyle=f.color.fin;ctx.globalAlpha=.83;
      ctx.beginPath();ctx.moveTo(0,0);ctx.quadraticCurveTo(-S*.04,side*S*.24,-S*.25,side*S*.29);
      ctx.quadraticCurveTo(-S*.32,side*S*.18,-S*.16,side*S*.03);ctx.closePath();ctx.fill();
      if(quality<2){
        ctx.strokeStyle='rgba(255,249,228,.38)';ctx.lineWidth=.75;
        ctx.beginPath();
        for(let i=1;i<=3;i++){ctx.moveTo(-S*.02,side*S*.025);ctx.lineTo(-S*(.13+i*.03),side*S*(.08+i*.05))}
        ctx.stroke();
      }
      ctx.restore();
    }
    if(!f.grad){
      const g=ctx.createLinearGradient(0,-S*.28,0,S*.28);
      g.addColorStop(0,f.color.fin);g.addColorStop(.31,f.color.base);g.addColorStop(.64,f.color.base);g.addColorStop(1,f.color.fin);
      f.grad=g;
    }
    ctx.fillStyle=f.grad;koiBodyPath(S,bend);ctx.fill();
    ctx.save();koiBodyPath(S,bend);ctx.clip();
    PATTERNS[f.pattern].forEach((p,i)=>{ctx.fillStyle=i===1&&f.pattern%2?f.color.accent:f.color.patch;koiMark(p[0]*S,p[1]*S,p[2]*S,p[3]*S,p[4])});
    // Keep every body detail clipped to the silhouette so no lines protrude.
    ctx.strokeStyle='rgba(255,255,241,.4)';ctx.lineWidth=S*.026;ctx.lineCap='round';
    ctx.beginPath();ctx.moveTo(S*.48,-S*.07);ctx.bezierCurveTo(S*.23,-S*.22,-S*.09,-S*.19,-S*.33,-S*.09);ctx.stroke();
    if(quality===0){
      // Faint scale rows, batched into one stroke.
      ctx.strokeStyle='rgba(43,60,55,.15)';ctx.lineWidth=.7;
      const sr=S*.065,c0=Math.cos(-.9)*sr,s0=Math.sin(-.9)*sr;
      ctx.beginPath();
      for(const row of SIDES)for(let i=0;i<5;i++){const x=-S*.35+i*S*.15,y=row*S*.14;ctx.moveTo(x+c0,y+s0);ctx.arc(x,y,sr,-.9,.8)}
      ctx.stroke();
    }
    // A smooth face with eyes only.
    ctx.fillStyle='#26352f';for(const side of SIDES){ctx.beginPath();ctx.arc(S*.49,side*S*.086,S*.023,0,Math.PI*2);ctx.fill()}
    ctx.restore();
    ctx.restore();
  }
  function drawSurface(){for(const r of ripples){const gap=r.rain?5:13;ctx.strokeStyle=`rgba(211,236,217,${r.life*(r.rain?.22:r.ambient?.13:.32)})`;ctx.lineWidth=r.ambient?1:1.5;for(let i=0;i<2;i++){ctx.beginPath();ctx.ellipse(r.x,r.y,r.r+i*gap,(r.r+i*gap)*.42,0,0,7);ctx.stroke()}}for(const p of food){ctx.fillStyle=`rgba(222,196,139,${Math.min(1,p.life*1.8)})`;ctx.beginPath();ctx.arc(p.x,p.y,p.r,0,7);ctx.fill()}}
  function rainFall(d){d.x=rand(0,w);d.ly=rand(h*.05,h);d.y=d.ly-rand(140,260);d.v=rand(850,1250);d.fall=true}
  function updateRain(dt){
    rainMix+=((raining?1:0)-rainMix)*Math.min(1,dt*1.5);
    if(!raining&&rainMix<.01){rainMix=0;return}
    for(const d of rainDrops){
      if(!d.fall){d.wait-=dt;if(d.wait<=0&&raining)rainFall(d);continue}
      d.y+=d.v*dt;
      if(d.y>=d.ly){d.fall=false;d.wait=rand(.5,2.5);ripples.push({x:d.x,y:d.ly,r:1,life:.8,s:40,f:1.7,rain:true})}
    }
  }
  function drawRain(){
    if(rainMix<.01)return;
    ctx.fillStyle=`rgba(6,28,30,${.14*rainMix})`;ctx.fillRect(0,0,w,h);
    ctx.strokeStyle=`rgba(214,236,228,${.35*rainMix})`;ctx.lineWidth=1;ctx.lineCap='round';
    ctx.beginPath();
    for(const d of rainDrops)if(d.fall){ctx.moveTo(d.x-1.5,d.y-22);ctx.lineTo(d.x,d.y)}
    ctx.stroke();
  }
  function update(dt){
    t+=dt;PondPlants.update(plantBodies,dt,t,w,h);updateRain(dt);updateSurprises(dt);
    ambientTimer-=dt;
    if(ambientTimer<=0){ripples.push({x:rand(w*.12,w*.88),y:rand(h*.14,h*.82),r:2,life:.8,ambient:true});ambientTimer=rand(1.5,3.7)}
    for(const r of ripples){r.r+=dt*(r.s||62);r.life-=dt*(r.f||.7)}ripples=ripples.filter(r=>r.life>0);
    for(const p of food){p.life-=dt*.055;p.y+=dt*1.5}food=food.filter(p=>p.life>0);
    for(const f of fish){
      f.wander-=dt;f.burst=Math.max(0,f.burst-dt);
      if(f.wander<=0||Math.hypot(f.tx-f.x,f.ty-f.y)<f.size*.8){
        const margin=Math.min(90,Math.min(w,h)*.16);
        f.tx=rand(margin,Math.max(margin+1,w-margin));
        f.ty=w<=720?rand(h*.36,h*.65):rand(margin,Math.max(margin+1,h-margin));
        f.wander=rand(3,8);
        if(Math.random()<.28)f.burst=rand(.7,1.7);
      }
      let target=null,best=Infinity;
      for(const p of food){let d=(f.x-p.x)**2+(f.y-p.y)**2;if(d<best){best=d;target=p}}
      const hungry=target&&best<Math.max(w,h)**2*.38;
      let dx=(hungry?target.x:f.tx)-f.x,dy=(hungry?target.y:f.ty)-f.y;
      // A gentle repulsion prevents the koi from stacking on top of one another.
      for(const other of fish){
        if(other===f)continue;
        const ox=f.x-other.x,oy=f.y-other.y,d2=ox*ox+oy*oy,space=f.size*1.65;
        if(d2>1&&d2<space*space){const force=(space-Math.sqrt(d2))/space;dx+=ox*force*2.4;dy+=oy*force*2.4}
      }
      const edge=Math.min(65,Math.min(w,h)*.13);
      if(f.x<edge)dx+=(edge-f.x)*2;
      if(f.x>w-edge)dx-=(f.x-(w-edge))*2;
      if(f.y<edge)dy+=(edge-f.y)*2;
      if(f.y>h-edge)dy-=(f.y-(h-edge))*2;
      const desired=Math.atan2(dy,dx),diff=Math.atan2(Math.sin(desired-f.a),Math.cos(desired-f.a));
      f.a+=clamp(diff,-dt*f.turnRate,dt*f.turnRate);
      const glide=.86+Math.sin(t*1.25+f.phase)*.16;
      const speed=(hungry?1.05:f.v)*(f.burst>0?1.55:glide)*pace*dt*54;
      f.x=clamp(f.x+Math.cos(f.a)*speed,18,w-18);
      f.y=clamp(f.y+Math.sin(f.a)*speed,18,h-18);
      if(hungry&&best<(f.size*.31)**2){
        food.splice(food.indexOf(target),1);Life.feed(f);queueSave();
        if(f.id===selectedKoi)document.querySelector('#koi-tag-detail').textContent=`${f.meals} meals shared`;
        ripples.push({x:f.x+Math.cos(f.a)*f.size*.5,y:f.y+Math.sin(f.a)*f.size*.5,r:2,life:.5});
        f.burst=rand(.4,.9);
      }
    }
    syncFeedingStatus();
  }
  function render(){
    ctx.drawImage(bgCanvas,0,0,w,h);
    drawCaustics();
    for(const f of fish)drawKoi(f);
    drawDecor();
    drawSurprise();
    drawSurface();
    drawRain();
    positionKoiTag();
  }
  function frame(now){
    requestAnimationFrame(frame);
    if(document.hidden){last=now;return}
    const el=now-last;
    // Cap at roughly 60fps so 120/144Hz displays don't do double the work.
    if(el<12)return;
    last=now;
    if(!qStamp)qStamp=now;
    // While paused nothing moves, so only redraw when something actually changed.
    if(paused&&!dirty)return;
    if(!paused){
      update(Math.min(el/1000,.05));
      // If frames stay slow, quietly step down to a lighter rendering mode.
      if(el<250){
        ema+=(el-ema)*.05;
        if(quality<2&&ema>27&&now-qStamp>2500)setQuality(quality+1,now);
      }
    }
    render();dirty=false;
  }
  canvas.addEventListener('pointerdown',e=>{
    const r=canvas.getBoundingClientRect(),x=e.clientX-r.left,y=e.clientY-r.top,chosen=nearestKoi(x,y);
    if(removing){if(chosen){fish.splice(fish.indexOf(chosen),1);setRemoveMode(false);updateStatus()}}
    else if(chosen)showKoi(chosen);
    else{closeKoiTag();drop(x,y)}
  });
  toggleControlsBtn.onclick=()=>{
    const collapsed=toggleControlsBtn.getAttribute('aria-expanded')==='true';
    if(collapsed&&removing){setRemoveMode(false);updateStatus()}
    panelContent.inert=collapsed;
    panelContent.setAttribute('aria-hidden',String(collapsed));
    instruction.setAttribute('aria-hidden',String(collapsed));
    panel.classList.toggle('is-collapsed',collapsed);
    panel.closest('.bottom').classList.toggle('controls-collapsed',collapsed);
    toggleControlsBtn.setAttribute('aria-expanded',String(!collapsed));
    toggleControlsBtn.querySelector('span').textContent=collapsed?'Show controls':'Hide controls';queueSave();
  };
  feedBtn.onclick=()=>drop(rand(w*.3,w*.7),rand(h*.3,h*.65),8);
  addBtn.onclick=()=>{if(fish.length<12){spawn();if(removing)setRemoveMode(false)}else status.textContent='The pond is full (12 koi)'};
  removeBtn.onclick=()=>{if(fish.length||removing)setRemoveMode(!removing);else status.textContent='No koi to remove'};
  function syncPause(){pauseBtn.querySelector('span').textContent=paused?'Resume':'Pause';pauseBtn.querySelector('svg').innerHTML=paused?'<path d="m8 5 11 7-11 7Z"/>':'<path d="M9 5v14M15 5v14"/>';pauseBtn.title=paused?'Resume pond':'Pause pond';pauseBtn.setAttribute('aria-pressed',paused);document.querySelector('#pause-badge').hidden=!paused;updateStatus()}
  pauseBtn.onclick=()=>{paused=!paused;syncPause()};
  const rainFxBtn=document.querySelector('#rainfx');
  rainFxBtn.onclick=()=>{
    raining=!raining;
    if(raining&&!rainDrops.length)rainDrops=Array.from({length:36},()=>({x:0,ly:0,y:0,v:0,fall:false,wait:rand(0,2)}));
    rainFxBtn.setAttribute('aria-pressed',raining);
    rainFxBtn.querySelector('span').textContent=raining?'Remove rain':'Add rain';
    audio.toggle('rain',raining);
    dirty=true;queueSave();
  };
  nightBtn.onclick=()=>{night=!night;nightBtn.querySelector('span').textContent=night?'Daylight':'Moonlight';nightBtn.title=night?'Switch to daylight':'Switch to moonlight';nightBtn.setAttribute('aria-pressed',night);document.querySelector('main').dataset.night=night;document.querySelector('#light-label').textContent=night?'Moonlight':'Daylight';buildLayers();queueSave();dirty=true};
  speedInput.oninput=()=>{pace=Number(speedInput.value);speedValue.textContent=`${pace.toFixed(1)}×`;queueSave()};
  document.addEventListener('keydown',e=>{
    if(e.key==='Escape'){if(removing)setRemoveMode(false);if(!koiTag.hidden){closeKoiTag();canvas.focus({preventScroll:true})}}
    if(e.code==='Space'&&!e.target.closest?.('button,input,select,textarea,[contenteditable=true]')){e.preventDefault();pauseBtn.click()}
  });
  function queueSave(){clearTimeout(saveTimer);saveTimer=setTimeout(savePond,900)}
  function welcomeSlotGolden(announceArrival=false){
    for(const [id,record] of pendingSlotGolden){
      if(!fish.some(f=>f.id===id)){
        if(fish.length>=Life.MAX_KOI)return false;
        spawn(clamp(record.x*w,30,w-30),clamp(record.y*h,30,h-30),record);
        if(announceArrival)announce(`${record.name} has arrived from Golden Seed. A golden friend for your pond.`);
      }
      seenSlotGolden.add(id);pendingSlotGolden.delete(id);
    }
    pond.fish=fish.map(f=>Life.record(f,w,h));
    return true;
  }
  function receiveSlotGolden(raw,announceArrival=false){
    const incoming=Life.decode(raw);
    for(const golden of incoming?.fish||[]){
      if(golden.golden&&(golden.id===SLOT_GOLDEN_ID||golden.id.startsWith(SLOT_GOLDEN_ID+'-'))&&!seenSlotGolden.has(golden.id))pendingSlotGolden.set(golden.id,golden);
    }
    return welcomeSlotGolden(announceArrival);
  }
  function savePond(){
    clearTimeout(saveTimer);
    try{
      // A suspended tab can save before its queued storage event is delivered.
      if(!receiveSlotGolden(localStorage.getItem(Life.KEY))){
        memoryLine.textContent='Kin is waiting. Remove a koi to welcome him and save your pond.';
        return;
      }
      pond.savedAt=Date.now();pond.fish=fish.map(f=>Life.record(f,w,h));
      pond.settings={night,raining,pace,rainVolume:Number(rainVolInput.value),collapsed:panel.classList.contains('is-collapsed'),audio:{...audioPreferences}};
      localStorage.setItem(Life.KEY,JSON.stringify(pond));memoryLine.textContent='Your pond is saved on this device.';
    }
    catch{memoryLine.textContent='Saving is unavailable here. Your pond will last for this visit.'}
  }
  function refreshKoiPicker(){
    const previous=koiPicker.value;koiPicker.replaceChildren(new Option('Meet a koi…',''));
    for(const f of fish)koiPicker.add(new Option(f.name+(f.golden?' · golden':''),f.id));
    if(fish.some(f=>f.id===previous))koiPicker.value=previous;
    koiPicker.disabled=!fish.length;
    if(selectedKoi&&!fish.some(f=>f.id===selectedKoi))closeKoiTag();
  }
  function showKoi(f){
    tagPosition=null;selectedKoi=f.id;koiTag.hidden=false;koiLink.removeAttribute('hidden');renameForm.hidden=true;renameBtn.hidden=false;
    document.querySelector('#koi-tag-title').textContent=f.name+(f.golden?' · golden koi':'');
    document.querySelector('#koi-tag-detail').textContent=f.meals?`${f.meals} meals shared`:'A new friend. A little food helps them grow.';
    nameInput.value=f.name;nameInput.setCustomValidity('');koiPicker.value=f.id;
    tagSide=-1;positionKoiTag();dirty=true;
  }
  function positionKoiTag(){
    if(koiTag.hidden)return;
    const f=fish.find(f=>f.id===selectedKoi);if(!f){closeKoiTag();return}
    const width=koiTag.offsetWidth,height=koiTag.offsetHeight,rect=canvas.getBoundingClientRect(),viewport=window.visualViewport;
    const left=Math.max(12,(viewport?.offsetLeft||0)-rect.left+12);
    const top=Math.max(12,(viewport?.offsetTop||0)-rect.top+12);
    const right=Math.max(left,Math.min(w,(viewport?.offsetLeft||0)+(viewport?.width||innerWidth)-rect.left)-width-12);
    const bottom=Math.max(top,Math.min(h,(viewport?.offsetTop||0)+(viewport?.height||innerHeight)-rect.top)-height-12);
    const gap=f.size*.45+24;
    // Only an active press or name edit pins the card; passive hover/focus must not stop tracking.
    const held=tagPressed||!renameForm.hidden;
    if(!held||!tagPosition){
      if(tagSide===-1&&f.y-gap-height<top&&f.y+gap<bottom)tagSide=1;
      else if(tagSide===1&&f.y+gap>bottom&&f.y-gap-height>top)tagSide=-1;
      tagPosition={x:clamp(f.x-width/2,left,right),y:clamp(tagSide===-1?f.y-gap-height:f.y+gap,top,bottom)};
    }
    tagPosition.x=clamp(tagPosition.x,left,right);tagPosition.y=clamp(tagPosition.y,top,bottom);
    const {x,y}=tagPosition;
    koiTag.style.transform=`translate3d(${x.toFixed(2)}px,${y.toFixed(2)}px,0)`;
    // Attach at the nearest card edge. The fine curved thread stays tied to the koi.
    const cx=x+width/2,cy=y+height/2,dx=f.x-cx,dy=f.y-cy;
    let ax,ay;
    if(Math.abs(dx)/width>Math.abs(dy)/height){ax=dx<0?x:x+width;ay=clamp(f.y,y+16,y+height-16)}
    else{ax=clamp(f.x,x+16,x+width-16);ay=dy<0?y:y+height}
    const bend=clamp((f.x-ax)*.2,-24,24);
    koiLinkLine.setAttribute('d',`M ${ax} ${ay} Q ${(ax+f.x)/2+bend} ${(ay+f.y)/2} ${f.x} ${f.y}`);
    for(const dot of [koiLinkHalo,koiLinkDot]){dot.setAttribute('cx',f.x);dot.setAttribute('cy',f.y)}
  }
  function closeKoiTag(){selectedKoi=null;tagPosition=null;tagPressed=false;koiTag.hidden=true;koiLink.setAttribute('hidden','');renameForm.hidden=true;renameBtn.hidden=false;koiPicker.value='';dirty=true}
  function nearestKoi(x,y){
    let chosen=null,best=Infinity;
    for(const f of fish){const dx=x-f.x,dy=y-f.y,c=Math.cos(f.a),s=Math.sin(f.a),along=dx*c+dy*s,across=-dx*s+dy*c;
      const distance=(along/(f.size*.95))**2+(across/(Math.max(16,f.size*.36)))**2;
      if(distance<=1&&distance<best){chosen=f;best=distance}
    }
    return chosen;
  }
  function announce(text){
    momentLine.textContent=text;momentLine.classList.add('visible');clearTimeout(momentTimer);
    momentTimer=setTimeout(()=>momentLine.classList.remove('visible'),7000);
  }
  function checkGrowthAndVisitors(){
    const now=Date.now();
    for(const f of fish){const old=f.growth;Life.settleGrowth(f,now);if(old!==f.growth){f.size=f.baseSize*(1+f.growth)*(w<=720?.72:1);f.grad=null;dirty=true}}
    pond.fish=fish.map(f=>Life.record(f,w,h));
    savePond();
  }
  function decorPose(sprite){
    const phase=sprite.phase;let x=w*sprite.x,y=h*sprite.y,angle=sprite.angle;
    if(sprite.kind==='pad'){
      x=sprite.body.x;y=sprite.body.y;
      angle+=Math.sin(t*.16+phase)*.16;
    }else{x+=sprite.x===1?8:-20;angle+=Math.sin(t*.2+phase)*.045}
    return{x,y,angle};
  }
  function beginSurprise(kind){
    const kinds=night?['frog','leaf','petals']:['dragonfly','frog','leaf','petals'];
    kind=kind||kinds[Math.floor(Math.random()*kinds.length)];
    sceneEvent=PondSurprises.create(kind,LILY_PADS);
    if(kind==='dragonfly')announce('Dragonflies are exploring the pond.');
    if(kind==='frog')announce('A few little visitors on the lily pads.');
  }

  function updateSurprises(dt){
    if(sceneEvent){sceneEvent.age+=dt;if(sceneEvent.age>=sceneEvent.duration){sceneEvent=null;surpriseIn=rand(90,210)}}
    else{surpriseIn-=dt;if(surpriseIn<=0)beginSurprise()}
  }
  function drawSurprise(){
    if(!sceneEvent)return;
    const e=sceneEvent,pads=decorSprites.slice(0,LILY_PADS.length).map(decorPose);
    for(const actor of e.actors){
      const pose=PondSurprises.pose(e,actor,pads,w,h);if(!pose)continue;
      ctx.save();ctx.globalAlpha=pose.fade*.85;ctx.translate(pose.x,pose.y);ctx.rotate(pose.angle);ctx.scale(actor.scale,actor.scale);
      if(e.kind==='leaf'||e.kind==='petals'){
        ctx.fillStyle=e.kind==='leaf'?'#b9ad6c':'#e7b7c8';ctx.beginPath();
        if(e.kind==='leaf'){ctx.moveTo(-13,0);ctx.quadraticCurveTo(0,-12,15,0);ctx.quadraticCurveTo(0,12,-13,0)}
        else{ctx.moveTo(0,6);ctx.bezierCurveTo(-9,0,-6,-7,-2,-6);ctx.lineTo(0,-3);ctx.lineTo(2,-6);ctx.bezierCurveTo(6,-7,9,0,0,6)}
        ctx.fill();if(e.kind==='leaf'){ctx.strokeStyle='#65734c';ctx.lineWidth=.8;ctx.beginPath();ctx.moveTo(-10,0);ctx.lineTo(11,0);ctx.stroke()}
      }else if(e.kind==='dragonfly'){
        const wing=pose.flying?Math.sin((e.age-actor.delay)*65+actor.phase)*.5:.08;
        ctx.fillStyle='rgba(221,237,222,.65)';
        for(const side of SIDES)for(const back of [-1,1]){ctx.beginPath();ctx.ellipse(side*8,back*4,10,2.5,side*(wing+back*.35),0,Math.PI*2);ctx.fill()}
        ctx.strokeStyle='#77a5a0';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(0,-7);ctx.lineTo(0,15);ctx.stroke();ctx.fillStyle='#bdcda6';ctx.beginPath();ctx.arc(0,-9,3,0,7);ctx.fill();
      }else{
        ctx.fillStyle='#73915a';
        for(const side of SIDES){ctx.beginPath();ctx.ellipse(side*8,pose.flying?10:6,5,3,side*.5,0,7);ctx.fill()}
        ctx.beginPath();ctx.ellipse(0,0,9,11,0,0,7);ctx.fill();
        for(const side of SIDES){ctx.fillStyle='#9ead70';ctx.beginPath();ctx.arc(side*5,-8,4,0,7);ctx.fill();ctx.fillStyle='#233c2d';ctx.beginPath();ctx.arc(side*5,-9,1.5,0,7);ctx.fill()}
      }
      ctx.restore();
    }
  }
  const ambientBtn=document.querySelector('#ambient'),musicBtn=document.querySelector('#music');
  const rainVolInput=document.querySelector('#rainvol'),rainVolValue=document.querySelector('#rainvol-value'),resumeAudioBtn=document.querySelector('#resume-audio');
  let audioPreferences={...pond.settings.audio,rain:raining};
  const audio=new PondAudio(enabled=>{
    audioPreferences={...enabled,rain:raining};
    ambientBtn.setAttribute('aria-pressed',enabled.ambient);musicBtn.setAttribute('aria-pressed',enabled.music);
    ambientBtn.querySelector('span').textContent=enabled.ambient?'Nature sounds on':'Nature sounds';
    musicBtn.querySelector('span').textContent=enabled.music?'Music on':'Gentle music';
    syncAudioRecovery();queueSave();
  },message=>{document.querySelector('#audio-status').textContent=message},()=>syncAudioRecovery());
  function syncAudioRecovery(){
    const needsTap=Object.values(audioPreferences).some(Boolean)&&(!Object.values(audio.enabled).some(Boolean)||audio.needsResume);
    resumeAudioBtn.hidden=!needsTap;
    const message=document.querySelector('#audio-status');
    if(needsTap)message.textContent='Tap the pond to resume your sounds.';
    else if(audio.loading.size)message.textContent='Loading sounds…';
    else if(['Tap the pond to resume your sounds.','Loading sounds…'].includes(message.textContent))message.textContent='';
  }
  function resumeSavedAudio(){
    if(document.hidden)return;
    const wanted={...audioPreferences};
    for(const name of Object.keys(wanted))if(wanted[name])audio.toggle(name,true);
  }
  function toggleSound(name){
    const interrupted=audio.enabled[name]&&!audio.loading.has(name)&&!audio.isPlaying(name);
    audio.toggle(name,interrupted||!audio.enabled[name]);
  }
  ambientBtn.onclick=()=>toggleSound('ambient');
  musicBtn.onclick=()=>toggleSound('music');
  resumeAudioBtn.onclick=resumeSavedAudio;
  document.addEventListener('click',e=>{
    if(e.target.closest?.('#rainfx,#ambient,#music,#resume-audio'))return;
    if(Object.values(audioPreferences).some(Boolean)&&(!Object.values(audio.enabled).some(Boolean)||audio.needsResume))resumeSavedAudio();
  });
  rainVolInput.oninput=()=>{const value=Number(rainVolInput.value);rainVolValue.textContent=`${value}%`;audio.setVolume(value);queueSave()};
  koiPicker.onchange=()=>{const f=fish.find(f=>f.id===koiPicker.value);if(f)showKoi(f)};
  document.querySelector('#close-koi-tag').onclick=()=>{closeKoiTag();canvas.focus({preventScroll:true})};
  renameBtn.onclick=()=>{renameForm.hidden=false;renameBtn.hidden=true;nameInput.focus();nameInput.select()};
  koiTag.addEventListener('pointerdown',()=>{tagPressed=true});
  document.addEventListener('pointerup',()=>{tagPressed=false;dirty=true});
  document.addEventListener('pointercancel',()=>{tagPressed=false;dirty=true});
  window.addEventListener('blur',()=>{tagPressed=false;dirty=true});
  koiTag.addEventListener('focusout',()=>{dirty=true});
  new ResizeObserver(()=>positionKoiTag()).observe(koiTag);
  window.visualViewport?.addEventListener('resize',()=>positionKoiTag());
  window.visualViewport?.addEventListener('scroll',()=>positionKoiTag());
  nameInput.oninput=()=>nameInput.setCustomValidity('');
  renameForm.onsubmit=e=>{
    e.preventDefault();const f=fish.find(f=>f.id===selectedKoi);if(!f)return;
    const name=nameInput.value.trim();if(!name){nameInput.setCustomValidity('Give your koi a name.');nameInput.reportValidity();return}
    f.name=Life.cleanName(name,f.name);refreshKoiPicker();showKoi(f);renameBtn.focus();savePond();
  };
  document.addEventListener('visibilitychange',()=>{savePond();if(Runtime.mobile)audio.visibility(document.hidden);else if(!document.hidden&&audio.needsResume)audio.resume();if(!document.hidden){last=performance.now();checkGrowthAndVisitors()}});
  window.addEventListener('storage',e=>{
    if(e.key!==Life.KEY||(e.storageArea&&e.storageArea!==localStorage))return;
    if(!receiveSlotGolden(e.newValue,true)){
      memoryLine.textContent='Kin is waiting. Remove a koi to welcome him and save your pond.';
      announce('A golden koi is waiting outside your full pond. Remove a koi to welcome Kin.');
    }
  });
  window.addEventListener('pagehide',()=>{savePond();audio.visibility(true)});
  window.addEventListener('pageshow',()=>{audio.visibility(document.hidden&&Runtime.mobile);syncAudioRecovery()});
  window.addEventListener('focus',()=>{if(!document.hidden)audio.visibility(false)});
  let resizeRaf=0;
  window.addEventListener('resize',()=>{cancelAnimationFrame(resizeRaf);resizeRaf=requestAnimationFrame(()=>resize())});
  resize();
  for(const record of pond.fish)spawn(clamp(record.x*w,30,w-30),clamp(record.y*h,30,h-30),record);
  if(raining)rainDrops=Array.from({length:36},()=>({x:0,ly:0,y:0,v:0,fall:false,wait:rand(0,2)}));
  rainFxBtn.setAttribute('aria-pressed',raining);rainFxBtn.querySelector('span').textContent=raining?'Remove rain':'Add rain';
  nightBtn.setAttribute('aria-pressed',night);nightBtn.querySelector('span').textContent=night?'Daylight':'Moonlight';nightBtn.title=night?'Switch to daylight':'Switch to moonlight';
  document.querySelector('main').dataset.night=night;document.querySelector('#light-label').textContent=night?'Moonlight':'Daylight';
  speedInput.value=pace;speedValue.textContent=`${pace.toFixed(1)}×`;
  rainVolInput.value=pond.settings.rainVolume;rainVolValue.textContent=`${pond.settings.rainVolume}%`;audio.setVolume(pond.settings.rainVolume);
  syncAudioRecovery();
  if(pond.settings.collapsed)toggleControlsBtn.click();
  if(stored)document.querySelector('.intro .eyebrow').textContent='Welcome back to your pond';
  syncPause();syncFeedingStatus();checkGrowthAndVisitors();setInterval(checkGrowthAndVisitors,30000);
  let backgroundSaveAt=0;
  Runtime.runBackground(update,()=>{const now=performance.now();if(now-backgroundSaveAt>=1000){backgroundSaveAt=now;checkGrowthAndVisitors()}dirty=true},()=>paused);
  requestAnimationFrame(frame);
  if(document.modelContext?.registerTool){
    const register=tool=>{try{Promise.resolve(document.modelContext.registerTool(tool)).catch(()=>{})}catch{}};
    register({name:'feed_koi',title:'Feed the koi',description:'Drop food into the pond at a position given as percentages of its width and height, up to 100 food pieces in the pond at once.',inputSchema:{type:'object',properties:{x:{type:'number',minimum:0,maximum:100},y:{type:'number',minimum:0,maximum:100}},required:['x','y'],additionalProperties:false},annotations:{readOnlyHint:false},execute(input){if(!input||!Number.isFinite(input.x)||!Number.isFinite(input.y)||input.x<0||input.x>100||input.y<0||input.y>100)throw Error('x and y must be numbers from 0 to 100');const added=drop(w*input.x/100,h*input.y/100);return{foodPieces:food.length,added,limit:MAX_FOOD}}});
    register({name:'add_koi',title:'Add a koi',description:'Add one koi to the pond, up to a maximum of twelve.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:false},execute(){if(fish.length>=12)throw Error('The pond is full');spawn();return{koiCount:fish.length}}});
    register({name:'remove_koi',title:'Remove a koi',description:'Remove a koi by its position in the pond, counting from one.',inputSchema:{type:'object',properties:{number:{type:'integer',minimum:1,maximum:12}},required:['number'],additionalProperties:false},annotations:{readOnlyHint:false},execute(input){if(!input||!Number.isInteger(input.number)||input.number<1||input.number>fish.length)throw Error('Choose a koi number currently in the pond');fish.splice(input.number-1,1);if(removing)setRemoveMode(false);updateStatus();return{koiCount:fish.length}}});
  }
})();
