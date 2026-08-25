(()=>{
  const originalAddStep=window.addStep;

  window.rds1016Image=function(i,input){
    const f=input?.files?.[0];
    if(!f)return;
    if(!/^image\/(png|jpeg|jpg|webp)$/i.test(f.type||'')){toast('Use imagem PNG, JPG ou WEBP.');input.value='';return;}
    if(f.size>2.5*1024*1024){toast('Imagem muito grande. Use até 2,5 MB.');input.value='';return;}
    const r=new FileReader();
    r.onload=()=>{campSteps[i].image=String(r.result||'');renderSteps();};
    r.onerror=()=>toast('Não foi possível ler a imagem.');
    r.readAsDataURL(f);
  };

  window.rds1016RemoveImage=function(i){campSteps[i].image='';renderSteps();};

  window.renderSteps=function(){
    const box=$('#stepsbox');if(!box)return;
    box.innerHTML=window.campSteps.map((s,i)=>`<div class=step><span class=eyebrow>Mensagem ${i+1}</span>${i?`<label>Enviar após a etapa anterior (minutos)</label><input type=number min=1 value="${s.delay_minutes||5}" onchange="campSteps[${i}].delay_minutes=Number(this.value)">`:''}<label>Texto</label><textarea oninput="campSteps[${i}].message=this.value">${esc(s.message||'')}</textarea><label>Imagem opcional</label><input type=file accept="image/png,image/jpeg,image/webp" onchange="rds1016Image(${i},this)">${s.image?`<div class=card style="padding:10px;margin-top:8px"><img src="${s.image}" alt="Prévia" style="display:block;max-width:100%;max-height:220px;object-fit:contain;margin:auto"><div class=row style="margin-top:8px"><button class=btn onclick="rds1016RemoveImage(${i})">Remover imagem</button></div></div>`:''}<p class=mini>O CTA “COMPRE AGORA” será anexado automaticamente.</p></div>`).join('');
  };

  window.addStep=function(){
    campSteps.push({message:'',delay_minutes:5,image:''});
    renderSteps();
  };

  window.saveCampaign=async function(){
    try{
      const mode=$('#cptarget').value,selected=[...document.querySelectorAll('.cpcontact:checked')].map(x=>x.value),sv=$('#cpstart').value;
      if(!sv)throw new Error('Informe o primeiro envio.');
      const steps=(campSteps||[]).map(s=>({delay_minutes:Number(s.delay_minutes||0),message:(s.image?`[[RDS_IMAGE:${s.image}]]\n`:'')+String(s.message||'')}));
      await post('/api/campaigns',{name:$('#cpname').value,unit_price:$('#cpprice').value,start_at:new Date(sv).toISOString(),target_mode:mode,target_group:mode==='group'?$('#cpgroup').value:null,selected_contact_ids:selected,cta_enabled:true,steps});
      document.querySelector('.modal')?.remove();
      toast('Campanha salva. Nenhuma mensagem foi enviada ainda.');
      campaigns();
    }catch(e){toast(e.message)}
  };
})();
