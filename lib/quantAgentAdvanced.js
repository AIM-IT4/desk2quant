import { GROQ_CHAT_MODEL } from './groqModels.js';
import { getServiceKey } from './supabaseAdmin.js';
import { normalizeAccessEmail } from './accessTokens.js';
import { handleQuantAgent, verifyAgentToken } from './quantAgentServer.js';

const SKILLS = new Set(['probability','linear_algebra','statistics','stochastic_calculus','derivatives','fixed_income','numerical_methods','programming','risk','quant_research']);
const ALL_DOCS = ['problem_book','numerical_methods','fixed_income','exotic_options','quant_research'];
const PRODUCT_DOC_RULES = [
  [/complete front office.*risk quant professional bundle/i, ALL_DOCS],
  [/quant interview problem book/i, ['problem_book']],
  [/numerical methods for quants/i, ['numerical_methods']],
  [/fixed income math.*bond pricing/i, ['fixed_income']],
  [/exotic options pricing guide/i, ['exotic_options']],
  [/quant researcher interview playbook/i, ['quant_research']]
];

function headers(key, extra = {}) { return { apikey:key, Authorization:`Bearer ${key}`, 'Content-Type':'application/json', ...extra }; }
function sbUrl() { return process.env.SUPABASE_URL || 'https://dntabmyurlrlnoajdnja.supabase.co'; }
function clamp(x,lo,hi){ return Math.max(lo,Math.min(hi,x)); }
function logistic(x){ return 1/(1+Math.exp(-x)); }
function normalizeSkill(value=''){
  const raw=String(value).trim().toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_+|_+$/g,'');
  const aliases={probability_theory:'probability',prob:'probability',maths:'linear_algebra',math:'linear_algebra',stochastic:'stochastic_calculus',ito:'stochastic_calculus',options:'derivatives',exotics:'derivatives',bonds:'fixed_income',rates:'fixed_income',monte_carlo:'numerical_methods',python:'programming',cpp:'programming',sql:'programming',var:'risk',es:'risk',research:'quant_research'};
  const skill=aliases[raw]||raw;
  return SKILLS.has(skill)?skill:'probability';
}

async function modelJson(messages,maxTokens=1800){
  const key=process.env.GROQ_API_KEY;
  if(!key) throw new Error('GROQ_API_KEY is not configured');
  const response=await fetch('https://api.groq.com/openai/v1/chat/completions',{method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:JSON.stringify({model:process.env.GROQ_CHAT_MODEL||GROQ_CHAT_MODEL,messages,temperature:0.2,max_tokens:maxTokens,response_format:{type:'json_object'}})});
  if(!response.ok) throw new Error(`Model request failed (${response.status})`);
  const data=await response.json();
  const raw=String(data?.choices?.[0]?.message?.content||'').trim();
  if(!raw) throw new Error('Empty model response');
  try{return JSON.parse(raw);}catch{
    const match=raw.match(/\{[\s\S]*\}/);
    if(!match) throw new Error('Invalid JSON model response');
    return JSON.parse(match[0]);
  }
}

async function razorpayPayment(paymentId){
  const id=process.env.RAZORPAY_KEY_ID, secret=process.env.RAZORPAY_KEY_SECRET;
  if(!id||!secret) return null;
  const auth='Basic '+Buffer.from(`${id}:${secret}`).toString('base64');
  const pResp=await fetch(`https://api.razorpay.com/v1/payments/${encodeURIComponent(paymentId)}`,{headers:{Authorization:auth}});
  if(!pResp.ok) return null;
  const payment=await pResp.json();
  let order=null;
  if(payment.order_id){
    try{const oResp=await fetch(`https://api.razorpay.com/v1/orders/${encodeURIComponent(payment.order_id)}`,{headers:{Authorization:auth}});if(oResp.ok) order=await oResp.json();}catch(_){}
  }
  return {payment,order};
}

async function verifiedPurchasedProductNames(email,key){
  const response=await fetch(`${sbUrl()}/rest/v1/purchases?customer_email=ilike.${encodeURIComponent(email)}&payment_id=like.pay_*&select=customer_email,product_name,payment_id&limit=100`,{headers:headers(key)});
  if(!response.ok) return [];
  const target=normalizeAccessEmail(email);
  const rows=(await response.json()).filter(r=>normalizeAccessEmail(r.customer_email)===target);
  const names=new Set(), seen=new Set();
  for(const row of rows){
    const pid=String(row.payment_id||'');
    if(!pid.startsWith('pay_')||seen.has(pid)) continue;
    seen.add(pid);
    const verified=await razorpayPayment(pid);
    if(!verified||verified.payment?.status!=='captured') continue;
    const p=verified.payment,o=verified.order;
    const emails=[p.email,p.notes?.customer_email,p.notes?.email,o?.notes?.customer_email,o?.notes?.email].filter(Boolean).map(normalizeAccessEmail);
    if(!emails.length||!emails.includes(target)) continue;
    const gatewayName=String(p.notes?.product_name||o?.notes?.product_name||'').trim();
    const storedName=String(row.product_name||'').trim();
    if(gatewayName) names.add(gatewayName);
    if(storedName) names.add(storedName);
  }
  return [...names];
}

