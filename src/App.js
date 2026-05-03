import { useState, useRef, useEffect, useCallback } from "react";

// ── persistence ───────────────────────────────────────────────────────────────
const S = (k,v) => { try { localStorage.setItem(k,JSON.stringify(v)); } catch {} };
const L = (k,d) => { try { const v=localStorage.getItem(k); return v?JSON.parse(v):d; } catch { return d; } };
const today = () => new Date().toISOString().split("T")[0];
const fmtDate = d => new Date(d+"T12:00:00").toLocaleDateString("en-IN",{day:"numeric",month:"short"});

// ── design tokens ─────────────────────────────────────────────────────────────
const T = {
  bg:       "#faf7f2",
  surface:  "#ffffff",
  card:     "#fff9f0",
  border:   "#e8e0d0",
  accent:   "#e6a817",   // sunflower
  accentBg: "#fef3d0",
  brown:    "#7a5c3a",
  brownBg:  "#f5ede0",
  green:    "#5a8a5a",
  greenBg:  "#eef5ee",
  red:      "#c0392b",
  redBg:    "#fdf0ee",
  blue:     "#3a6ea8",
  blueBg:   "#eef2f9",
  text:     "#2d2015",
  sub:      "#8a7060",
  muted:    "#c5b5a5",
  shadow:   "0 2px 12px rgba(120,80,30,0.08)",
};

const NUTR = ["cal","protein","carbs","fat","fiber","sodium","sugar","calcium","iron","vitaminC","vitaminD"];

function sumN(entries) {
  return entries.reduce((a,e)=>{ NUTR.forEach(k=>a[k]=(a[k]||0)+(e[k]||0)); return a; },{});
}
function calcBMR(p) {
  if(!p.weight||!p.height||!p.age) return 0;
  const b=10*p.weight+6.25*p.height-5*p.age;
  return Math.round(p.sex==="female"?b-161:b+5);
}
function calcTDEE(bmr,act) {
  return Math.round(bmr*({sedentary:1.2,light:1.375,moderate:1.55,active:1.725,very_active:1.9}[act]||1.2));
}
function inferMeal() {
  const h=new Date().getHours();
  if(h<10) return "Breakfast";
  if(h<13) return "Lunch";
  if(h<16) return "Snack";
  if(h<20) return "Dinner";
  return "Snack";
}

// ── Gemini ────────────────────────────────────────────────────────────────────
// Claude tool definitions
const TOOLS = [
  {
    name: "log_food",
    description: "Log food items to the user food diary. Call this whenever the user mentions eating or drinking anything.",
    input_schema: {
      type: "object",
      properties: {
        items: { type: "array", items: { type: "object", properties: {
          name:    {type:"string"}, qty:     {type:"number"}, unit:    {type:"string"},
          meal:    {type:"string"}, cal:     {type:"number"}, protein: {type:"number"},
          carbs:   {type:"number"}, fat:     {type:"number"}, fiber:   {type:"number"},
          sodium:  {type:"number"}, sugar:   {type:"number"}
        }, required:["name","qty","unit","cal","protein","carbs","fat","fiber"]}},
        message: {type:"string", description:"Brief natural comment shown to user before they confirm"}
      }, required:["items","message"]
    }
  },
  {
    name: "remove_food",
    description: "Remove food from the log. qty = how many to remove (supports partial removal).",
    input_schema: { type:"object", properties: {
      name: {type:"string"}, qty: {type:"number"}, message: {type:"string"}
    }, required:["name","message"]}
  },
  {
    name: "save_food",
    description: "Save a food to the user library for future use.",
    input_schema: { type:"object", properties: {
      name:{type:"string"}, servingSize:{type:"number"}, servingUnit:{type:"string"},
      cal:{type:"number"}, protein:{type:"number"}, carbs:{type:"number"}, fat:{type:"number"},
      fiber:{type:"number"}, sodium:{type:"number"}, sugar:{type:"number"}, message:{type:"string"}
    }, required:["name","servingSize","servingUnit","cal","protein","carbs","fat","message"]}
  },
  {
    name: "save_recipe",
    description: "Save a recipe with full ingredient list and per-serving macros.",
    input_schema: { type:"object", properties: {
      name:{type:"string"}, yield:{type:"number"}, yieldUnit:{type:"string"},
      steps:{type:"string"},
      ingredients:{type:"array", items:{type:"object", properties:{
        name:{type:"string"},qty:{type:"number"},unit:{type:"string"},
        cal:{type:"number"},protein:{type:"number"},carbs:{type:"number"},fat:{type:"number"},fiber:{type:"number"}
      }, required:["name","qty","unit","cal","protein","carbs","fat"]}},
      cal:{type:"number"}, protein:{type:"number"}, carbs:{type:"number"},
      fat:{type:"number"}, fiber:{type:"number"}, sodium:{type:"number"}, message:{type:"string"}
    }, required:["name","yield","yieldUnit","cal","protein","carbs","fat","message"]}
  }
];

async function callClaude(messages, system, imageB64, mimeType) {
  const apiMessages = messages.map((m, i) => {
    if(m.role === "user" && imageB64 && i === messages.length - 1) {
      return { role:"user", content:[
        {type:"image", source:{type:"base64", media_type:mimeType||"image/png", data:imageB64}},
        {type:"text", text:m.content}
      ]};
    }
    return {role: m.role === "assistant" ? "assistant" : "user", content: m.content};
  });

  const resp = await fetch('/api/chat', {
    method: 'POST',
    headers: {'Content-Type':'application/json'},
    body: JSON.stringify({
      model: 'claude-haiku-4-5',
      max_tokens: 2000,
      system,
      tools: TOOLS,
      messages: apiMessages,
    })
  });

  if(!resp.ok) throw new Error((await resp.text()).slice(0, 120));
  const data = await resp.json();
  const textBlock = data.content?.find(b => b.type === 'text');
  const toolBlock = data.content?.find(b => b.type === 'tool_use');
  return JSON.stringify({
    fnCall: toolBlock ? {name: toolBlock.name, args: toolBlock.input} : null,
    text: textBlock?.text || ''
  });
}

// ── tiny components ───────────────────────────────────────────────────────────
function Btn({children,onClick,variant="ghost",full,disabled,small,style:s={}}) {
  const v={
    ghost:{bg:"transparent",color:T.sub,border:`1px solid ${T.border}`},
    accent:{bg:T.accent,color:"#fff",border:"none"},
    brown:{bg:T.brown,color:"#fff",border:"none"},
    green:{bg:T.green,color:"#fff",border:"none"},
    soft:{bg:T.accentBg,color:T.brown,border:`1px solid ${T.border}`},
    danger:{bg:T.redBg,color:T.red,border:`1px solid ${T.red}44`},
  }[variant]||{};
  return (
    <button onClick={onClick} disabled={disabled} style={{
      background:v.bg,color:v.color,border:v.border,
      borderRadius:10,padding:small?"6px 12px":"10px 18px",
      fontSize:small?11:13,fontWeight:700,cursor:disabled?"not-allowed":"pointer",
      width:full?"100%":undefined,fontFamily:"inherit",opacity:disabled?0.5:1,
      letterSpacing:0.2,transition:"all 0.15s",...s
    }}>{children}</button>
  );
}

function Card({children,style:s={}}) {
  return <div style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:16,padding:16,boxShadow:T.shadow,...s}}>{children}</div>;
}

function Bar({val,goal,color,height=5}) {
  const pct=Math.min((val||0)/goal*100,100);
  return (
    <div style={{height,background:T.border,borderRadius:99,overflow:"hidden"}}>
      <div style={{height,width:`${pct}%`,background:color,borderRadius:99,transition:"width 0.5s"}}/>
    </div>
  );
}

function MacroPill({label,val,unit,color}) {
  return (
    <div style={{background:color+"15",border:`1px solid ${color}30`,borderRadius:12,padding:"8px 10px",textAlign:"center",flex:1,minWidth:0}}>
      <div style={{fontSize:15,fontWeight:800,color,fontFamily:"monospace"}}>{Math.round(val||0)}</div>
      <div style={{fontSize:9,color:T.sub,marginTop:1,textTransform:"uppercase",letterSpacing:0.5}}>{label}{unit?` (${unit})`:""}</div>
    </div>
  );
}

