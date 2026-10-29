import 'dotenv/config';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { finished } from 'node:stream/promises';
import { ZipArchive } from 'archiver';
import { parseLedger, safeFile } from '../server/ingest.js';
import { associateDocuments, matchLedgerLine } from '../server/engine.js';
import type { Document, Engagement, Fixture, LedgerLine } from '../shared/types.js';

const LABEL = 'Entirely fictional synthetic audit evidence. No employer, client or real-person data.';
const ZIP_DATE = new Date('2026-10-29T00:00:00Z');
const hash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const columns: (keyof LedgerLine)[] = ['id','date','vendor','invoice_no','amount','vat','account','currency','quantity','po_no','assertion'];
const definitions = [
  { id:'01-clean', title:'Clean purchase', ledgerIds:['L001'], sourceLedgerId:'L001', purpose:'A single purchase with no planted discrepancy.' },
  { id:'02-amount', title:'Amount transposition', ledgerIds:['L003'], sourceLedgerId:'L003', purpose:'Ledger amount 4,530.00 against the unchanged 4,350.00 supplier invoice.' },
  { id:'03-vat', title:'VAT calculation', ledgerIds:['L007'], sourceLedgerId:'L007', purpose:'Incorrect invoice VAT also causes the invoice gross total to differ from its purchase order.' },
  { id:'04-quantity', title:'Short goods receipt', ledgerIds:['L012'], sourceLedgerId:'L012', purpose:'Invoice and PO record ten units; the goods receipt records eight.' },
  { id:'05-approval', title:'Missing invoice authorisation', ledgerIds:['L017'], sourceLedgerId:'L017', purpose:'Invoice authorisation area is visibly unsigned.' },
  { id:'06-duplicate', title:'Duplicate supplier invoice', ledgerIds:['L021','L022'], sourceLedgerId:'L021', purpose:'Two ledger postings share one unchanged invoice, purchase order and goods receipt.' },
] as const;

export interface LiveSamplePlan {
  id:string;
  title:string;
  purpose:string;
  ledger:LedgerLine[];
  documents:Document[];
  expected:Fixture['expected'];
}
interface ManifestFile { path:string; kind:'ledger'|'source-document'|'upload-archive'|'scoring'; sha256:string; bytes:number }
export interface LiveSampleManifest {
  schemaVersion:1;
  label:string;
  notice:string;
  packs:{id:string;title:string;purpose:string;ledgerIds:string[];inputDirectory:string;archive:string;scoringFile:string;documents:{sourceId:string;filename:string;type:Document['type'];sha256:string}[]}[];
  files:ManifestFile[];
}

export function defineLiveSamplePlans(fixture:Fixture):LiveSamplePlan[] {
  return definitions.map(definition => {
    const ledger=definition.ledgerIds.map(id=>{
      const line=fixture.ledger.find(line=>line.id===id);
      assert.ok(line,`Synthetic fixture is missing ${id}. Run npm run seed before building samples.`);
      return structuredClone(line);
    });
    const documents=fixture.documents.filter(document=>document.ledgerId===definition.sourceLedgerId&&['invoice','po','grn'].includes(document.type));
    assert.equal(documents.length,3,`${definition.id} must have exactly one invoice, PO and GRN.`);
    assert.deepEqual(new Set(documents.map(document=>document.type)),new Set(['invoice','po','grn']));
    assert.ok(documents.every(document=>document.synthetic),`${definition.id} contains non-synthetic sources.`);
    const expected=fixture.expected.filter(item=>definition.ledgerIds.some(id=>id===item.ledgerId));
    assert.equal(expected.length,ledger.length*9,`${definition.id} has incomplete scoring truth.`);
    return {id:definition.id,title:definition.title,purpose:definition.purpose,ledger,documents:structuredClone(documents),expected:structuredClone(expected)};
  });
}

function csvFor(lines:LedgerLine[]):string {
  return [columns.join(','),...lines.map(line=>columns.map(column=>`"${String(line[column]??'').replaceAll('"','""')}"`).join(','))].join('\r\n')+'\r\n';
}

