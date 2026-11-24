"use client";
import {useEffect,useRef,useState,type FormEvent} from "react";
import {type Business,localDate} from "@/lib/domain";
import {readableError} from "@/lib/supabase";
import {decimalAmount,formatMinor} from "@/lib/expenses";
import {loanSchema,loanCommand,loansFor,instalmentsFor,loanHistoryFor,type Loan,type LoanInput,type Instalment,type LoanHistory} from "@/lib/loans";
import {Button,Notice} from "./ui";
export function LoansPanel({business,owner}:{business:Business;owner:boolean}){
 const today=localDate(business.timezone), canWrite=owner&&!business.archived_at;
 const [deleted,setDeleted]=useState(false),[rows,setRows]=useState<Loan[]>([]),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(""),[message,setMessage]=useState("");
 const [form,setForm]=useState<LoanInput|null>(null),[editing,setEditing]=useState<Loan|null>(null),[detail,setDetail]=useState<{loan:Loan;items:Instalment[];history:LoanHistory[]}|null>(null);
 const lock=useRef(false),request=useRef(""),generation=useRef(0);
 async function reload(){
  const n=++generation.current;setLoading(true);
  try{const data=await loansFor(business.id,deleted);if(n===generation.current)setRows(data);}
  finally{if(n===generation.current)setLoading(false);}
 }
 useEffect(()=>{setRows([]);setDetail(null);setForm(null);reload().catch(e=>setError(readableError(e)));return()=>{generation.current++;};},[business.id,deleted]);
 async function run(fn:()=>Promise<void>){
  if(lock.current)return;lock.current=true;setBusy(true);setError("");setMessage("");
  try{if(!navigator.onLine)throw Error("offline");await fn();}
  catch(e){setError(readableError(e));}finally{lock.current=false;setBusy(false);}
 }
 function open(l?:Loan){
  setEditing(l??null);request.current=crypto.randomUUID();
  setForm(l?{title:l.title,lender:l.lender,total:decimalAmount(l.total_minor),prior:decimalAmount(l.prior_minor),monthly:decimalAmount(l.monthly_minor),start_date:l.start_date,first_due:l.first_due,end_date:l.end_date}:{title:"",lender:"",total:"",prior:"0",monthly:"",start_date:today,first_due:today,end_date:today});
 }
 async function save(e:FormEvent){
  e.preventDefault();const parsed=loanSchema.safeParse(form);
  if(!parsed.success){setError(parsed.error.issues[0].message);return;}
  await run(async()=>{
   await loanCommand(editing?"update":"create",{...parsed.data,business_id:business.id,id:editing?.id??request.current,version:editing?.version});
   setForm(null);setDetail(null);setMessage("Loan saved.");await reload();
  });
 }
 function change(l:Loan){
  if(!l.deleted_at&&!confirm("Archive "+l.title+"? Its schedule and history will be retained."))return;
  run(async()=>{await loanCommand(l.deleted_at?"restore":"delete",{business_id:business.id,id:l.id,version:l.version});setDetail(null);await reload();setMessage(l.deleted_at?"Loan restored.":"Loan archived.");});
 }
 const total=rows.reduce((s,l)=>s+BigInt(l.total_minor)-BigInt(l.prior_minor),0n);
 const fields:{key:keyof LoanInput;label:string;type?:string;money?:boolean}[]=[
  {key:"title",label:"Loan name"},{key:"lender",label:"Lender"},
  {key:"total",label:"Total contractual repayment",money:true},{key:"prior",label:"Already paid before tracking",money:true},{key:"monthly",label:"Monthly instalment",money:true},
  {key:"start_date",label:"Loan start date",type:"date"},{key:"first_due",label:"First remaining due date",type:"date"},{key:"end_date",label:"Contract end date",type:"date"}
 ];
 return <div className="stack">
  {error&&<Notice error>{error} <button className="text-link" disabled={busy} onClick={()=>run(reload)}>Refresh</button></Notice>}
  {message&&<Notice>{message}</Notice>}
  <section className="card expense-toolbar"><div><span className="eyebrow">{deleted?"Archived loans":"Opening outstanding loan balance"}</span><div className="expense-total">{loading?"Loading…":formatMinor(total,business.currency)}</div><p className="muted">Contract totals less previously paid amounts. New payments will be tracked in settlements.</p></div>
  <div className="actions"><Button secondary disabled={busy} onClick={()=>setDeleted(!deleted)}>{deleted?"Active loans":"Archived loans"}</Button>{canWrite&&!deleted&&<Button disabled={busy||loading} onClick={()=>open()}>Add loan</Button>}</div></section>
  {form&&canWrite&&<section className="card form-card"><h2>{editing?"Edit loan":"New loan"}</h2><p className="muted">Enter the full contractual repayment including agreed interest. Editing replaces the remaining schedule; the previous schedule is retained in history.</p><form onSubmit={save}><fieldset disabled={busy}><div className="form-grid">
   {fields.map(f=><label key={f.key}>{f.label}{f.money?" ("+business.currency+")":""}<input required={f.key!=="lender"} type={f.type??"text"} inputMode={f.money?"decimal":undefined} value={form[f.key]} onChange={e=>setForm({...form,[f.key]:e.target.value})}/></label>)}
  </div></fieldset><div className="form-actions"><Button secondary type="button" disabled={busy} onClick={()=>setForm(null)}>Cancel</Button><Button disabled={busy}>{busy?"Saving…":"Save loan"}</Button></div></form></section>}
  {loading?<p className="muted">Loading loans…</p>:!rows.length?<section className="card empty"><h2>No {deleted?"archived ":""}loans yet</h2><p>Loan schedules will appear here.</p></section>:<div className="business-grid">{rows.map(l=><article className="card stack" key={l.id}><h2>{l.title}</h2><p className="muted">{l.lender||"Lender not specified"}</p><span className="eyebrow">Opening outstanding</span><div className="expense-total">{formatMinor(BigInt(l.total_minor)-BigInt(l.prior_minor),business.currency)}</div><dl><dt>Total repayment</dt><dd>{formatMinor(BigInt(l.total_minor),business.currency)}</dd><dt>Previously paid</dt><dd>{formatMinor(BigInt(l.prior_minor),business.currency)}</dd><dt>Monthly instalment</dt><dd>{formatMinor(BigInt(l.monthly_minor),business.currency)}</dd><dt>Contract period</dt><dd>{l.start_date} – {l.end_date}</dd></dl><div className="actions"><Button secondary disabled={busy} onClick={()=>run(async()=>{const [items,history]=await Promise.all([instalmentsFor(business.id,l.id),owner?loanHistoryFor(business.id,l.id):Promise.resolve([])]);setDetail({loan:l,items,history});})}>Schedule{owner?" & history":""}</Button>{canWrite&&<>{!l.deleted_at&&<Button secondary disabled={busy} onClick={()=>open(l)}>Edit</Button>}<Button secondary disabled={busy} onClick={()=>change(l)}>{l.deleted_at?"Restore":"Archive"}</Button></>}</div></article>)}</div>}
  {detail&&<section className="card stack"><div className="section-title"><h2>{detail.loan.title} — remaining schedule</h2><Button secondary onClick={()=>setDetail(null)}>Close</Button></div><p className="muted">{detail.items.length} scheduled instalments · Dates do not confirm payment status.</p>{detail.items.map(i=><div className="member-row" key={i.id}><span>{i.due_date}{i.due_date<today?" · Past due date":""}</span><strong>{formatMinor(BigInt(i.amount_minor),business.currency)}</strong></div>)}{owner&&<><h2>Change history</h2>{detail.history.map(h=><details key={h.id}><summary>{h.action} · {new Date(h.created_at).toLocaleString()}</summary><div style={{overflowWrap:"anywhere",whiteSpace:"pre-wrap"}}>Before: {JSON.stringify(h.before_record,null,2)}{"\n"}After: {JSON.stringify(h.after_record,null,2)}</div></details>)}</>}</section>}
 </div>;
}
