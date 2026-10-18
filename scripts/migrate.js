import { schema,transaction } from '../server/db.js';
if(!process.env.DATABASE_URL)throw new Error('Set DATABASE_URL before running production migrations.');
await transaction(db=>db.q(schema));console.log('GreenTime schema is ready.');process.exit(0);
