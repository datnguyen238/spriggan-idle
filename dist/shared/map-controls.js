(()=>{
 const trigger=document.querySelector('#toggle-controls');
 const panel=trigger?.closest('.panel,.dashboard');if(!panel)return;
 const label=panel.classList.contains('dashboard')?'farm':'pond';
 function sync(){const open=trigger.getAttribute('aria-expanded')==='true';trigger.setAttribute('aria-label',`${open?'Close':'Open'} ${label} controls`);trigger.title=`${open?'Close':'Open'} controls`}
 trigger.addEventListener('click',sync);
 // Dismiss after the outside click runs, so selecting/removing a koi still works.
 document.addEventListener('click',event=>{
  if(trigger.getAttribute('aria-expanded')==='true'&&!panel.contains(event.target)){trigger.click()}
 });
 document.addEventListener('keydown',event=>{
  if(event.key==='Escape'&&trigger.getAttribute('aria-expanded')==='true'){trigger.click();trigger.focus({preventScroll:true})}
 });
 if(trigger.getAttribute('aria-expanded')==='true')trigger.click();sync();
})();
