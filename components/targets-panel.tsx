"use client";
import {useEffect,useRef,useState} from "react";
import {localDate,days as weekdayNames,type Business} from "@/lib/domain";
import {formatMinor,addMonths} from "@/lib/expenses";
import {monthBounds,fundTotals} from "@/lib/funds";
import {settlementBalance,targetsFor} from "@/lib/settlements";
import {planTargets} from "@/lib/target-planner";
import {readableError} from "@/lib/supabase";
import {Button,Notice} from "./ui";
export function TargetsPanel({business}:{business:Business}){
 const today=localDate(business.timezone);
 const [horizon,setHorizon]=useState("month");
 const end=monthBounds(addMonths(today,horizon==="next"?1:horizon==="quarter"?2:0).slice(0,7)).to;
 const [data,setData]=useState<{plan:ReturnType<typeof planTargets>;todayCollections:bigint;monthCollections:bigint;business:bigint;external:bigint}|null>(null);
 const [error,setError]=useState(""),[loading,setLoading]=useState(true);
 const generation=useRef(0);
 async function reload(){
  const n=++generation.current;setData(null);setError("");setLoading(true);
  try{
   const [obligations,balance,daily,monthly]=await Promise.all([targetsFor(business.id,"2000-01-01",end),settlementBalance(business.id,today),fundTotals(business.id,today,today),fundTotals(business.id,today.slice(0,7)+"-01",today)]);
   const plan=planTargets({today,end,days:business.business_days,business:balance.business,external:balance.external,obligations});
   if(n===generation.current)setData({plan,todayCollections:daily.collection,monthCollections:monthly.collection,...balance});
  }catch(e){if(n===generation.current)setError(e instanceof Error?e.message:readableError(e));}
  finally{if(n===generation.current)setLoading(false);}
 }
 useEffect(()=>{reload();return()=>{generation.current++;};},[business.id,business.updated_at,today,end]);
 const fmt=(v:bigint)=>formatMinor(v,business.currency);
 const p=data?.plan;
 return <div className="stack">
 <section className="card stack"><div className="form-grid"><label>Planning horizon<select value={horizon} onChange={e=>setHorizon(e.target.value)}><option value="month">End of this month</option><option value="next">End of next month</option><option value="quarter">End of month + two months</option></select></label><div><span className="eyebrow">Working days</span><p>{business.business_days.map(d=>weekdayNames[d]).join(", ")}</p></div></div><p className="muted">Business local date {today} · Through {end}</p><Button secondary disabled={loading} onClick={reload}>Refresh targets</Button></section>
 {error&&<Notice error>{error}</Notice>}
 {loading&&<p>Calculating targets…</p>}
 {data&&p&&<>
 <section className="card stack"><span className="eyebrow">Additional collection recommended today</span><div className="expense-total">{fmt(p.targetToday)}</div><p>{p.workingToday?"Based on available cash and the tightest upcoming deadline. Today's recorded collections are already included in available funds.":"Non-working day. Next working-day rate: "+fmt(p.rate)}</p>{p.critical&&<small>Critical deadline: {p.critical}</small>}{p.urgent>0n&&<Notice error>Immediate funding gap: {fmt(p.urgent)}. No scheduled working day remains before a deadline. Arrange funds or revise the payment plan.</Notice>}<p className="muted">This is a live remaining target, not a fixed morning goal or guaranteed forecast.</p></section>
 <section className="card stack"><h2>Funding and obligations</h2><dl><dt>Available business funds</dt><dd>{fmt(data.business)}</dd><dt>Available external funds</dt><dd>{fmt(data.external)}</dd><dt>Unpaid expenses</dt><dd>{fmt(p.expenses)}</dd><dt>Unpaid loan instalments</dt><dd>{fmt(p.loans)}</dd><dt>Overdue obligations (included above)</dt><dd>{fmt(p.overdue)}</dd><dt>Additional collections required through {end}</dt><dd><strong>{fmt(p.required)}</strong></dd></dl></section>
 <section className="card stack"><h2>Actual business collections</h2><dl><dt>Today</dt><dd>{fmt(data.todayCollections)}</dd><dt>Month to date</dt><dd>{fmt(data.monthCollections)}</dd></dl><p className="muted">External funding is excluded from actual collections. Refresh after recording funds or payments.</p></section>
 <section className="card stack"><h2>Deadline breakdown</h2>{!p.deadlines.length?<p>No unpaid obligations in this horizon.</p>:p.deadlines.map(d=><div className="member-row" key={d.date}><div><strong>{d.date}{d.date===today?" · Includes overdue items":""}</strong><small>Due {fmt(d.outstanding)} · Cumulative {fmt(d.cumulative)}</small><small>{d.workdays} remaining working days · Funding gap {fmt(d.shortfall)}</small></div><strong>{d.urgent?"Immediate gap":fmt(d.rate)+" / day"}</strong></div>)}</section>
 </>}
 </div>;
}