/** Copies existing PDFs byte-for-byte; this command never regenerates fixture assets. */
export async function buildLiveSamples(options:{dataDir?:string;outputDir?:string}={}):Promise<LiveSampleManifest> {
  const dataDir=path.resolve(options.dataDir||process.env.DATA_DIR||'data');
  const outputDir=path.resolve(options.outputDir||'artifacts/live-samples');
  let fixture:Fixture;
  try { fixture=JSON.parse(await readFile(path.join(dataDir,'demo','fixture.json'),'utf8')) as Fixture; }
  catch { throw new Error('Existing data/demo/fixture.json is required. Run npm run seed first; sample packaging never regenerates source files.'); }
  const plans=defineLiveSamplePlans(fixture);
  const manifest:LiveSampleManifest={schemaVersion:1,label:LABEL,notice:'Only files under each inputs directory belong in the application upload. Scoring truth stays in the separate expected directory and is never sent to model providers.',packs:[],files:[]};
  await mkdir(path.join(outputDir,'expected'),{recursive:true});
  for(const plan of plans){
    const inputDirectory=`${plan.id}/inputs`,archive=`${plan.id}/upload.zip`,scoringFile=`expected/${plan.id}.json`;
    await mkdir(path.join(outputDir,inputDirectory,'documents'),{recursive:true});
    const csv=Buffer.from(csvFor(plan.ledger));
    assert.deepEqual(parseLedger(csv.toString('utf8')),plan.ledger,'Packaged CSV no longer reproduces the source ledger rows.');
    const csvPath=`${inputDirectory}/ledger.csv`;
    await writeFile(path.join(outputDir,csvPath),csv);
    manifest.files.push({path:csvPath,kind:'ledger',sha256:hash(csv),bytes:csv.length});
    const sources:{path:string;archivePath:string}[]=[{path:csvPath,archivePath:'ledger.csv'}];
    for(const document of plan.documents){
      const original=safeFile(dataDir,document.sourcePath),bytes=await readFile(original);
      assert.equal(hash(bytes),document.sha256,`Original source bytes changed: ${document.id}`);
      const filename=path.basename(document.sourcePath),target=`${inputDirectory}/documents/${filename}`;
      await copyFile(original,path.join(outputDir,target));
      assert.equal(hash(await readFile(path.join(outputDir,target))),document.sha256);
      manifest.files.push({path:target,kind:'source-document',sha256:document.sha256,bytes:bytes.length});
      sources.push({path:target,archivePath:`documents/${filename}`});
    }
    const truth=Buffer.from(JSON.stringify({label:LABEL,warning:'Evaluation only. Do not upload this file to the application or a model provider.',scenario:plan.id,purpose:plan.purpose,expected:plan.expected,expectedExceptionClaims:plan.expected.filter(item=>item.result==='exception').length,expectedAffectedRows:new Set(plan.expected.filter(item=>item.result==='exception').map(item=>item.ledgerId)).size},null,2));
    await writeFile(path.join(outputDir,scoringFile),truth);
    manifest.files.push({path:scoringFile,kind:'scoring',sha256:hash(truth),bytes:truth.length});
    const stream=createWriteStream(path.join(outputDir,archive)),zip=new ZipArchive({zlib:{level:9}});
    const complete=finished(stream);zip.on('error',error=>stream.destroy(error));zip.pipe(stream);
    for(const source of sources)zip.append(await readFile(path.join(outputDir,source.path)),{name:source.archivePath,date:ZIP_DATE,mode:0o644});
    await zip.finalize();await complete;
    const archiveBytes=await readFile(path.join(outputDir,archive));
    manifest.files.push({path:archive,kind:'upload-archive',sha256:hash(archiveBytes),bytes:archiveBytes.length});
    manifest.packs.push({id:plan.id,title:plan.title,purpose:plan.purpose,ledgerIds:plan.ledger.map(line=>line.id),inputDirectory,archive,scoringFile,documents:plan.documents.map(document=>({sourceId:document.id,filename:path.basename(document.sourcePath),type:document.type,sha256:document.sha256}))});
  }
  await writeFile(path.join(outputDir,'manifest.json'),JSON.stringify(manifest,null,2));
  await writeFile(path.join(outputDir,'README.txt'),`${LABEL}\n\nSMALL LIVE VALIDATION INPUTS\n\nGenerate: npm run samples:live\nVerify import and identifier associations without model calls: npm run samples:live -- --verify-api\nThe verifier uses the running local server at SMOKE_BASE_URL (default http://127.0.0.1:3001).\nAPP_TOKEN is read from your environment when access protection is enabled.\n\nFor each scenario, choose its inputs/ledger.csv and the three PDFs under inputs/documents/ in the application's import form. ZIP files are extraction conveniences; the importer accepts CSV and PDFs directly.\n\nThe clean packet is the smallest full three-way-match sample. Follow with amount, VAT, quantity, missing approval, and duplicate packets. The duplicate packet contains two CSV rows and ONE shared invoice/PO/GRN set.\n\nAll source PDFs are byte-for-byte copies of the existing seeded synthetic sources. Filename roles (invoice, po, grn) and ledger supplier/invoice/PO references are preserved. No source images or PDFs are regenerated.\n\nExpected outcomes live only under expected/. Do not upload expected/, manifest.json, verification.json or this README to the application or a provider. Offline association verification uses known synthetic metadata in memory and does not claim live extraction, segmentation or model accuracy.\n\nModel-backed runs still require Meta and Baseten credentials. Packaging and import verification do not call a model.\n`);
  return manifest;
}

