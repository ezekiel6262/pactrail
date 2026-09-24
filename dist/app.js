const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];

const profiles = {
  established: {
    id: "PACT #PR-1042", badge: "Standard protection", template: "Protected payment stream",
    copy: "30% kickoff, then continuous release",
    terms: [["Escrow funding","100%"],["Kickoff release","30%"],["Remaining payment","30-day stream"],["Review period","12 hours"]],
    evidence: [
      ["Sustained activity","Wallet shows 14 months of regular onchain activity."],
      ["Recurring relationships","37 counterparties appear more than once."],
      ["Agreement within range","Value is 1.2× the recipient’s observed median receipt."],
      ["Available liquidity","Observed liquid assets exceed the proposed commitment."]
    ]
  },
  thin: {
    id: "PACT #PR-1087", badge: "Enhanced protection", template: "Milestone escrow",
    copy: "Full funding with controlled releases",
    terms: [["Escrow funding","100%"],["Kickoff release","15%"],["Milestones","35% · 50%"],["Review period","48 hours"]],
    evidence: [
      ["Limited history","Recipient has 19 days of observable activity."],
      ["Concentrated funding","78% of inflows came from one related wallet."],
      ["Deal-size anomaly","Value is 3.4× the recipient’s largest observed receipt."],
      ["Limited continuity","Only two recurring counterparties were observed."]
    ]
  }
};

let activeProfile = "thin";
let currentResult = profiles.thin;

function money(n){ return Number(n || 0).toLocaleString("en-US"); }
function showToast(message){ const toast=$("#toast"); toast.textContent=message; toast.classList.add("show"); setTimeout(()=>toast.classList.remove("show"),2200); }

function setProfile(profile){
  activeProfile = profile;
  if(profile === "established"){
    $("#recipient").value="0x8B14...40C2";
    $("#sampleToggle").textContent="Use thin-history sample";
  }else{
    $("#recipient").value="0x3C42...91E7";
    $("#sampleToggle").textContent="Use established sample";
  }
}

$("#sampleToggle").addEventListener("click",()=>{
  setProfile(activeProfile === "thin" ? "established" : "thin");
  showToast(activeProfile === "thin" ? "Thin-history sample loaded" : "Established sample loaded");
});

function renderResult(result){
  currentResult=result;
  $("#agreementId").textContent=result.id;
  $("#protectionBadge").textContent=result.badge;
  $("#templateName").textContent=result.template;
  $("#recommendationCopy").textContent=result.copy;
  $("#signalCount").textContent=`${result.evidence.length} behavioral signals`;
  $("#termList").innerHTML=result.terms.map(([label,value])=>`<div class="term"><span>${label}</span><b>${value}</b></div>`).join("");
  $("#evidenceList").innerHTML=result.evidence.map(([title,copy])=>`<div class="evidence-item"><i></i><div><b>${title}</b><span>${copy}</span></div></div>`).join("");
}

async function compileAgreement(data){
  $("#emptyOutput").classList.add("hidden");
  $("#resultOutput").classList.add("hidden");
  $("#loadingOutput").classList.remove("hidden");
  const rows=$$(".scan-lines>div");
  rows.forEach(r=>{r.className="";r.querySelector("b").textContent="queued"});
  for(const row of rows){
    row.classList.add("active"); row.querySelector("b").textContent="checking";
    await new Promise(r=>setTimeout(r,430));
    row.classList.remove("active"); row.classList.add("done"); row.querySelector("b").textContent="verified";
  }
  let compiled = profiles[activeProfile];
  try {
    const response = await fetch('/api/policies/evaluate', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({actor:$('#payer').value,counterparty:$('#recipient').value,amount_usd:Number($('#amount').value),intent:'service_payment',demo_profile:activeProfile})});
    const api = await response.json();
    if(response.ok){
      const p=api.policy;
      compiled={id:`PACT #${api.policy_id.slice(-7).toUpperCase()}`,badge:api.decision==='ALLOW'?'Standard protection':'Enhanced protection',template:p.template==='protected_stream'?'Protected payment stream':'Milestone escrow',copy:p.template==='protected_stream'?'30% kickoff, then continuous release':'Full funding with controlled releases',terms:p.template==='protected_stream'?[["Escrow funding",`${p.escrow_percentage}%`],["Kickoff release",`${p.upfront_percentage}%`],["Remaining payment",`${p.stream_days}-day stream`],["Review period",`${p.review_period_hours} hours`]]:[["Escrow funding",`${p.escrow_percentage}%`],["Kickoff release",`${p.upfront_percentage}%`],["Milestones",p.milestone_percentages.map(x=>`${x}%`).join(' · ')],["Review period",`${p.review_period_hours} hours`]],evidence:api.reasons.map(r=>[r.code.split('_').map(x=>x[0]+x.slice(1).toLowerCase()).join(' '),r.observation])};
    }
  } catch (_) {}
  renderResult(compiled);
  $("#loadingOutput").classList.add("hidden");
  $("#resultOutput").classList.remove("hidden");
  return {decision:"ALLOW_WITH_SAFEGUARDS",agreement_id:currentResult.id.replace("PACT #",""),template:currentResult.template,protection:currentResult.badge};
}

