import {json,failure,ClientError,readJSON,validateListing,validateImage} from '../_lib/shared.js';
async function authorized(request,secret){
 if(!secret||secret.length<32)return false;
 const digest=async value=>new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)));
 const a=await digest(request.headers.get('Authorization')||'');const b=await digest('Bearer '+secret);let diff=0;for(let i=0;i<a.length;i++)diff|=a[i]^b[i];return diff===0;
}
export async function onRequest({request,env}){
 if(!await authorized(request,env.ADMIN_TOKEN))return json({error:'Access denied. Check your admin key.'},401);
 try{
  if(!env.DB)throw new ClientError('Database is not connected.',503);
  if(request.method==='GET'){
   const [listings,reports]=await Promise.all([env.DB.prepare('SELECT * FROM listings ORDER BY created_at DESC LIMIT 200').all(),env.DB.prepare('SELECT reports.*, listings.name AS listing_name FROM reports LEFT JOIN listings ON listings.id=reports.listing_id ORDER BY reports.created_at DESC LIMIT 500').all()]);return json({listings:listings.results,reports:reports.results});
  }
  if(request.method!=='POST')return json({error:'Method not allowed.'},405);
  const data=await readJSON(request);const {id,action}=data;if(typeof id!=='string'||id.length>50)throw new ClientError('Invalid reference.');
  let result;
  if(action==='save'){
   const item=validateListing(data.item,{legacy:true});const existing=await env.DB.prepare('SELECT id FROM listings WHERE id=?').bind(id).first();if(!existing)throw new ClientError('Listing not found.',404);
   // Consent is an admin attestation of the owner's permission, never assumed for old records.
   const imageSQL=Object.hasOwn(data.item,'image')?',image=?':'';
   const args=[item.name,item.category,item.province,item.city,item.price,item.description,item.deposit,item.min_days,item.delivery_mode,item.availability,item.conditions,item.phone,item.messenger,item.contact_consent];
   if(imageSQL)args.push(validateImage(data.item.image));args.push(id);
   result=await env.DB.prepare('UPDATE listings SET name=?,category=?,province=?,city=?,price=?,description=?,deposit=?,min_days=?,delivery_mode=?,availability=?,conditions=?,phone=?,messenger=?,contact_consent=?,contact_consent_at=CASE WHEN ?=1 THEN CURRENT_TIMESTAMP ELSE NULL END'+imageSQL+' WHERE id=?').bind(...args.slice(0,14),item.contact_consent,...args.slice(14)).run();
  }else if(action==='status'&&['approved','rejected'].includes(data.status)){
   result=await env.DB.prepare('UPDATE listings SET status=? WHERE id=?').bind(data.status,id).run();
  }else if(action==='delete'){
   result=await env.DB.prepare('DELETE FROM listings WHERE id=?').bind(id).run();
  }else if(action==='resolve_report'){
   result=await env.DB.prepare("UPDATE reports SET status='resolved' WHERE id=?").bind(id).run();
  }else if(action==='delete_report'){
   result=await env.DB.prepare('DELETE FROM reports WHERE id=?').bind(id).run();
  }else throw new ClientError('Invalid action.');
  if(!result.meta.changes)throw new ClientError('Record not found.',404);return json({ok:true});
 }catch(error){return failure(error);}
}
