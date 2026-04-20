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
const MEALS = ["Breakfast","Lunch","Dinner","Snack","Pre-workout","Post-workout"];

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
async function gemini(messages, system, imageB64, mimeType) {
  const key = process.env.REACT_APP_GEMINI_KEY;
  if(!key) throw new Error("no API key");
  const parts = [];
  if(imageB64) parts.push({inline_data:{mime_type:mimeType||"image/png",data:imageB64}});
  const lastMsg = messages[messages.length-1];
  parts.push({text: lastMsg.content});
  const contents = [
    ...messages.slice(0,-1).map(m=>({role:m.role==="assistant"?"model":"user",parts:[{text:m.content}]})),
    {role:"user", parts}
  ];
  const resp = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`,
    { method:"POST", headers:{"Content-Type":"application/json"},
      body:JSON.stringify({
        systemInstruction:{parts:[{text:system}]},
        contents,
        tools:[{google_search:{}}],
        generationConfig:{maxOutputTokens:2000,temperature:0.7}
      })
    }
  );
  if(!resp.ok) { const e=await resp.text(); throw new Error(e.slice(0,120)); }
  const data = await resp.json();
  return data.candidates?.[0]?.content?.parts?.map(p=>p.text||"").join("")||"";
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

function Tag({label,color}) {
  return <span style={{background:color+"22",color,border:`1px solid ${color}44`,borderRadius:20,padding:"2px 9px",fontSize:10,fontWeight:700}}>{label}</span>;
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
  const [profile, setProfile] = useState(()=>L("fp_profile",{weight:"",height:"",age:"",sex:"female",activity:"moderate",name:""}));
  const [goals, setGoals] = useState(()=>L("fp_goals",{cal:1600,protein:80,carbs:160,fat:55,fiber:25,sodium:2300,steps:8000,water:8}));
  const [log, setLog] = useState(()=>L("fp_log",{}));
  const [steps, setSteps] = useState(()=>L("fp_steps",{}));
  const [water, setWater] = useState(()=>L("fp_water",{}));
  const [weights, setWeights] = useState(()=>L("fp_weights",{}));
  const [foods, setFoods] = useState(()=>L("fp_foods",[]));
  const [recipes, setRecipes] = useState(()=>L("fp_recipes",[]));

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

  const tabs=[{id:"home",icon:"☀️",label:"Home"},{id:"chat",icon:"💬",label:"Chat"},{id:"profile",icon:"👤",label:"Profile"}];

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
            <div style={{fontSize:14,fontWeight:800,color:T.accent,fontFamily:"monospace"}}>{streak}🔥</div>
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
          }}>{t.icon} {t.label}</button>
        ))}
      </div>

      {/* content */}
      <div style={{flex:1,padding:"14px 18px 80px",overflowY:"auto"}} className="su" key={tab+viewDate}>
        {tab==="home"   && <Home totals={totals} goals={goals} log={log} viewLog={todayLog} steps={steps[viewDate]||0} water={water[viewDate]||0} tdee={tdee} isToday={isToday} viewDate={viewDate} onSteps={v=>sSt({...steps,[viewDate]:v})} onWater={v=>sWat({...water,[viewDate]:v})} onRemove={i=>sLog({...log,[viewDate]:todayLog.filter((_,idx)=>idx!==i)})} onEdit={(i,e)=>sLog({...log,[viewDate]:todayLog.map((x,idx)=>idx===i?e:x)})} streak={streak} weights={weights} onSaveWeight={sWts} profile={profile} onGoChat={()=>setTab("chat")}/>}
        {tab==="chat"   && <Chat profile={profile} goals={goals} log={log} viewDate={viewDate} viewLog={todayLog} totals={totals} tdee={tdee} foods={foods} recipes={recipes} onAddLog={items=>sLog({...log,[viewDate]:[...todayLog,...(Array.isArray(items)?items:[items])]})} onRemoveLog={(name,qty)=>{ const idx=[...todayLog].reverse().findIndex(e=>e.name.toLowerCase().includes(name.toLowerCase())); if(idx>=0){ const ri=todayLog.length-1-idx; sLog({...log,[viewDate]:todayLog.filter((_,i)=>i!==ri)}); }}} onUpdateLog={(name,newQty)=>{ const idx=[...todayLog].reverse().findIndex(e=>e.name.toLowerCase().includes(name.toLowerCase())); if(idx>=0){ const ri=todayLog.length-1-idx; const e=todayLog[ri]; const r=newQty/(e.qty||1); sLog({...log,[viewDate]:todayLog.map((x,i)=>i===ri?{...e,qty:newQty,cal:(e.cal||0)*r,protein:(e.protein||0)*r,carbs:(e.carbs||0)*r,fat:(e.fat||0)*r,fiber:(e.fiber||0)*r}:x)}); }}} onSaveFood={f=>sFoods([...foods,{...f,id:Date.now()}])} onSaveRecipe={r=>sRecipes([...recipes,{...r,id:Date.now()}])} onUpdateFood={(id,f)=>sFoods(foods.map(x=>x.id===id?{...x,...f}:x))} onUpdateRecipe={(id,r)=>sRecipes(recipes.map(x=>x.id===id?{...x,...r}:x))}/>}
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
        {isToday&&<button onClick={onGoChat} style={{marginTop:14,width:"100%",background:T.accent,border:"none",borderRadius:10,color:"#fff",fontWeight:800,fontSize:13,cursor:"pointer",padding:"10px",fontFamily:"inherit"}}>💬 Log food in Chat</button>}
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
            <div key={m.k}>
              <div style={{display:"flex",justifyContent:"space-between",marginBottom:3}}>
                <span style={{fontSize:11,color:T.sub}}>{m.label}</span>
                <span style={{fontSize:11,fontFamily:"monospace"}}>{Math.round(totals[m.k]||0)}{m.unit} <span style={{color:T.muted}}>/ {m.goal}{m.unit}</span></span>
              </div>
              <Bar val={totals[m.k]||0} goal={m.goal} color={m.color}/>
            </div>
          ))}
        </div>
      </Card>

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
                      <div style={{fontSize:11,color:T.sub}}>{e.qty}{e.unit}{e.meal?` · ${e.meal}`:""} · P:{Math.round(e.protein||0)}g C:{Math.round(e.carbs||0)}g</div>
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
  const pct=Math.min(value/goal,1);
  return (
    <Card style={{padding:14}}>
      <div style={{fontSize:11,color:T.sub,textTransform:"uppercase",letterSpacing:1,marginBottom:4,fontWeight:700}}>{icon} {label}</div>
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
function Chat({profile,goals,log,viewDate,viewLog,totals,tdee,foods,recipes,onAddLog,onRemoveLog,onUpdateLog,onSaveFood,onSaveRecipe,onUpdateFood,onUpdateRecipe}) {
  const [msgs,setMsgs]=useState(()=>L(`fc_chat_${viewDate}`,[{role:"assistant",content:`Hey${profile.name?` ${profile.name}`:""}! What did you eat? I can log food, look up nutrition, read photos, manage your recipes — just talk to me.`}]));
  const [input,setInput]=useState("");
  const [loading,setLoading]=useState(false);
  const [pending,setPending]=useState(null);
  const [img,setImg]=useState(null);
  const [imgB64,setImgB64]=useState(null);
  const [imgMime,setImgMime]=useState("image/png");
  const fileRef=useRef();
  const bottomRef=useRef();

  useEffect(()=>{ S(`fc_chat_${viewDate}`,msgs); },[msgs,viewDate]);
  useEffect(()=>{ bottomRef.current?.scrollIntoView({behavior:"smooth"}); },[msgs,loading,pending]);

  const buildContext = useCallback(()=>{
    const cal=totals.cal||0;
    const savedFoodsList=foods.map(f=>`${f.name}(${f.servingSize}${f.servingUnit}=${f.cal}kcal,P:${f.protein}g,C:${f.carbs}g,F:${f.fat}g)`).join("; ")||"none";
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

  const SYSTEM=`You are a friendly, knowledgeable nutrition assistant built into a fitness tracking app. You have access to Google Search for looking up current nutrition info, ingredient lists, and product details.

PERSONALITY: Warm, calm, helpful. Not robotic. Occasional dry humor. Brief responses — get to the point. No asterisks for bold. No excessive exclamation points.

YOU CAN DO THESE ACTIONS — always use the exact JSON format:

1. LOG FOOD (when user mentions eating something):
Respond with a brief comment then:
|||LOG|||{"items":[{"name":"food name","qty":100,"unit":"g","meal":"Breakfast","cal":200,"protein":10,"carbs":20,"fat":5,"fiber":2,"sodium":100,"sugar":2,"calcium":0,"iron":0,"vitaminC":0,"vitaminD":0}],"message":"brief comment"}|||END|||

2. REMOVE from log (most recent matching item):
|||REMOVE|||{"name":"food name","message":"removed."}|||END|||

3. UPDATE quantity in log:
|||UPDATE|||{"name":"food name","newQty":2,"message":"updated."}|||END|||

4. SAVE FOOD to library:
|||SAVEFOOD|||{"name":"food name","servingSize":100,"servingUnit":"g","cal":200,"protein":10,"carbs":20,"fat":5,"fiber":2,"sodium":100,"sugar":0,"calcium":0,"iron":0,"vitaminC":0,"vitaminD":0,"message":"saved to your library."}|||END|||

5. SAVE RECIPE:
|||SAVERECIPE|||{"name":"recipe name","yield":4,"yieldUnit":"serving","steps":"method","ingredients":[{"name":"ing","qty":100,"unit":"g","cal":100,"protein":5,"carbs":10,"fat":3}],"cal":250,"protein":15,"carbs":30,"fat":8,"fiber":3,"sodium":200,"message":"recipe saved."}|||END|||

IMPORTANT RULES:
- When user logs food, ALWAYS include the LOG action. Never skip it.
- Use Google Search when asked about specific branded products, restaurants, or recent nutrition info.
- If an image is provided, analyze it thoroughly — read nutrition labels precisely, identify food items, extract all data.
- Infer meal type from time of day if not specified. Current time context is provided.
- For "remove 1 bread" — remove exactly 1 (the most recent bread entry).
- For updating recipes — if user says "change ingredient X to Y in my recipe", update the full recipe and use SAVERECIPE with the same name to overwrite.
- Indian foods: you know dal, roti, sabzi, biryani, chai, idli, dosa macros well.
- Be conversational. If user asks a question, just answer it. Only use action blocks when an action is needed.
- The message field in JSON is shown to the user as your response. Keep it natural.`;

  async function send() {
    if((!input.trim()&&!img)||loading) return;
    const userText=input.trim()||(img?"[image attached]":"");
    const contextNote=`[${buildContext()}\nCurrent time: ${new Date().toLocaleTimeString("en-IN",{hour:"2-digit",minute:"2-digit"})}]\n\n${userText}`;
    const newMsgs=[...msgs,{role:"user",content:userText,img}];
    setMsgs(newMsgs);
    setInput(""); setImg(null); setImgB64(null);
    setLoading(true);
    try {
      const apiMsgs=[...newMsgs.slice(0,-1).map(m=>({role:m.role,content:m.content})),{role:"user",content:contextNote}];
      const raw=await gemini(apiMsgs,SYSTEM,imgB64,imgMime);

      // parse action blocks
      let display=raw;
      let parsedAction=null;
      const actionMatch=raw.match(/\|\|\|(\w+)\|\|\|([\s\S]*?)\|\|\|END\|\|\|/);
      if(actionMatch) {
        const [,type,jsonStr]=actionMatch;
        display=raw.replace(/\|\|\|\w+\|\|\|[\s\S]*?\|\|\|END\|\|\|/g,"").trim();
        try {
          const data=JSON.parse(jsonStr.trim());
          parsedAction={type,data};
          if(data.message) display=data.message;

          if(type==="LOG"&&data.items?.length) {
            const meal=inferMeal();
            const items=data.items.map(i=>({...i,meal:i.meal||meal}));
            setPending(items);
          }
          if(type==="REMOVE"&&data.name) {
            onRemoveLog(data.name);
          }
          if(type==="UPDATE"&&data.name) {
            onUpdateLog(data.name,data.newQty);
          }
          if(type==="SAVEFOOD"&&data.name) {
            onSaveFood(data);
          }
          if(type==="SAVERECIPE"&&data.name) {
            onSaveRecipe(data);
          }
        } catch(e) { console.error("parse error",e,jsonStr); }
      }
      if(!display||display.length<2) display="done.";
      setMsgs(p=>[...p,{role:"assistant",content:display,action:parsedAction}]);
    } catch(e) {
      setMsgs(p=>[...p,{role:"assistant",content:`something went wrong: ${e.message?.slice(0,80)}`}]);
    }
    setLoading(false);
  }

  function confirmLog() {
    if(!pending) return;
    onAddLog(pending);
    setMsgs(p=>[...p,{role:"assistant",content:`logged ${pending.length} item${pending.length>1?"s":""}. ✓`}]);
    setPending(null);
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

  const quickReplies=["what did i eat today?","how many calories left?","what fits in 300 cals?","remove last entry"];

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
              {m.action?.type==="LOG"&&m.action?.data?.items&&(
                <div style={{marginTop:8,paddingTop:8,borderTop:`1px solid ${m.role==="user"?"#ffffff33":T.border}`}}>
                  {m.action.data.items.map((item,j)=>(
                    <div key={j} style={{fontSize:11,color:m.role==="user"?"#ffffff99":T.sub,marginBottom:2}}>
                      <span style={{color:m.role==="user"?"#fff":T.text,fontWeight:600}}>{item.name}</span> {item.qty}{item.unit} · <span style={{color:T.accent,fontWeight:700}}>{Math.round(item.cal)} kcal</span>
                    </div>
                  ))}
                  <div style={{fontSize:12,fontWeight:700,color:T.accent,marginTop:4}}>total: {Math.round(m.action.data.items.reduce((a,x)=>a+(x.cal||0),0))} kcal</div>
                </div>
              )}
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
        {pending&&(
          <div style={{background:T.greenBg,border:`1px solid ${T.green}44`,borderRadius:12,padding:14}} className="pop">
            <div style={{fontSize:13,color:T.green,fontWeight:700,marginBottom:10}}>log {pending.length} item{pending.length>1?"s":""}?</div>
            {pending.map((item,i)=>(
              <div key={i} style={{fontSize:12,color:T.sub,marginBottom:4}}>
                <span style={{color:T.text,fontWeight:600}}>{item.name}</span> {item.qty}{item.unit} · {item.meal} · <span style={{color:T.green,fontWeight:700}}>{Math.round(item.cal)} kcal</span>
              </div>
            ))}
            <div style={{display:"flex",gap:8,marginTop:10}}>
              <Btn variant="green" onClick={confirmLog} style={{flex:1}}>✓ log it</Btn>
              <Btn variant="ghost" onClick={()=>setPending(null)} style={{flex:1}}>skip</Btn>
            </div>
          </div>
        )}
        <div ref={bottomRef}/>
      </div>

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

// ── PROFILE ───────────────────────────────────────────────────────────────────
function Profile({profile,goals,foods,recipes,bmr,tdee,weights,onProfile,onGoals,onFoods,onRecipes,onSaveWeight}) {
  const [section,setSection]=useState("stats");
  const [goalsOpen,setGoalsOpen]=useState(false);
  const [gDraft,setGDraft]=useState(goals);
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
      <div style={{display:"flex",gap:6}}>
        {sections.map(s=>(
          <button key={s.id} onClick={()=>setSection(s.id)} style={{flex:1,background:section===s.id?T.brown:T.surface,color:section===s.id?"#fff":T.sub,border:`1px solid ${section===s.id?T.brown:T.border}`,borderRadius:10,padding:"7px 0",fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"inherit",transition:"all 0.2s"}}>{s.label}</button>
        ))}
      </div>

      {section==="stats"&&(
        <>
          <Card>
            <div style={{fontSize:11,fontWeight:700,color:T.sub,textTransform:"uppercase",letterSpacing:1,marginBottom:14}}>Body Stats</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
              {[["name","Name","text","e.g. Aastha"],["weight","Weight (kg)","number","65"],["height","Height (cm)","number","162"],["age","Age","number","25"]].map(([k,l,t,ph])=>(
                <label key={k} style={{display:"flex",flexDirection:"column",gap:4}}>
                  <span style={{fontSize:10,color:T.sub,fontWeight:700,letterSpacing:1,textTransform:"uppercase"}}>{l}</span>
                  <input type={t} value={profile[k]||""} onChange={e=>onProfile(k,t==="number"?+e.target.value:e.target.value)} placeholder={ph}
                    style={{background:T.bg,border:`1px solid ${T.border}`,borderRadius:8,padding:"9px 12px",color:T.text,fontSize:13,outline:"none",fontFamily:"inherit"}}/>
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
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
            {[["cal","Calories (kcal)"],["protein","Protein (g)"],["carbs","Carbs (g)"],["fat","Fat (g)"],["fiber","Fiber (g)"],["sodium","Sodium (mg)"],["steps","Steps"],["water","Water (glasses)"]].map(([k,l])=>(
              <label key={k} style={{display:"flex",flexDirection:"column",gap:4}}>
                <span style={{fontSize:10,color:T.sub,fontWeight:700,letterSpacing:1,textTransform:"uppercase"}}>{l}</span>
                <input type="number" value={goals[k]||""} onChange={e=>onGoals({...goals,[k]:+e.target.value})}
                  style={{background:T.bg,border:`1px solid ${T.border}`,borderRadius:8,padding:"9px 12px",color:T.text,fontSize:13,outline:"none",fontFamily:"inherit"}}/>
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
                  <div style={{fontSize:11,color:T.sub,marginTop:2}}>Per {f.servingSize}{f.servingUnit} · {f.cal} kcal · P:{f.protein}g C:{f.carbs}g F:{f.fat}g</div>
                </div>
                <button onClick={()=>onFoods(foods.filter(x=>x.id!==f.id))} style={{background:"none",border:"none",color:T.muted,cursor:"pointer",fontSize:18}}>🗑</button>
              </div>
            </Card>
          ))}
        </>
      )}

      {section==="recipes"&&(
        <>
          <div style={{fontSize:12,color:T.sub,background:T.accentBg,borderRadius:10,padding:"10px 14px"}}>
            Ask the chat to save a recipe — "save my dal tadka recipe: 200g dal, 1 tbsp ghee, spices, yields 4 servings" and it'll calculate macros and save automatically.
          </div>
          {recipes.length===0&&<div style={{textAlign:"center",color:T.muted,fontSize:13,padding:30}}>no saved recipes yet.</div>}
          {recipes.map(r=>(
            <Card key={r.id}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                <div>
                  <div style={{fontSize:14,fontWeight:700,color:T.text}}>📖 {r.name}</div>
                  <div style={{fontSize:12,color:T.accent,fontWeight:700,marginTop:2}}>{Math.round(r.cal||0)} kcal <span style={{color:T.sub,fontWeight:400,fontSize:11}}>per {r.yieldUnit||"serving"} · P:{Math.round(r.protein||0)}g C:{Math.round(r.carbs||0)}g F:{Math.round(r.fat||0)}g</span></div>
                  {r.ingredients&&<div style={{fontSize:11,color:T.sub,marginTop:2}}>{r.ingredients.length} ingredients · yields {r.yield} {r.yieldUnit}{r.yield>1?"s":""}</div>}
                </div>
                <button onClick={()=>onRecipes(recipes.filter(x=>x.id!==r.id))} style={{background:"none",border:"none",color:T.muted,cursor:"pointer",fontSize:18}}>🗑</button>
              </div>
            </Card>
          ))}
        </>
      )}
    </div>
  );
}
