(()=>{
  const copyText=async text=>{
    if(!text)return false;
    try{await navigator.clipboard.writeText(text);return true}catch{
      const ta=document.createElement('textarea');
      ta.value=text;ta.style.position='fixed';ta.style.opacity='0';
      document.body.appendChild(ta);ta.select();
      let ok=false;try{ok=document.execCommand('copy')}catch{}
      ta.remove();return ok;
    }
  };
  const apply=()=>{
    if(typeof page==='undefined'||page!=='payments')return;
    const orders=Array.isArray(state?.orders)?state.orders:[];
    const waiting=orders.filter(o=>o.status==='AGUARDANDO_PAGAMENTO');
    const section=document.querySelector('.rds-section');
    if(!section)return;
    const cards=[...section.querySelectorAll('.rds-order')];
    cards.forEach((card,i)=>{
      const order=waiting[i];
      if(!order?.pix_copy_paste||card.querySelector('.rds-copy-pix-inline'))return;
      const row=card.querySelector('.rds-buttons');
      if(!row)return;
      const b=document.createElement('button');
      b.type='button';b.className='btn rds-copy-pix-inline';b.textContent='📋 Copiar PIX';
      b.title='Copiar somente o código PIX';
      b.addEventListener('click',async()=>{
        const ok=await copyText(String(order.pix_copy_paste||''));
        toast(ok?'PIX copiado.':'Não foi possível copiar o PIX.');
      });
      row.insertBefore(b,row.firstChild);
    });
  };
  const style=document.createElement('style');
  style.textContent=`
    .rds-copy-pix-inline{font-weight:700}
    @media(max-width:760px){.rds-copy-pix-inline{width:100%}}
  `;
  document.head.appendChild(style);
  new MutationObserver(apply).observe(document.body,{childList:true,subtree:true});
  setTimeout(apply,0);
})();