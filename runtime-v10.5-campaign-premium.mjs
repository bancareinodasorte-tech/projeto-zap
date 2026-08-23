import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverPath = path.join(__dirname,'server.js');
const appPath = path.join(__dirname,'app.js');

try{
  let s=fs.readFileSync(serverPath,'utf8');

  // Salva mídia de cada etapa de campanha usando colunas já existentes no banco V10.
  s=s.replace(
    "for(let i=0;i<steps.length;i++) await insert('rds10_campaign_steps',{campaign_id:c.id,step_index:i+1,delay_minutes:i===0?0:Number(steps[i].delay_minutes||0),message:cleanText(steps[i].message),created_at:nowISO()},'minimal');",
    "for(let i=0;i<steps.length;i++) await insert('rds10_campaign_steps',{campaign_id:c.id,step_index:i+1,delay_minutes:i===0?0:Number(steps[i].delay_minutes||0),message:cleanText(steps[i].message),image_data_url:steps[i].image_data_url||null,image_name:cleanText(steps[i].image_name||'')||null,cta_enabled:steps[i].cta_enabled!==false,created_at:nowISO()},'minimal');"
  );

  // Duplicação preserva imagem e CTA, sem ativar ou enviar nada.
  s=s.replace(
    "for(const s of steps) await insert('rds10_campaign_steps',{campaign_id:nc.id,step_index:s.step_index,delay_minutes:s.delay_minutes,message:s.message,created_at:nowISO()},'minimal');",
    "for(const s of steps) await insert('rds10_campaign_steps',{campaign_id:nc.id,step_index:s.step_index,delay_minutes:s.delay_minutes,message:s.message,image_data_url:s.image_data_url||null,image_name:s.image_name||null,cta_enabled:s.cta_enabled!==false,created_at:nowISO()},'minimal');"
  );

  // Envio com imagem quando configurada; fallback automático para texto.
  const oldSend=`  const cta = c?.cta_enabled !== false ? \`\\n\\n🛒 *COMPRE AGORA:* https://wa.me/\${connectedNumber}?text=\${encodeURIComponent('QUERO COMPRAR RDS-' + (c?.code || ''))}\` : '';\n  const body = cleanText(step.message) + cta;\n  const result = await sendTextPhone(d.phone,body);\n  await patch('rds10_deliveries',\`id=eq.\${d.id}\`,{status:'ENVIADA',sent_at:nowISO(),wa_message_id:result.id,updated_at:nowISO()});`;
  const newSend=`  const cta = (c?.cta_enabled !== false && step?.cta_enabled !== false) ? \`\\n\\n🛒 *COMPRE AGORA:* https://wa.me/\${connectedNumber}?text=\${encodeURIComponent('QUERO COMPRAR RDS-' + (c?.code || ''))}\` : '';\n  const body = cleanText(step.message) + cta;\n  let result;\n  if(step.image_data_url && /^data:image\\//i.test(step.image_data_url)){\n    const m=String(step.image_data_url).match(/^data:(image\\/[^;]+);base64,(.+)$/i);\n    if(m){\n      const {phone:n,jid}=await ensureTargetJid(d.phone);\n      const r=await sendToJid(jid,{image:Buffer.from(m[2],'base64'),caption:body,mimetype:m[1]});\n      await logMessage({phone:n,direction:'OUT',type:'image',body,status:'ENVIADA',waId:r?.key?.id,raw:{jid,campaign_id:c?.id||null}});\n      result={id:r?.key?.id,phone:n,jid};\n    }\n  }\n  if(!result) result = await sendTextPhone(d.phone,body);\n  await patch('rds10_deliveries',\`id=eq.\${d.id}\`,{status:'ENVIADA',sent_at:nowISO(),wa_message_id:result.id,updated_at:nowISO()});`;
  if(s.includes(oldSend)) s=s.replace(oldSend,newSend);

  // Edição segura apenas enquanto campanha não foi ativada.
  if(!s.includes("app.put('/api/campaigns/:id'")){
    const anchor="app.post('/api/campaigns/:id/activate'";
    const pos=s.indexOf(anchor);
    if(pos>0){
      const endpoint=`app.put('/api/campaigns/:id',async(req,res)=>{\n  try{\n    const c=await one('rds10_campaigns',\`select=*&id=eq.\${req.params.id}\`);\n    if(!c) throw new Error('Campanha não encontrada.');\n    if(c.status!=='RASCUNHO') throw new Error('Somente campanhas em rascunho podem ser editadas.');\n    const b=req.body||{};\n    const rows=await patch('rds10_campaigns',\`id=eq.\${c.id}\`,{name:cleanText(b.name)||c.name,unit_price:Number(b.unit_price||c.unit_price||3),start_at:b.start_at||c.start_at,target_mode:b.target_mode||c.target_mode,target_group:b.target_group||null,selected_contact_ids:Array.isArray(b.selected_contact_ids)?b.selected_contact_ids:c.selected_contact_ids,cta_enabled:b.cta_enabled!==false,updated_at:nowISO()});\n    if(Array.isArray(b.steps)){\n      await del('rds10_campaign_steps',\`campaign_id=eq.\${c.id}\`);\n      for(let i=0;i<b.steps.length;i++){const st=b.steps[i];await insert('rds10_campaign_steps',{campaign_id:c.id,step_index:i+1,delay_minutes:i===0?0:Number(st.delay_minutes||0),message:cleanText(st.message),image_data_url:st.image_data_url||null,image_name:cleanText(st.image_name||'')||null,cta_enabled:st.cta_enabled!==false,created_at:nowISO()},'minimal');}\n    }\n    res.json(rows?.[0]||c);\n  }catch(e){res.status(400).json({error:e.message});}\n});\n`;
      s=s.slice(0,pos)+endpoint+s.slice(pos);
    }
  }
  fs.writeFileSync(serverPath,s,'utf8');
  console.log('[V10.5] backend campanhas premium aplicado');
}catch(e){console.error('[V10.5] backend:',e.message);process.exitCode=1;}

