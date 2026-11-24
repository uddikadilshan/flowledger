import test from "node:test";
import assert from "node:assert/strict";
import {buildSchedule,loanSchema} from "../lib/loans";
test("month end and final partial instalment",()=>{
 assert.deepEqual(buildSchedule("1000","100","400","2027-01-31","2027-03-31"),[
 {due_date:"2027-01-31",amount_minor:40000n},{due_date:"2027-02-28",amount_minor:40000n},{due_date:"2027-03-31",amount_minor:10000n}]);
});
test("fully paid loan has no schedule",()=>assert.deepEqual(buildSchedule("100","100","20","2027-01-01","2027-01-01"),[]));
test("reject overpaid, zero instalment and impossible end date",()=>{
 assert.throws(()=>buildSchedule("100","101","20","2027-01-01","2027-12-01"));
 assert.throws(()=>buildSchedule("100","0","0","2027-01-01","2027-12-01"));
 assert.throws(()=>buildSchedule("100","0","20","2027-01-01","2027-01-01"));
});
test("reject invalid dates and amounts",()=>assert.equal(loanSchema.safeParse({title:"Loan",lender:"",total:"100.001",prior:"0",monthly:"20",start_date:"2027-02-01",first_due:"2027-01-01",end_date:"2027-12-01"}).success,false));
