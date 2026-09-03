from pathlib import Path
p=Path('server.js'); s=p.read_text()
old='''  const menuText=cleanText(text); if(["0","4","MENU","INICIO","OI","OLA"].includes(menuText)) return replyInbound(identity,routerMessage(settings)); if(menuText==="1") return beginOrder(identity,null); if(menuText==="3"){ const office=normalizeBR(settings.office_whatsapp || OFFICE_WA_DEFAULT); return replyInbound(identity,"🏢 *ATENDIMENTO*\\n"+(office||"ATENDIMENTO")); } if(menuText==="2"){ if(!order) return replyInbound(identity,"🔎 *CONSULTAR PEDIDO*\\n\\nEnvie o código do pedido."); return replyInbound(identity,"🔎 *STATUS DO PEDIDO*\\n\\nPedido: *"+order.code+"*\\nStatus: *"+order.status+"*"); }'''
new='''  const menuText=cleanText(text);
  if(["0","4","MENU","INICIO","OI","OLA"].includes(menuText)) return replyInbound(identity,routerMessage(settings));
  if(!order){
    if(menuText==="1") return beginOrder(identity,null);
    if(menuText==="3"){ const office=normalizeBR(settings.office_whatsapp || OFFICE_WA_DEFAULT); return replyInbound(identity,"🏢 *ATENDIMENTO*\\n"+(office||"ATENDIMENTO")); }
    if(menuText==="2") return replyInbound(identity,"🔎 *CONSULTAR PEDIDO*\\n\\nEnvie o código do pedido.");
  }'''
if old not in s: raise SystemExit('menu block não encontrado')
s=s.replace(old,new)
old2=r'''    const m=t.match(/^(\d{1,4})$/), qty=m?Number(m[1]):0;'''
new2=r'''    const m=t.match(/^(?:QUERO\s*)?(\d{1,4})(?:\s*BILHETES?)?$/i), qty=m?Number(m[1]):0;'''
if old2 not in s: raise SystemExit('quantity parser não encontrado')
s=s.replace(old2,new2)
p.write_text(s)
print('PATCH_OK')