try{
  let a=fs.readFileSync(appPath,'utf8');
  // Cada etapa passa a aceitar uma imagem; leitura local em base64 para envio pelo backend.
  a=a.replace("window.campSteps=[{message:'',delay_minutes:0}]","window.campSteps=[{message:'',delay_minutes:0,image_data_url:null,image_name:null}]");
  a=a.replace("campSteps.push({message:'',delay_minutes:5});renderSteps()","campSteps.push({message:'',delay_minutes:5,image_data_url:null,image_name:null});renderSteps()");

  const oldRender="function renderSteps(){$('#stepsbox').innerHTML=window.campSteps.map((s,i)=>`<div class=step><span class=eyebrow>Mensagem ${i+1}</span>${i?`<label>Enviar após a etapa anterior (minutos)</label><input type=number min=1 value=\"${s.delay_minutes||5}\" onchange=\"campSteps[${i}].delay_minutes=Number(this.value)\">`:''}<label>Texto</label><textarea oninput=\"campSteps[${i}].message=this.value\">${esc(s.message)}</textarea><p class=mini>O CTA “COMPRE AGORA” será anexado automaticamente.</p></div>`).join('')}";
  const newRender="function renderSteps(){$('#stepsbox').innerHTML=window.campSteps.map((s,i)=>`<div class=step><span class=eyebrow>Mensagem ${i+1}</span>${i?`<label>Enviar após a etapa anterior (minutos)</label><input type=number min=1 value=\"${s.delay_minutes||5}\" onchange=\"campSteps[${i}].delay_minutes=Number(this.value)\">`:''}<label>Texto</label><textarea oninput=\"campSteps[${i}].message=this.value\">${esc(s.message)}</textarea><label>Imagem opcional</label><input type=file accept=\"image/*\" onchange=\"campaignImage(${i},this)\"><p class=mini>${s.image_name?'📷 '+esc(s.image_name):'Sem imagem'} • O CTA “COMPRE AGORA” será anexado automaticamente.</p></div>`).join('')}\nasync function campaignImage(i,input){const f=input.files?.[0];if(!f)return; if(f.size>5*1024*1024){toast('Imagem muito grande. Use até 5 MB.');input.value='';return;} const r=new FileReader();r.onload=()=>{campSteps[i].image_data_url=r.result;campSteps[i].image_name=f.name;renderSteps()};r.readAsDataURL(f)}";
  if(a.includes(oldRender)) a=a.replace(oldRender,newRender);

  // Ações úteis na lista de campanhas: editar rascunho e excluir com confirmação.
  a=a.replace(
    "${c.status==='RASCUNHO'?btn('Ativar',`activateCampaign('${c.id}')`,'btn primary'):''}${btn('Duplicar',`duplicateCampaign('${c.id}')`)}</div>",
    "${c.status==='RASCUNHO'?btn('Editar',`editCampaign('${c.id}')`):''}${c.status==='RASCUNHO'?btn('Ativar',`activateCampaign('${c.id}')`,'btn primary'):''}${btn('Duplicar',`duplicateCampaign('${c.id}')`)}${btn('Excluir',`deleteCampaign('${c.id}')`,'btn danger')}</div>"
  );

  if(!a.includes('async function deleteCampaign(')){
    a=a.replace("async function duplicateCampaign(id){try{await post(`/api/campaigns/${id}/duplicate`);toast('Campanha duplicada com novo código.');campaigns()}catch(e){toast(e.message)}}",
`async function duplicateCampaign(id){try{await post(\`/api/campaigns/\${id}/duplicate\`);toast('Campanha duplicada como rascunho.');campaigns()}catch(e){toast(e.message)}}\nasync function deleteCampaign(id){if(!confirm('Excluir esta campanha?'))return;try{await del(\`/api/campaigns/\${id}\`);toast('Campanha excluída.');campaigns()}catch(e){toast(e.message)}}\nasync function editCampaign(id){try{await loadContacts();const d=await api(\`/api/campaigns/\${id}/details\`);window.editCampaignId=id;window.campSteps=d.steps.map(s=>({message:s.message||'',delay_minutes:s.delay_minutes||0,image_data_url:s.image_data_url||null,image_name:s.image_name||null}));const c=d.campaign;modal(\`<span class=eyebrow>Editar campanha</span><h2>\${esc(c.name)}</h2><label>Nome</label><input id=cpname value=\"\${esc(c.name)}\"><label>Preço do bilhete</label><input id=cpprice type=number step=.01 value=\"\${c.unit_price||3}\"><label>Primeiro envio</label><input id=cpstart type=datetime-local><label>Público</label><select id=cptarget onchange=\"targetUI()\"><option value=all>Todos os contatos válidos</option><option value=group>Grupo</option><option value=individual>Seleção individual</option></select><div id=targetbox></div><div id=stepsbox></div><div class=row>\${btn('+ Lembrete','addStep()')}\${btn('Salvar alterações',\`updateCampaign('\\\${id}')\`,'btn primary')}</div>\`);$('#cptarget').value=c.target_mode||'all';const z=new Date(c.start_at);$('#cpstart').value=new Date(z.getTime()-z.getTimezoneOffset()*60000).toISOString().slice(0,16);renderSteps();targetUI()}catch(e){toast(e.message)}}\nasync function updateCampaign(id){try{const mode=$('#cptarget').value,selected=[...document.querySelectorAll('.cpcontact:checked')].map(x=>x.value),sv=$('#cpstart').value;if(!sv)throw new Error('Informe o primeiro envio.');await put(\`/api/campaigns/\${id}\`,{name:$('#cpname').value,unit_price:$('#cpprice').value,start_at:new Date(sv).toISOString(),target_mode:mode,target_group:mode==='group'?$('#cpgroup').value:null,selected_contact_ids:selected,cta_enabled:true,steps:campSteps});document.querySelector('.modal')?.remove();toast('Campanha atualizada.');campaigns()}catch(e){toast(e.message)}}`);
  }

  fs.writeFileSync(appPath,a,'utf8');
  console.log('[V10.5] interface campanhas premium aplicada');
}catch(e){console.error('[V10.5] frontend:',e.message);process.exitCode=1;}

await import('./runtime-v10.4.6-bot-control.mjs');
