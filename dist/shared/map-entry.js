/* Direct map visits start at home; a choice on the landing page opens the map. */
(()=>{
 'use strict';
 const script=document.currentScript,home=new URL('../',script.src),key='spriggan.map-entry';
 if(script.hasAttribute('data-map-guard')){
  let selected=false;
  try{
   const entry=JSON.parse(sessionStorage.getItem(key));
   sessionStorage.removeItem(key);
   selected=entry?.path===location.pathname&&Date.now()-entry.at>=0&&Date.now()-entry.at<30000;
  }catch{}
  // Also supports opening a map card in a new tab and disabled session storage.
  let fromHome=false;
  try{const previous=new URL(document.referrer);fromHome=previous.origin===home.origin&&(previous.pathname===home.pathname||previous.pathname===home.pathname+'index.html')}catch{}
  if(!selected&&!fromHome){
   document.documentElement.style.visibility='hidden';
   location.replace(home.href);
  }
  return;
 }
 document.addEventListener('click',event=>{
  const link=event.target.closest?.('a.world[href]');
  if(!link||event.defaultPrevented)return;
  const target=new URL(link.href);
  if(target.origin!==home.origin)return;
  try{sessionStorage.setItem(key,JSON.stringify({path:target.pathname,at:Date.now()}))}catch{}
 });
})();
