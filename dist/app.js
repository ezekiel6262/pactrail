const $=(selector)=>document.querySelector(selector);
const $$=(selector)=>[...document.querySelectorAll(selector)];
let activeSample="thin";
let currentResult=null;
let currentPolicy=null;

const samples={thin:"0x28c6c06298d514db089934071355e5743bf21d60",established:"0x39d52da6beec991f075eebe577474fd105c5caec"};
const money=(value)=>Number(value||0).toLocaleString("en-US");
function showToast(message){const toast=$("#toast");toast.textContent=message;toast.classList.add("show");setTimeout(()=>toast.classList.remove("show"),2200)}

$("#sampleToggle").addEventListener("click",()=>{
  activeSample=activeSample==="thin"?"established":"thin";
  $("#recipient").value=samples[activeSample];
  $("#sampleToggle").textContent=activeSample==="thin"?"Use contrasting sample":"Use alternate public sample";
  showToast("Public wallet sample loaded");
});

function renderResult(result){
  currentResult=result;
  $("#agreementId").textContent=result.id;
  $("#protectionBadge").textContent=result.badge;
  $("#templateName").textContent=result.template;
  $("#recommendationCopy").textContent=result.copy;
  $("#signalCount").textContent=`${result.evidence.length} policy reasons`;
  $("#termList").innerHTML=result.terms.map(([label,value])=>`<div class="term"><span>${label}</span><b>${value}</b></div>`).join("");
  $("#evidenceList").innerHTML=result.evidence.map(([title,copy])=>`<div class="evidence-item"><i></i><div><b>${title}</b><span>${copy}</span></div></div>`).join("");
}

function persistPolicy(policy){
  const history=JSON.parse(localStorage.getItem("pactrail.agreements")||"[]");
  const record={...policy,purpose:$("#purpose").value,saved_at:new Date().toISOString()};
  localStorage.setItem("pactrail.agreements",JSON.stringify([record,...history.filter((item)=>item.policy_id!==record.policy_id)].slice(0,20)));
}

async function compileAgreement(){
  $("#emptyOutput").classList.add("hidden");
  $("#resultOutput").classList.add("hidden");
  $("#loadingOutput").classList.remove("hidden");
  const scanRows=$$(".scan-lines>div");
  scanRows.forEach((row)=>{row.className="";row.querySelector("b").textContent="queued"});
  for(const row of scanRows){row.classList.add("active");row.querySelector("b").textContent="checking";await new Promise((resolve)=>setTimeout(resolve,250));row.className="done";row.querySelector("b").textContent="verified"}
  try{
    const response=await fetch("/api/v1/policies/evaluate",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({actor:$("#payer").value,counterparty:$("#recipient").value,amount_usd:Number($("#amount").value),intent:"service_payment",chain:$("#network").value.toLowerCase()})});
    const api=await response.json();
    if(!response.ok)throw new Error(api.message||api.error||"Live policy evaluation failed");
    const policy=api.policy;
    const stream=policy.template==="protected_stream";
    const compiled={
      id:`PACT #${api.policy_id.slice(-7).toUpperCase()}`,
      badge:api.decision==="ALLOW"?"Standard protection":"Enhanced protection",
      template:stream?"Protected payment stream":"Milestone escrow",
      copy:`${api.data_quality.total_signal_groups} live Nansen signal groups · both wallets`,
      terms:stream?[["Escrow funding",`${policy.escrow_percentage}%`],["Kickoff release",`${policy.upfront_percentage}%`],["Remaining payment",`${policy.stream_days}-day stream`],["Review period",`${policy.review_period_hours} hours`]]:[["Escrow funding",`${policy.escrow_percentage}%`],["Kickoff release",`${policy.upfront_percentage}%`],["Milestones",policy.milestone_percentages.map((value)=>`${value}%`).join(" · ")],["Review period",`${policy.review_period_hours} hours`]],
      evidence:api.reasons.map((reason)=>[`${reason.role}: ${reason.code.split("_").map((part)=>part[0]+part.slice(1).toLowerCase()).join(" ")}`,reason.observation]),
    };
    currentPolicy=api;
    persistPolicy(api);
    renderResult(compiled);
    $("#loadingOutput").classList.add("hidden");
    $("#resultOutput").classList.remove("hidden");
    return {agreement_id:api.policy_id,decision:api.decision,mode:api.mode,provider:api.provider,signal_groups:api.data_quality.total_signal_groups};
  }catch(error){
    $("#loadingOutput").classList.add("hidden");
    $("#emptyOutput").classList.remove("hidden");
    $("#emptyOutput h2").textContent="Live evaluation unavailable";
    $("#emptyOutput>p:not(.kicker)").textContent=error.message;
    showToast(error.message);
    return {decision:"ERROR",message:error.message};
  }
}

$("#dealForm").addEventListener("submit",async(event)=>{event.preventDefault();if(Number($("#amount").value)<100){showToast("Enter an agreement value of at least $100");return}await compileAgreement()});

$("#deployButton").addEventListener("click",()=>{
  $("#modalAgreement").textContent=currentResult?.id.replace("PACT ","")||"Unavailable";
  $("#modalAmount").textContent=`${money($("#amount").value)} USDC`;
  $("#policyReceiptId").textContent=currentPolicy?.policy_id||"Unavailable";
  $("#escrowDialog").showModal();
});
$(".dialog-close").addEventListener("click",()=>$("#escrowDialog").close());
$("#downloadReceipt").addEventListener("click",()=>{
  if(!currentPolicy)return;
  const blob=new Blob([JSON.stringify(currentPolicy,null,2)],{type:"application/json"});
  const link=document.createElement("a");link.href=URL.createObjectURL(blob);link.download=`${currentPolicy.policy_id}.json`;link.click();URL.revokeObjectURL(link.href);
});

$("#walletButton").addEventListener("click",async()=>{
  if(!window.ethereum){showToast("Install an EVM wallet extension to connect");return}
  try{const accounts=await window.ethereum.request({method:"eth_requestAccounts"});const address=accounts[0];$("#payer").value=address;$("#walletButton").innerHTML=`<span></span> ${address.slice(0,6)}…${address.slice(-4)}`;showToast("Wallet connected")}catch{showToast("Wallet connection cancelled")}
});
$$('[data-scroll]').forEach((button)=>button.addEventListener("click",()=>document.getElementById(button.dataset.scroll).scrollIntoView()));

function registerWebMCP(){
  const context=document.modelContext;if(!context?.registerTool)return;
  Promise.resolve(context.registerTool({name:"compile_agreement",title:"Compile Pactrail agreement",description:"Run bilateral live Nansen analysis and compile transaction safeguards.",inputSchema:{type:"object",properties:{purpose:{type:"string"},payer:{type:"string"},recipient:{type:"string"},amountUsd:{type:"number",minimum:100}},required:["purpose","payer","recipient","amountUsd"],additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:false},async execute(input){$("#purpose").value=input.purpose;$("#payer").value=input.payer;$("#recipient").value=input.recipient;$("#amount").value=input.amountUsd;return compileAgreement()}})).catch(()=>{});
}
registerWebMCP();
