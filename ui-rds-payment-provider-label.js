(()=>{
  const fix=()=>{
    const root=document.querySelector('#app');
    if(!root)return;
    const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);
    const nodes=[];
    while(walker.nextNode())nodes.push(walker.currentNode);
    for(const n of nodes){
      if(n.nodeValue && /PagBank\s*:/i.test(n.nodeValue)) n.nodeValue=n.nodeValue.replace(/PagBank\s*:/gi,'Mercado Pago:');
    }
  };
  new MutationObserver(fix).observe(document.querySelector('#app')||document.body,{childList:true,subtree:true,characterData:true});
  setTimeout(fix,0);
})();