export function allowedDocumentsFromProducts(productNames=[]){
  const docs=new Set();
  for(const name of productNames) for(const [pattern,keys] of PRODUCT_DOC_RULES) if(pattern.test(name)) keys.forEach(k=>docs.add(k));
  return [...docs];
}

async function retrievePrivateContext(email,query,key){
  const names=await verifiedPurchasedProductNames(email,key);
  const allowed=allowedDocumentsFromProducts(names);
  if(!allowed.length) return {context:'',sources:[]};
  const response=await fetch(`${sbUrl()}/rest/v1/rpc/search_quant_agent_knowledge`,{method:'POST',headers:headers(key),body:JSON.stringify({query_text:String(query).slice(0,2000),allowed_document_keys:allowed,result_limit:5})});
  if(!response.ok) return {context:'',sources:[]};
  const rows=await response.json();
  if(!Array.isArray(rows)||!rows.length) return {context:'',sources:[]};
  return {context:rows.map((r,i)=>`[Private Desk2Quant source ${i+1}: ${r.document_title} / ${r.section}]\n${r.snippet}`).join('\n\n'),sources:rows.map(r=>({document:r.document_title,section:r.section}))};
}

async function loadSkill(user,skill,key){
  const response=await fetch(`${sbUrl()}/rest/v1/quant_agent_skills?user_key=eq.${user}&skill_key=eq.${skill}&select=user_key,skill_key,theta,information,attempts,mean_score,last_score,updated_at&limit=1`,{headers:headers(key)});
  if(!response.ok) throw new Error('skill state unavailable');
  const rows=await response.json();
  return rows?.[0]||{user_key:user,skill_key:skill,theta:0,information:0,attempts:0,mean_score:0,last_score:null};
}
async function listSkills(user,key){
  const response=await fetch(`${sbUrl()}/rest/v1/quant_agent_skills?user_key=eq.${user}&select=skill_key,theta,information,attempts,mean_score,last_score,updated_at&order=updated_at.desc`,{headers:headers(key)});
  if(!response.ok) throw new Error('skill state unavailable');
  return await response.json();
}

async function startAssessment(user,requestedSkill,key){
  const skill=normalizeSkill(requestedSkill), state=await loadSkill(user,skill,key), difficulty=clamp(Number(state.theta)||0,-2.25,2.25), discrimination=1.15;
  const item=await modelJson([{role:'system',content:'You are Desk2Quant assessment engine. Return strict JSON only. Create ONE original quant interview assessment item. It must test reasoning, not trivia. Do not quote proprietary books. JSON keys: question, rubric, referenceAnswer. rubric must specify objective scoring criteria totaling 100 points. referenceAnswer must be concise but sufficient to grade. No markdown fences.'},{role:'user',content:`Skill: ${skill}. IRT difficulty b=${difficulty.toFixed(2)} on a scale where 0 is intermediate, negative is easier, positive is harder. Create an item appropriate to that difficulty.`}],1800);
  if(!item.question||!item.rubric||!item.referenceAnswer) throw new Error('invalid assessment item');
  const response=await fetch(`${sbUrl()}/rest/v1/quant_agent_assessments`,{method:'POST',headers:headers(key,{Prefer:'return=representation'}),body:JSON.stringify({user_key:user,skill_key:skill,difficulty,discrimination,question:String(item.question).slice(0,6000),rubric:String(item.rubric).slice(0,8000),reference_answer:String(item.referenceAnswer).slice(0,12000)})});
  if(!response.ok) throw new Error('failed to save assessment');
  const created=(await response.json())?.[0];
  return {assessmentId:created.id,skill,difficulty,question:created.question,expiresAt:created.expires_at,currentTheta:Number(state.theta)||0,attempts:Number(state.attempts)||0};
}

