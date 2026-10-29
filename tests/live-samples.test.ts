import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { buildLedger } from '../scripts/gen-data.js';
import { buildLiveSamples, defineLiveSamplePlans } from '../scripts/build-live-samples.js';
import type { Fixture, TestName } from '../shared/types.js';

const controls:TestName[]=['amount','date','vat','approval','quantity','duplicate','vendor','invoice_no','price'];
const sourceBytes=(id:string)=>Buffer.from(`Binary copy preservation regression fixture: ${id}\n`);
function fixture():Fixture {
  const ledger=buildLedger();
  const bad=new Set(['L003:amount','L007:vat','L007:price','L012:quantity','L017:approval','L021:duplicate','L022:duplicate']);
  return {ledger,documents:ledger.flatMap(line=>(['invoice','po','grn'] as const).map(type=>{
    const id=`${line.id}-${type}`;
    return {id,name:`${id}.pdf`,type,sha256:createHash('sha256').update(sourceBytes(id)).digest('hex'),sourcePath:`demo/documents/${id}.pdf`,imagePath:`demo/documents/${id}.png`,pages:1,width:1200,height:1600,ledgerId:line.id,synthetic:true};
  })),fields:[],expected:ledger.flatMap(line=>controls.map(control=>({ledgerId:line.id,test:control,result:bad.has(`${line.id}:${control}`)?'exception' as const:'match' as const})))};
}
function zipNames(bytes:Buffer):string[]{
  const footer=bytes.lastIndexOf(Buffer.from([0x50,0x4b,0x05,0x06]));assert.ok(footer>=0);
  const count=bytes.readUInt16LE(footer+10);let cursor=bytes.readUInt32LE(footer+16);const names:string[]=[];
  for(let i=0;i<count;i++){assert.equal(bytes.readUInt32LE(cursor),0x02014b50);const n=bytes.readUInt16LE(cursor+28),extra=bytes.readUInt16LE(cursor+30),comment=bytes.readUInt16LE(cursor+32);names.push(bytes.toString('utf8',cursor+46,cursor+46+n));cursor+=46+n+extra+comment;}
  return names;
}

test('Live validation plans isolate scenarios and share one document set for paired duplicate postings',()=>{
  const plans=defineLiveSamplePlans(fixture());assert.equal(plans.length,6);
  assert.deepEqual(plans.map(plan=>plan.ledger.map(line=>line.id)),[['L001'],['L003'],['L007'],['L012'],['L017'],['L021','L022']]);
  assert.ok(plans.every(plan=>plan.documents.length===3));
  const duplicate=plans[5];assert.deepEqual(duplicate.documents.map(document=>document.id),['L021-invoice','L021-po','L021-grn']);
  assert.equal(duplicate.ledger[0].vendor,duplicate.ledger[1].vendor);assert.equal(duplicate.ledger[0].invoice_no,duplicate.ledger[1].invoice_no);assert.equal(duplicate.ledger[0].po_no,duplicate.ledger[1].po_no);
  assert.equal(plans[0].expected.filter(item=>item.result==='exception').length,0);
  assert.equal(plans[2].expected.filter(item=>item.result==='exception').length,2);
});

test('Live sample packaging preserves source bytes, excludes scoring from upload ZIPs and reproduces identical input hashes',async t=>{
  const directory=await mkdtemp(path.join(tmpdir(),'vouch-live-samples-test-'));
  t.after(async()=>{const relative=path.relative(path.resolve(tmpdir()),path.resolve(directory));assert.ok(relative.startsWith('vouch-live-samples-test-')&&!relative.includes(path.sep));await rm(directory,{recursive:true,force:true});});
  const dataDir=path.join(directory,'data'),outputDir=path.join(directory,'output'),input=fixture();
  await mkdir(path.join(dataDir,'demo','documents'),{recursive:true});
  await writeFile(path.join(dataDir,'demo','fixture.json'),JSON.stringify(input));
  for(const document of input.documents)await writeFile(path.join(dataDir,document.sourcePath),sourceBytes(document.id));
  const manifest=await buildLiveSamples({dataDir,outputDir});
  for(const pack of manifest.packs){
    const names=zipNames(await readFile(path.join(outputDir,pack.archive)));
    assert.deepEqual(names.sort(),['ledger.csv',...pack.documents.map(document=>`documents/${document.filename}`)].sort());
    assert.ok(!names.some(name=>/expected|scoring|fixture|manifest/i.test(name)));
    for(const document of pack.documents){
      const bytes=await readFile(path.join(outputDir,pack.inputDirectory,'documents',document.filename));
      assert.deepEqual(bytes,sourceBytes(document.sourceId));
    }
  }
  const again=await buildLiveSamples({dataDir,outputDir});
  assert.deepEqual(again,manifest,'Identical existing inputs must produce identical sample and ZIP hashes.');
  for(const document of input.documents)assert.deepEqual(await readFile(path.join(dataDir,document.sourcePath)),sourceBytes(document.id));
});

test('Live sample planning refuses non-synthetic or incomplete document sets',()=>{
  const real=fixture();real.documents[0].synthetic=false;
  assert.throws(()=>defineLiveSamplePlans(real),/non-synthetic/i);
  const missing=fixture();missing.documents=missing.documents.filter(document=>document.id!=='L001-grn');
  assert.throws(()=>defineLiveSamplePlans(missing),/invoice, PO and GRN/i);
});
