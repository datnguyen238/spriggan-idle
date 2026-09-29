/* Persistent pond data and slow growth, independent of rendering. */
(()=>{
  'use strict';
  const DAY=86400000,KEY='spriggan.pond.v1',MAX_KOI=12,GROWTH_PER_DAY=.12,MAX_GROWTH=.75;
  const NAMES=['Mochi','Sumi','Yuzu','Miso','Hana','Nori','Kumo','Ume','Momo','Taro','Aki','Hoshi'];
  const finite=(v,fallback,min,max)=>Number.isFinite(v)?Math.max(min,Math.min(max,v)):fallback;
  const cleanName=(name,fallback)=>typeof name==='string'&&name.trim()?name.trim().slice(0,24):fallback;
  function makeFish(index=0,now=Date.now(),golden=false){
    return{id:globalThis.crypto?.randomUUID?.()||`koi-${now}-${Math.random().toString(36).slice(2)}`,name:golden?'Kin':NAMES[index%NAMES.length],golden,
      baseSize:49+Math.random()*21,pattern:index%6,createdAt:now,lastGrowthAt:now,growth:0,nutrition:0,meals:0,x:.2+Math.random()*.6,y:.39+Math.random()*.25};
  }
  function settleGrowth(f,now=Date.now()){
    const days=Math.max(0,now-f.lastGrowthAt)/DAY,used=Math.min(days,f.nutrition);
    f.growth=Math.min(MAX_GROWTH,f.growth+used*GROWTH_PER_DAY);f.nutrition=Math.max(0,f.nutrition-used);
    f.lastGrowthAt=Math.max(now,f.lastGrowthAt);
    return f.growth;
  }
  function feed(f,now=Date.now()){
    settleGrowth(f,now);f.nutrition=Math.min(3,f.nutrition+.1);f.meals=Math.min(1000000,f.meals+1);
  }
  function create(now=Date.now()){
    return{version:1,savedAt:now,nextGoldenAt:now+DAY,fish:Array.from({length:5},(_,i)=>makeFish(i,now)),
      settings:{night:false,raining:false,pace:1,rainVolume:40,collapsed:false,audio:{rain:false,ambient:false,music:false}}};
  }
  function decode(raw,now=Date.now()){
    try{
      const p=JSON.parse(raw);
      if(!p||p.version!==1||!Array.isArray(p.fish)||p.fish.length>MAX_KOI)return null;
      const ids=new Set();
      const fish=p.fish.map((f,i)=>{
        if(!f||typeof f!=='object')throw Error('Invalid koi');
        const seed=makeFish(i,now),id=typeof f.id==='string'&&f.id.length<100&&!ids.has(f.id)?f.id:seed.id;ids.add(id);
        const result={id,name:cleanName(f.name,seed.name),golden:f.golden===true,baseSize:finite(f.baseSize,seed.baseSize,49,70),pattern:Math.round(finite(f.pattern,i%6,0,5)),
          createdAt:finite(f.createdAt,now,0,now),lastGrowthAt:finite(f.lastGrowthAt,now,0,now),growth:finite(f.growth,0,0,MAX_GROWTH),nutrition:finite(f.nutrition,0,0,3),
          meals:Math.round(finite(f.meals,0,0,1000000)),x:finite(f.x,.5,0,1),y:finite(f.y,.5,0,1)};
        settleGrowth(result,now);return result;
      });
      // Treat duplicated golden flags in edited or corrupt storage as ordinary koi.
      let goldenFound=false;for(const f of fish){if(f.golden){if(goldenFound)f.golden=false;goldenFound=true}}
      const s=p.settings||{},audio=s.audio||{};
      return{version:1,savedAt:finite(p.savedAt,now,0,now),nextGoldenAt:finite(p.nextGoldenAt,now+DAY,0,now+DAY),fish,
        settings:{night:s.night===true,raining:s.raining===true,pace:finite(s.pace,1,.4,2),rainVolume:finite(s.rainVolume,40,0,100),collapsed:s.collapsed===true,
          audio:{rain:audio.rain===true,ambient:audio.ambient===true,music:audio.music===true}}};
    }catch{return null}
  }
  function maybeGolden(pond,now=Date.now(),random=Math.random){
    if(now<pond.nextGoldenAt||pond.fish.length>=MAX_KOI)return null;
    // One chance per elapsed day, not per reload or per missed day.
    pond.nextGoldenAt=now+DAY;
    if(pond.fish.some(f=>f.golden)||random()>=.18)return null;
    const f=makeFish(pond.fish.length,now,true);pond.fish.push(f);return f;
  }
  function record(f,w,h){
    return{id:f.id,name:f.name,golden:f.golden,baseSize:f.baseSize,pattern:f.pattern,createdAt:f.createdAt,lastGrowthAt:f.lastGrowthAt,
      growth:f.growth,nutrition:f.nutrition,meals:f.meals,x:finite(f.x/w,.5,0,1),y:finite(f.y/h,.5,0,1)};
  }
  const api={DAY,KEY,MAX_KOI,NAMES,makeFish,settleGrowth,feed,create,decode,maybeGolden,record,cleanName};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else globalThis.PondLife=api;
})();
