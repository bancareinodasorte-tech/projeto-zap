(()=>{
  if(window.__RDS_V11_HOTFIX__)return;
  window.__RDS_V11_HOTFIX__=true;

  // APIs do painel nunca devem reutilizar respostas antigas do navegador.
  const originalFetch=window.fetch.bind(window);
  window.fetch=(input,init={})=>{
    try{
      const url=typeof input==='string'?input:(input?.url||'');
      const absolute=url.startsWith('http')?url:(location.origin+url);
      if(new URL(absolute,location.href).pathname.startsWith('/api/')){
        init={...init,cache:'no-store'};
      }
    }catch{}
    return originalFetch(input,init);
  };

  // Navegação única: pagamentos/retornos/etc. devem atualizar o estado `page`.
  // Isso impede que uma renderização posterior devolva o painel para Retornos.
  function bindNavigation(){
    document.querySelectorAll('#nav button[data-page],#mobileNav button[data-page]').forEach(button=>{
      if(button.dataset.rdsHotfixBound==='1')return;
      button.dataset.rdsHotfixBound='1';
      button.onclick=e=>{
        e.preventDefault();
        e.stopImmediatePropagation();
        const page=button.dataset.page;
        if(page==='about'){
          window.rdsAbout?.();
          return;
        }
        if(typeof window.go==='function'){
          window.go(page);
        }
      };
    });
  }

  bindNavigation();
  new MutationObserver(bindNavigation).observe(document.body,{childList:true,subtree:true});

  // Após instalar o cache-buster, recarrega apenas a página atualmente selecionada.
  // Não reconecta, não desconecta e não altera a sessão do WhatsApp.
  setTimeout(()=>{
    try{
      const active=document.querySelector('#nav button.active,#mobileNav button.active');
      const page=active?.dataset.page;
      if(page && page!=='about' && typeof window.go==='function')window.go(page);
    }catch{}
  },0);
})();