$("#dealForm").addEventListener("submit", async (event)=>{
  event.preventDefault();
  const amount=Number($("#amount").value);
  if(!amount || amount < 100){ showToast("Enter an agreement value of at least $100"); return; }
  await compileAgreement({amount,recipient:$("#recipient").value});
});

function openEscrow(){
  $("#modalAgreement").textContent=currentResult.id.replace("PACT ","");
  $("#modalAmount").textContent=`${money($("#amount").value)} USDC`;
  const kickoff=currentResult.terms[1][1].replace("%","");
  $("#proofAmount").textContent=`${money(Number($("#amount").value)*Number(kickoff)/100)} USDC`;
  $$(".dialog-step").forEach(x=>x.classList.add("hidden"));
  $('[data-step="fund"]').classList.remove("hidden");
  $("#escrowDialog").showModal();
}

$("#deployButton").addEventListener("click",openEscrow);
$(".dialog-close").addEventListener("click",()=>$("#escrowDialog").close());
$(".dialog-close-final").addEventListener("click",()=>$("#escrowDialog").close());
$$('.modal-action').forEach(button=>button.addEventListener("click",()=>{
  const next=button.dataset.next;
  $$(".dialog-step").forEach(x=>x.classList.add("hidden"));
  $(`[data-step="${next}"]`).classList.remove("hidden");
  if(next==="proof") $("#proofHash").textContent=`0x${Math.random().toString(16).slice(2,6)}…${Math.random().toString(16).slice(2,6)}`;
}));

$("#walletButton").addEventListener("click",async()=>{
  if(window.ethereum){
    try{const accounts=await window.ethereum.request({method:'eth_requestAccounts'});const a=accounts[0];$("#payer").value=a;$("#walletButton").innerHTML=`<span></span> ${a.slice(0,6)}…${a.slice(-4)}`;showToast("Wallet connected");return}catch(_){showToast("Wallet connection cancelled");return}
  }
  $("#walletButton").innerHTML="<span></span> 0x71A9…2F18";showToast("No wallet extension found — demo wallet loaded");
});
$$('[data-scroll]').forEach(btn=>btn.addEventListener("click",()=>document.getElementById(btn.dataset.scroll).scrollIntoView()));

function registerWebMCP(){
  const context=document.modelContext;
  if(!context?.registerTool) return;
  const controller=new AbortController();
  Promise.resolve(context.registerTool({
    name:"compile_agreement", title:"Compile Pactrail agreement",
    description:"Configure the visible Pactrail deal and compile wallet behavior into recommended safeguards.",
    inputSchema:{type:"object",properties:{purpose:{type:"string"},payer:{type:"string"},recipient:{type:"string"},amountUsd:{type:"number",minimum:100},profile:{type:"string",enum:["thin","established"]}},required:["purpose","payer","recipient","amountUsd"],additionalProperties:false},
    annotations:{readOnlyHint:false,untrustedContentHint:false},
    async execute(input){
      if(!input || input.amountUsd<100) throw new Error("amountUsd must be at least 100");
      $("#purpose").value=input.purpose; $("#payer").value=input.payer; $("#recipient").value=input.recipient; $("#amount").value=input.amountUsd;
      if(input.profile) activeProfile=input.profile;
      return await compileAgreement(input);
    }
  },{signal:controller.signal})).catch(()=>{});
}
registerWebMCP();
