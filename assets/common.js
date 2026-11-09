export const $=selector=>document.querySelector(selector);
export const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const pesos=value=>new Intl.NumberFormat('en-PH',{style:'currency',currency:'PHP',maximumFractionDigits:2}).format(value);
export const handover={pickup:'Pickup only',delivery:'Delivery only',both:'Pickup or delivery'};
export function messengerURL(value){try{const url=new URL(value);return url.protocol==='https:'&&!url.username&&!url.password&&!url.port&&((url.hostname==='m.me'&&/^\/[A-Za-z0-9._-]+\/?$/.test(url.pathname))||(['messenger.com','www.messenger.com'].includes(url.hostname)&&/^\/t\/[A-Za-z0-9._-]+\/?$/.test(url.pathname)))?url.origin+url.pathname:'';}catch{return '';}}
export function phoneURL(value){const phone=String(value||'').replace(/[\s()-]/g,'');return /^\+639\d{9}$/.test(phone)?'tel:'+phone:/^09\d{9}$/.test(phone)?'tel:+63'+phone.slice(1):'';}
export async function requestJSON(url,options={}){
 const response=await fetch(url,{...options,cache:'no-store'});let data;
 try{data=await response.json();}catch{throw Error('The service is not ready. Please refresh or try again later.');}
 if(!response.ok)throw Error(data.error||'Request failed. Please try again.');return data;
}
export async function preparePhoto(file){
 if(!file||!file.size)return '';
 if(file.size>10*1024*1024||!['image/jpeg','image/png','image/webp'].includes(file.type))throw Error('Choose a JPG, PNG, or WebP photo up to 10 MB.');
 let bitmap;try{bitmap=await createImageBitmap(file);}catch{throw Error('This photo could not be opened. Try another JPG, PNG, or WebP.');}
 const scale=Math.min(1,600/Math.max(bitmap.width,bitmap.height));const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));
 const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close();
 for(const quality of [.75,.55,.35,.2]){const image=canvas.toDataURL('image/jpeg',quality);if(image.length<=65000)return image;}
 throw Error('This photo is too detailed. Try a smaller or simpler photo.');
}
export async function listingPayload(form,{admin=false}={}){
 const fields=new FormData(form);const data=Object.fromEntries(fields);
 for(const field of ['price','min_days'])data[field]=Number(data[field]);
 data.deposit=data.deposit===''?null:Number(data.deposit);data.consent=fields.get('consent')==='on';data.contact_consent=fields.get('contact_consent')==='on';
 const file=form.querySelector('[name="photo"]').files[0];delete data.photo;
 if(file?.size)data.image=await preparePhoto(file);else if(!admin||fields.get('remove_photo')==='on')data.image='';
 return data;
}
let turnstilePromise;
async function loadTurnstile(){
 if(window.turnstile)return;
 if(!turnstilePromise)turnstilePromise=new Promise((resolve,reject)=>{
  const script=document.createElement('script');script.src='https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';script.async=true;script.onload=resolve;script.onerror=()=>{script.remove();turnstilePromise=null;reject(Error('Anti-spam check could not load. Check your connection and try again.'));};document.head.append(script);
 });await turnstilePromise;
}
export class HumanCheck{
 constructor(container,status,button,action){this.container=container;this.status=status;this.button=button;this.action=action;this.token='';this.widget=null;}
 async open(){
  this.button.disabled=true;this.token='';this.status.textContent='Loading anti-spam check…';
  try{
   const config=await requestJSON('/api/config');if(!config.ready||!config.turnstile_site_key)throw Error('Submissions are not enabled yet. The site owner must finish anti-spam setup.');
   await loadTurnstile();
   if(this.widget!==null)window.turnstile.remove(this.widget);
   this.widget=window.turnstile.render(this.container,{sitekey:config.turnstile_site_key,action:this.action,theme:'light',size:window.innerWidth<420?'compact':'flexible',callback:token=>{this.token=token;this.button.disabled=false;this.status.textContent='Anti-spam check complete. Your form is ready to submit.';},'expired-callback':()=>{this.token='';this.button.disabled=true;this.status.textContent='Anti-spam check expired. Please complete it again.';window.turnstile.reset(this.widget);},'error-callback':()=>{this.token='';this.button.disabled=true;this.status.textContent='Anti-spam check failed. Close and reopen this form to retry.';}});
   this.status.textContent='Complete the anti-spam check before submitting.';
  }catch(error){this.status.textContent=error.message;}
 }
 reset(){this.token='';this.button.disabled=true;if(this.widget!==null&&window.turnstile)window.turnstile.reset(this.widget);}
}
