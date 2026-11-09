import {json} from './listings.js';
async function authorized(request,secret){
 if(!secret||secret.length<32)return false;
 const digest=async value=>new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)));
 const a=await digest(request.headers.get('Authorization')||'');const b=await digest('Bearer '+secret);
 let diff=0;for(let i=0;i<a.length;i++)diff|=a[i]^b[i];return diff===0;
}
export async function onRequest({request,env}){
 if(!await authorized(request,env.ADMIN_TOKEN))return json({error:'Access denied. Check your admin key.'},401);
 if(!env.DB)return json({error:'Database is not connected.'},503);
 try{
  if(request.method==='GET'){
   const {results}=await env.DB.prepare('SELECT * FROM listings ORDER BY created_at DESC LIMIT 200').all();return json({listings:results});
  }
  if(request.method!=='POST')return json({error:'Method not allowed.'},405);
  if(request.headers.get('Origin')!==new URL(request.url).origin)return json({error:'Invalid origin.'},403);
  const raw=await request.text();if(raw.length>500)return json({error:'Invalid request.'},400);
  const {id,status}=JSON.parse(raw);
  if(typeof id!=='string'||id.length>50||!['approved','rejected','delete'].includes(status))return json({error:'Invalid action.'},400);
  const result=status==='delete'?await env.DB.prepare('DELETE FROM listings WHERE id=?').bind(id).run():await env.DB.prepare('UPDATE listings SET status=? WHERE id=?').bind(status,id).run();
  if(!result.meta.changes)return json({error:'Listing not found.'},404);
  return json({ok:true});
 }catch{return json({error:'Could not complete the action. Please retry.'},503);}
}
