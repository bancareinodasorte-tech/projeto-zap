/* RDS password visibility: login, registration, reset, admin, dynamic forms. */
(()=>{'use strict';
const marker='rds-password-toggle';
const css=document.createElement('style');
css.textContent='.rds-password-wrap{position:relative!important;display:block;width:100%}.rds-password-wrap>input{padding-right:55px!important}.rds-password-toggle{position:absolute!important;right:7px!important;top:50%!important;transform:translateY(-50%)!important;width:40px!important;height:38px!important;min-height:0!important;min-width:0!important;margin:0!important;padding:0!important;display:flex!important;align-items:center!important;justify-content:center!important;border:0!important;border-radius:8px!important;background:transparent!important;color:#24466f!important;box-shadow:none!important;cursor:pointer!important;z-index:2!important;font-size:19px!important}.rds-password-toggle:focus-visible{outline:2px solid #1762b7!important}';
document.head.appendChild(css);
function enhance(root){
 const nodes=[];
 if(root?.nodeType===1&&root.matches?.('input[type="password"]'))nodes.push(root);
 root?.querySelectorAll?.('input[type="password"]').forEach(x=>nodes.push(x));
 for(const input of nodes){
  if(input.closest('.rds-password-wrap')||input.dataset.rdsPasswordToggle==='1')continue;
  const parent=input.parentNode;if(!parent)continue;
  const wrapper=document.createElement('span');wrapper.className='rds-password-wrap';
  parent.insertBefore(wrapper,input);wrapper.appendChild(input);
  const button=document.createElement('button');button.type='button';button.className=marker;
  button.textContent='👁';button.setAttribute('aria-label','Mostrar senha');button.setAttribute('aria-pressed','false');
  button.title='Mostrar senha';
  button.addEventListener('click',()=>{
   const visible=input.type==='password';input.type=visible?'text':'password';
   button.setAttribute('aria-label',visible?'Ocultar senha':'Mostrar senha');
   button.setAttribute('aria-pressed',String(visible));button.title=visible?'Ocultar senha':'Mostrar senha';
   button.textContent=visible?'🙈':'👁';input.focus({preventScroll:true});
  });
  wrapper.appendChild(button);input.dataset.rdsPasswordToggle='1';
 }
}
let queued=false;
const observer=new MutationObserver(()=>{if(queued)return;queued=true;queueMicrotask(()=>{queued=false;enhance(document.body);});});
function start(){enhance(document.body);observer.observe(document.body,{childList:true,subtree:true});}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();