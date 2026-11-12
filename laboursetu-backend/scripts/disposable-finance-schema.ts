import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { PrismaClient } from '@prisma/client';
import { applyFinanceIndexes } from '../src/modules/payroll/finance.indexes.js';

// MongoDB has no SQL schema migration. Create legacy collections/indexes only in
// the randomly named loopback test database, then exercise the real additive migration.
export async function initializeDisposableFinanceSchema(db:PrismaClient){
  const url=new URL(process.env.DATABASE_URL??'');
  if(url.protocol!=='mongodb:'||url.hostname!=='127.0.0.1'||!/^\/finance_(?:ui_)?test_[a-f0-9]+$/.test(url.pathname))throw new Error('Refusing schema setup outside a disposable loopback finance test database');
  const legacy=readFileSync(path.resolve('prisma/schema.prisma'),'utf8').split('// Phase 3:')[0];
  for(const match of legacy.matchAll(/model\s+\w+\s*\{([\s\S]*?)^\}/gm)){
    const body=match[1];const collection=body.match(/@@map\("([^"]+)"\)/)?.[1];if(!collection)continue;
    await db.$runCommandRaw({create:collection});
    const indexes:{key:Record<string,number>;name:string;unique?:boolean}[]=[];
    for(const index of body.matchAll(/@@(unique|index)\(\[([^\]]+)\]/g)){
      const fields=index[2].split(',').map(f=>f.trim());const unique=index[1]==='unique';indexes.push({key:Object.fromEntries(fields.map(f=>[f,1])),name:`${collection}_${fields.join('_')}_${unique?'key':'idx'}`,...(unique?{unique:true}:{})});
    }
    for(const field of body.matchAll(/^\s*(\w+)\s+String\s+[^\n]*@unique/gm))indexes.push({key:{[field[1]]:1},name:`${collection}_${field[1]}_key`,unique:true});
    if(indexes.length)await db.$runCommandRaw({createIndexes:collection,indexes});
  }
  await applyFinanceIndexes(db);
}
