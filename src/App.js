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

  const tabs=[{id:"home",icon:"",label:"Home"},{id:"chat",icon:"",label:"Chat"},{id:"profile",icon:"",label:"Profile"}];

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

   
