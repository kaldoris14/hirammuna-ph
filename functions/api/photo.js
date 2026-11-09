export async function onRequestGet({request,env}){
 if(!env.DB)return new Response('Unavailable',{status:503});
 const id=new URL(request.url).searchParams.get('id');if(!id||id.length>50)return new Response('Not found',{status:404});
 try{
  const row=await env.DB.prepare("SELECT image FROM listings WHERE id=? AND status='approved'").bind(id).first();
  if(!row?.image)return new Response('Not found',{status:404});
  const binary=atob(row.image.split(',')[1]);const bytes=Uint8Array.from(binary,c=>c.charCodeAt(0));
  return new Response(bytes,{headers:{'Content-Type':'image/jpeg','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
 }catch{return new Response('Unavailable',{status:503});}
}
