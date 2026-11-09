import {json,failure,ClientError,readJSON,validateListing,validateImage,verifyHuman,rateLimit,contactReady,codeHash} from '../_lib/shared.js';
export async function onRequest({request,env}){
 try{
  if(!env.DB)throw new ClientError('Listings are not connected yet.',503);
  if(request.method==='GET'){
   const {results}=await env.DB.prepare("SELECT id,name,category,province,city,price,description,deposit,min_days,delivery_mode,availability,conditions,phone,messenger,contact_consent,length(image)>0 AS has_image FROM listings WHERE status='approved' ORDER BY created_at DESC LIMIT 200").all();
   return json({listings:results.map(row=>({...row,phone:contactReady(row)?row.phone:'',messenger:contactReady(row)?row.messenger:'',contact_consent:undefined}))});
  }
  if(request.method!=='POST')return json({error:'Method not allowed.'},405);
  const data=await readJSON(request);const item=validateListing(data);const image=validateImage(data.image||'');
  if(data.consent!==true)throw new ClientError('Confirm ownership and permission to publish the listing.');
  await verifyHuman(request,env,data.turnstile_token,'submit_listing');await rateLimit(request,env,'listing',5);
  const id=crypto.randomUUID();const ownerCode=crypto.randomUUID()+crypto.randomUUID();const hash=await codeHash(ownerCode);
  const result=await env.DB.prepare("INSERT INTO listings(id,name,category,province,city,price,description,image,deposit,min_days,delivery_mode,availability,conditions,phone,messenger,contact_consent,contact_consent_at,owner_code_hash) SELECT ?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP,? WHERE (SELECT COUNT(*) FROM listings)<200").bind(id,item.name,item.category,item.province,item.city,item.price,item.description,image,item.deposit,item.min_days,item.delivery_mode,item.availability,item.conditions,item.phone,item.messenger,item.contact_consent,hash).run();
  if(!result.meta.changes)throw new ClientError('Submissions are full. Please try again later.',429);
  return json({id,status:'pending',owner_code:ownerCode},201);
 }catch(error){return failure(error);}
}
