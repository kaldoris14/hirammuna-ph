import {json,failure,ClientError,readJSON,verifyHuman,rateLimit,codeHash} from '../_lib/shared.js';
export async function onRequest({request,env}){
 try{
  if(request.method!=='POST')return json({error:'Method not allowed.'},405);
  if(!env.DB)throw new ClientError('Reporting is temporarily unavailable.',503);
  const data=await readJSON(request,6000);
  if(typeof data.listing_id!=='string'||data.listing_id.length>50||!['Misleading listing','Unsafe or prohibited item','Wrong contact details','Spam or duplicate','Privacy or removal request','Other'].includes(data.reason)||typeof data.details!=='string'||data.details.trim().length<10||data.details.length>1000)throw new ClientError('Choose a reason and provide 10–1,000 characters of detail.');
  await verifyHuman(request,env,data.turnstile_token,'report_listing');await rateLimit(request,env,'report',10);
  const exists=await env.DB.prepare('SELECT id,status,owner_code_hash FROM listings WHERE id=?').bind(data.listing_id).first();
  const validCode=exists&&typeof data.owner_code==='string'&&data.owner_code.length<=100&&exists.owner_code_hash&&await codeHash(data.owner_code)===exists.owner_code_hash;
  if(!exists||(exists.status!=='approved'&&!validCode))throw new ClientError('Listing not found, or the private change-request code is incorrect.',404);
  const id=crypto.randomUUID();const result=await env.DB.prepare('INSERT INTO reports(id,listing_id,reason,details) SELECT ?,?,?,? WHERE (SELECT COUNT(*) FROM reports)<500').bind(id,data.listing_id,data.reason,data.details.trim()).run();
  if(!result.meta.changes)throw new ClientError('The report queue is full. Please try again later.',429);
  return json({id,status:'open'},201);
 }catch(error){return failure(error);}
}
