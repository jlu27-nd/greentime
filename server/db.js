import { mkdirSync } from 'node:fs';
export const schema=`
CREATE TABLE IF NOT EXISTS households (id TEXT PRIMARY KEY, state TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, name TEXT NOT NULL, role TEXT NOT NULL, password TEXT NOT NULL, family_id TEXT, link_code TEXT UNIQUE, link_expires BIGINT);
CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, user_id TEXT NOT NULL, expires BIGINT NOT NULL);
CREATE TABLE IF NOT EXISTS attempts (key TEXT PRIMARY KEY, count INTEGER NOT NULL, expires BIGINT NOT NULL);
CREATE TABLE IF NOT EXISTS push_subscriptions (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, subscription TEXT NOT NULL, origin TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS push_deliveries (id TEXT PRIMARY KEY, subscription_id TEXT NOT NULL, family_id TEXT NOT NULL, payload TEXT NOT NULL, sent INTEGER NOT NULL DEFAULT 0, attempts INTEGER NOT NULL DEFAULT 0, next_attempt BIGINT NOT NULL DEFAULT 0);
`;
let local,pool,queue=Promise.resolve();
export async function transaction(fn){
 if(process.env.DATABASE_URL){
  if(!pool){const {Pool}=await import('pg');pool=new Pool({connectionString:process.env.DATABASE_URL,max:4,connectionTimeoutMillis:10000});}
  const c=await pool.connect();try{await c.query('BEGIN');const out=await fn({q:async(sql,args=[])=> (await c.query(sql,args)).rows,lock:' FOR UPDATE'});await c.query('COMMIT');return out;}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
 }
 if(process.env.VERCEL||process.env.NODE_ENV==='production')throw Object.assign(new Error('Database setup is required.'),{status:503});
 const previous=queue;let release;queue=new Promise(r=>release=r);await previous;
 try{if(!local){const {DatabaseSync}=await import('node:sqlite');mkdirSync('.data',{recursive:true});local=new DatabaseSync(process.env.SQLITE_PATH||'.data/greentime.sqlite');local.exec('PRAGMA journal_mode=WAL;');local.exec(schema);}
 local.exec('BEGIN IMMEDIATE');try{const out=await fn({q:async(sql,args=[])=>{const values=[];sql=sql.replace(/\$(\d+)/g,(_,n)=>{values.push(args[+n-1]);return '?';});const st=local.prepare(sql);return st.columns().length?st.all(...values):(st.run(...values),[]);},lock:''});local.exec('COMMIT');return out;}catch(e){local.exec('ROLLBACK');throw e;}}finally{release();}
}
