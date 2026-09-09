(()=>{
  const app=document.querySelector('#app');
  if(!app)return;
  const STORE='rds-interface-collapse-v1';
  let saved={};
  try{saved=JSON.parse(localStorage.getItem(STORE)||'{}')||{};}catch{}

  const cleanText=()=>{
    const replacements=[
      ['O que precisa de atenção agora, sem ruído.','Visão rápida das prioridades da operação.'],
      ['Ações agora','Prioridades da operação'],
      ['Próximo disparo','Próximo envio'],
      ['Fila, falhas, comprovantes e próximos disparos.','Acompanhe fila, falhas, pagamentos e próximos envios.'],
      ['Intervenção humana','Atendimento manual'],
      ['Caixa comercial','Atendimento e retornos'],
      ['Última interação e estágio de cada cliente.','Acompanhe as últimas interações e os pedidos em andamento.'],
      ['Conferir PIX','Conferir pagamentos'],
      ['Bilhetes pendentes','Bilhetes a enviar'],
      ['Carregando operação...','Carregando painel...'],
      ['Não foi possível carregar','Não foi possível carregar o painel'],
      ['Operação em dia.','Operação em dia. Nenhuma ação urgente.']
    ];
    const root=app;
    const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);
    const nodes=[];
    while(walker.nextNode())nodes.push(walker.currentNode);
    for(const node of nodes){
      if(!node.nodeValue||node.parentElement?.matches('script,style'))continue;
      let v=node.nodeValue;
      for(const [from,to] of replacements)if(v.includes(from))v=v.split(from).join(to);
      if(v!==node.nodeValue)node.nodeValue=v;
    }
  };

  const keyFor=(d)=>{
    const page=document.querySelector('.side-nav button.active')?.dataset.page||'app';
    const title=d.querySelector('summary b')?.textContent?.trim()||d.querySelector('summary')?.textContent?.trim()||'section';
    return `${page}|${title}`.slice(0,180);
  };

  const bindDetails=()=>{
    app.querySelectorAll('details').forEach(d=>{
      if(!d.dataset.rdsInterfaceBound){
        d.dataset.rdsInterfaceBound='1';
        d.dataset.rdsCollapseKey=keyFor(d);
        d.addEventListener('toggle',()=>{
          const k=d.dataset.rdsCollapseKey;
          if(!k)return;
          saved[k]=d.open;
          try{localStorage.setItem(STORE,JSON.stringify(saved));}catch{}
        });
      }
      const k=d.dataset.rdsCollapseKey;
      if(Object.prototype.hasOwnProperty.call(saved,k)&&d.open!==!!saved[k])d.open=!!saved[k];
    });
  };

  const refresh=()=>{cleanText();bindDetails();};
  refresh();
  new MutationObserver(refresh).observe(app,{childList:true,subtree:true});
})();