/** Real HTTP multipart ingestion, followed by an explicitly fixture-assisted association check. */
export async function verifyLiveSampleImports(options:{dataDir?:string;outputDir?:string;baseUrl?:string;token?:string}={}) {
  const dataDir=path.resolve(options.dataDir||process.env.DATA_DIR||'data'),outputDir=path.resolve(options.outputDir||'artifacts/live-samples');
  const base=(options.baseUrl||process.env.SMOKE_BASE_URL||'http://127.0.0.1:3001').replace(/\/$/,'');
  const fixture=JSON.parse(await readFile(path.join(dataDir,'demo','fixture.json'),'utf8')) as Fixture;
  const manifest=JSON.parse(await readFile(path.join(outputDir,'manifest.json'),'utf8')) as LiveSampleManifest;
  const plans=defineLiveSamplePlans(fixture),token=options.token||process.env.APP_TOKEN;
  const headers:Record<string,string>=token?{Authorization:`Bearer ${token}`}:{ };
  const results:{id:string;passed:boolean;engagementId?:string;ledgerRows?:number;sourceDocuments?:number;deterministicExceptionClaims?:number;associationMode:string;details?:unknown;error?:string}[]=[];
  for(const pack of manifest.packs){
    try{
      const form=new FormData();form.set('name',`Synthetic live validation: ${pack.title}`);form.set('client','Fictional synthetic validation only');form.set('period','October 2026');
      form.set('ledger',new Blob([new Uint8Array(await readFile(path.join(outputDir,pack.inputDirectory,'ledger.csv')))],{type:'text/csv'}),'ledger.csv');
      for(const document of pack.documents)form.append('documents',new Blob([new Uint8Array(await readFile(path.join(outputDir,pack.inputDirectory,'documents',document.filename)))],{type:'application/pdf'}),document.filename);
      const response=await fetch(base+'/api/engagements',{method:'POST',headers,body:form,signal:AbortSignal.timeout(90_000)});
      const payload=await response.json();assert.ok(response.ok,`Import returned HTTP ${response.status}: ${JSON.stringify(payload)}`);
      const imported=payload as Engagement,plan=plans.find(plan=>plan.id===pack.id)!;
      assert.equal(imported.mode,'live');assert.equal(imported.status,'ready');assert.equal(imported.fields.length,0,'Imported engagement must not contain fixture extraction values.');
      assert.equal(imported.ledger.length,pack.ledgerIds.length);assert.equal(imported.documents.length,3);
      const probe=structuredClone(imported);
      for(const source of pack.documents){
        const document=probe.documents.find(document=>document.name===source.filename);assert.ok(document,`Filename role changed: ${source.filename}`);
        assert.equal(document.type,source.type);assert.equal(document.sha256,source.sha256);assert.equal(document.synthetic,false);assert.match(document.imageSha256||'',/^[a-f0-9]{64}$/);
        const original=fixture.documents.find(document=>document.id===source.sourceId)!;
        probe.fields.push(...fixture.fields.filter(field=>field.docId===source.sourceId).map(field=>({...structuredClone(field),id:`${document.id}-${field.name}`,docId:document.id,bbox:[Math.round(field.bbox[0]*document.width/original.width),Math.round(field.bbox[1]*document.height/original.height),Math.max(1,Math.round(field.bbox[2]*document.width/original.width)),Math.max(1,Math.round(field.bbox[3]*document.height/original.height))] as [number,number,number,number],model:'known synthetic metadata for association test only'})));
      }
      associateDocuments(probe);
      const observed=probe.ledger.flatMap(line=>matchLedgerLine(probe,line).map(candidate=>({ledgerId:line.id,test:candidate.test,result:candidate.pass===null?'unverified':candidate.pass?'match':'exception',sourceFieldCount:candidate.fields.length,sourceDocumentIds:[...new Set(candidate.fields.map(field=>field.docId))]})));
      for(const expected of plan.expected){const candidate=observed.find(candidate=>candidate.ledgerId===expected.ledgerId&&candidate.test===expected.test);assert.equal(candidate?.result,expected.result,`${expected.ledgerId}:${expected.test} association/control mismatch.`);assert.ok(candidate.sourceFieldCount>0);}
      const sourceApplicability=probe.documents.map(document=>({name:document.name,ledgerIds:[...new Set(observed.filter(candidate=>candidate.sourceDocumentIds.includes(document.id)).map(candidate=>candidate.ledgerId))]}));
      for(const source of sourceApplicability)assert.deepEqual(new Set(source.ledgerIds),new Set(pack.ledgerIds),`Source ${source.name} was not available to every intended sample row.`);
      const integrityResponse=await fetch(base+`/api/engagements/${imported.id}/integrity`,{headers,signal:AbortSignal.timeout(30_000)});const integrity=await integrityResponse.json();assert.equal(integrity.filesValid,true);
      results.push({id:pack.id,passed:true,engagementId:imported.id,ledgerRows:imported.ledger.length,sourceDocuments:imported.documents.length,deterministicExceptionClaims:observed.filter(candidate=>candidate.result==='exception').length,associationMode:'Real multipart PDF ingestion; known synthetic field values injected into a LOCAL IN-MEMORY CLONE only. No extraction or model accuracy claimed. Server engagement remains untouched and ready for real live extraction.',details:{documentRoles:imported.documents.map(document=>document.type),associations:probe.documents.map(document=>({name:document.name,ledgerId:document.ledgerId??null})),sourceApplicability,controls:observed}});
    }catch(error){results.push({id:pack.id,passed:false,associationMode:'Import and fixture-assisted association verification',error:error instanceof Error?error.message:String(error)});}
  }
  const report={label:LABEL,scope:'Import/rasterization and source-identifier association tests only. No model API calls.',inputManifestSha256:hash(await readFile(path.join(outputDir,'manifest.json'))),baseUrl:base,timestamp:new Date().toISOString(),passed:results.every(result=>result.passed),results};
  await writeFile(path.join(outputDir,'verification.json'),JSON.stringify(report,null,2));
  return report;
}

if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
  const args=process.argv.slice(2);if(args.some(arg=>arg!=='--verify-api'))throw new Error('Usage: npm run samples:live [-- --verify-api]');
  const manifest=await buildLiveSamples();console.log(`Prepared ${manifest.packs.length} fictional sample packs under artifacts/live-samples without regenerating source assets.`);
  if(args.includes('--verify-api')){const report=await verifyLiveSampleImports();console.log(JSON.stringify({passed:report.passed,results:report.results.map(({id,passed,engagementId,ledgerRows,sourceDocuments,deterministicExceptionClaims,error})=>({id,passed,engagementId,ledgerRows,sourceDocuments,deterministicExceptionClaims,error}))},null,2));if(!report.passed)process.exitCode=1;}
}
