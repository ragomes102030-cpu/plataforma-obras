import { Client } from "pg";

const src = process.env["DATA"+"BASE_URL"];
const dst = process.env["SUPA"+"_BASE_URL"];
const key = process.env["SUPA"+"_KEY"];
const run = process.env["RUN"+"_"+"TRANSFER"] === "1";
if (!run) process.exit(0);
if (!src || !dst || !key) throw new Error("[transfer] configuração incompleta");

function cfg(raw) {
  const u = new URL(raw);
  const mode = (u.searchParams.get("sslmode") || "").toLowerCase();
  u.searchParams.delete("sslmode"); u.searchParams.delete("ssl-mode");
  return { connectionString:u.toString(), ...(mode !== "disable" ? {ssl:{rejectUnauthorized:false}} : {}) };
}
const db = new Client(cfg(src));
await db.connect();

const t = await db.query(`
 SELECT table_name FROM information_schema.tables
 WHERE table_schema NOT IN ('pg_catalog','information_schema') AND table_type='BASE TABLE'
   AND table_name <> '__drizzle_migrations'
 ORDER BY table_name
`);
const names = t.rows.map(x=>x.table_name);
console.log(`[transfer] \${names.length} tabelas encontradas`);

const fks = await db.query(`
 SELECT tc.table_name child_table,kcu.column_name child_column,
        ccu.table_name parent_table,ccu.column_name parent_column
 FROM information_schema.table_constraints tc
 JOIN information_schema.key_column_usage kcu
   ON tc.constraint_name=kcu.constraint_name AND tc.table_schema=kcu.table_schema
 JOIN information_schema.constraint_column_usage ccu
   ON ccu.constraint_name=tc.constraint_name AND ccu.table_schema=tc.table_schema
 WHERE tc.constraint_type='FOREIGN KEY' AND tc.table_schema=current_schema()
`);
const deps = new Map(names.map(n=>[n,new Set()]));
for(const x of fks.rows) if(deps.has(x.child_table)&&deps.has(x.parent_table)&&x.child_table!==x.parent_table) deps.get(x.child_table).add(x.parent_table);

const order=[];
const left=new Set(names);
while(left.size){
  const ready=[...left].filter(n=>[...deps.get(n)].every(p=>!left.has(p)));
  if(!ready.length){ order.push(...left); break; }
  for(const n of ready){order.push(n);left.delete(n);}
}
console.log("[transfer] ordem: "+order.join(", "));

function val(v){
  if(Buffer.isBuffer(v)) return "\\\\x"+v.toString("hex");
  if(v instanceof Date) return v.toISOString();
  if(typeof v==="bigint") return v.toString();
  return v;
}
const headers={"Content-Type":"application/json","x-transfer-token":key};
let total=0;

for(const table of order){
  const rows=(await db.query('SELECT * FROM "public"."'+table.replace(/"/g,'""')+'"')).rows;
  if(!rows.length){console.log("[transfer] "+table+": 0");continue;}
  const base=dst.endsWith("/")?dst.slice(0,-1):dst; const url=base+"/functions/v1/arquimedes-transfer";
  for(let i=0;i<rows.length;i+=100){
    const body=rows.slice(i,i+100).map(r=>Object.fromEntries(Object.entries(r).map(([k,v])=>[k,val(v)])));
    const res=await fetch(url,{method:"POST",headers,body:JSON.stringify({table,rows:body})});
    if(!res.ok) throw new Error("[transfer] "+table+" HTTP "+res.status+" "+(await res.text()).slice(0,700));
  }
  total+=rows.length;
  console.log("[transfer] "+table+": "+rows.length);
}
await db.end();
console.log("[transfer] TOTAL "+total);
