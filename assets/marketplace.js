import {$,esc,pesos,handover,messengerURL,phoneURL,requestJSON,listingPayload,HumanCheck} from './common.js';
let listings=[],loaded=false,activeItem=null,confirmation=null;
const detail=$('#detail-dialog'),listingDialog=$('#listing-dialog'),listingForm=$('#listing-form'),reportDialog=$('#report-dialog'),reportForm=$('#report-form');
const listingHuman=new HumanCheck($('#listing-human'),$('#submission-status'),$('#submit-listing'),'submit_listing');
const reportHuman=new HumanCheck($('#report-human'),$('#report-status'),$('#submit-report'),'report_listing');
function render(){
 const query=$('#search').value.trim().toLowerCase();const filtered=listings.filter(item=>(!$('#category').value||item.category===$('#category').value)&&(!$('#province').value||item.province===$('#province').value)&&(!$('#available-only').checked||item.availability==='available')&&`${item.name} ${item.city} ${item.province} ${item.description} ${item.category}`.toLowerCase().includes(query));
 const grid=$('#listings');grid.replaceChildren();
 for(const item of filtered){
  const card=document.createElement('article');card.className='card';
  card.innerHTML=`<div class="visual"><span class="sample">COMMUNITY LISTING</span><span class="fallback-icon" aria-hidden="true">▧</span>${item.has_image?`<img class="photo" src="/api/photo?id=${encodeURIComponent(item.id)}" alt="" loading="lazy">`:''}</div><div class="card-body"><div class="category">${esc(item.category)}</div><h3>${esc(item.name)}</h3><p class="location">${esc(item.city)}, ${esc(item.province)}</p><span class="availability ${item.availability==='unavailable'?'off':''}">${item.availability==='available'?'Available · confirm dates':'Currently unavailable'}</span><p class="rental-meta">${esc(handover[item.delivery_mode]||'Handover: ask owner')} · ${item.min_days?'Min. '+Number(item.min_days)+' day(s)':'Minimum days: ask owner'}</p><div class="card-bottom"><span class="price">${pesos(item.price)} <small>/ day</small></span><button class="details" type="button" aria-label="View ${esc(item.name)}">View & contact ↗</button></div></div>`;
  const image=card.querySelector('img');if(image)image.addEventListener('error',()=>{image.hidden=true;});
  card.querySelector('button').addEventListener('click',()=>openDetails(item));grid.append(card);
 }
 $('#result-count').textContent=loaded?`${filtered.length} of ${listings.length} community listings`:'';
 $('#empty').hidden=!loaded||filtered.length>0;
 $('#empty-title').textContent=listings.length?'No matching listings.':'Be the first to share something useful.';
 $('#empty-text').textContent=listings.length?'Try another keyword or reset your filters.':'No approved items yet. Submit a real item for admin review.';
 $('#empty-reset').hidden=!listings.length;$('#empty-list').hidden=Boolean(listings.length);
}
function openDetails(item){
 activeItem=item;$('#detail-title').textContent=item.name;$('#detail-location').textContent=`${item.city}, ${item.province} · ${item.category}`;$('#detail-description').textContent=item.description;
 const badge=$('#detail-availability');badge.textContent=item.availability==='available'?'Available · confirm dates with owner':'Currently unavailable';badge.className='availability '+(item.availability==='unavailable'?'off':'');
 const photo=$('#detail-photo');photo.hidden=true;photo.onload=null;photo.onerror=()=>{photo.hidden=true;};photo.removeAttribute('src');
 if(item.has_image){photo.onload=()=>{photo.hidden=false;};photo.alt=item.name;photo.src='/api/photo?id='+encodeURIComponent(item.id);}
 const facts=[['Daily rental',pesos(item.price)],['Refundable deposit',item.deposit===null?'Ask owner':Number(item.deposit)===0?'No deposit':pesos(item.deposit)],['Minimum rental',item.min_days?`${item.min_days} day(s)`:'Ask owner'],['Handover',handover[item.delivery_mode]||'Ask owner']];
 $('#detail-facts').innerHTML=facts.map(([label,value])=>`<div><dt>${esc(label)}</dt><dd>${esc(value)}</dd></div>`).join('');
 $('#detail-conditions').textContent=item.conditions||'No conditions provided yet. Agree on terms directly with the owner before renting.';
 const actions=$('#contact-actions');actions.replaceChildren();
 const messenger=messengerURL(item.messenger),phone=phoneURL(item.phone);
 if(item.availability==='available'){
  if(messenger){const link=document.createElement('a');link.href=messenger;link.target='_blank';link.rel='noopener noreferrer';link.className='messenger';link.textContent='Message owner ↗';actions.append(link);}
  if(phone){const link=document.createElement('a');link.href=phone;link.className='phone-link';link.textContent='Call '+item.phone;actions.append(link);}
 }
 $('#contact-note').textContent=item.availability==='unavailable'?'This item is currently unavailable. Contact actions are paused until the admin marks it available.':messenger&&phone?'Contact details are owner-provided. Messenger opens an external service; calling uses your device’s phone app. Confirm availability and rental terms first.':'Owner contact is not published yet. The admin must add the details with the owner’s permission.';
 $('#detail-reference').textContent='Listing reference: '+item.id;
 detail.showModal();
}
function resetFilters(){$('#search').value='';$('#category').value='';$('#province').value='';$('#available-only').checked=false;render();}
for(const id of ['search','category','province','available-only'])$('#'+id).addEventListener(id==='search'?'input':'change',render);
$('#reset').addEventListener('click',resetFilters);$('#empty-reset').addEventListener('click',resetFilters);
async function loadListings(){
 try{const data=await requestJSON('/api/listings');listings=data.listings;loaded=true;render();$('#load-status').textContent='Admin-reviewed submissions. Availability and contact details are provided by owners.';}
 catch(error){loaded=false;render();$('#load-status').textContent=error.message+' No sample listings are displayed.';}
}
function openListing(){
 $('#submission-success').hidden=true;listingForm.hidden=false;confirmation=null;listingDialog.showModal();listingHuman.open();
}
$('#list-item').addEventListener('click',openListing);$('#empty-list').addEventListener('click',openListing);
$('#cancel-listing').addEventListener('click',()=>listingDialog.close());$('#close-success').addEventListener('click',()=>listingDialog.close());
let listingBusy=false;
listingForm.addEventListener('submit',async event=>{
 event.preventDefault();if(listingBusy)return;const status=$('#submission-status');if(!listingHuman.token){status.textContent='Complete the anti-spam check first.';return;}
 listingBusy=true;$('#submit-listing').disabled=true;status.textContent='Preparing your submission…';
 try{
  const payload=await listingPayload(listingForm);payload.turnstile_token=listingHuman.token;
  const data=await requestJSON('/api/listings',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
  confirmation={id:data.id,code:data.owner_code,name:payload.name};
  $('#saved-reference').textContent=confirmationText();listingForm.reset();listingForm.hidden=true;$('#submission-success').hidden=false;$('#save-confirmation').focus();
 }catch(error){status.textContent=error.message;}finally{listingBusy=false;listingHuman.reset();}
});
function confirmationText(){return `HiramMuna PH — Pending admin review\nItem: ${confirmation.name}\nReference: ${confirmation.id}\nPrivate change-request code: ${confirmation.code}\n\nKeep this code private. It allows change/removal requests; the admin still reviews them.\nRequest a change at: ${location.origin}/#owner-help\nNo email receipt is sent. Approval has no guaranteed turnaround time.`;}
$('#save-confirmation').addEventListener('click',()=>{if(!confirmation)return;const blob=new Blob([confirmationText()],{type:'text/plain;charset=utf-8'});const url=URL.createObjectURL(blob);const link=document.createElement('a');link.href=url;link.download='hirammuna-submission-'+confirmation.id+'.txt';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});
let reportReference='',reportCode='';
function openReport(id='',code='',privateRequest=false){
 reportReference=id;reportCode=code;reportForm.reset();reportForm.hidden=false;$('#report-success').hidden=true;$('#report-title').textContent=privateRequest?'Request a listing change':'Report listing';$('#report-context').textContent=id?'Listing reference: '+id:'Use the reference and private code from your saved submission confirmation.';
 $('#private-request-fields').hidden=!privateRequest;$('#request-reference').required=privateRequest;$('#request-code').required=privateRequest;
 $('#request-reference').value=id;$('#request-code').value=code;if(privateRequest)$('#report-reason').value='Privacy or removal request';
 reportDialog.showModal();reportHuman.open();
}
$('#report-item').addEventListener('click',()=>{detail.close();openReport(activeItem.id);});
$('#request-change').addEventListener('click',()=>{if(!confirmation)return;listingDialog.close();openReport(confirmation.id,confirmation.code,true);});
$('#open-owner-help').addEventListener('click',()=>openReport('','',true));
$('#cancel-report').addEventListener('click',()=>reportDialog.close());
$('#close-report-success').addEventListener('click',()=>reportDialog.close());
let reportBusy=false;
reportForm.addEventListener('submit',async event=>{
 event.preventDefault();if(reportBusy)return;const status=$('#report-status');if(!reportHuman.token){status.textContent='Complete the anti-spam check first.';return;}
 reportBusy=true;$('#submit-report').disabled=true;
 try{
  const fields=new FormData(reportForm);const privateRequest=!$('#private-request-fields').hidden;
  const payload={listing_id:privateRequest?$('#request-reference').value.trim():reportReference,owner_code:privateRequest?$('#request-code').value.trim():reportCode,reason:fields.get('reason'),details:fields.get('details'),website:fields.get('website'),turnstile_token:reportHuman.token};
  const data=await requestJSON('/api/reports',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
  reportForm.reset();reportForm.hidden=true;$('#report-saved-reference').textContent='Report reference: '+data.id;$('#report-success').hidden=false;
 }catch(error){status.textContent=error.message;}finally{reportBusy=false;reportHuman.reset();}
});
render();loadListings();
