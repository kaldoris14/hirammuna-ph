import {$,esc,pesos,handover,requestJSON,listingPayload} from './common.js';
let token='',items=[],reports=[],editing=null,lockedVersion=0;
const status=$('#admin-status'),dialog=$('#edit-dialog'),form=$('#edit-form');
function lock(){lockedVersion++;token='';items=[];reports=[];editing=null;$('#key').value='';$('#queue').replaceChildren();$('#reports').replaceChildren();$('#admin-content').hidden=true;$('#refresh').disabled=true;if(dialog.open)dialog.close();form.reset();status.textContent='Locked.';}
$('#lock').addEventListener('click',lock);
async function api(payload){return requestJSON('/api/admin',{method:payload?'POST':'GET',headers:{Authorization:'Bearer '+token,...(payload?{'Content-Type':'application/json'}:{})},...(payload?{body:JSON.stringify(payload)}:{})});}
async function refresh(){
 if(!token)return;const version=lockedVersion;status.textContent='Loading…';$('#refresh').disabled=true;
 try{const data=await api();if(version!==lockedVersion)return;items=data.listings;reports=data.reports;$('#admin-content').hidden=false;render();status.textContent=`${items.filter(i=>i.status==='pending').length} pending · ${items.filter(i=>i.status==='approved').length} approved · ${reports.filter(i=>i.status==='open').length} open reports`;}
 catch(error){if(version===lockedVersion){$('#admin-content').hidden=true;$('#queue').replaceChildren();$('#reports').replaceChildren();status.textContent=error.message;}}
 finally{if(version===lockedVersion)$('#refresh').disabled=!token;}
}
function button(text,callback){const b=document.createElement('button');b.type='button';b.className='details';b.textContent=text;b.addEventListener('click',callback);return b;}
async function action(payload,element){
 element.disabled=true;const version=lockedVersion;
 try{await api(payload);if(version===lockedVersion)await refresh();}catch(error){if(version===lockedVersion)status.textContent=error.message;}finally{element.disabled=false;}
}
function render(){
 const queue=$('#queue');queue.replaceChildren();const query=$('#queue-search').value.trim().toLowerCase(),filter=$('#queue-status').value;
 const filtered=items.filter(i=>(!filter||i.status===filter)&&`${i.name} ${i.id}`.toLowerCase().includes(query));
 if(!filtered.length){const p=document.createElement('p');p.textContent='No listings match this view.';queue.append(p);}
 for(const item of filtered){
  const card=document.createElement('article');card.className='queue-card';card.innerHTML=`<h3>${esc(item.name)}</h3><p class="queue-summary">${esc(item.status.toUpperCase())} · ${esc(item.created_at)} · ${esc(item.availability)}</p><p>${esc(item.city)}, ${esc(item.province)} · ${esc(item.category)}</p><p><strong>${pesos(item.price)} / day</strong> · Deposit: ${item.deposit===null?'Not specified':pesos(item.deposit)} · Min. ${item.min_days?Number(item.min_days)+' day(s)':'Not specified'}</p><p>${esc(handover[item.delivery_mode]||'Handover not confirmed')}</p><p class="terms-text">${esc(item.description)}</p><p class="terms-text">Conditions: ${esc(item.conditions||'Not specified')}</p><p>Messenger: ${esc(item.messenger||'Not provided')}<br>Phone: ${esc(item.phone||'Not provided')}<br>Contact publication permission: ${item.contact_consent?'Recorded':'Not recorded'}</p><p class="queue-summary">Reference: ${esc(item.id)}</p>`;
  if(item.image){const image=document.createElement('img');image.src=item.image;image.className='detail-photo';image.alt=item.name;card.append(image);}
  const controls=document.createElement('div');controls.className='form-actions';
  controls.append(button('Edit details',()=>edit(item)));
  for(const [label,value] of [['Approve','approved'],['Reject / unpublish','rejected']]){
   const b=button(label,()=>{if(value==='approved'&&!confirm('Publish this item, photo and consented contact details?'))return;action({id:item.id,action:'status',status:value},b);});controls.append(b);
  }
  const remove=button('Delete',()=>{if(confirm('Permanently delete this listing and its photo? Reports remain until you delete them separately.'))action({id:item.id,action:'delete'},remove);});remove.classList.add('danger');controls.append(remove);card.append(controls);queue.append(card);
 }
 const list=$('#reports');list.replaceChildren();if(!reports.length){const p=document.createElement('p');p.textContent='No reports yet.';list.append(p);}
 for(const report of reports){
  const card=document.createElement('article');card.className='queue-card report-card';card.innerHTML=`<h3>${esc(report.reason)}</h3><p class="queue-summary">${esc(report.status.toUpperCase())} · ${esc(report.created_at)}</p><p>Listing: ${esc(report.listing_name||'Deleted listing')}<br>Reference: ${esc(report.listing_id)}</p><p class="terms-text">${esc(report.details)}</p><p class="queue-summary">Report: ${esc(report.id)}</p>`;
  const controls=document.createElement('div');controls.className='report-actions';const item=items.find(i=>i.id===report.listing_id);if(item)controls.append(button('Edit this listing',()=>edit(item)));
  if(report.status==='open'){const resolve=button('Mark resolved',()=>action({id:report.id,action:'resolve_report'},resolve));controls.append(resolve);}
  const remove=button('Delete report',()=>{if(confirm('Permanently delete this report?'))action({id:report.id,action:'delete_report'},remove);});controls.append(remove);card.append(controls);list.append(card);
 }
}
function edit(item){
 editing=item;form.reset();$('#edit-title').textContent='Edit: '+item.name;
 for(const name of ['name','category','province','city','price','deposit','min_days','delivery_mode','availability','description','conditions','messenger','phone'])form.elements.namedItem(name).value=item[name]??'';
 form.elements.namedItem('contact_consent').checked=Boolean(item.contact_consent);$('#edit-status').textContent='';dialog.showModal();
}
$('#cancel-edit').addEventListener('click',()=>dialog.close());
let saving=false;
form.addEventListener('submit',async event=>{
 event.preventDefault();if(!editing||saving)return;const version=lockedVersion;saving=true;$('#save-edit').disabled=true;$('#edit-status').textContent='Saving…';
 try{const payload=await listingPayload(form,{admin:true});await api({id:editing.id,action:'save',item:payload});if(version!==lockedVersion)return;dialog.close();await refresh();}
 catch(error){if(version===lockedVersion)$('#edit-status').textContent=error.message;}finally{saving=false;$('#save-edit').disabled=false;}
});
$('#login').addEventListener('submit',event=>{event.preventDefault();lockedVersion++;token=$('#key').value;$('#key').value='';refresh();});
$('#refresh').addEventListener('click',refresh);$('#queue-search').addEventListener('input',render);$('#queue-status').addEventListener('change',render);
window.addEventListener('pagehide',lock);