async function gradeAssessment(user,assessmentId,answer,key){
  if(!assessmentId||!String(answer||'').trim()) throw new Error('assessmentId and answer required');
  if(String(answer).length>12000) throw new Error('answer too long');
  const response=await fetch(`${sbUrl()}/rest/v1/quant_agent_assessments?id=eq.${encodeURIComponent(assessmentId)}&user_key=eq.${user}&status=eq.open&select=*&limit=1`,{headers:headers(key)});
  if(!response.ok) throw new Error('assessment unavailable');
  const item=(await response.json())?.[0];
  if(!item) throw new Error('assessment not found or already graded');
  if(Date.now()>new Date(item.expires_at).getTime()){await fetch(`${sbUrl()}/rest/v1/quant_agent_assessments?id=eq.${item.id}`,{method:'PATCH',headers:headers(key),body:JSON.stringify({status:'expired'})});throw new Error('assessment expired');}
  const grading=await modelJson([{role:'system',content:'You are a strict quant interview grader. Return JSON only with keys score and feedback. score must be a number in [0,1]. Grade only against the supplied rubric/reference answer; give partial credit for correct reasoning. Do not reward verbosity.'},{role:'user',content:`QUESTION:\n${item.question}\n\nRUBRIC:\n${item.rubric}\n\nREFERENCE ANSWER:\n${item.reference_answer}\n\nCANDIDATE ANSWER:\n${String(answer)}`}],1200);
  const score=clamp(Number(grading.score),0,1),state=await loadSkill(user,item.skill_key,key),theta=Number(state.theta)||0,a=Number(item.discrimination)||1,b=Number(item.difficulty)||0,p=logistic(a*(theta-b)),attempts=Number(state.attempts)||0,eta=0.75/Math.sqrt(1+attempts/4),nextTheta=clamp(theta+eta*a*(score-p),-4,4),info=(Number(state.information)||0)+a*a*p*(1-p),nextAttempts=attempts+1,mean=((Number(state.mean_score)||0)*attempts+score)/nextAttempts,now=new Date().toISOString();
  await fetch(`${sbUrl()}/rest/v1/quant_agent_skills`,{method:'POST',headers:headers(key,{Prefer:'resolution=merge-duplicates,return=minimal'}),body:JSON.stringify({user_key:user,skill_key:item.skill_key,theta:nextTheta,information:info,attempts:nextAttempts,mean_score:mean,last_score:score,updated_at:now})});
  await fetch(`${sbUrl()}/rest/v1/quant_agent_assessments?id=eq.${item.id}`,{method:'PATCH',headers:headers(key),body:JSON.stringify({status:'graded',score,feedback:String(grading.feedback||'').slice(0,6000),graded_at:now})});
  return {assessmentId:item.id,skill:item.skill_key,score,feedback:String(grading.feedback||''),thetaBefore:theta,thetaAfter:nextTheta,attempts:nextAttempts,meanScore:mean,information:info,abilityNote:'theta is a calibrated latent skill estimate from graded assessments, not a percentage.'};
}

function authSession(req){const email=normalizeAccessEmail(req.body?.email);if(!email||!email.includes('@')) return {error:'Valid email required.'};const session=verifyAgentToken(email,req.body?.agentToken);if(!session) return {error:'Quant Agent session expired. Run `d2q login` again.'};return {email,session};}

export async function handleQuantAgentAdvanced(req,res){
  const action=String(req.body?.action||'');
  if(!['agent-assess-start','agent-assess-submit','agent-skills','agent-run'].includes(action)) return handleQuantAgent(req,res);
  const auth=authSession(req); if(auth.error) return res.status(401).json({error:auth.error});
  const key=getServiceKey(); if(!key) return res.status(503).json({error:'Quant Agent database access is not configured.'});
  try{
    if(action==='agent-assess-start') return res.status(200).json({success:true,...await startAssessment(auth.session.sub,req.body.skill,key)});
    if(action==='agent-assess-submit') return res.status(200).json({success:true,...await gradeAssessment(auth.session.sub,req.body.assessmentId,req.body.answer,key)});
    if(action==='agent-skills'){const skills=await listSkills(auth.session.sub,key);return res.status(200).json({success:true,skills,note:'theta is centered at 0; positive values indicate stronger demonstrated performance at harder items, negative values weaker performance. It is not a percentile.'});}
    const originalQuery=String(req.body.query||'');
    const rag=await retrievePrivateContext(auth.email,originalQuery,key);
    if(!rag.context) return handleQuantAgent(req,res);
    req.body={...req.body,query:`${originalQuery}\n\nINTERNAL PRIVATE DESK2QUANT RETRIEVAL CONTEXT (Razorpay-verified entitlement):\n${rag.context}\n\nUse the context when relevant. Paraphrase rather than reproduce long passages. If the context does not answer the point, rely on quant reasoning and say the private material did not directly cover it.`.slice(0,6000)};
    res.setHeader('X-D2Q-RAG','1');
    return handleQuantAgent(req,res);
  }catch(err){console.error('Advanced Quant Agent error:',err.message);const status=/expired|not found|already graded|required|too long/i.test(err.message)?400:500;return res.status(status).json({error:err.message==='assessment expired'?'Assessment expired. Start a new one.':'Advanced Quant Agent request failed.'});}
}

export const QUANT_AGENT_SKILLS=[...SKILLS];
