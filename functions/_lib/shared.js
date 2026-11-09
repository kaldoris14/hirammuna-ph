export const categories=['Tools','Outdoor','Camera','Events','Home'];
export const provinces=['Aurora','Bataan','Bulacan','Nueva Ecija','Pampanga','Tarlac','Zambales'];
export const json=(body,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
export class ClientError extends Error{constructor(message,status=400){super(message);this.status=status;}}
export const failure=error=>json({error:error instanceof ClientError?error.message:'The service is temporarily unavailable. Please try again later.'},error instanceof ClientError?error.status:503);
export async function readJSON(request,limit=78000){
 if(request.headers.get('Origin')!==new URL(request.url).origin)throw new ClientError('Please submit from this website.',403);
 if(!request.headers.get('Content-Type')?.includes('application/json'))throw new ClientError('Expected JSON.',415);
 const reader=request.body?.getReader();if(!reader)throw new ClientError('Missing form.');
 const chunks=[];let size=0;
 while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>limit){await reader.cancel();throw new ClientError('Submission is too large.',413);}chunks.push(value);}
 const bytes=new Uint8Array(size);let offset=0;for(const part of chunks){bytes.set(part,offset);offset+=part.length;}
 let data;try{data=JSON.parse(new TextDecoder().decode(bytes));}catch{throw new ClientError('Invalid form.');}
 if(!data||typeof data!=='object'||Array.isArray(data))throw new ClientError('Invalid form.');
 if(data.website)throw new ClientError('Submission rejected.');return data;
}
export function cleanPhone(value){
 if(typeof value!=='string'||value.length>30)return '';
 const phone=value.replace(/[\s()-]/g,'');
 if(/^09\d{9}$/.test(phone))return '+63'+phone.slice(1);
 return /^\+639\d{9}$/.test(phone)?phone:'';
}
export function cleanMessenger(value){
 if(typeof value!=='string'||value.length>200)return '';
 try{const url=new URL(value);if(url.protocol!=='https:'||url.username||url.password||url.port)return '';
 const valid=(url.hostname==='m.me'&&/^\/[A-Za-z0-9._-]+\/?$/.test(url.pathname))||(['messenger.com','www.messenger.com'].includes(url.hostname)&&/^\/t\/[A-Za-z0-9._-]+\/?$/.test(url.pathname));
 return valid?url.origin+url.pathname:'';
 }catch{return '';}
}
export function validateListing(data,{legacy=false}={}){
 const text=(key,min,max)=>typeof data[key]==='string'&&data[key].trim().length>=min&&data[key].trim().length<=max;
 if(!text('name',3,80)||!text('city',2,60)||!text('description',15,1200)||!categories.includes(data.category)||!provinces.includes(data.province))throw new ClientError('Check the item name, category, location, and description.');
 if(typeof data.price!=='number'||!Number.isFinite(data.price)||data.price<0.01||data.price>100000)throw new ClientError('Enter a daily rate between PHP 0.01 and PHP 100,000.');
 if(data.deposit!==null&&(typeof data.deposit!=='number'||!Number.isFinite(data.deposit)||data.deposit<0||data.deposit>1000000))throw new ClientError('Enter a valid deposit, or leave it blank if not yet agreed.');
 if(!Number.isInteger(data.min_days)||data.min_days<1||data.min_days>365)throw new ClientError('Minimum rental must be 1–365 days.');
 if(!['pickup','delivery','both'].includes(data.delivery_mode)||!['available','unavailable'].includes(data.availability)||!text('conditions',0,1000))throw new ClientError('Check availability, handover options, and rental conditions.');
 const phone=cleanPhone(data.phone||'');const messenger=cleanMessenger(data.messenger||'');
 const hasContact=Boolean(data.phone||data.messenger);
 if((!legacy||hasContact)&&(!phone||!messenger||data.contact_consent!==true))throw new ClientError('Provide a valid Philippine mobile number, Messenger link, and permission to publish both.');
 return {name:data.name.trim(),category:data.category,province:data.province,city:data.city.trim(),price:Math.round(data.price*100)/100,description:data.description.trim(),deposit:data.deposit===null?null:Math.round(data.deposit*100)/100,min_days:data.min_days,delivery_mode:data.delivery_mode,availability:data.availability,conditions:data.conditions.trim(),phone,messenger,contact_consent:hasContact&&data.contact_consent===true?1:0};
}
export function validateImage(image){
 if(typeof image!=='string'||image.length>65000||(image&&!/^data:image\/jpeg;base64,\/9j\/[A-Za-z0-9+/=]+$/.test(image)))throw new ClientError('Choose a valid photo using the image picker.');
 return image;
}
export async function verifyHuman(request,env,token,action){
 if(!env.TURNSTILE_SECRET_KEY||!env.TURNSTILE_SITE_KEY)throw new ClientError('Spam protection is not configured yet. Please try again after setup.',503);
 if(typeof token!=='string'||token.length<1||token.length>2048)throw new ClientError('Complete the anti-spam check first.');
 let check;try{const response=await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({secret:env.TURNSTILE_SECRET_KEY,response:token,remoteip:request.headers.get('CF-Connecting-IP')||undefined}),signal:AbortSignal.timeout(10000)});if(!response.ok)throw Error();check=await response.json();}catch{throw new ClientError('Anti-spam check is temporarily unavailable. Please try again.',503);}
 if(!check.success||check.hostname!==new URL(request.url).hostname||check.action!==action)throw new ClientError('Anti-spam check expired or failed. Complete it again.');
}
export async function rateLimit(request,env,scope,max){
 const now=Math.floor(Date.now()/1000);const window=Math.floor(now/3600);
 // Salted, short-lived identifiers; raw IP addresses are never stored in D1.
 const raw=env.TURNSTILE_SECRET_KEY+'|'+(request.headers.get('CF-Connecting-IP')||'unknown')+'|'+window+'|'+scope;
 const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(raw));const key=Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
 await env.DB.prepare('DELETE FROM rate_limits WHERE expires_at < ?').bind(now).run();
 const row=await env.DB.prepare('INSERT INTO rate_limits(key,count,expires_at) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1 RETURNING count').bind(key,(window+1)*3600).first();
 if(row.count>max)throw new ClientError('Too many submissions from this connection. Please try again next hour.',429);
}
export function contactReady(row){return Boolean(row.contact_consent&&cleanPhone(row.phone)&&cleanMessenger(row.messenger));}
export async function codeHash(value){const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));return Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');}
