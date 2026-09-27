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

const BASE_SEPOLIA={chainId:"0x14a34",chainName:"Base Sepolia",nativeCurrency:{name:"ETH",symbol:"ETH",decimals:18},rpcUrls:["https://sepolia.base.org"],blockExplorerUrls:["https://sepolia.basescan.org"]};
const BASE_SEPOLIA_USDC="0x036CbD53842c5426634e7929541eC2318f3dCF7e";
const ERC20_ABI=["function approve(address spender,uint256 amount) returns (bool)"];

async function switchToBaseSepolia(){
  try{await window.ethereum.request({method:"wallet_switchEthereumChain",params:[{chainId:BASE_SEPOLIA.chainId}]})}
  catch(error){if(error.code!==4902)throw error;await window.ethereum.request({method:"wallet_addEthereumChain",params:[BASE_SEPOLIA]})}
}

function milestoneAmounts(amount,policy){
  const total=ethers.parseUnits(String(amount),6);
  const percentages=policy.template==="milestone_escrow"?[policy.upfront_percentage,...policy.milestone_percentages]:[policy.upfront_percentage,100-policy.upfront_percentage];
  const values=[];let allocated=0n;
  percentages.forEach((percentage,index)=>{const value=index===percentages.length-1?total-allocated:total*BigInt(percentage)/100n;values.push(value);allocated+=value});
  return values;
}

$("#executeEscrow").addEventListener("click",async()=>{
  const status=$("#executionStatus");
  try{
    if(!currentPolicy)throw new Error("Compile a live policy first");
    if(!window.ethereum)throw new Error("Install an EVM wallet extension to execute escrow");
    const resolver=$("#resolverAddress").value.trim();
    if(!ethers.isAddress(resolver))throw new Error("Enter a valid independent resolver address");
    await switchToBaseSepolia();
    const provider=new ethers.BrowserProvider(window.ethereum);
    const signer=await provider.getSigner();
    const payer=await signer.getAddress();
    if(resolver.toLowerCase()===payer.toLowerCase()||resolver.toLowerCase()===$("#recipient").value.toLowerCase())throw new Error("Resolver must differ from both parties");
    status.textContent="Checking escrow factory…";
    let factoryAddress=localStorage.getItem("pactrail.baseSepoliaFactory");
    if(factoryAddress){const code=await provider.getCode(factoryAddress);if(code==="0x")factoryAddress=null}
    if(!factoryAddress){
      status.textContent="Confirm factory deployment in your wallet…";
      const deployment=new ethers.ContractFactory(PACTRAIL_CONTRACTS.factory.abi,PACTRAIL_CONTRACTS.factory.bytecode,signer);
      const factory=await deployment.deploy();
      await factory.waitForDeployment();
      factoryAddress=await factory.getAddress();
      localStorage.setItem("pactrail.baseSepoliaFactory",factoryAddress);
    }
    const factory=new ethers.Contract(factoryAddress,PACTRAIL_CONTRACTS.factory.abi,signer);
    const amounts=milestoneAmounts(Number($("#amount").value),currentPolicy.policy);
    const policyHash=ethers.keccak256(ethers.toUtf8Bytes(JSON.stringify(currentPolicy)));
    const expiresAt=Math.floor(Date.now()/1000)+30*24*60*60;
    status.textContent="Confirm escrow creation in your wallet…";
    const createTx=await factory.createEscrow($("#recipient").value,resolver,BASE_SEPOLIA_USDC,policyHash,amounts,expiresAt);
    const createReceipt=await createTx.wait();
    const created=createReceipt.logs.map((log)=>{try{return factory.interface.parseLog(log)}catch{return null}}).find((event)=>event?.name==="EscrowCreated");
    if(!created)throw new Error("Escrow creation event was not found");
    const escrowAddress=created.args.escrow;
    const total=amounts.reduce((sum,value)=>sum+value,0n);
    status.textContent="Confirm exact USDC approval in your wallet…";
    const token=new ethers.Contract(BASE_SEPOLIA_USDC,ERC20_ABI,signer);
    await (await token.approve(escrowAddress,total)).wait();
    status.textContent="Confirm escrow funding in your wallet…";
    const escrow=new ethers.Contract(escrowAddress,PACTRAIL_CONTRACTS.escrow.abi,signer);
    const fundTx=await escrow.fund();
    const fundReceipt=await fundTx.wait();
    const execution={network:"base-sepolia",factory_address:factoryAddress,escrow_address:escrowAddress,create_tx:createReceipt.hash,fund_tx:fundReceipt.hash,asset:BASE_SEPOLIA_USDC,status:"funded",updated_at:new Date().toISOString()};
    currentPolicy.execution=execution;persistPolicy(currentPolicy);
    status.innerHTML=`Escrow funded onchain. <a href="https://sepolia.basescan.org/address/${escrowAddress}" target="_blank" rel="noreferrer">View verified activity ↗</a>`;
    $("#executeEscrow").disabled=true;
    $("#executeEscrow span").textContent="Escrow funded";
  }catch(error){status.textContent=error.shortMessage||error.message||"Escrow execution failed"}
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
