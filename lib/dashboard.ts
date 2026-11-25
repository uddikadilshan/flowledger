import {fundEntries} from "./funds";
import {settlementsFor,settlementBalance,targetsFor,remaining} from "./settlements";
import {expensesFor,categoriesFor} from "./expenses";
import {planTargets,nextDay} from "./target-planner";
import {aggregateFlow,monthShift,monthRange,comparableRange,expenseBreakdown} from "./dashboard-math";
import type {Business} from "./domain";
export async function dashboardFor(b:Business,month:string,today:string){
 const {range,previous}=comparableRange(month,today);
 const first=monthShift(month,-5)+"-01",last=range.to;
 const [funds,payments,balance,targets,expenses,categories,todayFunds]=await Promise.all([
 fundEntries(b.id,first,last,false),settlementsFor(b.id,first,last),settlementBalance(b.id,today),
 targetsFor(b.id,"2000-01-01","2100-12-31"),expensesFor(b.id,month,false),categoriesFor(b.id),fundEntries(b.id,today,today,false)
 ]);
 const flow=aggregateFlow(funds,payments,range.from,range.to),prior=aggregateFlow(funds,payments,previous.from,previous.to);
 const trend=Array.from({length:6},(_,i)=>{const key=monthShift(month,i-5),r=monthRange(key);return {month:key,...aggregateFlow(funds,payments,r.from,key===month?range.to:r.to)};});
 const daily=aggregateFlow(todayFunds,[],today,today).collection;
 const plan=planTargets({today,end:monthRange(today.slice(0,7)).to,days:b.business_days,business:balance.business,external:balance.external,obligations:targets});
 const outstanding=targets.filter(t=>remaining(t)>0n);
 const sum=(kind:"expense"|"loan")=>outstanding.filter(t=>t.kind===kind).reduce((s,t)=>s+remaining(t),0n);
 const loanScheduled=targets.filter(t=>t.kind==="loan").reduce((s,t)=>s+BigInt(t.amount_minor),0n);
 const loanPaid=targets.filter(t=>t.kind==="loan").reduce((s,t)=>s+BigInt(t.paid_minor),0n);
 let week=today;for(let i=0;i<7;i++)week=nextDay(week);
 const overdue=outstanding.filter(t=>t.due_date<today),upcoming=outstanding.filter(t=>t.due_date>=today&&t.due_date<=week);
 return {flow,prior,trend,daily,balance,plan,expensesDue:sum("expense"),loansDue:sum("loan"),loanScheduled,loanPaid,overdue,upcoming,breakdown:expenseBreakdown(expenses,categories),range,previous};
}
