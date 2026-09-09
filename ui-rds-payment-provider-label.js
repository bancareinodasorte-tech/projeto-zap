(()=>{
  const fix=()=>{
    const root=document.body;
    if(!root)return;
    const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);
    const nodes=[];
    while(walker.nextNode())nodes.push(walker.currentNode);
    for(const n of nodes){
      if(!n.nodeValue)continue;
      n.nodeValue=n.nodeValue.replace(/PagBank\s*:/gi,'Mercado Pago:');
      n.nodeValue=n.nodeValue.replace(/\bPagBank\b/gi,'Mercado Pago');
    }
  };
  const start=()=>{
    fix();
    new MutationObserver(fix).observe(document.body,{childList:true,subtree:true,characterData:true});
    [250,750,1500,3000,5000].forEach(ms=>setTimeout(fix,ms));
  };
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
