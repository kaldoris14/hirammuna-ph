const categories = ['Tools','Outdoor','Camera','Events','Home'];
const provinces = ['Aurora','Bataan','Bulacan','Nueva Ecija','Pampanga','Tarlac','Zambales'];
export const json = (body,status=200) => Response.json(body,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
export async function onRequest({request,env}) {
 try {
  if(!env.DB) return json({error:'Listings are not connected yet. Please try again after setup.'},503);
  if(request.method==='GET') {
   const {results}=await env.DB.prepare("SELECT id,name,category,province,city,price,description FROM listings WHERE status='approved' ORDER BY created_at DESC LIMIT 200").all();
   return json({listings:results.map(row=>({...row,live:true}))});
  }
  if(request.method!=='POST') return json({error:'Method not allowed.'},405);
  if(request.headers.get('Origin')!==new URL(request.url).origin) return json({error:'Please submit from this website.'},403);
  if(!request.headers.get('Content-Type')?.includes('application/json')) return json({error:'Expected JSON.'},415);
  // Enforce a streaming limit even when Content-Length is absent.
  const reader=request.body?.getReader(); if(!reader) return json({error:'Missing form.'},400);
  const chunks=[];let size=0;
  while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>75000){await reader.cancel();return json({error:'Image is too large. Choose a smaller photo.'},413);}chunks.push(value);}
  const bytes=new Uint8Array(size);let offset=0;for(const part of chunks){bytes.set(part,offset);offset+=part.length;}
  let data;try{data=JSON.parse(new TextDecoder().decode(bytes));}catch{return json({error:'Invalid form.'},400);}
  if(data.website) return json({error:'Submission rejected.'},400);
  const text=(key,min,max)=>typeof data[key]==='string'&&data[key].trim().length>=min&&data[key].trim().length<=max;
  if(!text('name',3,80)||!text('city',2,60)||!text('description',15,1200)||!categories.includes(data.category)||!provinces.includes(data.province)||typeof data.price!=='number'||!Number.isFinite(data.price)||data.price<=0||data.price>100000||data.consent!==true) return json({error:'Check the required fields and ownership confirmation.'},400);
  const image=data.image||'';
  if(typeof image!=='string'||image.length>65000||(image&&!/^data:image\/jpeg;base64,\/9j\/[A-Za-z0-9+/=]+$/.test(image))) return json({error:'Please select a valid JPEG photo using the form.'},400);
  const id=crypto.randomUUID();
  // Atomic total cap protects the small MVP database from unbounded uploads.
  const result=await env.DB.prepare("INSERT INTO listings(id,name,category,province,city,price,description,image) SELECT ?,?,?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM listings)<200").bind(id,data.name.trim(),data.category,data.province,data.city.trim(),data.price,data.description.trim(),image).run();
  if(!result.meta.changes) return json({error:'Submissions are full. Please try again later.'},429);
  return json({id,status:'pending'},201);
 }catch{return json({error:'Listings are temporarily unavailable. Please try again later.'},503);}
}