// ── MAIN APP ──────────────────────────────────────────────────────────────────
export default function App() {
  const [tab, setTab] = useState("home");
  const [viewDate, setViewDate] = useState(today());
  // migrate old keys from previous version
  useState(()=>{ try { ["profile","goals","log","steps","water","weights","ing","rec"].forEach(k=>{ const old=localStorage.getItem("ft_"+k); if(old&&!localStorage.getItem("fp_"+k)) localStorage.setItem("fp_"+k,old); }); } catch {} });
  const [profile, setProfile] = useState(()=>L("fp_profile",{weight:"",height:"",age:"",sex:"female",activity:"moderate",name:""}));
  const [goals, setGoals] = useState(()=>L("fp_goals",{cal:1600,protein:80,carbs:160,fat:55,fiber:25,sodium:2300,steps:8000,water:8}));
  const [log, setLog] = useState(()=>L("fp_log",{}));
  const [steps, setSteps] = useState(()=>L("fp_steps",{}));
  const [water, setWater] = useState(()=>L("fp_water",{}));
  const [weights, setWeights] = useState(()=>L("fp_weights",{}));
  const [foods, setFoods] = useState(()=>L("fp_foods",[]));
  const [recipes, setRecipes] = useState(()=>L("fp_recipes",[]));

  const [msgs,setMsgs]=useState(()=>L("fp_chat",[{role:"assistant",content:`Hey${profile.name?" "+profile.name:""}! What did you eat? I can log food, look up nutrition, read photos, manage your recipes — just talk to me.`}]));
  const sMsgs=v=>{ setMsgs(v); S("fp_chat",v); };

  const sp=(k,v)=>{ const n={...profile,[k]:v}; setProfile(n); S("fp_profile",n); };
  const sg=v=>{ setGoals(v); S("fp_goals",v); };
  const sLog=v=>{ setLog(v); S("fp_log",v); };
  const sSt=v=>{ setSteps(v); S("fp_steps",v); };
  const sWat=v=>{ setWater(v); S("fp_water",v); };
  const sWts=v=>{ setWeights(v); S("fp_weights",v); };
  const sFoods=v=>{ setFoods(v); S("fp_foods",v); };
  const sRecipes=v=>{ setRecipes(v); S("fp_recipes",v); };

  const todayLog = log[viewDate]||[];
  const totals = sumN(todayLog);
  const bmr = calcBMR(profile);
  const tdee = calcTDEE(bmr, profile.activity);
  const isToday = viewDate===today();

  // streak
  let streak=0;
  for(let i=0;i>=-365;i--) {
    const d=new Date(); d.setDate(d.getDate()+i);
    const ds=d.toISOString().split("T")[0];
    if((log[ds]||[]).length>0) streak++;
    else if(i<0) break;
  }

  const tabs=[{id:"home",label:"Home"},{id:"chat",label:"Chat"},{id:"history",label:"History"},{id:"profile",label:"Profile"}];

  return (
    <div style={{background:T.bg,minHeight:"100vh",fontFamily:"'Plus Jakarta Sans','Segoe UI',sans-serif",color:T.text,width:"min(100vw,820px)",margin:"0 auto",display:"flex",flexDirection:"column"}}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap');
        *{box-sizing:border-box;margin:0;padding:0;}
        ::-webkit-scrollbar{width:3px;} ::-webkit-scrollbar-thumb{background:${T.border};border-radius:99px;}
        input::placeholder,textarea::placeholder{color:${T.muted};}
        select option{background:${T.surface};}
        @keyframes slideUp{from{opacity:0;transform:translateY(10px);}to{opacity:1;transform:translateY(0);}}
        .su{animation:slideUp 0.25s ease forwards;}
        @keyframes pop{0%{transform:scale(0.95);opacity:0;}100%{transform:scale(1);opacity:1);}} .pop{animation:pop 0.2s ease forwards;}
        button:active{transform:scale(0.97);}
      `}</style>

      {/* header */}
      <div style={{padding:"16px 18px 0",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <div>
          <div style={{fontSize:10,color:T.sub,letterSpacing:2,textTransform:"uppercase"}}>
            {new Date().toLocaleDateString("en-IN",{weekday:"long",day:"numeric",month:"long"})}
          </div>
          <div style={{fontSize:22,fontWeight:800,color:T.text,letterSpacing:-0.5}}>
            Fuel <span style={{color:T.accent}}>Log</span>
          </div>
        </div>
        <div style={{display:"flex",gap:8,alignItems:"center"}}>
          <div style={{background:T.accentBg,border:`1px solid ${T.accent}44`,borderRadius:10,padding:"5px 10px",textAlign:"center"}}>
            <div style={{fontSize:14,fontWeight:800,color:T.accent,fontFamily:"monospace"}}>{streak} day streak</div>
            <div style={{fontSize:9,color:T.sub}}>streak</div>
          </div>
          <div style={{textAlign:"right"}}>
            <div style={{fontSize:20,fontWeight:800,color:T.brown,fontFamily:"monospace"}}>{Math.round(totals.cal||0)}</div>
            <div style={{fontSize:10,color:T.sub}}>kcal {isToday?"today":"logged"}</div>
          </div>
        </div>
      </div>

      {/* date toggle */}
      <div style={{display:"flex",gap:6,padding:"10px 18px 0"}}>
        <button onClick={()=>setViewDate(new Date(new Date().setDate(new Date().getDate()-1)).toISOString().split("T")[0])}
          style={{background:!isToday?T.brownBg:"transparent",border:`1px solid ${!isToday?T.brown:T.border}`,borderRadius:8,padding:"5px 12px",fontSize:11,color:!isToday?T.brown:T.sub,cursor:"pointer",fontFamily:"inherit",fontWeight:700}}>← Yesterday</button>
        <button onClick={()=>setViewDate(today())}
          style={{background:isToday?T.accentBg:"transparent",border:`1px solid ${isToday?T.accent:T.border}`,borderRadius:8,padding:"5px 12px",fontSize:11,color:isToday?T.brown:T.sub,cursor:"pointer",fontFamily:"inherit",fontWeight:700}}>Today</button>
      </div>

      {/* tabs */}
      <div style={{display:"flex",padding:"10px 18px 0",gap:6}}>
        {tabs.map(t=>(
          <button key={t.id} onClick={()=>setTab(t.id)} style={{
            flex:1,background:tab===t.id?T.brown:T.surface,
            color:tab===t.id?"#fff":T.sub,
            border:`1px solid ${tab===t.id?T.brown:T.border}`,
            borderRadius:10,padding:"8px 0",fontSize:12,fontWeight:700,
            cursor:"pointer",fontFamily:"inherit",transition:"all 0.2s"
          }}>{t.label}</button>
        ))}
      </div>

      {/* content */}
      <div style={{flex:1,padding:"14px 18px 80px",overflowY:"auto"}} className="su" key={tab+viewDate}>
        {tab==="home"   && <Home totals={totals} goals={goals} log={log} viewLog={todayLog} steps={steps[viewDate]||0} water={water[viewDate]||0} tdee={tdee} isToday={isToday} viewDate={viewDate} onSteps={v=>sSt({...steps,[viewDate]:v})} onWater={v=>sWat({...water,[viewDate]:v})} onRemove={i=>sLog({...log,[viewDate]:todayLog.filter((_,idx)=>idx!==i)})} onEdit={(i,e)=>sLog({...log,[viewDate]:todayLog.map((x,idx)=>idx===i?e:x)})} streak={streak} weights={weights} onSaveWeight={sWts} profile={profile} onGoChat={()=>setTab("chat")}/>}
        {tab==="chat"   && <Chat msgs={msgs} onMsgs={sMsgs} profile={profile} goals={goals} log={log} viewDate={viewDate} viewLog={todayLog} totals={totals} tdee={tdee} foods={foods} recipes={recipes} onAddLog={items=>sLog({...log,[viewDate]:[...todayLog,...(Array.isArray(items)?items:[items])]})} onRemoveLog={(name,removeQty=1)=>{
            const idx=[...todayLog].map((e,i)=>({e,i})).reverse().find(({e})=>e.name.toLowerCase().includes(name.toLowerCase()));
            if(!idx) return;
            const entry=idx.e; const ri=idx.i;
            const loggedQty=entry.qty||1;
            if(removeQty>=loggedQty) {
              // remove entire entry
              sLog({...log,[viewDate]:todayLog.filter((_,i)=>i!==ri)});
            } else {
              // partial removal — scale down the entry
              const ratio=(loggedQty-removeQty)/loggedQty;
              const updated={...entry,qty:loggedQty-removeQty,
                cal:(entry.cal||0)*ratio,protein:(entry.protein||0)*ratio,
                carbs:(entry.carbs||0)*ratio,fat:(entry.fat||0)*ratio,
                fiber:(entry.fiber||0)*ratio,sodium:(entry.sodium||0)*ratio};
              sLog({...log,[viewDate]:todayLog.map((x,i)=>i===ri?updated:x)});
            }
          }} onUpdateLog={(name,newQty)=>{ const idx=[...todayLog].reverse().findIndex(e=>e.name.toLowerCase().includes(name.toLowerCase())); if(idx>=0){ const ri=todayLog.length-1-idx; const e=todayLog[ri]; const r=newQty/(e.qty||1); sLog({...log,[viewDate]:todayLog.map((x,i)=>i===ri?{...e,qty:newQty,cal:(e.cal||0)*r,protein:(e.protein||0)*r,carbs:(e.carbs||0)*r,fat:(e.fat||0)*r,fiber:(e.fiber||0)*r}:x)}); }}} onSaveFood={f=>sFoods([...foods,{...f,id:Date.now()}])} onSaveRecipe={r=>sRecipes([...recipes,{...r,id:Date.now()}])} onUpdateFood={(id,f)=>sFoods(foods.map(x=>x.id===id?{...x,...f}:x))} onUpdateRecipe={(id,r)=>sRecipes(recipes.map(x=>x.id===id?{...x,...r}:x))}/>}
        {tab==="history" && <History log={log} goals={goals}/>}
        {tab==="profile"&& <Profile profile={profile} goals={goals} foods={foods} recipes={recipes} bmr={bmr} tdee={tdee} weights={weights} onProfile={sp} onGoals={sg} onFoods={sFoods} onRecipes={sRecipes} onSaveWeight={sWts}/>}
      </div>
    </div>
  );
}

// ── HOME ──────────────────────────────────────────────────────────────────────
function Home({totals,goals,log,viewLog,steps,water,tdee,isToday,viewDate,onSteps,onWater,onRemove,onEdit,streak,weights,onSaveWeight,profile,onGoChat}) {
  const [showAll,setShowAll]=useState(false);
  const [editIdx,setEditIdx]=useState(null);
  const [editQty,setEditQty]=useState("");
  const [newWeight,setNewWeight]=useState("");
  const [showWt,setShowWt]=useState(false);
  const [macroDetail,setMacroDetail]=useState(null);

  const calPct=(totals.cal||0)/goals.cal;
  const deficit=tdee-(totals.cal||0);
  const projFat=deficit>0?deficit/7.7:0;
  const goalFat=tdee-goals.cal>0?(tdee-goals.cal)/7.7:0;
  const stepsCal=Math.round((steps||0)*(profile?.weight||65)*0.00057);
  const weightEntries=Object.entries(weights).sort((a,b)=>b[0].localeCompare(a[0])).slice(0,5);

  const MACROS=[
    {k:"protein",label:"Protein",color:T.blue,goal:goals.protein,unit:"g"},
    {k:"carbs",  label:"Carbs",  color:T.accent,goal:goals.carbs,unit:"g"},
    {k:"fat",    label:"Fat",    color:T.brown, goal:goals.fat,  unit:"g"},
    {k:"fiber",  label:"Fiber",  color:T.green, goal:goals.fiber,unit:"g"},
  ];

  const MEAL_BUDGETS=[
    {meal:"Breakfast",pct:0.25,color:T.accent},
    {meal:"Lunch",    pct:0.35,color:T.brown},
    {meal:"Dinner",   pct:0.30,color:T.blue},
    {meal:"Snack",    pct:0.10,color:T.green},
  ];

  return (
    <div style={{display:"flex",flexDirection:"column",gap:14}}>

      {/* calorie ring */}
      <Card>
        <div style={{display:"flex",alignItems:"center",gap:16}}>
          <div style={{position:"relative",width:90,height:90,flexShrink:0}}>
            <svg width={90} height={90} style={{transform:"rotate(-90deg)"}}>
              <circle cx={45} cy={45} r={36} fill="none" stroke={T.border} strokeWidth={8}/>
              <circle cx={45} cy={45} r={36} fill="none"
                stroke={calPct>1?T.red:T.accent} strokeWidth={8} strokeLinecap="round"
                strokeDasharray={`${Math.min(calPct,1)*226} 226`}
                style={{transition:"stroke-dasharray 0.7s"}}/>
            </svg>
            <div style={{position:"absolute",inset:0,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center"}}>
              <div style={{fontSize:18,fontWeight:800,color:T.text,fontFamily:"monospace",lineHeight:1}}>{Math.round(totals.cal||0)}</div>
              <div style={{fontSize:8,color:T.sub}}>kcal</div>
            </div>
          </div>
          <div style={{flex:1}}>
            <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
              <span style={{fontSize:12,color:T.sub}}>Goal</span>
              <span style={{fontSize:12,fontWeight:700,color:T.text}}>{goals.cal} kcal</span>
            </div>
            <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
              <span style={{fontSize:12,color:T.sub}}>Remaining</span>
              <span style={{fontSize:12,fontWeight:700,color:calPct>1?T.red:T.green}}>{Math.round(Math.abs(goals.cal-(totals.cal||0)))} kcal {calPct>1?"over":"left"}</span>
            </div>
            {tdee>0&&<div style={{display:"flex",justifyContent:"space-between"}}>
              <span style={{fontSize:12,color:T.sub}}>TDEE</span>
              <span style={{fontSize:12,fontWeight:700,color:T.text}}>{tdee} kcal</span>
            </div>}
          </div>
        </div>
        {isToday&&<button onClick={onGoChat} style={{marginTop:14,width:"100%",background:T.accent,border:"none",borderRadius:10,color:"#fff",fontWeight:800,fontSize:13,cursor:"pointer",padding:"10px",fontFamily:"inherit"}}>Log food in Chat</button>}
      </Card>

      {/* fat burn projection */}
      {tdee>0&&(
        <Card style={{background:T.greenBg,border:`1px solid ${T.green}44`}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <div>
              <div style={{fontSize:10,color:T.green,textTransform:"uppercase",letterSpacing:1,fontWeight:700,marginBottom:2}}>projected fat burn today</div>
              <div style={{fontSize:28,fontWeight:800,color:T.green,fontFamily:"monospace"}}>{projFat.toFixed(1)}<span style={{fontSize:13}}> g</span></div>
              <div style={{fontSize:11,color:T.sub,marginTop:2}}>{deficit>0?`${Math.round(deficit)} kcal under TDEE`:`${Math.round(-deficit)} kcal over`}</div>
            </div>
            {goalFat>0&&<div style={{textAlign:"right"}}>
              <div style={{fontSize:10,color:T.sub,marginBottom:2}}>if you hit goal</div>
              <div style={{fontSize:20,fontWeight:800,color:T.accent,fontFamily:"monospace"}}>{goalFat.toFixed(1)}g</div>
            </div>}
          </div>
        </Card>
      )}

      {/* macros */}
      <Card>
        <div style={{fontSize:11,fontWeight:700,color:T.sub,textTransform:"uppercase",letterSpacing:1,marginBottom:10}}>Macros</div>
        <div style={{display:"flex",gap:8,marginBottom:12}}>
          {MACROS.map(m=><MacroPill key={m.k} label={m.label} val={totals[m.k]||0} color={m.color}/>)}
        </div>
        <div style={{display:"flex",flexDirection:"column",gap:8}}>
          {MACROS.map(m=>(
            <div key={m.k} onClick={()=>setMacroDetail(m)} style={{cursor:"pointer"}}>
              <div style={{display:"flex",justifyContent:"space-between",marginBottom:3}}>
                <span style={{fontSize:11,color:T.blue,textDecoration:"underline",textDecorationStyle:"dotted"}}>{m.label}</span>
                <span style={{fontSize:11,fontFamily:"monospace"}}>{Math.round(totals[m.k]||0)}{m.unit} <span style={{color:T.muted}}>/ {m.goal}{m.unit}</span></span>
              </div>
              <Bar val={totals[m.k]||0} goal={m.goal} color={m.color}/>
            </div>
          ))}
        </div>
      </Card>

      {/* macro breakdown modal */}
      {macroDetail&&(
        <div onClick={()=>setMacroDetail(null)} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.3)",zIndex:200,display:"flex",alignItems:"flex-end",justifyContent:"center"}}>
          <div onClick={e=>e.stopPropagation()} style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:"16px 16px 0 0",padding:"20px 18px 36px",width:"100%",maxWidth:540,maxHeight:"80vh",overflowY:"auto"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
              <span style={{fontSize:16,fontWeight:800,color:T.text}}>{macroDetail.label} breakdown</span>
              <button onClick={()=>setMacroDetail(null)} style={{background:"none",border:"none",color:T.sub,fontSize:22,cursor:"pointer",lineHeight:1}}>×</button>
            </div>
            <div style={{display:"flex",justifyContent:"space-between",marginBottom:14,paddingBottom:12,borderBottom:`1px solid ${T.border}`}}>
              <span style={{fontSize:12,color:T.sub}}>Total</span>
              <span style={{fontSize:20,fontWeight:800,color:macroDetail.color,fontFamily:"monospace"}}>{Math.round(totals[macroDetail.k]||0)}{macroDetail.unit}</span>
            </div>
            {viewLog.filter(e=>(e[macroDetail.k]||0)>0).sort((a,b)=>(b[macroDetail.k]||0)-(a[macroDetail.k]||0)).length===0&&(
              <div style={{color:T.muted,fontSize:13,textAlign:"center",padding:20}}>nothing logged yet</div>
            )}
            {viewLog.filter(e=>(e[macroDetail.k]||0)>0).sort((a,b)=>(b[macroDetail.k]||0)-(a[macroDetail.k]||0)).map((e,i)=>(
              <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 0",borderBottom:`1px solid ${T.border}`}}>
                <div>
                  <div style={{fontSize:13,fontWeight:600,color:T.text}}>{e.name}</div>
                  <div style={{fontSize:11,color:T.sub}}>{e.qty}{e.unit}{e.meal?` · ${e.meal}`:""}</div>
                </div>
                <div style={{textAlign:"right"}}>
                  <div style={{fontSize:13,fontWeight:700,color:macroDetail.color,fontFamily:"monospace"}}>{Math.round((e[macroDetail.k]||0)*10)/10}{macroDetail.unit}</div>
                  <div style={{fontSize:10,color:T.muted}}>{Math.round((e[macroDetail.k]||0)/(totals[macroDetail.k]||1)*100)}%</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* meal budget */}
      <Card>
        <div style={{fontSize:11,fontWeight:700,color:T.sub,textTransform:"uppercase",letterSpacing:1,marginBottom:10}}>Meal Budget</div>
        {MEAL_BUDGETS.map(({meal,pct,color})=>{
          const budget=Math.round(goals.cal*pct);
          const eaten=viewLog.filter(e=>(e.meal||"").toLowerCase()===meal.toLowerCase()).reduce((a,e)=>a+(e.cal||0),0);
          const over=eaten>budget;
          return (
            <div key={meal} style={{marginBottom:9}}>
              <div style={{display:"flex",justifyContent:"space-between",marginBottom:3}}>
                <span style={{fontSize:11,color:T.sub}}>{meal}</span>
                <span style={{fontSize:11,fontFamily:"monospace",color:over?T.red:T.text}}>{Math.round(eaten)} <span style={{color:T.muted}}>/ {budget} kcal</span></span>
              </div>
              <Bar val={eaten} goal={budget} color={over?T.red:color}/>
            </div>
          );
        })}
      </Card>

      {/* steps + water */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
        <QuickTrack icon="👟" label="Steps" value={steps} goal={goals.steps} color={T.brown} unit="steps" onSave={onSteps} sub={stepsCal>0?`≈ ${stepsCal} kcal`:null}/>
        <QuickTrack icon="💧" label="Water" value={water} goal={goals.water} color={T.blue} unit="glasses" onSave={onWater}/>
      </div>

      {/* weight log */}
      <Card>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
          <div style={{fontSize:11,fontWeight:700,color:T.sub,textTransform:"uppercase",letterSpacing:1}}>⚖️ Weight Log</div>
          <Btn small onClick={()=>setShowWt(p=>!p)} variant="soft">{showWt?"cancel":"+ Log"}</Btn>
        </div>
        {showWt&&(
          <div style={{display:"flex",gap:8,marginBottom:10}}>
            <input type="number" value={newWeight} onChange={e=>setNewWeight(e.target.value)} placeholder="kg"
              style={{flex:1,background:T.bg,border:`1px solid ${T.accent}`,borderRadius:8,padding:"8px 12px",color:T.text,fontSize:13,outline:"none",fontFamily:"inherit"}}/>
            <Btn variant="accent" onClick={()=>{ if(!newWeight) return; onSaveWeight({...weights,[today()]:+newWeight}); setNewWeight(""); setShowWt(false); }}>Save</Btn>
          </div>
        )}
        {weightEntries.length===0&&<div style={{fontSize:12,color:T.muted,textAlign:"center",padding:"8px 0"}}>no weight logged yet</div>}
        {weightEntries.map(([date,kg])=>(
          <div key={date} style={{display:"flex",justifyContent:"space-between",padding:"6px 0",borderBottom:`1px solid ${T.border}`,fontSize:12}}>
            <span style={{color:T.sub}}>{fmtDate(date)}</span>
            <span style={{fontWeight:700,fontFamily:"monospace",color:T.text}}>{kg} kg</span>
          </div>
        ))}
      </Card>

      {/* today's food */}
      {viewLog.length>0&&(
        <Card>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
            <div style={{fontSize:11,fontWeight:700,color:T.sub,textTransform:"uppercase",letterSpacing:1}}>{isToday?"Today's":"That day's"} food</div>
            <button onClick={()=>setShowAll(p=>!p)} style={{background:"none",border:"none",color:T.sub,fontSize:11,cursor:"pointer"}}>{showAll?`▲ less`:`▼ all ${viewLog.length}`}</button>
          </div>
          {(showAll?viewLog:viewLog.slice(-4)).map((e,vi)=>{
            const ri=showAll?vi:viewLog.length-4+vi;
            return (
              <div key={vi} style={{padding:"8px 0",borderBottom:vi<(showAll?viewLog:viewLog.slice(-4)).length-1?`1px solid ${T.border}`:"none"}}>
                {editIdx===ri?(
                  <div style={{display:"flex",gap:8,alignItems:"center"}}>
                    <span style={{fontSize:12,color:T.text,flex:1}}>{e.name}</span>
                    <input type="number" value={editQty} onChange={x=>setEditQty(x.target.value)} placeholder={String(e.qty)}
                      style={{width:60,background:T.bg,border:`1px solid ${T.accent}`,borderRadius:6,padding:"4px 8px",color:T.text,fontSize:12,outline:"none"}}/>
                    <span style={{fontSize:11,color:T.sub}}>{e.unit}</span>
                    <button onClick={()=>{ const q=+editQty||e.qty; const r=q/(e.qty||1); onEdit(ri,{...e,qty:q,cal:(e.cal||0)*r,protein:(e.protein||0)*r,carbs:(e.carbs||0)*r,fat:(e.fat||0)*r,fiber:(e.fiber||0)*r}); setEditIdx(null); }} style={{background:T.green,border:"none",borderRadius:6,color:"#fff",fontWeight:700,fontSize:11,cursor:"pointer",padding:"4px 8px"}}>✓</button>
                    <button onClick={()=>setEditIdx(null)} style={{background:"none",border:"none",color:T.muted,cursor:"pointer",fontSize:14}}>×</button>
                  </div>
                ):(
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                    <div>
                      <div style={{fontSize:13,fontWeight:600,color:T.text}}>{e.name}</div>
                      <div style={{fontSize:11,color:T.sub}}>{e.qty}{e.unit}{e.meal?` · ${e.meal}`:""} · P:{Math.round(e.protein||0)}g C:{Math.round(e.carbs||0)}g F:{Math.round(e.fat||0)}g Fib:{Math.round(e.fiber||0)}g</div>
                    </div>
                    <div style={{display:"flex",alignItems:"center",gap:8}}>
                      <span style={{fontSize:13,fontWeight:700,color:T.brown,fontFamily:"monospace"}}>{Math.round(e.cal)}</span>
                      <button onClick={()=>{setEditIdx(ri);setEditQty("");}} style={{background:"none",border:"none",color:T.sub,cursor:"pointer",fontSize:13,padding:2}}>✏️</button>
                      <button onClick={()=>onRemove(ri)} style={{background:"none",border:"none",color:T.muted,cursor:"pointer",fontSize:18,lineHeight:1,padding:2}}>×</button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </Card>
      )}
    </div>
  );
}

function QuickTrack({icon,label,value,goal,color,unit,onSave,sub}) {
  const [edit,setEdit]=useState(false);
  const [draft,setDraft]=useState("");
  return (
    <Card style={{padding:14}}>
      <div style={{fontSize:11,color:T.sub,textTransform:"uppercase",letterSpacing:1,marginBottom:4,fontWeight:700}}>{label}</div>
      <div style={{fontSize:22,fontWeight:800,color,fontFamily:"monospace"}}>{value.toLocaleString()}</div>
      <div style={{fontSize:10,color:T.muted,marginBottom:sub?2:6}}>/ {goal.toLocaleString()} {unit}</div>
      {sub&&<div style={{fontSize:11,color:T.green,marginBottom:6,fontWeight:600}}>{sub}</div>}
      <Bar val={value} goal={goal} color={color} height={4}/>
      <div style={{marginTop:8}}>
        {edit?(
          <div style={{display:"flex",gap:6}}>
            <input type="number" value={draft} onChange={e=>setDraft(e.target.value)} placeholder={String(value)} autoFocus
              style={{flex:1,width:0,background:T.bg,border:`1px solid ${color}`,borderRadius:6,padding:"5px 8px",color:T.text,fontSize:12,outline:"none",fontFamily:"inherit"}}/>
            <button onClick={()=>{if(draft!=="")onSave(+draft);setEdit(false);setDraft("");}}
              style={{background:color,border:"none",borderRadius:6,color:"#fff",fontWeight:700,fontSize:12,cursor:"pointer",padding:"5px 10px"}}>✓</button>
          </div>
        ):(
          <button onClick={()=>{setDraft("");setEdit(true);}}
            style={{background:color+"18",border:`1px solid ${color}33`,borderRadius:6,color,fontSize:11,fontWeight:700,cursor:"pointer",padding:"5px 10px",width:"100%",fontFamily:"inherit"}}>
            + Update
          </button>
        )}
      </div>
    </Card>
  );
}

// ── CHAT ──────────────────────────────────────────────────────────────────────
function Chat({msgs,onMsgs,profile,goals,log,viewDate,viewLog,totals,tdee,foods,recipes,onAddLog,onRemoveLog,onUpdateLog,onSaveFood,onSaveRecipe,onUpdateFood,onUpdateRecipe}) {
  const msgsRef = useRef(msgs);
  msgsRef.current = msgs;
  const setMsgs = v => onMsgs(typeof v === 'function' ? v(msgsRef.current) : v);
  const [input,setInput]=useState("");
  const [loading,setLoading]=useState(false);
  const [pending,setPending]=useState(null);
  const [pendingMeal,setPendingMeal]=useState(inferMeal());
  const [img,setImg]=useState(null);
  const [imgB64,setImgB64]=useState(null);
  const [imgMime,setImgMime]=useState("image/png"); // eslint-disable-line no-unused-vars
  const fileRef=useRef();
  const bottomRef=useRef();


  useEffect(()=>{ bottomRef.current?.scrollIntoView({behavior:"smooth"}); },[msgs,loading,pending]);

  const buildContext = useCallback(()=>{
    const cal=totals.cal||0;
    const savedFoodsList=foods.map(f=>`${f.name}(${f.servingSize}${f.servingUnit}=${f.cal}kcal,P:${f.protein}g,C:${f.carbs}g,F:${f.fat}g,Fib:${f.fiber||0}g)`).join("; ")||"none";
    const recipeList=recipes.map(r=>`${r.name}(per serving:${r.cal}kcal,P:${r.protein}g)`).join("; ")||"none";
    const todayFoodList=viewLog.map(e=>`${e.name} ${e.qty}${e.unit} ${e.meal||""} = ${Math.round(e.cal||0)}kcal`).join(", ")||"nothing yet";
    return `USER PROFILE:
Name: ${profile.name||"not set"}
Weight: ${profile.weight||"?"}kg, Height: ${profile.height||"?"}cm, Age: ${profile.age||"?"}
Sex: ${profile.sex}, Activity: ${profile.activity}
BMR: ${tdee?Math.round(tdee/({sedentary:1.2,light:1.375,moderate:1.55,active:1.725,very_active:1.9}[profile.activity]||1.2)):0} kcal, TDEE: ${tdee||0} kcal

DAILY GOALS: ${goals.cal}kcal, protein:${goals.protein}g, carbs:${goals.carbs}g, fat:${goals.fat}g, fiber:${goals.fiber}g

TODAY (${viewDate}): eaten ${Math.round(cal)}kcal, remaining ${Math.round(goals.cal-cal)}kcal
Today's log: ${todayFoodList}

SAVED FOODS: ${savedFoodsList}
SAVED RECIPES: ${recipeList}`;
  },[profile,goals,totals,viewLog,viewDate,tdee,foods,recipes]);

  const SYSTEM=`You are a sharp, warm nutrition assistant inside a fitness tracking app. You know food, macros, Indian cooking, and how to keep someone on track without being annoying about it.

PERSONALITY: Talk like a knowledgeable friend. Casual, direct, occasionally dry. "that's 340 cals, not bad" not "Great choice! I have logged your food." No asterisks. No markdown. Keep responses short.

TOOLS — use them automatically, no need to announce it:
- log_food: any time the user mentions eating or drinking. Fiber is a PRIMARY macro — always include it, never 0 unless truly fiber-free. Reference values: oats 60g=5g, chia 20g=7g, banana=2.6g, rice 130g=1.5g, roti=2g, dal 100g=4g, bread slice=1.5g, broccoli 100g=2.6g, peas 70g=3g, apple=2.4g, almonds 30g=3.5g. Infer meal from time of day if not stated.
- remove_food: when user wants to remove something. qty = exact amount to remove.
- save_food: when user asks to save something to their library.
- save_recipe: when user describes a full recipe to save. Calculate per-serving macros.

The message field in your tool call is what the user sees. Make it sound like you, not a bot.
For plain questions — just answer. No tool needed.`;

  async function send() {
    if((!input.trim()&&!img)||loading) return;
    const userText=input.trim()||(img?"[image attached]":"");
    const contextNote=`[${buildContext()}\nCurrent time: ${new Date().toLocaleTimeString("en-IN",{hour:"2-digit",minute:"2-digit"})}]\n\n${userText}`;
    const newMsgs=[...msgs,{role:"user",content:userText,img}];
    setMsgs(newMsgs);
    setInput(""); setImg(null); setImgB64(null);
    setLoading(true);
    try {
      const historyMsgs=newMsgs.slice(0,-1).slice(-12); // keep last 12 messages for context
      const apiMsgs=[...historyMsgs.map(m=>({role:m.role,content:m.content})),{role:"user",content:contextNote}];
      const raw=await callClaude(apiMsgs,SYSTEM,imgB64,imgMime);
      let parsed; try { parsed=JSON.parse(raw); } catch { parsed={text:raw,fnCall:null}; }
      const {fnCall, text} = parsed;
      let display = (text||"")
        .replace(/\*\*(.*?)\*\*/g,"$1")
        .replace(/\*(.*?)\*/g,"$1")
        .trim();
      let parsedAction=null;

      if(fnCall?.name) {
        const d=fnCall.args||{};
        if(d.message) display=d.message;

        if(fnCall.name==="log_food"&&d.items?.length) {
          const meal=inferMeal();
          const items=d.items.map(i=>({...i,
            meal:i.meal||meal,
            fiber:i.fiber||0,sodium:i.sodium||0,sugar:i.sugar||0,
            calcium:0,iron:0,vitaminC:0,vitaminD:0
          }));
          setPending(items);
          setPendingMeal(meal);
          parsedAction={type:"LOG",data:{items,message:d.message}};
        }
        if(fnCall.name==="remove_food"&&d.name) {
          onRemoveLog(d.name, d.qty||1);
          parsedAction={type:"REMOVE",data:d};
        }
        if(fnCall.name==="save_food"&&d.name) {
          onSaveFood({...d,id:Date.now()});
          parsedAction={type:"SAVEFOOD",data:d};
        }
        if(fnCall.name==="save_recipe"&&d.name) {
          onSaveRecipe({...d,id:Date.now()});
          parsedAction={type:"SAVERECIPE",data:d};
        }
      }
      if(!display||display.length<2) display=fnCall?.name?"done.":"hmm, try again.";
      setMsgs(p=>[...p,{role:"assistant",content:display,action:parsedAction}]);
    } catch(e) {
      setMsgs(p=>[...p,{role:"assistant",content:`something went wrong: ${e.message?.slice(0,80)}`}]);
    }
    setLoading(false);
  }

  function confirmLog() {
    if(!pending) return;
    onAddLog(pending.map(item=>({...item,meal:pendingMeal})));
    setMsgs(p=>[...p,{role:"assistant",content:`logged ${pending.length} item${pending.length>1?"s":""} as ${pendingMeal}.`}]);
    setPending(null);
    setPendingMeal(inferMeal());
  }

  function handleFile(file) {
    if(!file) return;
    const reader=new FileReader();
    reader.onload=e=>{
      const full=e.target.result;
      setImg(full);
      setImgB64(full.split(",")[1]);
      setImgMime(file.type||"image/png");
    };
    reader.readAsDataURL(file);
  }

  const quickReplies=["what did i eat today?","how many cals left?","what fits in 300 cals?","remove last entry"];

  return (
    <div style={{display:"flex",flexDirection:"column",height:"calc(100vh - 220px)",minHeight:400}}>
      {/* messages */}
      <div style={{flex:1,overflowY:"auto",display:"flex",flexDirection:"column",gap:10,paddingBottom:8}}>
        {msgs.map((m,i)=>(
          <div key={i} style={{display:"flex",justifyContent:m.role==="user"?"flex-end":"flex-start"}}>
            <div style={{
              maxWidth:"85%",padding:"10px 14px",
              borderRadius:m.role==="user"?"14px 14px 4px 14px":"14px 14px 14px 4px",
              background:m.role==="user"?T.brown:T.surface,
              color:m.role==="user"?"#fff":T.text,
              fontSize:13,lineHeight:1.6,
              border:m.role==="assistant"?`1px solid ${T.border}`:"none",
              boxShadow:m.role==="assistant"?T.shadow:"none"
            }}>
              {m.img&&<img src={m.img} alt="" style={{width:"100%",maxHeight:160,objectFit:"cover",borderRadius:8,marginBottom:8}}/>}
              {m.content}

            </div>
          </div>
        ))}
        {loading&&(
          <div style={{display:"flex",justifyContent:"flex-start"}}>
            <div style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:"14px 14px 14px 4px",padding:"10px 16px",fontSize:13,color:T.muted,boxShadow:T.shadow}}>
              <span style={{animation:"pulse 1s infinite"}}>thinking...</span>
            </div>
          </div>
        )}
        <div ref={bottomRef}/>
      </div>

      {/* confirm popup — lives outside scroll so it's always visible */}
      {pending&&(
        <div style={{background:T.greenBg,border:`2px solid ${T.green}`,borderRadius:12,padding:14,marginBottom:8}} className="pop">
          <div style={{fontSize:11,color:T.sub,textTransform:"uppercase",letterSpacing:1,marginBottom:4}}>confirm before logging</div>
          <div style={{fontSize:14,color:T.green,fontWeight:800,marginBottom:8}}>log {pending.length} item{pending.length>1?"s":""}?</div>
          {pending.map((item,i)=>(
            <div key={i} style={{fontSize:12,color:T.sub,marginBottom:3}}>
              <span style={{color:T.text,fontWeight:600}}>{item.name}</span> {item.qty}{item.unit} · <span style={{color:T.green,fontWeight:700}}>{Math.round(item.cal)} kcal</span>
            </div>
          ))}
          <div style={{marginTop:10,marginBottom:10}}>
            <select value={pendingMeal} onChange={e=>setPendingMeal(e.target.value)}
              style={{width:"100%",background:T.surface,border:`1px solid ${T.border}`,borderRadius:8,padding:"8px 12px",color:T.text,fontSize:13,outline:"none",fontFamily:"inherit"}}>
              {["Breakfast","Lunch","Dinner","Snack","Pre-workout","Post-workout"].map(m=><option key={m}>{m}</option>)}
            </select>
          </div>
          <div style={{display:"flex",gap:8}}>
            <Btn variant="green" onClick={confirmLog} style={{flex:1}}>log it</Btn>
            <Btn variant="ghost" onClick={()=>setPending(null)} style={{flex:1}}>skip</Btn>
          </div>
        </div>
      )}

      {/* image preview */}
      {img&&(
        <div style={{position:"relative",marginBottom:8}}>
          <img src={img} alt="" style={{width:80,height:60,objectFit:"cover",borderRadius:8,border:`2px solid ${T.accent}`}}/>
          <button onClick={()=>{setImg(null);setImgB64(null);}} style={{position:"absolute",top:-6,left:74,background:T.red,border:"none",borderRadius:"50%",width:18,height:18,color:"#fff",fontSize:10,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>×</button>
        </div>
      )}

      {/* input */}
      <div style={{borderTop:`1px solid ${T.border}`,paddingTop:10}}>
        <div style={{display:"flex",gap:8,marginBottom:8}}>
          <button onClick={()=>fileRef.current?.click()}
            style={{background:T.brownBg,border:`1px solid ${T.border}`,borderRadius:10,color:T.brown,fontSize:18,cursor:"pointer",padding:"8px 12px",flexShrink:0}}>📷</button>
          <input value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>e.key==="Enter"&&!e.shiftKey&&send()}
            placeholder="log food, ask anything, send a photo..."
            style={{flex:1,background:T.surface,border:`1px solid ${T.border}`,borderRadius:12,padding:"11px 14px",color:T.text,fontSize:13,outline:"none",fontFamily:"inherit",boxShadow:T.shadow}}/>
          <button onClick={send} disabled={loading||(!input.trim()&&!img)}
            style={{background:loading||(!input.trim()&&!img)?T.muted:T.accent,border:"none",borderRadius:12,color:"#fff",fontWeight:800,fontSize:13,cursor:loading||(!input.trim()&&!img)?"not-allowed":"pointer",padding:"11px 16px",fontFamily:"inherit",transition:"background 0.2s"}}>
            {loading?"⟳":"→"}
          </button>
        </div>
        <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
          {quickReplies.map(q=>(
            <button key={q} onClick={()=>setInput(q)}
              style={{background:T.brownBg,border:`1px solid ${T.border}`,borderRadius:20,padding:"4px 11px",fontSize:10,color:T.brown,cursor:"pointer",fontFamily:"inherit",fontWeight:600}}>
              {q}
            </button>
          ))}
        </div>
      </div>
      <input ref={fileRef} type="file" accept="image/*" style={{display:"none"}} onChange={e=>handleFile(e.target.files[0])}/>
    </div>
  );
}



// ── HISTORY ──────────────────────────────────────────────────────────────────
function History({log, goals}) {
  const [view, setView] = useState("week");      // week | month | compare
  const [compareA, setCompareA] = useState("");
  const [compareB, setCompareB] = useState("");
  const MACROS = [{k:"cal",label:"Calories",color:T.accent,unit:"kcal"},{k:"protein",label:"Protein",color:T.blue,unit:"g"},{k:"carbs",label:"Carbs",color:"#c8822a",unit:"g"},{k:"fat",label:"Fat",color:T.brown,unit:"g"},{k:"fiber",label:"Fiber",color:T.green,unit:"g"}];

  // helpers
  const dateStr = (offset=0) => { const d=new Date(); d.setDate(d.getDate()+offset); return d.toISOString().split("T")[0]; };
  const fmt = d => new Date(d+"T12:00:00").toLocaleDateString("en-IN",{day:"numeric",month:"short"});
  const fmtShort = d => new Date(d+"T12:00:00").toLocaleDateString("en-IN",{day:"numeric",month:"short"});
  const dayName = d => new Date(d+"T12:00:00").toLocaleDateString("en-IN",{weekday:"short"});
  const sumDay = d => { const e=log[d]||[]; return e.reduce((a,x)=>{ ["cal","protein","carbs","fat","fiber"].forEach(k=>a[k]=(a[k]||0)+(x[k]||0)); return a; },{cal:0,protein:0,carbs:0,fat:0,fiber:0}); };

  // get last N days
  const lastNDays = n => Array.from({length:n},(_,i)=>dateStr(-(n-1-i)));

  // week data (last 7 days)
  const weekDays = lastNDays(7);
  const weekTotals = weekDays.reduce((a,d)=>{ const s=sumDay(d); ["cal","protein","carbs","fat","fiber"].forEach(k=>a[k]=(a[k]||0)+s[k]); return a; },{cal:0,protein:0,carbs:0,fat:0,fiber:0});
  const weekAvg = Object.fromEntries(Object.entries(weekTotals).map(([k,v])=>[k,v/7]));
  const daysLogged = weekDays.filter(d=>(log[d]||[]).length>0).length;
  const daysOnTarget = weekDays.filter(d=>{ const s=sumDay(d); return s.cal>0 && s.cal<=goals.cal*1.05; }).length;

  // month data (last 28 days, grouped by week)
  const monthDays = lastNDays(28);
  const weeks = [[0,6],[7,13],[14,20],[21,27]].map(([s,e])=>({
    label: `${fmt(monthDays[s])} – ${fmt(monthDays[e])}`,
    days: monthDays.slice(s,e+1),
    totals: monthDays.slice(s,e+1).reduce((a,d)=>{ const x=sumDay(d); ["cal","protein","carbs","fat","fiber"].forEach(k=>a[k]=(a[k]||0)+x[k]); return a; },{cal:0,protein:0,carbs:0,fat:0,fiber:0})
  }));

  // compare weeks
  const getWeekStart = offset => { const d=new Date(); d.setDate(d.getDate()-d.getDay()-offset*7); return d.toISOString().split("T")[0]; };
  const weekOptions = Array.from({length:8},(_,i)=>({ value: getWeekStart(i), label: i===0?"This week":i===1?"Last week":`${i} weeks ago` }));
  const getWeekDays = start => Array.from({length:7},(_,i)=>{ const d=new Date(start+"T12:00:00"); d.setDate(d.getDate()+i); return d.toISOString().split("T")[0]; });
  const sumWeek = start => { const days=getWeekDays(start); return days.reduce((a,d)=>{ const s=sumDay(d); ["cal","protein","carbs","fat","fiber"].forEach(k=>a[k]=(a[k]||0)+s[k]); return a; },{cal:0,protein:0,carbs:0,fat:0,fiber:0}); };

  const cmpA = compareA ? sumWeek(compareA) : null;
  const cmpB = compareB ? sumWeek(compareB) : null;

  const barMax = Math.max(...weekDays.map(d=>sumDay(d).cal), goals.cal, 1);

  const views = [{id:"week",label:"This Week"},{id:"month",label:"Monthly"},{id:"compare",label:"Compare"}];

  return (
    <div style={{display:"flex",flexDirection:"column",gap:14}}>

      {/* view switcher */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:6}}>
        {views.map(v=>(
          <button key={v.id} onClick={()=>setView(v.id)} style={{
            background:view===v.id?T.brown:T.surface, color:view===v.id?"#fff":T.sub,
            border:`1px solid ${view===v.id?T.brown:T.border}`, borderRadius:10,
            padding:"9px 0", fontSize:12, fontWeight:700, cursor:"pointer", fontFamily:"inherit"
          }}>{v.label}</button>
        ))}
      </div>

      {/* ── WEEK VIEW ── */}
      {view==="week"&&(<>
        {/* summary cards */}
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8}}>
          <Card style={{padding:12,textAlign:"center"}}>
            <div style={{fontSize:10,color:T.sub,textTransform:"uppercase",letterSpacing:1,marginBottom:4}}>Days logged</div>
            <div style={{fontSize:24,fontWeight:800,color:T.accent,fontFamily:"monospace"}}>{daysLogged}<span style={{fontSize:13,color:T.muted}}>/7</span></div>
          </Card>
          <Card style={{padding:12,textAlign:"center"}}>
            <div style={{fontSize:10,color:T.sub,textTransform:"uppercase",letterSpacing:1,marginBottom:4}}>On target</div>
            <div style={{fontSize:24,fontWeight:800,color:T.green,fontFamily:"monospace"}}>{daysOnTarget}<span style={{fontSize:13,color:T.muted}}>/7</span></div>
          </Card>
          <Card style={{padding:12,textAlign:"center"}}>
            <div style={{fontSize:10,color:T.sub,textTransform:"uppercase",letterSpacing:1,marginBottom:4}}>Avg cals</div>
            <div style={{fontSize:24,fontWeight:800,color:T.brown,fontFamily:"monospace"}}>{Math.round(weekAvg.cal)}</div>
          </Card>
        </div>

        {/* daily calorie bars */}
        <Card>
          <div style={{fontSize:11,fontWeight:700,color:T.sub,textTransform:"uppercase",letterSpacing:1,marginBottom:12}}>Daily calories</div>
          <div style={{display:"flex",gap:6,alignItems:"flex-end",height:100}}>
            {weekDays.map(d=>{
              const s=sumDay(d);
              const h=s.cal>0?Math.max((s.cal/barMax)*90,4):0;
              const isToday=d===dateStr(0);
              const over=s.cal>goals.cal*1.05;
              return (
                <div key={d} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:4}}>
                  <div style={{fontSize:9,color:T.sub,fontFamily:"monospace"}}>{s.cal>0?Math.round(s.cal):""}</div>
                  <div style={{width:"100%",height:90,display:"flex",alignItems:"flex-end"}}>
                    <div style={{width:"100%",height:h,background:over?T.red:isToday?T.accent:T.brown,borderRadius:"4px 4px 0 0",opacity:isToday?1:0.7,transition:"height 0.4s"}}/>
                  </div>
                  <div style={{fontSize:9,color:isToday?T.accent:T.sub,fontWeight:isToday?700:400}}>{dayName(d)}</div>
                </div>
              );
            })}
          </div>
          {/* goal line label */}
          <div style={{fontSize:10,color:T.muted,marginTop:6,textAlign:"right"}}>goal: {goals.cal} kcal · red = over</div>
        </Card>

        {/* week macro totals */}
        <Card>
          <div style={{fontSize:11,fontWeight:700,color:T.sub,textTransform:"uppercase",letterSpacing:1,marginBottom:12}}>Week totals vs goal (×7)</div>
          {MACROS.map(m=>{
            const total=Math.round(weekTotals[m.k]||0);
            const weekGoal=(goals[m.k]||0)*7;
            const pct=weekGoal>0?Math.min(total/weekGoal*100,100):0;
            const over=total>weekGoal*1.05;
            return (
              <div key={m.k} style={{marginBottom:10}}>
                <div style={{display:"flex",justifyContent:"space-between",marginBottom:3}}>
                  <span style={{fontSize:11,color:T.sub}}>{m.label}</span>
                  <span style={{fontSize:11,fontFamily:"monospace",color:over?T.red:T.text}}>
                    {total}{m.unit} <span style={{color:T.muted}}>/ {weekGoal}{m.unit}</span>
                  </span>
                </div>
                <div style={{height:5,background:T.border,borderRadius:99,overflow:"hidden"}}>
                  <div style={{height:5,width:`${pct}%`,background:over?T.red:m.color,borderRadius:99,transition:"width 0.5s"}}/>
                </div>
              </div>
            );
          })}
        </Card>

        {/* per-day breakdown table */}
        <Card>
          <div style={{fontSize:11,fontWeight:700,color:T.sub,textTransform:"uppercase",letterSpacing:1,marginBottom:12}}>Daily breakdown</div>
          <div style={{overflowX:"auto"}}>
            <table style={{width:"100%",borderCollapse:"collapse",fontSize:11}}>
              <thead>
                <tr style={{borderBottom:`1px solid ${T.border}`}}>
                  <th style={{textAlign:"left",padding:"4px 6px",color:T.sub,fontWeight:700}}>Day</th>
                  <th style={{textAlign:"right",padding:"4px 6px",color:T.accent,fontWeight:700}}>Kcal</th>
                  <th style={{textAlign:"right",padding:"4px 6px",color:T.blue,fontWeight:700}}>P</th>
                  <th style={{textAlign:"right",padding:"4px 6px",color:"#c8822a",fontWeight:700}}>C</th>
                  <th style={{textAlign:"right",padding:"4px 6px",color:T.brown,fontWeight:700}}>F</th>
                  <th style={{textAlign:"right",padding:"4px 6px",color:T.green,fontWeight:700}}>Fib</th>
                </tr>
              </thead>
              <tbody>
                {weekDays.map(d=>{
                  const s=sumDay(d);
                  const isToday=d===dateStr(0);
                  const hasData=s.cal>0;
                  return (
                    <tr key={d} style={{borderBottom:`1px solid ${T.border}`,background:isToday?T.accentBg:"transparent"}}>
                      <td style={{padding:"6px 6px",color:isToday?T.brown:T.sub,fontWeight:isToday?700:400}}>{dayName(d)} <span style={{color:T.muted,fontSize:10}}>{fmtShort(d)}</span></td>
                      <td style={{textAlign:"right",padding:"6px 6px",color:hasData?T.text:T.muted,fontFamily:"monospace"}}>{hasData?Math.round(s.cal):"—"}</td>
                      <td style={{textAlign:"right",padding:"6px 6px",color:hasData?T.text:T.muted,fontFamily:"monospace"}}>{hasData?Math.round(s.protein)+"g":"—"}</td>
                      <td style={{textAlign:"right",padding:"6px 6px",color:hasData?T.text:T.muted,fontFamily:"monospace"}}>{hasData?Math.round(s.carbs)+"g":"—"}</td>
                      <td style={{textAlign:"right",padding:"6px 6px",color:hasData?T.text:T.muted,fontFamily:"monospace"}}>{hasData?Math.round(s.fat)+"g":"—"}</td>
                      <td style={{textAlign:"right",padding:"6px 6px",color:hasData?T.green:T.muted,fontFamily:"monospace"}}>{hasData?Math.round(s.fiber)+"g":"—"}</td>
                    </tr>
                  );
                })}
                {/* averages row */}
                <tr style={{borderTop:`2px solid ${T.border}`,background:T.card}}>
                  <td style={{padding:"6px 6px",color:T.brown,fontWeight:700,fontSize:10,textTransform:"uppercase"}}>Avg/day</td>
                  <td style={{textAlign:"right",padding:"6px 6px",color:T.accent,fontWeight:700,fontFamily:"monospace"}}>{Math.round(weekAvg.cal)}</td>
                  <td style={{textAlign:"right",padding:"6px 6px",color:T.text,fontFamily:"monospace"}}>{Math.round(weekAvg.protein)}g</td>
                  <td style={{textAlign:"right",padding:"6px 6px",color:T.text,fontFamily:"monospace"}}>{Math.round(weekAvg.carbs)}g</td>
                  <td style={{textAlign:"right",padding:"6px 6px",color:T.text,fontFamily:"monospace"}}>{Math.round(weekAvg.fat)}g</td>
                  <td style={{textAlign:"right",padding:"6px 6px",color:T.green,fontFamily:"monospace"}}>{Math.round(weekAvg.fiber)}g</td>
                </tr>
              </tbody>
            </table>
          </div>
        </Card>
      </>)}

      {/* ── MONTH VIEW ── */}
      {view==="month"&&(<>
        <Card>
          <div style={{fontSize:11,fontWeight:700,color:T.sub,textTransform:"uppercase",letterSpacing:1,marginBottom:12}}>Last 28 days — daily calories</div>
          <div style={{display:"flex",gap:3,alignItems:"flex-end",height:80}}>
            {monthDays.map(d=>{
              const cal=sumDay(d).cal;
              const h=cal>0?Math.max((cal/Math.max(...monthDays.map(x=>sumDay(x).cal),goals.cal,1))*72,3):0;
              const isToday=d===dateStr(0);
              const over=cal>goals.cal*1.05;
              return (
                <div key={d} style={{flex:1,height:80,display:"flex",flexDirection:"column",justifyContent:"flex-end",alignItems:"center"}}>
                  <div style={{width:"100%",height:h,background:over?T.red:isToday?T.accent:T.brown,borderRadius:"2px 2px 0 0",opacity:isToday?1:0.65}}/>
                </div>
              );
            })}
          </div>
          <div style={{display:"flex",justifyContent:"space-between",marginTop:4}}>
            <span style={{fontSize:9,color:T.muted}}>{fmtShort(monthDays[0])}</span>
            <span style={{fontSize:9,color:T.muted}}>today</span>
          </div>
        </Card>

        {/* weekly summary cards */}
        {weeks.map((w,wi)=>{
          const avg=Object.fromEntries(Object.entries(w.totals).map(([k,v])=>[k,v/7]));
          const logged=w.days.filter(d=>(log[d]||[]).length>0).length;
          return (
            <Card key={wi}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
                <div>
                  <div style={{fontSize:12,fontWeight:700,color:T.text}}>{wi===3?"This week":wi===2?"Last week":`${4-wi} weeks ago`}</div>
                  <div style={{fontSize:10,color:T.muted}}>{w.label}</div>
                </div>
                <div style={{textAlign:"right"}}>
                  <div style={{fontSize:18,fontWeight:800,color:T.accent,fontFamily:"monospace"}}>{Math.round(avg.cal)}<span style={{fontSize:10,color:T.muted}}> avg kcal</span></div>
                  <div style={{fontSize:10,color:T.sub}}>{logged}/7 days logged</div>
                </div>
              </div>
              <div style={{display:"flex",gap:8}}>
                {[{k:"protein",color:T.blue,label:"P"},{k:"carbs",color:"#c8822a",label:"C"},{k:"fat",color:T.brown,label:"F"},{k:"fiber",color:T.green,label:"Fib"}].map(m=>(
                  <div key={m.k} style={{flex:1,background:m.color+"15",borderRadius:8,padding:"6px 4px",textAlign:"center"}}>
                    <div style={{fontSize:12,fontWeight:700,color:m.color,fontFamily:"monospace"}}>{Math.round(avg[m.k])}</div>
                    <div style={{fontSize:9,color:T.sub}}>{m.label}/day</div>
                  </div>
                ))}
              </div>
            </Card>
          );
        })}
      </>)}

      {/* ── COMPARE VIEW ── */}
      {view==="compare"&&(<>
        <Card>
          <div style={{fontSize:11,fontWeight:700,color:T.sub,textTransform:"uppercase",letterSpacing:1,marginBottom:12}}>Compare two weeks</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:14}}>
            <div>
              <div style={{fontSize:10,color:T.brown,fontWeight:700,textTransform:"uppercase",letterSpacing:1,marginBottom:4}}>Week A</div>
              <select value={compareA} onChange={e=>setCompareA(e.target.value)}
                style={{width:"100%",background:T.bg,border:`1px solid ${T.brown}`,borderRadius:8,padding:"8px 10px",color:T.text,fontSize:12,outline:"none",fontFamily:"inherit"}}>
                <option value="">select week</option>
                {weekOptions.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div>
              <div style={{fontSize:10,color:T.blue,fontWeight:700,textTransform:"uppercase",letterSpacing:1,marginBottom:4}}>Week B</div>
              <select value={compareB} onChange={e=>setCompareB(e.target.value)}
                style={{width:"100%",background:T.bg,border:`1px solid ${T.blue}`,borderRadius:8,padding:"8px 10px",color:T.text,fontSize:12,outline:"none",fontFamily:"inherit"}}>
                <option value="">select week</option>
                {weekOptions.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
          </div>

          {cmpA&&cmpB&&(
            <div style={{display:"flex",flexDirection:"column",gap:10}}>
              {MACROS.map(m=>{
                const a=Math.round((cmpA[m.k]||0)/7);
                const b=Math.round((cmpB[m.k]||0)/7);
                const maxVal=Math.max(a,b,1);
                const diff=a-b;
                return (
                  <div key={m.k}>
                    <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
                      <span style={{fontSize:11,fontWeight:700,color:T.sub}}>{m.label} <span style={{fontSize:10,fontWeight:400}}>(avg/day)</span></span>
                      <span style={{fontSize:11,color:diff>0?T.red:T.green,fontWeight:700}}>{diff>0?"+":""}{diff} {m.unit}</span>
                    </div>
                    <div style={{display:"flex",gap:6,alignItems:"center"}}>
                      <div style={{flex:1}}>
                        <div style={{display:"flex",justifyContent:"space-between",fontSize:10,marginBottom:2}}>
                          <span style={{color:T.brown,fontWeight:700}}>A</span>
                          <span style={{color:T.brown,fontFamily:"monospace"}}>{a}{m.unit}</span>
                        </div>
                        <div style={{height:8,background:T.border,borderRadius:99,overflow:"hidden"}}>
                          <div style={{height:8,width:`${a/maxVal*100}%`,background:T.brown,borderRadius:99}}/>
                        </div>
                      </div>
                      <div style={{flex:1}}>
                        <div style={{display:"flex",justifyContent:"space-between",fontSize:10,marginBottom:2}}>
                          <span style={{color:T.blue,fontWeight:700}}>B</span>
                          <span style={{color:T.blue,fontFamily:"monospace"}}>{b}{m.unit}</span>
                        </div>
                        <div style={{height:8,background:T.border,borderRadius:99,overflow:"hidden"}}>
                          <div style={{height:8,width:`${b/maxVal*100}%`,background:T.blue,borderRadius:99}}/>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          {(!cmpA||!cmpB)&&<div style={{textAlign:"center",color:T.muted,fontSize:13,padding:20}}>select two weeks above to compare</div>}
        </Card>

        {/* day-by-day comparison */}
        {cmpA&&cmpB&&(
          <Card>
            <div style={{fontSize:11,fontWeight:700,color:T.sub,textTransform:"uppercase",letterSpacing:1,marginBottom:12}}>Day by day — calories</div>
            <div style={{display:"flex",gap:4,alignItems:"flex-end",height:90}}>
              {Array.from({length:7},(_,i)=>{
                const dA=getWeekDays(compareA)[i];
                const dB=getWeekDays(compareB)[i];
                const calA=sumDay(dA).cal;
                const calB=sumDay(dB).cal;
                const maxCal=Math.max(...Array.from({length:7},(_,j)=>Math.max(sumDay(getWeekDays(compareA)[j]).cal,sumDay(getWeekDays(compareB)[j]).cal)),goals.cal,1);
                const hA=calA>0?Math.max(calA/maxCal*80,3):0;
                const hB=calB>0?Math.max(calB/maxCal*80,3):0;
                const days=["Su","Mo","Tu","We","Th","Fr","Sa"];
                return (
                  <div key={i} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:2}}>
                    <div style={{width:"100%",height:80,display:"flex",gap:1,alignItems:"flex-end"}}>
                      <div style={{flex:1,height:hA,background:T.brown,borderRadius:"2px 2px 0 0",opacity:0.85}}/>
                      <div style={{flex:1,height:hB,background:T.blue,borderRadius:"2px 2px 0 0",opacity:0.85}}/>
                    </div>
                    <div style={{fontSize:9,color:T.sub}}>{days[i]}</div>
                  </div>
                );
              })}
            </div>
            <div style={{display:"flex",gap:16,marginTop:8,fontSize:10}}>
              <span style={{display:"flex",alignItems:"center",gap:4}}><span style={{width:10,height:10,background:T.brown,borderRadius:2,display:"inline-block"}}/>Week A</span>
              <span style={{display:"flex",alignItems:"center",gap:4}}><span style={{width:10,height:10,background:T.blue,borderRadius:2,display:"inline-block"}}/>Week B</span>
            </div>
          </Card>
        )}
      </>)}
    </div>
  );
}


// ── RECIPES PANEL ─────────────────────────────────────────────────────────────
function RecipesPanel({recipes, onRecipes}) {
  const [expanded, setExpanded] = useState(null);
  const [editing, setEditing] = useState(null); // recipe id being edited
  const [editDraft, setEditDraft] = useState(null);
  const UNITS = ["g","ml","oz","piece","tbsp","tsp","cup","katori","roti","bowl","slice","scoop"];

  function startEdit(r) {
    setEditDraft({
      ...r,
      ingredients: (r.ingredients||[]).map(i=>({...i,
        qty:String(i.qty||""), cal:String(i.cal||""), protein:String(i.protein||""),
        carbs:String(i.carbs||""), fat:String(i.fat||""), fiber:String(i.fiber||"")
      }))
    });
    setEditing(r.id);
    setExpanded(r.id);
  }

  function updateIng(i, k, v) {
    const ings = [...editDraft.ingredients];
    ings[i] = {...ings[i], [k]:v};
    // recalculate totals from ingredients
    const totals = ings.reduce((a,ing)=>({
      cal: a.cal+(parseFloat(ing.cal)||0),
      protein: a.protein+(parseFloat(ing.protein)||0),
      carbs: a.carbs+(parseFloat(ing.carbs)||0),
      fat: a.fat+(parseFloat(ing.fat)||0),
      fiber: a.fiber+(parseFloat(ing.fiber)||0),
    }), {cal:0,protein:0,carbs:0,fat:0,fiber:0});
    const yld = parseFloat(editDraft.yield)||1;
    setEditDraft(d=>({...d, ingredients:ings,
      cal:+(totals.cal/yld).toFixed(1), protein:+(totals.protein/yld).toFixed(1),
      carbs:+(totals.carbs/yld).toFixed(1), fat:+(totals.fat/yld).toFixed(1),
      fiber:+(totals.fiber/yld).toFixed(1)
    }));
  }

  function addIng() {
    setEditDraft(d=>({...d, ingredients:[...d.ingredients, {name:"",qty:"",unit:"g",cal:"",protein:"",carbs:"",fat:"",fiber:""}]}));
  }

  function removeIng(i) {
    const ings = editDraft.ingredients.filter((_,idx)=>idx!==i);
    setEditDraft(d=>({...d, ingredients:ings}));
  }

  function saveEdit() {
    const updated = {...editDraft,
      yield: parseFloat(editDraft.yield)||1,
      ingredients: editDraft.ingredients.map(i=>({...i,
        qty:parseFloat(i.qty)||0, cal:parseFloat(i.cal)||0, protein:parseFloat(i.protein)||0,
        carbs:parseFloat(i.carbs)||0, fat:parseFloat(i.fat)||0, fiber:parseFloat(i.fiber)||0
      }))
    };
    onRecipes(recipes.map(r=>r.id===editing?updated:r));
    setEditing(null);
    setEditDraft(null);
  }

  const inputStyle = {background:T.bg, border:`1px solid ${T.border}`, borderRadius:7,
    padding:"6px 8px", color:T.text, fontSize:12, outline:"none", fontFamily:"inherit",
    width:"100%", boxSizing:"border-box"};

  return (
    <div style={{display:"flex",flexDirection:"column",gap:10}}>
      <div style={{fontSize:12,color:T.sub,background:T.accentBg,borderRadius:10,padding:"10px 14px"}}>
        Ask the chat to save a recipe — "save my dal tadka recipe: 200g dal, 1 tbsp ghee, yields 4 servings" and it'll calculate macros automatically.
      </div>
      {recipes.length===0&&<div style={{textAlign:"center",color:T.muted,fontSize:13,padding:30}}>no saved recipes yet.</div>}
      {recipes.map(r=>(
        <Card key={r.id} style={{padding:0,overflow:"hidden"}}>
          {/* header — always visible */}
          <div onClick={()=>setExpanded(p=>p===r.id?null:r.id)}
            style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"14px 16px",cursor:"pointer"}}>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontSize:14,fontWeight:700,color:T.text}}>{r.name}</div>
              <div style={{fontSize:11,color:T.sub,marginTop:2}}>
                {Math.round(r.cal||0)} kcal · P:{Math.round(r.protein||0)}g C:{Math.round(r.carbs||0)}g F:{Math.round(r.fat||0)}g Fib:{Math.round(r.fiber||0)}g
                <span style={{color:T.muted}}> · per {r.yieldUnit||"serving"}</span>
              </div>
            </div>
            <div style={{display:"flex",alignItems:"center",gap:10,flexShrink:0}}>
              <span style={{fontSize:11,color:T.sub}}>{expanded===r.id?"▲":"▼"}</span>
            </div>
          </div>

          {/* expanded view */}
          {expanded===r.id&&(
            <div style={{borderTop:`1px solid ${T.border}`,padding:"14px 16px"}}>
              {editing===r.id ? (
                /* EDIT MODE */
                <div style={{display:"flex",flexDirection:"column",gap:12}}>
                  {/* name + yield */}
                  <div style={{display:"grid",gridTemplateColumns:"1fr 80px 80px",gap:8}}>
                    <div>
                      <div style={{fontSize:10,color:T.sub,fontWeight:700,letterSpacing:1,textTransform:"uppercase",marginBottom:3}}>Name</div>
                      <input value={editDraft.name} onChange={e=>setEditDraft(d=>({...d,name:e.target.value}))} style={inputStyle}/>
                    </div>
                    <div>
                      <div style={{fontSize:10,color:T.sub,fontWeight:700,letterSpacing:1,textTransform:"uppercase",marginBottom:3}}>Yield</div>
                      <input type="number" value={editDraft.yield} onChange={e=>setEditDraft(d=>({...d,yield:e.target.value}))} style={inputStyle}/>
                    </div>
                    <div>
                      <div style={{fontSize:10,color:T.sub,fontWeight:700,letterSpacing:1,textTransform:"uppercase",marginBottom:3}}>Unit</div>
                      <select value={editDraft.yieldUnit||"serving"} onChange={e=>setEditDraft(d=>({...d,yieldUnit:e.target.value}))}
                        style={{...inputStyle,padding:"6px 6px"}}>
                        {["serving","g","ml","piece","bowl","katori","roti","cup","slice"].map(u=><option key={u}>{u}</option>)}
                      </select>
                    </div>
                  </div>

                  {/* ingredients */}
                  <div>
                    <div style={{fontSize:11,fontWeight:700,color:T.sub,textTransform:"uppercase",letterSpacing:1,marginBottom:8}}>Ingredients</div>
                    {editDraft.ingredients.map((ing,i)=>(
                      <div key={i} style={{marginBottom:10,padding:10,background:T.bg,borderRadius:8,border:`1px solid ${T.border}`}}>
                        <div style={{display:"flex",gap:6,marginBottom:6,alignItems:"center"}}>
                          <input value={ing.name} onChange={e=>updateIng(i,"name",e.target.value)} placeholder="ingredient"
                            style={{...inputStyle,flex:1}}/>
                          <button onClick={()=>removeIng(i)}
                            style={{background:"none",border:"none",color:T.muted,cursor:"pointer",fontSize:18,flexShrink:0,lineHeight:1}}>×</button>
                        </div>
                        <div style={{display:"grid",gridTemplateColumns:"2fr 2fr",gap:6,marginBottom:6}}>
                          <input type="number" value={ing.qty} onChange={e=>updateIng(i,"qty",e.target.value)} placeholder="qty"
                            style={inputStyle}/>
                          <select value={ing.unit} onChange={e=>updateIng(i,"unit",e.target.value)}
                            style={{...inputStyle,padding:"6px 6px"}}>
                            {UNITS.map(u=><option key={u}>{u}</option>)}
                          </select>
                        </div>
                        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr 1fr",gap:4}}>
                          {[["cal","kcal"],["protein","P"],["carbs","C"],["fat","F"],["fiber","Fib"]].map(([k,l])=>(
                            <input key={k} type="number" value={ing[k]} onChange={e=>updateIng(i,k,e.target.value)} placeholder={l}
                              style={{...inputStyle,textAlign:"center",padding:"5px 4px",fontSize:11}}/>
                          ))}
                        </div>
                      </div>
                    ))}
                    <button onClick={addIng}
                      style={{width:"100%",background:T.brownBg,border:`1px dashed ${T.brown}`,borderRadius:8,
                        color:T.brown,fontSize:12,fontWeight:700,cursor:"pointer",padding:"8px",fontFamily:"inherit"}}>
                      + add ingredient
                    </button>
                  </div>

                  {/* steps */}
                  <div>
                    <div style={{fontSize:10,color:T.sub,fontWeight:700,letterSpacing:1,textTransform:"uppercase",marginBottom:3}}>Method (optional)</div>
                    <textarea value={editDraft.steps||""} onChange={e=>setEditDraft(d=>({...d,steps:e.target.value}))}
                      placeholder="how to make it..."
                      style={{...inputStyle,minHeight:80,resize:"vertical",lineHeight:1.5}}/>
                  </div>

                  {/* per serving preview */}
                  <div style={{background:T.greenBg,borderRadius:8,padding:"10px 12px",border:`1px solid ${T.green}33`}}>
                    <div style={{fontSize:10,color:T.green,fontWeight:700,letterSpacing:1,textTransform:"uppercase",marginBottom:4}}>per serving (auto-calculated)</div>
                    <div style={{display:"flex",gap:12,fontSize:12,fontFamily:"monospace"}}>
                      <span style={{color:T.accent,fontWeight:700}}>{Math.round(editDraft.cal||0)} kcal</span>
                      <span>P:{Math.round(editDraft.protein||0)}g</span>
                      <span>C:{Math.round(editDraft.carbs||0)}g</span>
                      <span>F:{Math.round(editDraft.fat||0)}g</span>
                      <span>Fib:{Math.round(editDraft.fiber||0)}g</span>
                    </div>
                  </div>

                  <div style={{display:"flex",gap:8}}>
                    <Btn variant="accent" full onClick={saveEdit}>Save changes</Btn>
                    <Btn variant="ghost" onClick={()=>{setEditing(null);setEditDraft(null);}}>Cancel</Btn>
                  </div>
                </div>
              ) : (
                /* VIEW MODE */
                <div>
                  {/* ingredients list */}
                  {r.ingredients?.length>0&&(
                    <div style={{marginBottom:12}}>
                      <div style={{fontSize:11,fontWeight:700,color:T.sub,textTransform:"uppercase",letterSpacing:1,marginBottom:8}}>Ingredients</div>
                      {r.ingredients.map((ing,i)=>(
                        <div key={i} style={{display:"flex",justifyContent:"space-between",padding:"6px 0",borderBottom:`1px solid ${T.border}`,fontSize:12}}>
                          <span style={{color:T.text,fontWeight:500}}>{ing.name}</span>
                          <span style={{color:T.sub,fontFamily:"monospace"}}>{ing.qty}{ing.unit} · {Math.round(ing.cal||0)} kcal</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* yield info */}
                  <div style={{display:"flex",gap:8,marginBottom:12}}>
                    <div style={{background:T.accentBg,borderRadius:8,padding:"8px 12px",flex:1,textAlign:"center"}}>
                      <div style={{fontSize:10,color:T.sub,textTransform:"uppercase",letterSpacing:1}}>Yield</div>
                      <div style={{fontSize:16,fontWeight:800,color:T.accent,fontFamily:"monospace"}}>{r.yield} {r.yieldUnit}{r.yield>1?"s":""}</div>
                    </div>
                    <div style={{background:T.brownBg,borderRadius:8,padding:"8px 12px",flex:1,textAlign:"center"}}>
                      <div style={{fontSize:10,color:T.sub,textTransform:"uppercase",letterSpacing:1}}>Per serving</div>
                      <div style={{fontSize:16,fontWeight:800,color:T.brown,fontFamily:"monospace"}}>{Math.round(r.cal||0)} kcal</div>
                    </div>
                  </div>

                  {/* steps */}
                  {r.steps&&(
                    <div style={{marginBottom:12}}>
                      <div style={{fontSize:11,fontWeight:700,color:T.sub,textTransform:"uppercase",letterSpacing:1,marginBottom:6}}>Method</div>
                      <div style={{fontSize:13,color:T.text,lineHeight:1.6,whiteSpace:"pre-wrap"}}>{r.steps}</div>
                    </div>
                  )}

                  {/* actions */}
                  <div style={{display:"flex",gap:8,marginTop:4}}>
                    <Btn variant="soft" onClick={()=>startEdit(r)} style={{flex:1}}>Edit recipe</Btn>
                    <Btn variant="danger" onClick={()=>{onRecipes(recipes.filter(x=>x.id!==r.id));setExpanded(null);}} style={{flex:1}}>Delete</Btn>
                  </div>
                </div>
              )}
            </div>
          )}
        </Card>
      ))}
    </div>
  );
}


// ── PROFILE ───────────────────────────────────────────────────────────────────
function Profile({profile,goals,foods,recipes,bmr,tdee,weights,onProfile,onGoals,onFoods,onRecipes,onSaveWeight}) {
  const [section,setSection]=useState("stats");
  // goals edited inline
  const [newFood,setNewFood]=useState({name:"",servingSize:100,servingUnit:"g",cal:"",protein:"",carbs:"",fat:"",fiber:"",sodium:"",sugar:"",calcium:"",iron:"",vitaminC:"",vitaminD:""});
  const [showAddFood,setShowAddFood]=useState(false);
  const bmi=profile.weight&&profile.height?+(profile.weight/Math.pow(profile.height/100,2)).toFixed(1):null;
  const bmiColor=bmi?bmi<18.5?T.blue:bmi<25?T.green:bmi<30?T.accent:T.red:T.sub;

  const UNITS=["g","ml","oz","piece","tbsp","tsp","cup","katori","roti","bowl","slice","scoop"];

  function saveFood() {
    if(!newFood.name.trim()) return;
    const f={...newFood,id:Date.now()};
    ["servingSize","cal","protein","carbs","fat","fiber","sodium","sugar","calcium","iron","vitaminC","vitaminD"].forEach(k=>f[k]=+(f[k]||0));
    onFoods([...foods,f]);
    setNewFood({name:"",servingSize:100,servingUnit:"g",cal:"",protein:"",carbs:"",fat:"",fiber:"",sodium:"",sugar:"",calcium:"",iron:"",vitaminC:"",vitaminD:""});
    setShowAddFood(false);
  }

  const sections=[{id:"stats",label:"Stats"},{id:"goals",label:"Goals"},{id:"foods",label:"My Foods"},{id:"recipes",label:"Recipes"}];

  return (
    <div style={{display:"flex",flexDirection:"column",gap:14}}>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6}}>
        {sections.map(s=>(
          <button key={s.id} onClick={()=>setSection(s.id)} style={{background:section===s.id?T.brown:T.surface,color:section===s.id?"#fff":T.sub,border:`1px solid ${section===s.id?T.brown:T.border}`,borderRadius:10,padding:"9px 0",fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"inherit",transition:"all 0.2s"}}>{s.label}</button>
        ))}
      </div>

      {section==="stats"&&(
        <>
          <Card>
            <div style={{fontSize:11,fontWeight:700,color:T.sub,textTransform:"uppercase",letterSpacing:1,marginBottom:14}}>Body Stats</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,width:"100%",minWidth:0}}>
              {[["name","Name","text","e.g. Aastha"],["weight","Weight (kg)","number","65"],["height","Height (cm)","number","162"],["age","Age","number","25"]].map(([k,l,t,ph])=>(
                <label key={k} style={{display:"flex",flexDirection:"column",gap:4,minWidth:0}}>
                  <span style={{fontSize:10,color:T.sub,fontWeight:700,letterSpacing:1,textTransform:"uppercase"}}>{l}</span>
                  <input type={t} value={profile[k]||""} onChange={e=>onProfile(k,t==="number"?+e.target.value:e.target.value)} placeholder={ph}
                    style={{background:T.bg,border:`1px solid ${T.border}`,borderRadius:8,padding:"9px 10px",color:T.text,fontSize:13,outline:"none",fontFamily:"inherit",width:"100%",boxSizing:"border-box"}}/>
                </label>
              ))}
              <label style={{display:"flex",flexDirection:"column",gap:4}}>
                <span style={{fontSize:10,color:T.sub,fontWeight:700,letterSpacing:1,textTransform:"uppercase"}}>Sex</span>
                <select value={profile.sex} onChange={e=>onProfile("sex",e.target.value)}
                  style={{background:T.bg,border:`1px solid ${T.border}`,borderRadius:8,padding:"9px 12px",color:T.text,fontSize:13,outline:"none",fontFamily:"inherit"}}>
                  <option value="female">Female</option><option value="male">Male</option>
                </select>
              </label>
              <label style={{display:"flex",flexDirection:"column",gap:4}}>
                <span style={{fontSize:10,color:T.sub,fontWeight:700,letterSpacing:1,textTransform:"uppercase"}}>Activity</span>
                <select value={profile.activity} onChange={e=>onProfile("activity",e.target.value)}
                  style={{background:T.bg,border:`1px solid ${T.border}`,borderRadius:8,padding:"9px 12px",color:T.text,fontSize:13,outline:"none",fontFamily:"inherit"}}>
                  <option value="sedentary">Sedentary</option>
                  <option value="light">Light (1-3x/week)</option>
                  <option value="moderate">Moderate (3-5x/week)</option>
                  <option value="active">Active (6-7x/week)</option>
                  <option value="very_active">Very active</option>
                </select>
              </label>
            </div>
            {bmi&&(
              <div style={{marginTop:14,padding:12,background:bmiColor+"15",border:`1px solid ${bmiColor}33`,borderRadius:10,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <div><div style={{fontSize:10,color:T.sub,marginBottom:2}}>BMI</div><div style={{fontSize:24,fontWeight:800,color:bmiColor,fontFamily:"monospace"}}>{bmi}</div></div>
                <div style={{fontSize:13,color:bmiColor,fontWeight:700}}>{bmi<18.5?"Underweight":bmi<25?"Normal weight":bmi<30?"Overweight":"Obese"}</div>
              </div>
            )}
            {bmr>0&&(
              <div style={{marginTop:12,display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                <div style={{background:T.brownBg,borderRadius:10,padding:12,textAlign:"center"}}>
                  <div style={{fontSize:10,color:T.sub,textTransform:"uppercase",letterSpacing:1,marginBottom:4}}>BMR</div>
                  <div style={{fontSize:20,fontWeight:800,color:T.brown,fontFamily:"monospace"}}>{bmr}</div>
                  <div style={{fontSize:10,color:T.muted}}>kcal at rest</div>
                </div>
                <div style={{background:T.accentBg,borderRadius:10,padding:12,textAlign:"center"}}>
                  <div style={{fontSize:10,color:T.sub,textTransform:"uppercase",letterSpacing:1,marginBottom:4}}>TDEE</div>
                  <div style={{fontSize:20,fontWeight:800,color:T.accent,fontFamily:"monospace"}}>{tdee}</div>
                  <div style={{fontSize:10,color:T.muted}}>kcal with activity</div>
                </div>
              </div>
            )}
          </Card>
        </>
      )}

      {section==="goals"&&(
        <Card>
          <div style={{fontSize:11,fontWeight:700,color:T.sub,textTransform:"uppercase",letterSpacing:1,marginBottom:14}}>Daily Goals</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,width:"100%",minWidth:0}}>
            {[["cal","Calories (kcal)"],["protein","Protein (g)"],["carbs","Carbs (g)"],["fat","Fat (g)"],["fiber","Fiber (g)"],["sodium","Sodium (mg)"],["steps","Steps"],["water","Water (glasses)"]].map(([k,l])=>(
              <label key={k} style={{display:"flex",flexDirection:"column",gap:4,minWidth:0}}>
                <span style={{fontSize:10,color:T.sub,fontWeight:700,letterSpacing:1,textTransform:"uppercase"}}>{l}</span>
                <input type="number" value={goals[k]||""} onChange={e=>onGoals({...goals,[k]:+e.target.value})}
                  style={{background:T.bg,border:`1px solid ${T.border}`,borderRadius:8,padding:"9px 10px",color:T.text,fontSize:13,outline:"none",fontFamily:"inherit",width:"100%",boxSizing:"border-box"}}/>
              </label>
            ))}
          </div>
          <div style={{marginTop:10,fontSize:11,color:T.sub,background:T.accentBg,borderRadius:8,padding:"8px 12px"}}>
            Changes save automatically as you type.
          </div>
        </Card>
      )}

      {section==="foods"&&(
        <>
          <Btn variant="brown" full onClick={()=>setShowAddFood(p=>!p)}>{showAddFood?"cancel":"+ Add Food Manually"}</Btn>
          {showAddFood&&(
            <Card>
              <div style={{fontSize:13,fontWeight:700,color:T.text,marginBottom:12}}>New Food</div>
              <div style={{display:"flex",flexDirection:"column",gap:8}}>
                <label style={{display:"flex",flexDirection:"column",gap:4}}>
                  <span style={{fontSize:10,color:T.sub,fontWeight:700,letterSpacing:1,textTransform:"uppercase"}}>Name</span>
                  <input value={newFood.name} onChange={e=>setNewFood(p=>({...p,name:e.target.value}))} placeholder="e.g. Eggoz Egg"
                    style={{background:T.bg,border:`1px solid ${T.border}`,borderRadius:8,padding:"9px 12px",color:T.text,fontSize:13,outline:"none",fontFamily:"inherit"}}/>
                </label>
                <div style={{display:"flex",gap:8}}>
                  <label style={{display:"flex",flexDirection:"column",gap:4,flex:1}}>
                    <span style={{fontSize:10,color:T.sub,fontWeight:700,letterSpacing:1,textTransform:"uppercase"}}>Serving</span>
                    <input type="number" value={newFood.servingSize} onChange={e=>setNewFood(p=>({...p,servingSize:e.target.value}))}
                      style={{background:T.bg,border:`1px solid ${T.border}`,borderRadius:8,padding:"9px 12px",color:T.text,fontSize:13,outline:"none",fontFamily:"inherit"}}/>
                  </label>
                  <label style={{display:"flex",flexDirection:"column",gap:4,flex:1}}>
                    <span style={{fontSize:10,color:T.sub,fontWeight:700,letterSpacing:1,textTransform:"uppercase"}}>Unit</span>
                    <select value={newFood.servingUnit} onChange={e=>setNewFood(p=>({...p,servingUnit:e.target.value}))}
                      style={{background:T.bg,border:`1px solid ${T.border}`,borderRadius:8,padding:"9px 12px",color:T.text,fontSize:13,outline:"none",fontFamily:"inherit"}}>
                      {UNITS.map(u=><option key={u}>{u}</option>)}
                    </select>
                  </label>
                </div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                  {[["cal","Calories"],["protein","Protein (g)"],["carbs","Carbs (g)"],["fat","Fat (g)"],["fiber","Fiber (g)"],["sodium","Sodium (mg)"],["sugar","Sugar (g)"],["calcium","Calcium (mg)"],["iron","Iron (mg)"],["vitaminC","Vit C (mg)"],["vitaminD","Vit D (mcg)"]].map(([k,l])=>(
                    <label key={k} style={{display:"flex",flexDirection:"column",gap:4}}>
                      <span style={{fontSize:10,color:T.sub,fontWeight:700,letterSpacing:1,textTransform:"uppercase"}}>{l}</span>
                      <input type="number" value={newFood[k]} onChange={e=>setNewFood(p=>({...p,[k]:e.target.value}))} placeholder="0"
                        style={{background:T.bg,border:`1px solid ${T.border}`,borderRadius:8,padding:"8px 10px",color:T.text,fontSize:13,outline:"none",fontFamily:"inherit"}}/>
                    </label>
                  ))}
                </div>
                <Btn variant="accent" full onClick={saveFood}>Save Food</Btn>
              </div>
            </Card>
          )}
          {foods.length===0&&!showAddFood&&<div style={{textAlign:"center",color:T.muted,fontSize:13,padding:30}}>no saved foods yet. add manually or ask the chat to save something.</div>}
          {foods.map(f=>(
            <Card key={f.id}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                <div>
                  <div style={{fontSize:14,fontWeight:700,color:T.text}}>{f.name}</div>
                  <div style={{fontSize:11,color:T.sub,marginTop:2}}>Per {f.servingSize}{f.servingUnit} · {f.cal} kcal · P:{f.protein}g C:{f.carbs}g F:{f.fat}g Fib:{f.fiber||0}g</div>
                </div>
                <button onClick={()=>onFoods(foods.filter(x=>x.id!==f.id))} style={{background:"none",border:"none",color:T.muted,cursor:"pointer",fontSize:18}}>🗑</button>
              </div>
            </Card>
          ))}
        </>
      )}

      {section==="recipes"&&(
        <RecipesPanel recipes={recipes} onRecipes={onRecipes}/>
      )}
    </div>
  );
}
