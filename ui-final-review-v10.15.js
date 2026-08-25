(()=>{
 const oldHome=window.home;
 const oldSettings=window.settings;
 const pages=[['Central','home'],['Clientes','contacts'],['Campanhas','campaigns'],['Automação','execution'],['Retornos','returns'],['Compras','orders'],['Ajustes','settings']];
 window.rds1015Review=function(){
   modal(`<span class="eyebrow">Revisão final</span><h2>Teste integrado do aplicativo</h2><p class="mut">Percorra os módulos abaixo. Esta tela não envia mensagens nem altera pedidos.</p><div class="priority-list">${pages.map(([n,p])=>`<div class="priority"><div><strong>${n}</strong><small>Verificar carregamento e estabilidade</small></div><button class="btn" onclick="document.querySelector('.modal')?.remove();go('${p}')">Abrir</button></div>`).join('')}</div><p class="mut">Após validar todos os módulos, o projeto fica pronto para a etapa de empacotamento/instalação.</p>`)
 };
 window.home=async function(){await oldHome();try{if(document.querySelector('#rds1015Review'))return;const b=document.createElement('div');b.id='rds1015Review';b.className='card';b.innerHTML=`<div class="row" style="justify-content:space-between;align-items:center"><div><span class="eyebrow">Validação final</span><h2 style="margin:.35rem 0">Teste integrado</h2><p class="mut" style="margin:0">Última conferência dos módulos antes do empacotamento.</p></div><button class="btn primary" onclick="rds1015Review()">Iniciar teste</button></div>`;app.appendChild(b)}catch(e){console.error('V10.15',e)}};
 window.settings=async function(){await oldSettings();try{if(document.querySelector('#rds1015Settings'))return;const b=document.createElement('div');b.id='rds1015Settings';b.className='card';b.innerHTML=`<span class="eyebrow">Versão candidata</span><h2>Preparar instalação</h2><p class="mut">Execute o teste integrado antes de gerar a versão instalada.</p><button class="btn primary" onclick="rds1015Review()">Teste integrado</button>`;app.appendChild(b)}catch(e){console.error('V10.15 settings',e)}};
})();
