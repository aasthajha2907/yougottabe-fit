import { useState, useRef, useMemo, useEffect } from "react";
import { MY_MENU } from "./menu-data";

// ── persistence ───────────────────────────────────────────────────────────────
const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };
const load = (k, d) => { try { const s = localStorage.getItem(k); return s ? JSON.parse(s) : d; } catch { return d; } };
const dateStr = (offset = 0) => {
  const d = new Date(); d.setDate(d.getDate() + offset);
  return d.toISOString().split("T")[0];
};
const fmtDate = (d) => new Date(d + "T12:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
const fmtShort = (d) => new Date(d + "T12:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short" });
const FAT_KCAL = 7.7;
const UNITS = ["g","ml","oz","serving","tbsp","tsp","cup","piece","katori","roti","bowl","slice","scoop"];
const MEALS = ["Breakfast","Lunch","Dinner","Snack","Pre-workout","Post-workout"];

const C = {
  bg:"#070709", surface:"#0f0f15", card:"#141420", border:"#1e1e2e",
  accent:"#c8f04a", accentDim:"#c8f04a14",
  green:"#34d399", greenDim:"#34d39914",
  blue:"#7dd3fc", blueDim:"#7dd3fc14",
  pink:"#f9a8d4", pinkDim:"#f9a8d414",
  orange:"#fdba74", purple:"#c4b5fd", purpleDim:"#c4b5fd14",
  text:"#eeedf5", sub:"#7878a0", muted:"#33334a",
};

// ── nutrition math ────────────────────────────────────────────────────────────
const NUTR_KEYS = ["cal","protein","carbs","fat","fiber","sodium","sugar","calcium","iron","vitaminC","vitaminD"];
function sumNutr(entries) {
  return entries.reduce((a, e) => { NUTR_KEYS.forEach(k => a[k] = (a[k]||0) + (e[k]||0)); return a; }, {});
}
function calcBMR(p) {
  if (!p.weight||!p.height||!p.age) return 0;
  const base = 10*p.weight + 6.25*p.height - 5*p.age;
  return Math.round(p.sex==="female" ? base-161 : base+5);
}
function calcTDEE(bmr, act) {
  return Math.round(bmr * ({sedentary:1.2,light:1.375,moderate:1.55,active:1.725,very_active:1.9}[act]||1.2));
}

// ── Gemini API ────────────────────────────────────────────────────────────────
async function callAI(messages, system) {
  const key = process.env.REACT_APP_GEMINI_KEY;
  if (!key) throw new Error("no API key");
  const contents = messages.map(m => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }]
  }));
  const resp = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`,
    {
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({
        systemInstruction:{ parts:[{ text: system || "You are a helpful assistant." }] },
        contents,
        generationConfig:{ maxOutputTokens:2000, temperature:0.7 }
      })
    }
  );
  if (!resp.ok) { const e = await resp.text(); throw new Error(e.slice(0,120)); }
  const data = await resp.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || "";
}

// ── micro UI ──────────────────────────────────────────────────────────────────
function Pill({ label, value, color }) {
  return (
    <div style={{ background:color+"18", border:`1px solid ${color}28`, borderRadius:10, padding:"7px 8px", textAlign:"center", flex:1, minWidth:0 }}>
      <div style={{ fontSize:12, fontWeight:800, color, fontFamily:"monospace", whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{value}</div>
      <div style={{ fontSize:9, color:C.sub, marginTop:1, textTransform:"uppercase", letterSpacing:0.7 }}>{label}</div>
    </div>
  );
}
function Input({ label, hint, ...p }) {
  return (
    <label style={{ display:"flex", flexDirection:"column", gap:5 }}>
      {label && <span style={{ fontSize:11, color:C.sub, fontWeight:700, letterSpacing:1, textTransform:"uppercase" }}>{label}</span>}
      <input {...p} style={{ background:C.bg, border:`1px solid ${C.border}`, borderRadius:8, padding:"10px 13px", color:C.text, fontSize:14, outline:"none", width:"100%", boxSizing:"border-box", fontFamily:"inherit", ...(p.style||{}) }}
        onFocus={e=>e.target.style.borderColor=C.accent} onBlur={e=>e.target.style.borderColor=C.border}/>
      {hint && <span style={{ fontSize:11, color:C.sub }}>{hint}</span>}
    </label>
  );
}
function Sel({ label, children, ...p }) {
  return (
    <label style={{ display:"flex", flexDirection:"column", gap:5 }}>
      {label && <span style={{ fontSize:11, color:C.sub, fontWeight:700, letterSpacing:1, textTransform:"uppercase" }}>{label}</span>}
      <select {...p} style={{ background:C.bg, border:`1px solid ${C.border}`, borderRadius:8, padding:"10px 13px", color:C.text, fontSize:14, outline:"none", width:"100%", boxSizing:"border-box", fontFamily:"inherit", ...(p.style||{}) }}>{children}</select>
    </label>
  );
}
function Btn({ children, onClick, variant="ghost", full, disabled, style:s={} }) {
  const v = { ghost:{bg:"transparent",color:C.sub,border:`1px solid ${C.border}`}, accent:{bg:C.accent,color:C.bg,border:"none"}, green:{bg:C.green,color:C.bg,border:"none"}, flat:{bg:C.card,color:C.text,border:`1px solid ${C.border}`}, danger:{bg:"#ef444418",color:"#f87171",border:"1px solid #ef444430"} }[variant];
  return <button onClick={onClick} disabled={disabled} style={{ background:v.bg, color:v.color, border:v.border, borderRadius:8, padding:"10px 18px", fontSize:13, fontWeight:700, cursor:disabled?"not-allowed":"pointer", width:full?"100%":undefined, letterSpacing:0.3, fontFamily:"inherit", opacity:disabled?0.5:1, ...s }}>{children}</button>;
}
function Modal({ open, onClose, title, children }) {
  if (!open) return null;
  return (
    <div onClick={onClose} style={{ position:"fixed", inset:0, background:"#00000099", zIndex:200, display:"flex", alignItems:"flex-end", justifyContent:"center" }}>
      <div onClick={e=>e.stopPropagation()} style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:"20px 20px 0 0", padding:"24px 20px 40px", width:"100%", maxWidth:540, maxHeight:"92vh", overflowY:"auto" }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20 }}>
          <span style={{ fontSize:17, fontWeight:800, color:C.text }}>{title}</span>
          <button onClick={onClose} style={{ background:"none", border:"none", color:C.sub, fontSize:24, cursor:"pointer", lineHeight:1 }}>×</button>
        </div>
        {children}
      </div>
    </div>
  );
}
function MicroBar({ label, val, goal, unit, color, entries, onClick }) {
  const pct = Math.min((val||0)/goal*100, 100);
  return (
    <div onClick={onClick} style={{ cursor:onClick?"pointer":"default" }}>
      <div style={{ display:"flex", justifyContent:"space-between", marginBottom:3 }}>
        <span style={{ fontSize:12, color:onClick?C.accent:C.sub }}>{label}{onClick?" ↗":""}</span>
        <span style={{ fontSize:12, color:C.text, fontFamily:"monospace" }}>{Math.round((val||0)*10)/10}{unit} <span style={{ color:C.muted }}>/ {goal}{unit}</span></span>
      </div>
      <div style={{ height:4, background:C.border, borderRadius:99 }}>
        <div style={{ height:4, width:`${pct}%`, background:color, borderRadius:99, transition:"width 0.5s" }}/>
      </div>
    </div>
  );
}
function ArcMeter({ pct, color, size=130, sw=10 }) {
  const r=(size-sw)/2, circ=Math.PI*r, filled=Math.min(pct,1)*circ;
  return (
    <svg width={size} height={size/2+sw} viewBox={`0 0 ${size} ${size/2+sw}`}>
      <path d={`M${sw/2},${size/2} A${r},${r} 0 0,1 ${size-sw/2},${size/2}`} fill="none" stroke={C.border} strokeWidth={sw} strokeLinecap="round"/>
      <path d={`M${sw/2},${size/2} A${r},${r} 0 0,1 ${size-sw/2},${size/2}`} fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeDasharray={`${filled} ${circ}`} style={{ transition:"stroke-dasharray 0.7s cubic-bezier(.4,0,.2,1)" }}/>
    </svg>
  );
}
export default function App() {
  const [tab, setTab] = useState("today");
  const [viewDate, setViewDate] = useState(dateStr(0)); // for yesterday toggle
  const [profile, setProfile] = useState(()=>load("ft_profile",{weight:"",height:"",age:"",sex:"female",activity:"moderate"}));
  const [goals, setGoals] = useState(()=>load("ft_goals",{cal:1500,protein:80,carbs:150,fat:50,fiber:25,sodium:2300,sugar:50,calcium:1000,iron:18,vitaminC:90,vitaminD:20,steps:8000,water:8}));
  const [baseline, setBaseline] = useState(()=>load("ft_baseline",{currentCals:"",bmrOverride:""}));
  const [ingredients, setIngredients] = useState(()=>load("ft_ing",[]));
  const [recipes, setRecipes] = useState(()=>load("ft_rec",[]));
  const [log, setLog] = useState(()=>load("ft_log",{}));
  const [steps, setSteps] = useState(()=>load("ft_steps",{}));
  const [water, setWater] = useState(()=>load("ft_water",{}));
  const [weights, setWeights] = useState(()=>load("ft_weights",{}));
  const [pantry, setPantry] = useState(()=>load("ft_pantry",[]));

  const sp=(k,v)=>{ const n={...profile,[k]:v}; setProfile(n); save("ft_profile",n); };
  const sG=v=>{ setGoals(v); save("ft_goals",v); };
  const sB=v=>{ setBaseline(v); save("ft_baseline",v); };
  const sIng=v=>{ setIngredients(v); save("ft_ing",v); };
  const sRec=v=>{ setRecipes(v); save("ft_rec",v); };
  const sLog=v=>{ setLog(v); save("ft_log",v); };
  const sSt=v=>{ setSteps(v); save("ft_steps",v); };
  const sWat=v=>{ setWater(v); save("ft_water",v); };
  const sWts=v=>{ setWeights(v); save("ft_weights",v); };
  const sPantry=v=>{ setPantry(v); save("ft_pantry",v); };

  const today = dateStr(0);
  const viewLog = log[viewDate]||[];
  const totals = sumNutr(viewLog);
  const bmr = baseline.bmrOverride ? +baseline.bmrOverride : calcBMR(profile);
  const tdee = calcTDEE(bmr, profile.activity);

  // streak calculation
  const streak = useMemo(() => {
    let s = 0;
    for (let i = 0; i >= -365; i--) {
      const d = dateStr(i);
      if ((log[d]||[]).length > 0) s++;
      else if (i < 0) break;
    }
    return s;
  }, [log]);

  // consistency score (last 7 days logged / 7)
  const consistency = useMemo(() => {
    let logged = 0;
    for (let i = 0; i > -7; i--) {
      if ((log[dateStr(i)]||[]).length > 0) logged++;
    }
    return Math.round((logged / 7) * 100);
  }, [log]);

  const tabs=[
    {id:"today",   icon:"⚡", label:"Today"},
    {id:"log",     icon:"💬", label:"Log"},
    {id:"menu",    icon:"🍽️", label:"Menu"},
    {id:"planner", icon:"📅", label:"Plan"},
    {id:"scan",    icon:"📷", label:"Scan"},
    {id:"library", icon:"📦", label:"Library"},
    {id:"fat",     icon:"🔥", label:"Fat Loss"},
    {id:"history", icon:"📈", label:"History"},
    {id:"profile", icon:"👤", label:"Profile"},
  ];

  const isToday = viewDate === today;

  return (
    <div style={{ background:C.bg, minHeight:"100vh", fontFamily:"'Plus Jakarta Sans','Segoe UI',sans-serif", color:C.text, width:"min(100vw, 820px)", margin:"0 auto", display:"flex", flexDirection:"column" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;700;800&display=swap');
        *{box-sizing:border-box;margin:0;padding:0;}
        ::-webkit-scrollbar{width:3px;} ::-webkit-scrollbar-thumb{background:${C.border};border-radius:99px;}
        input[type=number]::-webkit-inner-spin-button{opacity:0;}
        input::placeholder,textarea::placeholder{color:${C.muted};}
        select option{background:${C.surface};}
        @keyframes fu{from{opacity:0;transform:translateY(8px);}to{opacity:1;transform:translateY(0);}}
        .fu{animation:fu 0.28s ease forwards;}
        @keyframes pop{0%{transform:scale(0.9);opacity:0;}100%{transform:scale(1);opacity:1;}} .pop{animation:pop 0.2s ease forwards;}
        @media(min-width:600px){ html{font-size:clamp(14px,1.1vw,18px);} }
      `}</style>

      {/* header */}
      <div style={{ padding:"16px 18px 0", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
        <div>
          <div style={{ fontSize:10, color:C.sub, letterSpacing:2, textTransform:"uppercase" }}>
            {new Date().toLocaleDateString("en-IN",{weekday:"long",day:"numeric",month:"long"})}
          </div>
          <div style={{ fontSize:22, fontWeight:800, letterSpacing:-0.5 }}>Fuel <span style={{ color:C.accent }}>Log</span></div>
        </div>
        <div style={{ display:"flex", gap:8, alignItems:"center" }}>
          {/* streak badge */}
          <div style={{ background:C.orange+"18", border:`1px solid ${C.orange}30`, borderRadius:8, padding:"4px 10px", textAlign:"center" }}>
            <div style={{ fontSize:14, fontWeight:800, color:C.orange, fontFamily:"monospace" }}>{streak}🔥</div>
            <div style={{ fontSize:9, color:C.sub }}>streak</div>
          </div>
          <div style={{ textAlign:"right" }}>
            <div style={{ fontSize:18, fontWeight:800, color:C.accent, fontFamily:"monospace" }}>{Math.round(totals.cal||0)}</div>
            <div style={{ fontSize:10, color:C.sub }}>kcal {isToday?"today":"that day"}</div>
          </div>
          <button onClick={()=>setTab("log")} style={{ background:C.accent, border:"none", borderRadius:10, color:C.bg, fontWeight:800, fontSize:12, cursor:"pointer", padding:"8px 14px", fontFamily:"inherit" }}>+ Log</button>
        </div>
      </div>

      {/* date toggle */}
      <div style={{ display:"flex", gap:6, padding:"10px 18px 0", alignItems:"center" }}>
        <button onClick={()=>setViewDate(dateStr(-1))} style={{ background:viewDate===dateStr(-1)?C.accent+"22":"transparent", border:`1px solid ${viewDate===dateStr(-1)?C.accent:C.border}`, borderRadius:8, padding:"5px 12px", fontSize:11, color:viewDate===dateStr(-1)?C.accent:C.sub, cursor:"pointer", fontFamily:"inherit", fontWeight:700 }}>← Yesterday</button>
        <button onClick={()=>setViewDate(today)} style={{ background:viewDate===today?C.accent+"22":"transparent", border:`1px solid ${viewDate===today?C.accent:C.border}`, borderRadius:8, padding:"5px 12px", fontSize:11, color:viewDate===today?C.accent:C.sub, cursor:"pointer", fontFamily:"inherit", fontWeight:700 }}>Today</button>
        <div style={{ fontSize:11, color:C.muted, marginLeft:"auto" }}>{consistency}% this week</div>
      </div>

      {/* tabs */}
      <div style={{ display:"flex", padding:"10px 18px 0", gap:4, overflowX:"auto", scrollbarWidth:"none" }}>
        {tabs.map(t=>(
          <button key={t.id} onClick={()=>setTab(t.id)} style={{ background:tab===t.id?C.accent:"transparent", color:tab===t.id?C.bg:C.sub, border:`1px solid ${tab===t.id?C.accent:C.border}`, borderRadius:8, padding:"6px 11px", fontSize:11, fontWeight:700, cursor:"pointer", whiteSpace:"nowrap", letterSpacing:0.3, fontFamily:"inherit", flexShrink:0 }}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* content */}
      <div style={{ flex:1, padding:"14px 18px 80px", overflowY:"auto" }} className="fu" key={tab+viewDate}>
        {tab==="today"   && <Today totals={totals} goals={goals} viewLog={viewLog} steps={steps[viewDate]||0} water={water[viewDate]||0} tdee={tdee} isToday={isToday} viewDate={viewDate} onSteps={v=>sSt({...steps,[viewDate]:v})} onWater={v=>sWat({...water,[viewDate]:v})} onRemove={i=>sLog({...log,[viewDate]:viewLog.filter((_,idx)=>idx!==i)})} onEdit={(i,e)=>sLog({...log,[viewDate]:viewLog.map((x,idx)=>idx===i?e:x)})} onGoToLog={()=>setTab("log")} streak={streak} consistency={consistency} profile={profile}/>}
        {tab==="log"     && <ChatLog ingredients={ingredients} recipes={recipes} viewLog={viewLog} viewDate={viewDate} goals={goals} onAdd={e=>sLog({...log,[viewDate]:[...viewLog,...(Array.isArray(e)?e:[e])]})} onRemoveByName={name=>sLog({...log,[viewDate]:viewLog.filter(e=>e.name!==name)})} onSaveIng={sIng} onSaveRec={sRec}/>}
        {tab==="menu"    && <MenuTab pantry={pantry} remainingCal={Math.round(goals.cal-(totals.cal||0))} onAddToLog={e=>{ sLog({...log,[viewDate]:[...viewLog,e]}); setTab("today"); }}/>}
        {tab==="planner" && <Planner goals={goals} log={log} recipes={recipes} onLogMeal={e=>{ sLog({...log,[today]:[...(log[today]||[]),e]}); }}/>}
        {tab==="scan"    && <ScanLabel ingredients={ingredients} onSave={sIng}/>}
        {tab==="library" && <Library ingredients={ingredients} recipes={recipes} onSaveIng={sIng} onSaveRec={sRec}/>}
        {tab==="fat"     && <FatLoss log={log} goals={goals} tdee={tdee} baseline={baseline} profile={profile} weights={weights} onSaveWeights={sWts}/>}
        {tab==="history" && <History log={log} steps={steps} water={water} goals={goals}/>}
        {tab==="profile" && <Profile profile={profile} baseline={baseline} goals={goals} bmr={bmr} tdee={tdee} pantry={pantry} onProfile={sp} onBaseline={sB} onGoals={sG} onPantry={sPantry}/>}
      </div>
    </div>
  );
}

// ── SUPPLEMENTS ───────────────────────────────────────────────────────────────
function Supplements() {
  const [supps, setSupps] = useState(()=>load("ft_supps",[]));
  const [checked, setChecked] = useState(()=>load("ft_supp_log",{}));
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const today = dateStr(0);
  const todayChecked = checked[today]||{};
  const saveSupps=v=>{ setSupps(v); save("ft_supps",v); };
  function toggle(id){ const n={...todayChecked,[id]:!todayChecked[id]}; const nl={...checked,[today]:n}; setChecked(nl); save("ft_supp_log",nl); }
  function addSupp(){ if(!newName.trim()) return; saveSupps([...supps,{id:Date.now(),name:newName.trim()}]); setNewName(""); setAdding(false); }
  const doneCount=supps.filter(s=>todayChecked[s.id]).length;
  return (
    <div style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:14, padding:16 }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
        <div>
          <div style={{ fontSize:11, fontWeight:700, color:C.sub, textTransform:"uppercase", letterSpacing:1 }}>💊 Supplements</div>
          {supps.length>0&&<div style={{ fontSize:11, color:doneCount===supps.length?C.green:C.sub, marginTop:2 }}>{doneCount}/{supps.length} taken{doneCount===supps.length?" — done":""}</div>}
        </div>
        <button onClick={()=>setAdding(p=>!p)} style={{ background:C.accentDim, border:`1px solid ${C.accent}44`, borderRadius:7, color:C.accent, fontSize:12, fontWeight:700, cursor:"pointer", padding:"5px 12px" }}>{adding?"cancel":"+ Add"}</button>
      </div>
      {adding&&(
        <div style={{ display:"flex", gap:8, marginBottom:10 }}>
          <input value={newName} onChange={e=>setNewName(e.target.value)} onKeyDown={e=>e.key==="Enter"&&addSupp()} placeholder="D3, Omega 3, B12..."
            style={{ flex:1, background:C.bg, border:`1px solid ${C.accent}`, borderRadius:8, padding:"9px 12px", color:C.text, fontSize:13, outline:"none", fontFamily:"inherit" }}/>
          <button onClick={addSupp} style={{ background:C.accent, border:"none", borderRadius:8, color:C.bg, fontWeight:700, fontSize:13, cursor:"pointer", padding:"9px 16px" }}>Add</button>
        </div>
      )}
      {supps.length===0&&!adding&&<div style={{ color:C.muted, fontSize:12, textAlign:"center", padding:"10px 0" }}>no supplements added yet</div>}
      <div style={{ display:"flex", flexDirection:"column", gap:7 }}>
        {supps.map(s=>{
          const done=!!todayChecked[s.id];
          return (
            <div key={s.id} onClick={()=>toggle(s.id)} style={{ display:"flex", alignItems:"center", gap:12, padding:"10px 12px", background:done?C.green+"12":C.surface, border:`1px solid ${done?C.green+"44":C.border}`, borderRadius:10, cursor:"pointer", transition:"all 0.2s" }}>
              <div style={{ width:22, height:22, borderRadius:6, border:`2px solid ${done?C.green:C.muted}`, background:done?C.green:"transparent", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                {done&&<span style={{ color:C.bg, fontSize:13, fontWeight:900, lineHeight:1 }}>✓</span>}
              </div>
              <span style={{ fontSize:13, fontWeight:600, color:done?C.green:C.text, flex:1 }}>{s.name}</span>
              <button onClick={e=>{e.stopPropagation();saveSupps(supps.filter(x=>x.id!==s.id));}} style={{ background:"none", border:"none", color:C.muted, cursor:"pointer", fontSize:16, lineHeight:1, padding:2 }}>×</button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── TODAY ─────────────────────────────────────────────────────────────────────
function Today({ totals, goals, viewLog, steps, water, tdee, isToday, viewDate, onSteps, onWater, onRemove, onEdit, onGoToLog, profile }) {
  const [showAll, setShowAll] = useState(false);
  const [editIdx, setEditIdx] = useState(null);
  const [editQty, setEditQty] = useState("");
  const [macroDetail, setMacroDetail] = useState(null); // which macro to show breakdown for
  const calPct = (totals.cal||0)/goals.cal;
  const deficit = tdee-(totals.cal||0);
  const fatBurned = deficit>0?deficit/FAT_KCAL:0;

  // macro breakdown
  const macroBreakdown = (key) => viewLog.map(e => ({
    name: e.name, qty: e.qty, unit: e.unit, val: e[key]||0
  })).filter(e => e.val > 0).sort((a,b) => b.val-a.val);

  const MACRO_META = {
    protein:  { label:"Protein",   unit:"g",   goal:goals.protein||80,   color:C.blue },
    carbs:    { label:"Carbs",     unit:"g",   goal:goals.carbs||200,    color:C.accent },
    fat:      { label:"Fat",       unit:"g",   goal:goals.fat||60,       color:C.pink },
    fiber:    { label:"Fiber",     unit:"g",   goal:goals.fiber||25,     color:C.green },
    sodium:   { label:"Sodium",    unit:"mg",  goal:goals.sodium||2300,  color:C.orange },
    sugar:    { label:"Sugar",     unit:"g",   goal:goals.sugar||50,     color:C.pink },
    calcium:  { label:"Calcium",   unit:"mg",  goal:goals.calcium||1000, color:C.blue },
    iron:     { label:"Iron",      unit:"mg",  goal:goals.iron||18,      color:C.orange },
    vitaminC: { label:"Vitamin C", unit:"mg",  goal:goals.vitaminC||90,  color:C.accent },
    vitaminD: { label:"Vitamin D", unit:"mcg", goal:goals.vitaminD||20,  color:C.purple },
  };

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
      {/* calorie arc */}
      <div style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:18, padding:20, textAlign:"center" }}>
        <div style={{ display:"flex", justifyContent:"center" }}><ArcMeter pct={calPct} color={calPct>1?"#f87171":C.accent}/></div>
        <div style={{ marginTop:-8 }}>
          <div style={{ fontSize:32, fontWeight:800, color:C.text, fontFamily:"monospace", letterSpacing:-1 }}>{Math.round(totals.cal||0)}</div>
          <div style={{ fontSize:12, color:C.sub }}>of {goals.cal} kcal goal</div>
          {tdee>0&&<div style={{ fontSize:12, color:C.sub, marginTop:2 }}>TDEE: <span style={{ color:C.text, fontWeight:700 }}>{tdee}</span> kcal</div>}
          <div style={{ marginTop:5 }}>
            {calPct>1
              ? <span style={{ fontSize:13, color:"#f87171", fontWeight:700 }}>{Math.round((totals.cal||0)-goals.cal)} kcal over</span>
              : <span style={{ fontSize:13, color:C.accent, fontWeight:700 }}>{Math.round(goals.cal-(totals.cal||0))} kcal remaining</span>}
          </div>
        </div>
        {isToday&&<button onClick={onGoToLog} style={{ marginTop:14, background:C.accent, border:"none", borderRadius:10, color:C.bg, fontWeight:800, fontSize:13, cursor:"pointer", padding:"10px 28px", fontFamily:"inherit" }}>+ Log Food</button>}
      </div>

      {/* meal budget */}
      <div style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:14, padding:14 }}>
        <div style={{ fontSize:11, fontWeight:700, color:C.sub, textTransform:"uppercase", letterSpacing:1, marginBottom:10 }}>Meal Budget</div>
        {[
          {meal:"Breakfast", budget:Math.round(goals.cal*0.25), color:C.orange},
          {meal:"Lunch",     budget:Math.round(goals.cal*0.35), color:C.accent},
          {meal:"Dinner",    budget:Math.round(goals.cal*0.30), color:C.blue},
          {meal:"Snack",     budget:Math.round(goals.cal*0.10), color:C.purple},
        ].map(({meal,budget,color})=>{
          const eaten = viewLog.filter(e=>(e.meal||"").toLowerCase()===meal.toLowerCase()).reduce((a,e)=>a+(e.cal||0),0);
          const pct = Math.min(eaten/budget,1);
          const over = eaten > budget;
          return (
            <div key={meal} style={{ marginBottom:10 }}>
              <div style={{ display:"flex", justifyContent:"space-between", marginBottom:3 }}>
                <span style={{ fontSize:12, color:C.sub }}>{meal}</span>
                <span style={{ fontSize:12, fontFamily:"monospace" }}>
                  <span style={{ color:over?"#f87171":C.text }}>{Math.round(eaten)}</span>
                  <span style={{ color:C.muted }}> / {budget} kcal</span>
                </span>
              </div>
              <div style={{ height:4, background:C.border, borderRadius:99 }}>
                <div style={{ height:4, width:`${pct*100}%`, background:over?"#f87171":color, borderRadius:99, transition:"width 0.5s" }}/>
              </div>
            </div>
          );
        })}
      </div>

      {/* fat burned */}
      {isToday&&tdee>0&&(()=>{
        const projectedDeficit = tdee - (totals.cal||0);
        const projectedFat = projectedDeficit > 0 ? projectedDeficit / FAT_KCAL : 0;
        const fullDayDeficit = goals.cal > 0 ? tdee - goals.cal : 0;
        const maxFat = fullDayDeficit > 0 ? fullDayDeficit / FAT_KCAL : 0;
        return (
          <div style={{ background:`linear-gradient(135deg,${C.green}18,${C.accent}0a)`, border:`1px solid ${C.green}30`, borderRadius:14, padding:16 }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8 }}>
              <div>
                <div style={{ fontSize:11, color:C.green, textTransform:"uppercase", letterSpacing:1, fontWeight:700 }}>projected fat burn today</div>
                <div style={{ fontSize:26, fontWeight:800, color:projectedFat>0?C.green:"#f87171", fontFamily:"monospace", marginTop:2 }}>
                  {projectedFat>0?projectedFat.toFixed(1):"0.0"}<span style={{ fontSize:14 }}> g</span>
                </div>
                <div style={{ fontSize:11, color:C.sub, marginTop:2 }}>
                  {projectedDeficit>0?`${Math.round(projectedDeficit)} kcal under TDEE`:`${Math.round(-projectedDeficit)} kcal over TDEE`}
                </div>
              </div>
              <div style={{ textAlign:"right" }}>
                <div style={{ fontSize:10, color:C.sub, marginBottom:4 }}>if you hit goal</div>
                <div style={{ fontSize:18, fontWeight:800, color:C.accent, fontFamily:"monospace" }}>{maxFat.toFixed(1)}g</div>
                <div style={{ fontSize:10, color:C.muted }}>max possible</div>
              </div>
            </div>
            <div style={{ height:4, background:C.border, borderRadius:99 }}>
              <div style={{ height:4, width:`${Math.min((totals.cal||0)/tdee*100,100)}%`, background:projectedFat>0?C.green:"#f87171", borderRadius:99, transition:"width 0.5s" }}/>
            </div>
            <div style={{ fontSize:10, color:C.muted, marginTop:4 }}>TDEE: {tdee} kcal · eaten: {Math.round(totals.cal||0)} kcal</div>
          </div>
        );
      })()}

      {/* steps + water */}
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
        <QuickTrack icon="👟" label="Steps" value={steps} goal={goals.steps} color={C.orange} unit="steps" onSave={onSteps} subValue={Math.round(steps * (profile?.weight||70) * 0.00057 * 100)/100}/>
        <QuickTrack icon="💧" label="Water" value={water} goal={goals.water} color={C.blue} unit="glasses" onSave={onWater}/>
      </div>

      {/* macros — clickable for breakdown */}
      <div style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:14, padding:16 }}>
        <div style={{ fontSize:11, fontWeight:700, color:C.sub, textTransform:"uppercase", letterSpacing:1, marginBottom:10 }}>Macronutrients <span style={{ color:C.muted, fontSize:10, fontWeight:400 }}>tap to see breakdown</span></div>
        <div style={{ display:"flex", gap:7, marginBottom:12 }}>
          {["protein","carbs","fat","fiber"].map(k=>(
            <div key={k} onClick={()=>setMacroDetail(k)} style={{ background:MACRO_META[k].color+"18", border:`1px solid ${macroDetail===k?MACRO_META[k].color:MACRO_META[k].color+"28"}`, borderRadius:10, padding:"7px 8px", textAlign:"center", flex:1, minWidth:0, cursor:"pointer" }}>
              <div style={{ fontSize:12, fontWeight:800, color:MACRO_META[k].color, fontFamily:"monospace" }}>{Math.round(totals[k]||0)}g</div>
              <div style={{ fontSize:9, color:C.sub, marginTop:1, textTransform:"uppercase", letterSpacing:0.7 }}>{k}</div>
            </div>
          ))}
        </div>
        <div style={{ display:"flex", flexDirection:"column", gap:7 }}>
          {["protein","carbs","fat","fiber"].map(k=>(
            <MicroBar key={k} label={MACRO_META[k].label} val={totals[k]||0} goal={MACRO_META[k].goal} unit={MACRO_META[k].unit} color={MACRO_META[k].color} onClick={()=>setMacroDetail(k)}/>
          ))}
        </div>
      </div>

      {/* macro breakdown modal */}
      {macroDetail&&(
        <Modal open={true} onClose={()=>setMacroDetail(null)} title={`${MACRO_META[macroDetail].label} breakdown`}>
          <div style={{ marginBottom:14, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
            <span style={{ fontSize:12, color:C.sub }}>Total</span>
            <span style={{ fontSize:20, fontWeight:800, color:MACRO_META[macroDetail].color, fontFamily:"monospace" }}>{Math.round(totals[macroDetail]||0)}{MACRO_META[macroDetail].unit}</span>
          </div>
          {macroBreakdown(macroDetail).length===0&&<div style={{ color:C.muted, fontSize:13, textAlign:"center", padding:20 }}>Nothing logged yet.</div>}
          {macroBreakdown(macroDetail).map((e,i)=>(
            <div key={i} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"10px 0", borderBottom:`1px solid ${C.border}` }}>
              <div>
                <div style={{ fontSize:13, fontWeight:600, color:C.text }}>{e.name}</div>
                <div style={{ fontSize:11, color:C.sub }}>{e.qty}{e.unit}</div>
              </div>
              <div style={{ textAlign:"right" }}>
                <div style={{ fontSize:13, fontWeight:700, color:MACRO_META[macroDetail].color, fontFamily:"monospace" }}>{Math.round(e.val*10)/10}{MACRO_META[macroDetail].unit}</div>
                <div style={{ fontSize:10, color:C.muted }}>{Math.round(e.val/(totals[macroDetail]||1)*100)}%</div>
              </div>
            </div>
          ))}
        </Modal>
      )}

      {/* micros */}
      <div style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:14, padding:16 }}>
        <div style={{ fontSize:11, fontWeight:700, color:C.sub, textTransform:"uppercase", letterSpacing:1, marginBottom:10 }}>Micronutrients <span style={{ color:C.muted, fontSize:10, fontWeight:400 }}>tap to see breakdown</span></div>
        <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
          {["sodium","sugar","calcium","iron","vitaminC","vitaminD"].map(k=>(
            <MicroBar key={k} label={MACRO_META[k].label} val={totals[k]||0} goal={MACRO_META[k].goal} unit={MACRO_META[k].unit} color={MACRO_META[k].color} onClick={()=>setMacroDetail(k)}/>
          ))}
        </div>
      </div>

      {isToday&&<Supplements/>}

      {/* food log */}
      {viewLog.length>0&&(
        <div style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:14, padding:14 }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
            <div style={{ fontSize:11, fontWeight:700, color:C.sub, textTransform:"uppercase", letterSpacing:1 }}>{isToday?"Today's":"That day's"} food</div>
            <button onClick={()=>setShowAll(p=>!p)} style={{ background:"none", border:"none", color:C.sub, fontSize:11, cursor:"pointer" }}>{showAll?"▲ less":`▼ all ${viewLog.length}`}</button>
          </div>
          {(showAll?viewLog:viewLog.slice(-5)).map((e,vi)=>{
            const sliceStart = Math.max(0, viewLog.length-5);
            const ri=showAll?vi:sliceStart+vi;
            return (
              <div key={vi} style={{ padding:"8px 0", borderBottom:vi<(showAll?viewLog:viewLog.slice(-5)).length-1?`1px solid ${C.border}`:"none" }}>
                {editIdx===ri?(
                  <div style={{ display:"flex", gap:8, alignItems:"center" }}>
                    <span style={{ fontSize:12, color:C.text, flex:1 }}>{e.name}</span>
                    <input type="number" value={editQty} onChange={x=>setEditQty(x.target.value)} placeholder={String(e.qty)}
                      style={{ width:60, background:C.bg, border:`1px solid ${C.accent}`, borderRadius:6, padding:"4px 8px", color:C.text, fontSize:12, outline:"none" }}/>
                    <span style={{ fontSize:11, color:C.sub }}>{e.unit}</span>
                    <button onClick={()=>{
                      const newQ=+editQty||e.qty; const r=newQ/(e.qty||1);
                      onEdit(ri,{...e,qty:newQ,cal:(e.cal||0)*r,protein:(e.protein||0)*r,carbs:(e.carbs||0)*r,fat:(e.fat||0)*r,fiber:(e.fiber||0)*r,sodium:(e.sodium||0)*r,sugar:(e.sugar||0)*r,calcium:(e.calcium||0)*r,iron:(e.iron||0)*r,vitaminC:(e.vitaminC||0)*r,vitaminD:(e.vitaminD||0)*r});
                      setEditIdx(null);
                    }} style={{ background:C.green, border:"none", borderRadius:6, color:C.bg, fontWeight:700, fontSize:11, cursor:"pointer", padding:"4px 8px" }}>✓</button>
                    <button onClick={()=>setEditIdx(null)} style={{ background:"none", border:"none", color:C.muted, cursor:"pointer", fontSize:14 }}>×</button>
                  </div>
                ):(
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                    <div>
                      <div style={{ fontSize:13, fontWeight:600, color:C.text }}>{e.name}</div>
                      <div style={{ fontSize:11, color:C.sub }}>{e.qty}{e.unit}{e.meal?` · ${e.meal}`:""} · P:{Math.round(e.protein||0)}g C:{Math.round(e.carbs||0)}g F:{Math.round(e.fat||0)}g</div>
                    </div>
                    <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                      <span style={{ fontSize:13, fontWeight:700, color:C.accent, fontFamily:"monospace" }}>{Math.round(e.cal)}</span>
                      <button onClick={()=>{setEditIdx(ri);setEditQty("");}} style={{ background:"none", border:"none", color:C.sub, cursor:"pointer", fontSize:13 }}>✏️</button>
                      <button onClick={()=>onRemove(ri)} style={{ background:"none", border:"none", color:C.muted, cursor:"pointer", fontSize:18, lineHeight:1 }}>×</button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function QuickTrack({ icon, label, value, goal, color, unit, onSave, subValue }) {
  const [edit, setEdit] = useState(false);
  const [draft, setDraft] = useState("");
  const pct = Math.min(value/goal,1);
  return (
    <div style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:14, padding:14 }}>
      <div style={{ fontSize:11, color:C.sub, textTransform:"uppercase", letterSpacing:1, marginBottom:5, fontWeight:700 }}>{icon} {label}</div>
      <div style={{ fontSize:22, fontWeight:800, color, fontFamily:"monospace" }}>{value.toLocaleString()}</div>
      <div style={{ fontSize:10, color:C.muted, marginBottom:subValue?2:8 }}>/ {goal.toLocaleString()} {unit}</div>
      {subValue&&<div style={{ fontSize:11, color:C.green, marginBottom:8, fontWeight:700 }}>≈ {subValue} kcal burned</div>}
      <div style={{ height:4, background:C.border, borderRadius:99, marginBottom:10 }}>
        <div style={{ height:4, width:`${pct*100}%`, background:color, borderRadius:99, transition:"width 0.5s" }}/>
      </div>
      {edit?(
        <div style={{ display:"flex", gap:6 }}>
          <input type="number" value={draft} onChange={e=>setDraft(e.target.value)} placeholder={String(value)}
            style={{ flex:1, width:0, background:C.bg, border:`1px solid ${color}`, borderRadius:6, padding:"5px 8px", color:C.text, fontSize:12, outline:"none", fontFamily:"inherit" }}/>
          <button onClick={()=>{if(draft!=="")onSave(+draft);setEdit(false);setDraft("");}}
            style={{ background:color, border:"none", borderRadius:6, color:C.bg, fontWeight:700, fontSize:12, cursor:"pointer", padding:"5px 10px" }}>✓</button>
        </div>
      ):(
        <button onClick={()=>{setDraft("");setEdit(true);}}
          style={{ background:color+"22", border:`1px solid ${color}44`, borderRadius:6, color, fontSize:11, fontWeight:700, cursor:"pointer", padding:"5px 10px", width:"100%" }}>
          + Update
        </button>
      )}
    </div>
  );
}

// ── CHAT LOG ──────────────────────────────────────────────────────────────────
const CHAT_SYSTEM = `You are a nutrition tracking assistant. Tone: dry, calm, deadpan. Like a coach who has seen everything — you give accurate numbers without drama. No exclamation points. No gen-Z slang. No hype. State facts. Mild dry humor occasionally. Be brief.

CRITICAL: When someone logs food, you MUST respond with EXACTLY this format — one short sentence, then a JSON block:

Your comment here (one sentence, dry, factual).
\`\`\`json
{"action":"log","items":[{"name":"food name","qty":100,"unit":"g","meal":"Lunch","cal":200,"protein":10,"carbs":20,"fat":5,"fiber":2,"sodium":100,"sugar":2,"calcium":0,"iron":0,"vitaminC":0,"vitaminD":0,"unknown":false}],"unknownItems":[],"totalCal":200,"message":"your comment here"}
\`\`\`

When removing food:
\`\`\`json
{"action":"remove","name":"exact food name","message":"removed."}
\`\`\`

Rules:
- ALWAYS output the json block when food is mentioned. Never skip it.
- For unknown items (things you cannot estimate), set unknown:true and list in unknownItems
- Indian food: use standard values for dal, roti, rice, sabzi, chai etc. State assumption if estimating.
- Sodium/calcium/iron in mg. VitaminD in mcg. Everything else in g.
- For conversational questions (no food logging), just answer in plain text. No JSON.
- The message field and your comment should be the same dry one-liner.`;

function ChatLog({ ingredients, recipes, viewLog, viewDate, goals, onAdd, onRemoveByName, onUpdateByName, onSaveFood, onNavigate, onSaveIng }) {
  const [messages, setMessages] = useState(()=>load(`ft_chat_${viewDate}`,[{role:"assistant", content:`what did you eat? or ask me anything about today's remaining macros.`}]));
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [pendingItems, setPendingItems] = useState(null);
  const [loggedMsg, setLoggedMsg] = useState("");
  const [meal, setMeal] = useState("Lunch");
  const bottomRef = useRef();

  useEffect(()=>{ save(`ft_chat_${viewDate}`, messages); }, [messages, viewDate]);
  useEffect(()=>{ bottomRef.current?.scrollIntoView({behavior:"smooth"}); }, [messages, loading]);

  function buildContext() {
    const cal = viewLog.reduce((a,e)=>a+(e.cal||0),0);
    return `Date being logged: ${viewDate}. Eaten so far: ${Math.round(cal)} kcal. Remaining: ${Math.round(goals.cal-cal)} kcal. Goal: ${goals.cal} kcal, protein: ${goals.protein}g, carbs: ${goals.carbs}g, fat: ${goals.fat}g. Current meal: ${meal}. Saved foods: ${ingredients.map(i=>i.name).join(", ")||"none"}.`;
  }

  async function send() {
    if (!input.trim()||loading) return;
    const userMsg = input.trim();
    setInput("");
    const newMessages = [...messages, {role:"user", content:userMsg}];
    setMessages(newMessages);
    setLoading(true);
    try {
      const apiMessages = newMessages.map(m=>({role:m.role, content:m.content}));
      apiMessages[apiMessages.length-1].content = `[Context: ${buildContext()}]\n\n${userMsg}`;
      const raw = await callAI(apiMessages, CHAT_SYSTEM);
      // Extract JSON — try multiple formats Gemini might use
      let parsed = null;
      // Try ```json ... ``` block
      const m1 = raw.match(/```json\s*([\s\S]*?)```/);
      // Try ``` ... ``` block
      const m2 = raw.match(/```\s*([\s\S]*?)```/);
      // Try bare { ... } starting with action or items
      const m3 = raw.match(/\{\s*"action"[\s\S]*\}/);
      const m3b = raw.match(/\{\s*"items"[\s\S]*\}/);

      const jsonStr = m1?.[1] || m2?.[1] || m3?.[0] || m3b?.[0];

      if (jsonStr) {
        try { parsed = JSON.parse(jsonStr.trim()); } catch(e) {
          // try to fix truncated JSON
          try { parsed = JSON.parse(jsonStr.trim() + '"}]}'); } catch {}
        }
      }

      // Clean display text — remove ALL json artifacts
      let displayText = raw
        .replace(/```json[\s\S]*?```/gs, "")
        .replace(/```[\s\S]*?```/gs, "")
        .replace(/<JSON>[\s\S]*?<\/JSON>/g, "")
        .replace(/\{\s*"action"[\s\S]*/, "")
        .replace(/\{\s*"items"[\s\S]*/, "")
        .replace(/Here are the estimated[^.]*\./i, "")
        .trim();

      if (parsed?.message?.trim()) displayText = parsed.message;
      if (!displayText || displayText.length < 2) displayText = "noted.";
      setMessages(p=>[...p, {role:"assistant", content:displayText, parsed}]);
      if (parsed?.action==="log" && parsed?.items?.length) {
        const known = parsed.items.filter(i=>!i.unknown).map(i=>({...i,meal}));
        if (known.length>0) setPendingItems(known);
      }
      if (parsed?.action==="remove" && parsed?.name) {
        onRemoveByName(parsed.name);
        setMessages(p=>[...p.slice(0,-1), {...p[p.length-1], content:`removed ${parsed.name} from the log.`}]);
      }
      if (parsed?.action==="update" && parsed?.name) {
        onUpdateByName(parsed.name, parsed.newQty, parsed.newUnit);
        setMessages(p=>[...p.slice(0,-1), {...p[p.length-1], content:parsed.message||"updated."}]);
      }
      if (parsed?.action==="saveFood" && parsed?.food) {
        onSaveFood(parsed.food);
        setMessages(p=>[...p.slice(0,-1), {...p[p.length-1], content:parsed.message||"saved to library."}]);
      }
      if (parsed?.action==="navigate" && parsed?.tab) {
        onNavigate(parsed.tab);
        setMessages(p=>[...p.slice(0,-1), {...p[p.length-1], content:parsed.message||`opening ${parsed.tab}.`}]);
      }
    } catch(e) {
      setMessages(p=>[...p, {role:"assistant", content:`error: ${e.message?.slice(0,80)}`}]);
    }
    setLoading(false);
  }

  function confirmLog() {
    if (!pendingItems) return;
    onAdd(pendingItems);
    setLoggedMsg(`logged ${pendingItems.length} item${pendingItems.length>1?"s":""}.`);
    setPendingItems(null);
    setTimeout(()=>setLoggedMsg(""),3000);
  }

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:0, height:"calc(100vh - 200px)", minHeight:400 }}>
      <div style={{ display:"flex", gap:8, marginBottom:10, alignItems:"center" }}>
        <Sel value={meal} onChange={e=>setMeal(e.target.value)} style={{ flex:1, padding:"8px 12px", fontSize:12 }}>
          {MEALS.map(m=><option key={m}>{m}</option>)}
        </Sel>
        <div style={{ fontSize:11, color:C.sub, whiteSpace:"nowrap" }}>{Math.round(goals.cal-(viewLog.reduce((a,e)=>a+(e.cal||0),0)))} kcal left</div>
      </div>

      <div style={{ flex:1, overflowY:"auto", display:"flex", flexDirection:"column", gap:10, paddingBottom:8 }}>
        {messages.map((m,i)=>(
          <div key={i} style={{ display:"flex", justifyContent:m.role==="user"?"flex-end":"flex-start" }}>
            <div style={{ maxWidth:"85%", padding:"10px 14px", borderRadius:m.role==="user"?"14px 14px 4px 14px":"14px 14px 14px 4px", background:m.role==="user"?C.accent:C.card, color:m.role==="user"?C.bg:C.text, fontSize:13, lineHeight:1.5, border:m.role==="assistant"?`1px solid ${C.border}`:"none" }}>
              {m.content}
              {m.parsed?.items?.filter(x=>!x.unknown).length>0&&(
                <div style={{ marginTop:10, paddingTop:10, borderTop:`1px solid ${C.border}` }}>
                  {m.parsed.items.filter(x=>!x.unknown).map((item,j)=>(
                    <div key={j} style={{ fontSize:11, color:C.sub, marginBottom:3 }}>
                      <span style={{ color:C.text, fontWeight:600 }}>{item.name}</span> {item.qty}{item.unit} — <span style={{ color:C.accent }}>{Math.round(item.cal)} kcal</span> · P:{Math.round(item.protein||0)}g C:{Math.round(item.carbs||0)}g
                    </div>
                  ))}
                  <div style={{ fontSize:12, fontWeight:700, color:C.accent, marginTop:4 }}>total: {Math.round(m.parsed.totalCal||0)} kcal</div>
                </div>
              )}
              {m.parsed?.unknownItems?.length>0&&(
                <div style={{ marginTop:8, padding:"8px 10px", background:"#f9731618", borderRadius:8, fontSize:11, color:C.orange }}>
                  what is "{m.parsed.unknownItems.join(", ")}"? add it to the library first.
                </div>
              )}
            </div>
          </div>
        ))}
        {loading&&(
          <div style={{ display:"flex", justifyContent:"flex-start" }}>
            <div style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:"14px 14px 14px 4px", padding:"12px 16px", fontSize:13, color:C.sub, opacity:0.7 }}>...</div>
          </div>
        )}
        {pendingItems&&(
          <div style={{ background:C.greenDim, border:`1px solid ${C.green}44`, borderRadius:12, padding:12 }} className="pop">
            <div style={{ fontSize:12, color:C.green, fontWeight:700, marginBottom:8 }}>log {pendingItems.length} item{pendingItems.length>1?"s":""}?</div>
            <div style={{ display:"flex", gap:8 }}>
              <Btn variant="green" onClick={confirmLog} style={{ flex:1, padding:"8px" }}>confirm</Btn>
              <Btn variant="ghost" onClick={()=>setPendingItems(null)} style={{ flex:1, padding:"8px" }}>skip</Btn>
            </div>
          </div>
        )}
        {loggedMsg&&(
          <div style={{ background:C.greenDim, border:`1px solid ${C.green}44`, borderRadius:10, padding:"10px 14px", fontSize:13, color:C.green, fontWeight:700, textAlign:"center" }} className="pop">{loggedMsg}</div>
        )}
        <div ref={bottomRef}/>
      </div>

      <div style={{ display:"flex", gap:8, paddingTop:10, borderTop:`1px solid ${C.border}` }}>
        <input value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>e.key==="Enter"&&!e.shiftKey&&send()}
          placeholder="100g rice, 2 eggs, tuna bowl... or 'remove the rice'"
          style={{ flex:1, background:C.card, border:`1px solid ${C.border}`, borderRadius:12, padding:"12px 16px", color:C.text, fontSize:13, outline:"none", fontFamily:"inherit" }}/>
        <button onClick={send} disabled={loading||!input.trim()}
          style={{ background:loading||!input.trim()?C.muted:C.accent, border:"none", borderRadius:12, color:C.bg, fontWeight:800, fontSize:13, cursor:loading||!input.trim()?"not-allowed":"pointer", padding:"12px 18px", fontFamily:"inherit", transition:"background 0.2s" }}>
          {loading?"...":"send"}
        </button>
      </div>
      <div style={{ display:"flex", gap:6, marginTop:8, flexWrap:"wrap" }}>
        {["what did i eat today?","i have 300 cals left, what fits?","remove last entry"].map(p=>(
          <button key={p} onClick={()=>setInput(p)} style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:20, padding:"5px 12px", fontSize:10, color:C.sub, cursor:"pointer", fontFamily:"inherit" }}>{p}</button>
        ))}
      </div>
    </div>
  );
}

// ── MY MENU ───────────────────────────────────────────────────────────────────
function MenuTab({ pantry, onAddToLog, remainingCal }) {
  const [filter, setFilter] = useState("all");
  const [summerOnly, setSummerOnly] = useState(false);
  const [selected, setSelected] = useState(null);
  const [qty, setQty] = useState(1);
  const [meal, setMeal] = useState("Lunch");
  const [canMakeOnly, setCanMakeOnly] = useState(false);
  const [fitsCalBudget, setFitsCalBudget] = useState(false);

  const canMake = (dish) => {
    if (pantry.length === 0) return true;
    return dish.ingredients.some(ing =>
      pantry.some(p => ing.toLowerCase().includes(p.toLowerCase()))
    );
  };

  const filtered = MY_MENU.filter(d => {
    if (summerOnly && !d.summer) return false;
    if (canMakeOnly && !canMake(d)) return false;
    if (fitsCalBudget && Math.round((d.cal[0]+d.cal[1])/2) > (remainingCal||9999)) return false;
    if (filter !== "all" && d.category !== filter) return false;
    return true;
  });

  function logDish(dish) {
    const avgCal = Math.round((dish.cal[0]+dish.cal[1])/2);
    const avgProt = Math.round((dish.protein[0]+dish.protein[1])/2);
    const avgCarbs = Math.round((dish.carbs[0]+dish.carbs[1])/2);
    const avgFat = Math.round((dish.fat[0]+dish.fat[1])/2);
    const avgFiber = Math.round((dish.fiber[0]+dish.fiber[1])/2);
    onAddToLog({ name:dish.name, qty:qty, unit:dish.servingNote, meal, cal:avgCal*qty, protein:avgProt*qty, carbs:avgCarbs*qty, fat:avgFat*qty, fiber:avgFiber*qty, sodium:0, sugar:0, calcium:0, iron:0, vitaminC:0, vitaminD:0 });
    setSelected(null);
  }

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
      {/* filters */}
      <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
        <button onClick={()=>setSummerOnly(p=>!p)} style={{ background:summerOnly?C.orange+"22":"transparent", border:`1px solid ${summerOnly?C.orange:C.border}`, borderRadius:20, padding:"5px 12px", fontSize:11, color:summerOnly?C.orange:C.sub, cursor:"pointer", fontFamily:"inherit", fontWeight:700 }}>☀️ Summer only</button>
        <button onClick={()=>setCanMakeOnly(p=>!p)} style={{ background:canMakeOnly?C.green+"22":"transparent", border:`1px solid ${canMakeOnly?C.green:C.border}`, borderRadius:20, padding:"5px 12px", fontSize:11, color:canMakeOnly?C.green:C.sub, cursor:"pointer", fontFamily:"inherit", fontWeight:700 }}>🧑‍🍳 Can make now</button>
        <button onClick={()=>setFitsCalBudget(p=>!p)} style={{ background:fitsCalBudget?C.accent+"22":"transparent", border:`1px solid ${fitsCalBudget?C.accent:C.border}`, borderRadius:20, padding:"5px 12px", fontSize:11, color:fitsCalBudget?C.accent:C.sub, cursor:"pointer", fontFamily:"inherit", fontWeight:700 }}>⚡ Fits my budget</button>
      </div>
      <div style={{ display:"flex", gap:4, overflowX:"auto", scrollbarWidth:"none" }}>
        {[["all","All"],["breakfast","Breakfast"],["protein-meals","Protein"],["mains","Mains"],["snacks","Snacks"],["drinks","Drinks"],["treats","Treats"]].map(([id,label])=>(
          <button key={id} onClick={()=>setFilter(id)} style={{ background:filter===id?C.accent:"transparent", color:filter===id?C.bg:C.sub, border:`1px solid ${filter===id?C.accent:C.border}`, borderRadius:8, padding:"5px 12px", fontSize:11, fontWeight:700, cursor:"pointer", whiteSpace:"nowrap", fontFamily:"inherit", flexShrink:0 }}>{label}</button>
        ))}
      </div>

      {/* dish grid */}
      {filtered.length===0&&<div style={{ textAlign:"center", color:C.muted, fontSize:13, padding:30 }}>no dishes match that filter</div>}
      {filtered.map(dish=>(
        <div key={dish.id} onClick={()=>setSelected(dish)} style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:14, padding:14, cursor:"pointer" }}
          onMouseEnter={e=>e.currentTarget.style.borderColor=C.accent+"66"}
          onMouseLeave={e=>e.currentTarget.style.borderColor=C.border}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
            <div>
              <div style={{ fontSize:15, fontWeight:700, color:C.text }}>{dish.emoji} {dish.name}</div>
              <div style={{ fontSize:12, fontWeight:800, color:C.accent, fontFamily:"monospace", marginTop:2 }}>{Math.round((dish.cal[0]+dish.cal[1])/2)} kcal <span style={{ fontSize:10, color:C.sub, fontWeight:400 }}>avg · P:{dish.protein[0]}–{dish.protein[1]}g · {dish.cookTime}</span></div>
            </div>
            <div style={{ display:"flex", gap:4, flexWrap:"wrap", justifyContent:"flex-end" }}>
              {dish.summer&&<span style={{ background:C.orange+"22", color:C.orange, border:`1px solid ${C.orange}33`, borderRadius:6, padding:"2px 7px", fontSize:9, fontWeight:700 }}>☀️ summer</span>}
              {dish.tags.includes("high-protein")&&<span style={{ background:C.blue+"22", color:C.blue, border:`1px solid ${C.blue}33`, borderRadius:6, padding:"2px 7px", fontSize:9, fontWeight:700 }}>💪 protein</span>}
              {dish.tags.includes("no-cook")&&<span style={{ background:C.green+"22", color:C.green, border:`1px solid ${C.green}33`, borderRadius:6, padding:"2px 7px", fontSize:9, fontWeight:700 }}>no cook</span>}
            </div>
          </div>
        </div>
      ))}

      {/* dish detail modal */}
      {selected&&(
        <Modal open={true} onClose={()=>setSelected(null)} title={`${selected.emoji} ${selected.name}`}>
          <div style={{ display:"flex", gap:6, marginBottom:14 }}>
            <Pill label="kcal" value={`${selected.cal[0]}–${selected.cal[1]}`} color={C.accent}/>
            <Pill label="protein" value={`${selected.protein[0]}–${selected.protein[1]}g`} color={C.blue}/>
            <Pill label="carbs" value={`${selected.carbs[0]}–${selected.carbs[1]}g`} color={C.green}/>
            <Pill label="fat" value={`${selected.fat[0]}–${selected.fat[1]}g`} color={C.pink}/>
          </div>
          <div style={{ background:C.surface, borderRadius:10, padding:14, marginBottom:14 }}>
            <div style={{ fontSize:11, fontWeight:700, color:C.sub, textTransform:"uppercase", letterSpacing:1, marginBottom:8 }}>Ingredients</div>
            {selected.ingredients.map((ing,i)=>(
              <div key={i} style={{ fontSize:12, color:C.sub, padding:"4px 0", borderBottom:i<selected.ingredients.length-1?`1px solid ${C.border}`:"none" }}>· {ing}</div>
            ))}
          </div>
          <div style={{ background:C.surface, borderRadius:10, padding:14, marginBottom:16 }}>
            <div style={{ fontSize:11, fontWeight:700, color:C.sub, textTransform:"uppercase", letterSpacing:1, marginBottom:8 }}>How to make it</div>
            <div style={{ fontSize:13, color:C.text, lineHeight:1.7 }}>{selected.recipe}</div>
          </div>
          <div style={{ display:"flex", gap:8, marginBottom:12 }}>
            <Input label="Servings" type="number" value={qty} onChange={e=>setQty(+e.target.value||1)} style={{ flex:1 }}/>
            <Sel label="Meal" value={meal} onChange={e=>setMeal(e.target.value)} style={{ flex:1 }}>
              {MEALS.map(m=><option key={m}>{m}</option>)}
            </Sel>
          </div>
          <Btn variant="accent" full onClick={()=>logDish(selected)}>Log this — {Math.round((selected.cal[0]+selected.cal[1])/2)*qty} kcal avg</Btn>
        </Modal>
      )}
    </div>
  );
}

// ── WEEKLY PLANNER ────────────────────────────────────────────────────────────
function Planner({ goals, log, recipes, onLogMeal }) {
  const [plan, setPlan] = useState(()=>load("ft_plan",{}));
  const [generating, setGenerating] = useState(false); // eslint-disable-line no-unused-vars
  const [showShopping, setShowShopping] = useState(false);
  const [swapDay, setSwapDay] = useState(null);
  const [swapMeal, setSwapMeal] = useState(null);
  const savePlan = v=>{ setPlan(v); save("ft_plan",v); };

  const DAYS = Array.from({length:7},(_,i)=>{
    const d = new Date(); d.setDate(d.getDate()-d.getDay()+i+1);
    return { key:d.toISOString().split("T")[0], label:d.toLocaleDateString("en-IN",{weekday:"short",day:"numeric"}) };
  });

  function autoGenerate() {
    const customMeals = (recipes||[]).map(r=>({ name:r.name, category:"mains", cal:[r.cal||0, r.cal||0] }));
    const allMenu = [...MY_MENU, ...customMeals];
    const bf = allMenu.filter(d=>d.category==="breakfast");
    const protein = allMenu.filter(d=>d.category==="protein-meals");
    const mains = allMenu.filter(d=>["mains","protein-meals"].includes(d.category));
    const bfPick = (i) => bf[i % bf.length]?.name || "Overnight Oats";
    const lunchPick = (i) => protein[i % protein.length]?.name || "Tuna Yoghurt Bowl";
    const dinnerPick = (i) => mains[i % mains.length]?.name || "Rice + Chicken";
    const newPlan = {};
    DAYS.forEach((day, i) => {
      newPlan[day.key] = {
        breakfast: bfPick(i),
        lunch: lunchPick(i),
        dinner: dinnerPick(i),
      };
    });
    savePlan(newPlan);
  }

  // shopping list from plan
  const shoppingList = useMemo(()=>{
    const ingMap = {};
    Object.values(plan).forEach(dayMeals=>{
      Object.values(dayMeals).forEach(dishName=>{
        const dish = MY_MENU.find(d=>d.name===dishName);
        if (dish) dish.ingredients.forEach(ing=>{
          const key = ing.split("(")[0].trim().toLowerCase();
          if (!ingMap[key]) ingMap[key] = { name:ing.split("(")[0].trim(), count:0 };
          ingMap[key].count++;
        });
      });
    });
    return Object.values(ingMap).sort((a,b)=>b.count-a.count);
  }, [plan]);

  function getDish(name) { return MY_MENU.find(d=>d.name===name); }

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
      <div style={{ display:"flex", gap:8 }}>
        <Btn variant="accent" onClick={autoGenerate} disabled={generating} style={{ flex:1 }}>
          {generating?"generating...":"✨ Auto-generate week"}
        </Btn>
        {Object.keys(plan).length>0&&<Btn variant="flat" onClick={()=>setShowShopping(true)}>🛒 Shopping list</Btn>}
      </div>

      {DAYS.map(day=>{
        const dayPlan = plan[day.key]||{};
        const logged = (log[day.key]||[]).length > 0;
        return (
          <div key={day.key} style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:14, padding:14 }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
              <div style={{ fontSize:13, fontWeight:700, color:C.text }}>{day.label}</div>
              {logged&&<span style={{ fontSize:10, color:C.green, fontWeight:700 }}>✓ logged</span>}
            </div>
            {["breakfast","lunch","dinner"].map(mealType=>{
              const dishName = dayPlan[mealType];
              const dish = dishName?getDish(dishName):null;
              return (
                <div key={mealType} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"7px 0", borderBottom:`1px solid ${C.border}` }}>
                  <div>
                    <div style={{ fontSize:10, color:C.sub, textTransform:"uppercase", letterSpacing:1 }}>{mealType}</div>
                    <div style={{ fontSize:13, color:dish?C.text:C.muted, marginTop:2 }}>{dishName||"not planned"}</div>
                    {dish&&<div style={{ fontSize:10, color:C.sub }}>{Math.round((dish.cal[0]+dish.cal[1])/2)} kcal avg</div>}
                  </div>
                  <div style={{ display:"flex", gap:6 }}>
                    {dish&&<button onClick={()=>onLogMeal({name:dish.name,qty:1,unit:dish.servingNote,meal:mealType,cal:Math.round((dish.cal[0]+dish.cal[1])/2),protein:Math.round((dish.protein[0]+dish.protein[1])/2),carbs:Math.round((dish.carbs[0]+dish.carbs[1])/2),fat:Math.round((dish.fat[0]+dish.fat[1])/2),fiber:Math.round((dish.fiber[0]+dish.fiber[1])/2),sodium:0,sugar:0,calcium:0,iron:0,vitaminC:0,vitaminD:0})}
                      style={{ background:C.green+"22", border:`1px solid ${C.green}44`, borderRadius:6, color:C.green, fontSize:11, fontWeight:700, cursor:"pointer", padding:"4px 10px" }}>+ log</button>}
                    <button onClick={()=>{setSwapDay(day.key);setSwapMeal(mealType);}}
                      style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:6, color:C.sub, fontSize:11, cursor:"pointer", padding:"4px 10px" }}>swap</button>
                  </div>
                </div>
              );
            })}
          </div>
        );
      })}

      {/* swap modal */}
      {swapDay&&(
        <Modal open={true} onClose={()=>{setSwapDay(null);setSwapMeal(null);}} title={`Pick ${swapMeal} for ${swapDay}`}>
          <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
            {MY_MENU.filter(d=>swapMeal==="breakfast"?["breakfast","snacks"].includes(d.category):["mains","protein-meals","treats"].includes(d.category)).map(dish=>(
              <div key={dish.id} onClick={()=>{ savePlan({...plan,[swapDay]:{...(plan[swapDay]||{}),[swapMeal]:dish.name}}); setSwapDay(null); setSwapMeal(null); }}
                style={{ padding:"10px 12px", background:C.surface, borderRadius:10, cursor:"pointer", display:"flex", justifyContent:"space-between" }}
                onMouseEnter={e=>e.currentTarget.style.background=C.card}
                onMouseLeave={e=>e.currentTarget.style.background=C.surface}>
                <span style={{ fontSize:13, color:C.text }}>{dish.emoji} {dish.name}</span>
                <span style={{ fontSize:11, color:C.sub }}>{Math.round((dish.cal[0]+dish.cal[1])/2)} kcal</span>
              </div>
            ))}
          </div>
        </Modal>
      )}

      {/* shopping list modal */}
      {showShopping&&(
        <Modal open={true} onClose={()=>setShowShopping(false)} title="🛒 Shopping List">
          <div style={{ fontSize:12, color:C.sub, marginBottom:14 }}>Based on your weekly plan — {shoppingList.length} items</div>
          {shoppingList.map((item,i)=>(
            <div key={i} style={{ display:"flex", justifyContent:"space-between", padding:"8px 0", borderBottom:`1px solid ${C.border}`, fontSize:13 }}>
              <span style={{ color:C.text }}>{item.name}</span>
              <span style={{ color:C.sub, fontSize:11 }}>{item.count}x this week</span>
            </div>
          ))}
        </Modal>
      )}
    </div>
  );
}

// ── SCAN LABEL ────────────────────────────────────────────────────────────────
function ScanLabel({ ingredients, onSave }) {
  const [preview, setPreview] = useState(null);
  const [imageB64, setImageB64] = useState(null);
  const [scanning, setScanning] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [saved, setSaved] = useState(false);
  const [editing, setEditing] = useState(false);
  const [aiQuery, setAiQuery] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const fileRef = useRef();

  function handleFile(file) {
    if(!file) return;
    const reader = new FileReader();
    reader.onload = e=>{ setPreview(e.target.result); setImageB64(e.target.result.split(",")[1]); setResult(null); setSaved(false); setError(null); setEditing(false); };
    reader.readAsDataURL(file);
  }

  async function scanLabel() {
    if(!imageB64) return;
    setScanning(true); setError(null);
    try {
      const key = process.env.REACT_APP_ANTHROPIC_KEY;
      const resp = await fetch("https://api.anthropic.com/v1/messages",{
        method:"POST", headers:{"Content-Type":"application/json","x-api-key":key,"anthropic-version":"2023-06-01","anthropic-dangerous-allow-browser":"true"},
        body:JSON.stringify({ model:"claude-sonnet-4-20250514", max_tokens:800,
          messages:[{role:"user",content:[
            {type:"image",source:{type:"base64",media_type:"image/jpeg",data:imageB64}},
            {type:"text",text:`Read this nutrition label. Return ONLY raw JSON:
{"name":"product name","servingSize":number,"servingUnit":"g/ml/piece","cal":number,"protein":number,"carbs":number,"fat":number,"fiber":number,"sodium":number,"sugar":number,"saturatedFat":number,"cholesterol":number,"potassium":number,"calcium":number,"iron":number,"vitaminC":number,"vitaminD":number}
All numbers. sodium/calcium/iron/potassium in mg. vitaminD in mcg. others in g. Use 0 if not visible.`}
          ]}]
        })
      });
      const data = await resp.json();
      const text = data.content?.find(b=>b.type==="text")?.text||"";
      setResult(JSON.parse(text.replace(/```json|```/g,"").trim()));
    } catch { setError("couldn't read it. try better lighting, no glare, full panel in frame."); }
    finally { setScanning(false); }
  }

  async function lookupAI() {
    if (!aiQuery.trim()) return;
    setAiLoading(true); setError(null);
    try {
      const text = await callAI([{role:"user",content:`Nutrition info for: ${aiQuery}. Return ONLY raw JSON:
{"name":"food name","servingSize":number,"servingUnit":"g or piece or ml","cal":number,"protein":number,"carbs":number,"fat":number,"fiber":number,"sodium":number,"sugar":number,"calcium":number,"iron":number,"vitaminC":number,"vitaminD":number}
Use standard USDA/FSSAI values. All numbers. sodium/calcium/iron in mg. vitaminD in mcg. others in g.`}],
        "Return only JSON. No explanation.");
      setResult(JSON.parse(text.replace(/```json|```/g,"").trim()));
      setPreview(null); setImageB64(null);
    } catch { setError("couldn't find that. try being more specific."); }
    finally { setAiLoading(false); }
  }

  const fields=[["cal","Calories"],["protein","Protein (g)"],["carbs","Carbs (g)"],["fat","Fat (g)"],["fiber","Fiber (g)"],["sodium","Sodium (mg)"],["sugar","Sugar (g)"],["saturatedFat","Sat. Fat (g)"],["cholesterol","Cholesterol (mg)"],["potassium","Potassium (mg)"],["calcium","Calcium (mg)"],["iron","Iron (mg)"],["vitaminC","Vit C (mg)"],["vitaminD","Vit D (mcg)"]];

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
      <div style={{ background:C.card, border:`1px solid ${C.accent}44`, borderRadius:14, padding:16 }}>
        <div style={{ fontSize:11, fontWeight:700, color:C.accent, textTransform:"uppercase", letterSpacing:1, marginBottom:8 }}>🤖 Ask AI — no label needed</div>
        <div style={{ fontSize:12, color:C.sub, marginBottom:10 }}>Type anything — "150g cooked white rice", "1 medium banana", "50g raw potato"</div>
        <div style={{ display:"flex", gap:8 }}>
          <input value={aiQuery} onChange={e=>setAiQuery(e.target.value)} onKeyDown={e=>e.key==="Enter"&&lookupAI()}
            placeholder="150g cooked basmati rice..."
            style={{ flex:1, background:C.bg, border:`1px solid ${C.border}`, borderRadius:8, padding:"10px 13px", color:C.text, fontSize:13, outline:"none", fontFamily:"inherit" }}/>
          <button onClick={lookupAI} disabled={aiLoading||!aiQuery.trim()}
            style={{ background:aiLoading?C.muted:C.accent, border:"none", borderRadius:8, color:C.bg, fontWeight:700, fontSize:13, cursor:"pointer", padding:"10px 16px" }}>
            {aiLoading?"...":"Look up"}
          </button>
        </div>
      </div>

      <div style={{ background:C.card, border:`2px dashed ${preview?C.accent+"55":C.border}`, borderRadius:16, padding:preview?14:24, textAlign:"center" }}>
        {preview?(
          <>
            <img src={preview} alt="label" style={{ maxWidth:"100%", maxHeight:180, borderRadius:10, objectFit:"contain", marginBottom:10 }}/>
            <div style={{ display:"flex", gap:8, justifyContent:"center" }}>
              <Btn onClick={()=>{setPreview(null);setImageB64(null);setResult(null);setSaved(false);}} variant="ghost">Remove</Btn>
              <Btn onClick={()=>fileRef.current?.click()} variant="flat">Change</Btn>
            </div>
          </>
        ):(
          <>
            <div style={{ fontSize:36, marginBottom:8 }}>📷</div>
            <div style={{ fontSize:14, fontWeight:700, color:C.text, marginBottom:4 }}>Scan a nutrition label</div>
            <div style={{ fontSize:12, color:C.sub, marginBottom:14 }}>Packaged food, supplements, protein powder</div>
            <Btn variant="accent" onClick={()=>fileRef.current?.click()}>Upload / Take Photo</Btn>
          </>
        )}
        <input ref={fileRef} type="file" accept="image/*" style={{ display:"none" }} onChange={e=>handleFile(e.target.files[0])}/>
      </div>

      {imageB64&&!result&&!scanning&&<Btn variant="accent" full onClick={scanLabel}>🔍 Scan & Extract</Btn>}
      {(scanning||aiLoading)&&<div style={{ background:C.accentDim, border:`1px solid ${C.accent}44`, borderRadius:10, padding:14, textAlign:"center", color:C.accent, fontSize:13 }}>reading...</div>}
      {error&&<div style={{ background:"#ef444420", border:"1px solid #ef444438", borderRadius:10, padding:14, color:"#f87171", fontSize:13 }}>{error}</div>}

      {result&&(
        <div style={{ background:C.card, border:`1px solid ${C.green}44`, borderRadius:16, padding:16 }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:12 }}>
            <div>
              {editing?<Input value={result.name} onChange={e=>setResult(p=>({...p,name:e.target.value}))} style={{ marginBottom:4 }}/>:<div style={{ fontSize:15, fontWeight:800, color:C.text }}>{result.name}</div>}
              <div style={{ fontSize:11, color:C.sub, marginTop:3 }}>Per {result.servingSize}{result.servingUnit}</div>
            </div>
            <span style={{ background:C.greenDim, color:C.green, borderRadius:6, padding:"3px 10px", fontSize:11, fontWeight:700 }}>got it ✓</span>
          </div>
          <div style={{ display:"flex", gap:6, marginBottom:10 }}>
            <Pill label="kcal" value={result.cal} color={C.accent}/>
            <Pill label="protein" value={`${result.protein}g`} color={C.blue}/>
            <Pill label="carbs" value={`${result.carbs}g`} color={C.green}/>
            <Pill label="fat" value={`${result.fat}g`} color={C.pink}/>
          </div>
          {editing?(
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginBottom:10 }}>
              {fields.map(([k,l])=><Input key={k} label={l} type="number" value={result[k]||0} onChange={e=>setResult(p=>({...p,[k]:+e.target.value}))}/>)}
            </div>
          ):(
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:5, marginBottom:10 }}>
              {fields.filter(([k])=>result[k]>0).map(([k,l])=>(
                <div key={k} style={{ display:"flex", justifyContent:"space-between", background:C.surface, borderRadius:7, padding:"6px 10px" }}>
                  <span style={{ fontSize:11, color:C.sub }}>{l.split(" (")[0]}</span>
                  <span style={{ fontSize:11, color:C.text, fontFamily:"monospace" }}>{result[k]}</span>
                </div>
              ))}
            </div>
          )}
          <div style={{ display:"flex", gap:8 }}>
            <Btn variant="flat" onClick={()=>setEditing(p=>!p)} style={{ flex:1 }}>{editing?"✓ done":"✏️ edit"}</Btn>
            {!saved&&<Btn variant="green" onClick={()=>{ onSave([...ingredients,{...result,id:Date.now()}]); setSaved(true); }} style={{ flex:1 }}>save to library</Btn>}
          </div>
          {saved&&<div style={{ marginTop:8, background:C.greenDim, borderRadius:8, padding:10, textAlign:"center", color:C.green, fontSize:13, fontWeight:700 }}>saved. go log it in 💬 Log.</div>}
        </div>
      )}
    </div>
  );
}

// ── LIBRARY ───────────────────────────────────────────────────────────────────
function Library({ ingredients, recipes, onSaveIng, onSaveRec }) {
  const [view, setView] = useState("ingredients");
  const [showAddIng, setShowAddIng] = useState(false);
  const [showAddRec, setShowAddRec] = useState(false);
  const [selectedRec, setSelectedRec] = useState(null);
  const [ingF, setIngF] = useState({name:"",servingSize:100,servingUnit:"g",cal:"",protein:"",carbs:"",fat:"",fiber:"",sodium:"",sugar:"",calcium:"",iron:"",vitaminC:"",vitaminD:""});
  const [recF, setRecF] = useState({name:"",yield:1,yieldUnit:"serving",steps:"",recIngredients:[{name:"",qty:"",unit:"g",cal:"",protein:"",carbs:"",fat:"",fiber:"",sodium:""}]});
  const [extracting, setExtracting] = useState(false);
  const [recipeImg, setRecipeImg] = useState(null);
  const [recipeImgB64, setRecipeImgB64] = useState(null);
  const recipeFileRef = useRef();

  function saveIng() {
    if(!ingF.name) return;
    const n={...ingF,id:Date.now()};
    ["servingSize","cal","protein","carbs","fat","fiber","sodium","sugar","calcium","iron","vitaminC","vitaminD"].forEach(k=>n[k]=+(n[k]||0));
    onSaveIng([...ingredients,n]);
    setIngF({name:"",servingSize:100,servingUnit:"g",cal:"",protein:"",carbs:"",fat:"",fiber:"",sodium:"",sugar:"",calcium:"",iron:"",vitaminC:"",vitaminD:""});
    setShowAddIng(false);
  }

  function calcRecipeMacros(ings) {
    return ings.reduce((a,i)=>({
      cal: a.cal+(+i.cal||0), protein: a.protein+(+i.protein||0),
      carbs: a.carbs+(+i.carbs||0), fat: a.fat+(+i.fat||0),
      fiber: a.fiber+(+i.fiber||0), sodium: a.sodium+(+i.sodium||0),
    }), {cal:0,protein:0,carbs:0,fat:0,fiber:0,sodium:0});
  }

  function saveRecipe() {
    if(!recF.name) return;
    const total = calcRecipeMacros(recF.recIngredients);
    const perServing = Object.fromEntries(Object.entries(total).map(([k,v])=>[k, Math.round((v/(+recF.yield||1))*10)/10]));
    const rec = { id:Date.now(), name:recF.name, yield:+recF.yield||1, yieldUnit:recF.yieldUnit, steps:recF.steps, ingredients:recF.recIngredients, totalMacros:total, servingUnit:recF.yieldUnit, ...perServing };
    onSaveRec([...recipes, rec]);
    setRecF({name:"",yield:1,yieldUnit:"serving",steps:"",recIngredients:[{name:"",qty:"",unit:"g",cal:"",protein:"",carbs:"",fat:"",fiber:"",sodium:""}]});
    setShowAddRec(false);
  }

  function addRecIngredient() {
    setRecF(p=>({...p, recIngredients:[...p.recIngredients, {name:"",qty:"",unit:"g",cal:"",protein:"",carbs:"",fat:"",fiber:"",sodium:""}]}));
  }

  function updateRecIng(i, field, val) {
    setRecF(p=>{ const ings=[...p.recIngredients]; ings[i]={...ings[i],[field]:val}; return {...p,recIngredients:ings}; });
  }

  function removeRecIng(i) {
    setRecF(p=>({...p, recIngredients:p.recIngredients.filter((_,idx)=>idx!==i)}));
  }

  async function extractFromImage() {
    if (!recipeImgB64) return;
    setExtracting(true);
    try {
      const key = process.env.REACT_APP_ANTHROPIC_KEY;
      const resp = await fetch("https://api.anthropic.com/v1/messages", {
        method:"POST",
        headers:{"Content-Type":"application/json","x-api-key":key,"anthropic-version":"2023-06-01","anthropic-dangerous-allow-browser":"true"},
        body: JSON.stringify({
          model:"claude-sonnet-4-20250514", max_tokens:1500,
          messages:[{role:"user", content:[
            {type:"image", source:{type:"base64", media_type:"image/jpeg", data:recipeImgB64}},
            {type:"text", text:`Extract this recipe. Return ONLY raw JSON:
{"name":"recipe name","yield":4,"yieldUnit":"serving","steps":"step by step instructions as a single string","ingredients":[{"name":"ingredient name","qty":100,"unit":"g","cal":200,"protein":5,"carbs":30,"fat":3,"fiber":2,"sodium":100}]}
Estimate macros per ingredient quantity shown. All numbers. No markdown.`}
          ]}]
        })
      });
      const data = await resp.json();
      const text = data.content?.find(b=>b.type==="text")?.text||"";
      const parsed = JSON.parse(text.replace(/```json|```/g,"").trim());
      setRecF({
        name: parsed.name||"",
        yield: parsed.yield||1,
        yieldUnit: parsed.yieldUnit||"serving",
        steps: parsed.steps||"",
        recIngredients: (parsed.ingredients||[]).map(i=>({name:i.name||"",qty:String(i.qty||""),unit:i.unit||"g",cal:String(i.cal||""),protein:String(i.protein||""),carbs:String(i.carbs||""),fat:String(i.fat||""),fiber:String(i.fiber||""),sodium:String(i.sodium||"")}))
      });
      setShowAddRec(true);
    } catch(e) { alert("Couldn't extract recipe. Try a clearer photo."); }
    setExtracting(false);
  }

  const recTotals = calcRecipeMacros(recF.recIngredients);
  const recPerServing = Object.fromEntries(Object.entries(recTotals).map(([k,v])=>[k, Math.round((v/(+recF.yield||1))*10)/10]));

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
      <div style={{ display:"flex", gap:8 }}>
        <Btn variant={view==="ingredients"?"accent":"ghost"} onClick={()=>setView("ingredients")}>🧂 Saved Foods ({ingredients.length})</Btn>
        <Btn variant={view==="recipes"?"accent":"ghost"} onClick={()=>setView("recipes")}>📖 Cookbook ({recipes.length})</Btn>
      </div>

      {view==="ingredients"&&(
        <>
          <Btn variant="flat" full onClick={()=>setShowAddIng(true)}>+ Add Food Manually</Btn>
          {ingredients.length===0&&<div style={{ textAlign:"center", color:C.muted, fontSize:13, padding:28 }}>empty. scan a label or add manually.</div>}
          {ingredients.map(ing=>(
            <div key={ing.id} style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:12, padding:14 }}>
              <div style={{ display:"flex", justifyContent:"space-between" }}>
                <div>
                  <div style={{ fontSize:14, fontWeight:700, color:C.text }}>{ing.name}</div>
                  <div style={{ fontSize:11, color:C.sub }}>Per {ing.servingSize}{ing.servingUnit} · {ing.cal} kcal · P:{ing.protein}g C:{ing.carbs}g F:{ing.fat}g</div>
                </div>
                <button onClick={()=>onSaveIng(ingredients.filter(i=>i.id!==ing.id))} style={{ background:"none", border:"none", color:C.muted, cursor:"pointer", fontSize:18 }}>🗑</button>
              </div>
            </div>
          ))}
        </>
      )}

      {view==="recipes"&&(
        <>
          {/* upload recipe photo */}
          <div style={{ background:C.card, border:`1px solid ${C.accent}33`, borderRadius:14, padding:14 }}>
            <div style={{ fontSize:11, fontWeight:700, color:C.accent, textTransform:"uppercase", letterSpacing:1, marginBottom:8 }}>📸 Extract from photo</div>
            <div style={{ fontSize:12, color:C.sub, marginBottom:10 }}>Screenshot a recipe from anywhere — we'll pull all the ingredients and steps automatically.</div>
            <div style={{ display:"flex", gap:8 }}>
              <button onClick={()=>recipeFileRef.current?.click()} style={{ flex:1, background:C.surface, border:`1px solid ${C.border}`, borderRadius:8, color:C.sub, fontSize:12, padding:"9px 0", cursor:"pointer" }}>
                {recipeImg?"📷 Change photo":"📷 Upload recipe photo"}
              </button>
              {recipeImg&&<button onClick={extractFromImage} disabled={extracting} style={{ flex:1, background:extracting?C.muted:C.accent, border:"none", borderRadius:8, color:C.bg, fontSize:12, fontWeight:700, padding:"9px 0", cursor:"pointer" }}>
                {extracting?"extracting...":"✨ Extract"}
              </button>}
            </div>
            {recipeImg&&<img src={recipeImg} alt="recipe" style={{ width:"100%", maxHeight:120, objectFit:"cover", borderRadius:8, marginTop:8 }}/>}
            <input ref={recipeFileRef} type="file" accept="image/*" style={{ display:"none" }} onChange={e=>{ const f=e.target.files[0]; if(!f) return; const r=new FileReader(); r.onload=ev=>{ setRecipeImg(ev.target.result); setRecipeImgB64(ev.target.result.split(",")[1]); }; r.readAsDataURL(f); }}/>
          </div>

          <Btn variant="flat" full onClick={()=>setShowAddRec(true)}>+ Build Recipe Manually</Btn>

          {recipes.length===0&&<div style={{ textAlign:"center", color:C.muted, fontSize:13, padding:28 }}>no recipes yet. build one or upload a photo.</div>}
          {recipes.map(rec=>(
            <div key={rec.id} onClick={()=>setSelectedRec(rec)} style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:12, padding:14, cursor:"pointer" }}
              onMouseEnter={e=>e.currentTarget.style.borderColor=C.accent+"66"}
              onMouseLeave={e=>e.currentTarget.style.borderColor=C.border}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
                <div>
                  <div style={{ fontSize:14, fontWeight:700, color:C.text }}>📖 {rec.name}</div>
                  <div style={{ fontSize:12, color:C.accent, fontWeight:700, marginTop:2 }}>{Math.round(rec.cal||0)} kcal <span style={{ color:C.sub, fontWeight:400, fontSize:11 }}>per {rec.yieldUnit||"serving"} · P:{Math.round(rec.protein||0)}g C:{Math.round(rec.carbs||0)}g F:{Math.round(rec.fat||0)}g</span></div>
                  <div style={{ fontSize:11, color:C.sub, marginTop:2 }}>yields {rec.yield} {rec.yieldUnit}{rec.yield>1?"s":""} · {(rec.ingredients||[]).length} ingredients</div>
                </div>
                <button onClick={e=>{e.stopPropagation();onSaveRec(recipes.filter(r=>r.id!==rec.id));}} style={{ background:"none", border:"none", color:C.muted, cursor:"pointer", fontSize:18 }}>🗑</button>
              </div>
            </div>
          ))}
        </>
      )}

      {/* recipe detail modal */}
      {selectedRec&&(
        <Modal open={true} onClose={()=>setSelectedRec(null)} title={`📖 ${selectedRec.name}`}>
          <div style={{ display:"flex", gap:6, marginBottom:14 }}>
            <Pill label="kcal" value={Math.round(selectedRec.cal||0)} color={C.accent}/>
            <Pill label="protein" value={`${Math.round(selectedRec.protein||0)}g`} color={C.blue}/>
            <Pill label="carbs" value={`${Math.round(selectedRec.carbs||0)}g`} color={C.green}/>
            <Pill label="fat" value={`${Math.round(selectedRec.fat||0)}g`} color={C.pink}/>
          </div>
          <div style={{ fontSize:12, color:C.sub, marginBottom:14 }}>per {selectedRec.yieldUnit} · yields {selectedRec.yield} {selectedRec.yieldUnit}s</div>
          {(selectedRec.ingredients||[]).length>0&&(
            <div style={{ background:C.surface, borderRadius:10, padding:12, marginBottom:12 }}>
              <div style={{ fontSize:11, fontWeight:700, color:C.sub, textTransform:"uppercase", letterSpacing:1, marginBottom:8 }}>Ingredients</div>
              {selectedRec.ingredients.map((ing,i)=>(
                <div key={i} style={{ display:"flex", justifyContent:"space-between", padding:"5px 0", borderBottom:`1px solid ${C.border}`, fontSize:12 }}>
                  <span style={{ color:C.text }}>{ing.name}</span>
                  <span style={{ color:C.sub }}>{ing.qty}{ing.unit} · {ing.cal} kcal</span>
                </div>
              ))}
            </div>
          )}
          {selectedRec.steps&&(
            <div style={{ background:C.surface, borderRadius:10, padding:12 }}>
              <div style={{ fontSize:11, fontWeight:700, color:C.sub, textTransform:"uppercase", letterSpacing:1, marginBottom:8 }}>Method</div>
              <div style={{ fontSize:13, color:C.text, lineHeight:1.7, whiteSpace:"pre-wrap" }}>{selectedRec.steps}</div>
            </div>
          )}
        </Modal>
      )}

      {/* add/edit recipe modal */}
      <Modal open={showAddRec} onClose={()=>setShowAddRec(false)} title="Build Recipe">
        <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
          <Input label="Recipe name" value={recF.name} onChange={e=>setRecF(p=>({...p,name:e.target.value}))} placeholder="e.g. Dal Tadka"/>
          <div style={{ display:"flex", gap:8 }}>
            <Input label="Yields" type="number" value={recF.yield} onChange={e=>setRecF(p=>({...p,yield:e.target.value}))} style={{ flex:1 }}/>
            <Sel label="Unit" value={recF.yieldUnit} onChange={e=>setRecF(p=>({...p,yieldUnit:e.target.value}))} style={{ flex:1 }}>
              {["serving","bowl","cup","piece","katori","roti","slice"].map(u=><option key={u}>{u}</option>)}
            </Sel>
          </div>

          <div style={{ fontSize:11, fontWeight:700, color:C.sub, textTransform:"uppercase", letterSpacing:1, marginTop:4 }}>Ingredients</div>
          {recF.recIngredients.map((ing,i)=>(
            <div key={i} style={{ background:C.surface, borderRadius:10, padding:10 }}>
              <div style={{ display:"flex", gap:6, marginBottom:6, alignItems:"center" }}>
                <input value={ing.name} onChange={e=>updateRecIng(i,"name",e.target.value)} placeholder="Ingredient name"
                  style={{ flex:2, background:C.bg, border:`1px solid ${C.border}`, borderRadius:6, padding:"7px 10px", color:C.text, fontSize:12, outline:"none", fontFamily:"inherit" }}/>
                <input type="number" value={ing.qty} onChange={e=>updateRecIng(i,"qty",e.target.value)} placeholder="qty"
                  style={{ flex:1, background:C.bg, border:`1px solid ${C.border}`, borderRadius:6, padding:"7px 8px", color:C.text, fontSize:12, outline:"none", fontFamily:"inherit" }}/>
                <select value={ing.unit} onChange={e=>updateRecIng(i,"unit",e.target.value)}
                  style={{ flex:1, background:C.bg, border:`1px solid ${C.border}`, borderRadius:6, padding:"7px 6px", color:C.text, fontSize:11, outline:"none" }}>
                  {UNITS.map(u=><option key={u}>{u}</option>)}
                </select>
                <button onClick={()=>removeRecIng(i)} style={{ background:"none", border:"none", color:C.muted, cursor:"pointer", fontSize:16 }}>×</button>
              </div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr 1fr", gap:4 }}>
                {[["cal","kcal"],["protein","P"],["carbs","C"],["fat","F"]].map(([k,l])=>(
                  <input key={k} type="number" value={ing[k]} onChange={e=>updateRecIng(i,k,e.target.value)} placeholder={l}
                    style={{ background:C.bg, border:`1px solid ${C.border}`, borderRadius:5, padding:"5px 6px", color:C.text, fontSize:11, outline:"none", fontFamily:"monospace", textAlign:"center" }}/>
                ))}
              </div>
            </div>
          ))}
          <Btn variant="flat" onClick={addRecIngredient}>+ Add ingredient</Btn>

          {/* live macro calc */}
          <div style={{ background:C.greenDim, border:`1px solid ${C.green}33`, borderRadius:10, padding:12 }}>
            <div style={{ fontSize:11, color:C.green, fontWeight:700, marginBottom:6 }}>Total · Per {recF.yieldUnit}</div>
            <div style={{ display:"flex", gap:8 }}>
              {[["kcal","cal"],["P","protein"],["C","carbs"],["F","fat"]].map(([l,k])=>(
                <div key={k} style={{ flex:1, textAlign:"center" }}>
                  <div style={{ fontSize:13, fontWeight:800, color:C.green, fontFamily:"monospace" }}>{Math.round(recTotals[k])}</div>
                  <div style={{ fontSize:9, color:C.sub }}>{l} total</div>
                  <div style={{ fontSize:11, fontWeight:700, color:C.accent, fontFamily:"monospace" }}>{recPerServing[k]}</div>
                  <div style={{ fontSize:9, color:C.muted }}>per {recF.yieldUnit}</div>
                </div>
              ))}
            </div>
          </div>

          <div style={{ fontSize:11, fontWeight:700, color:C.sub, textTransform:"uppercase", letterSpacing:1 }}>Steps (optional)</div>
          <textarea value={recF.steps} onChange={e=>setRecF(p=>({...p,steps:e.target.value}))} placeholder="Step 1: Boil water...&#10;Step 2: Add dal..."
            style={{ background:C.bg, border:`1px solid ${C.border}`, borderRadius:8, padding:"10px 12px", color:C.text, fontSize:13, outline:"none", fontFamily:"inherit", minHeight:100, resize:"vertical" }}/>

          <Btn variant="accent" full onClick={saveRecipe}>Save Recipe</Btn>
        </div>
      </Modal>

      <Modal open={showAddIng} onClose={()=>setShowAddIng(false)} title="Add Food">
        <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
          <Input label="Name" value={ingF.name} onChange={e=>setIngF(p=>({...p,name:e.target.value}))} placeholder="e.g. Amul Full Cream Milk"/>
          <div style={{ display:"flex", gap:8 }}>
            <Input label="Serving size" type="number" value={ingF.servingSize} onChange={e=>setIngF(p=>({...p,servingSize:e.target.value}))} style={{ flex:1 }}/>
            <Sel label="Unit" value={ingF.servingUnit} onChange={e=>setIngF(p=>({...p,servingUnit:e.target.value}))} style={{ flex:1 }}>
              {UNITS.map(u=><option key={u}>{u}</option>)}
            </Sel>
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
            {[["cal","Calories"],["protein","Protein (g)"],["carbs","Carbs (g)"],["fat","Fat (g)"],["fiber","Fiber (g)"],["sodium","Sodium (mg)"],["sugar","Sugar (g)"],["calcium","Calcium (mg)"],["iron","Iron (mg)"],["vitaminC","Vit C (mg)"],["vitaminD","Vit D (mcg)"]].map(([k,l])=>(
              <Input key={k} label={l} type="number" value={ingF[k]} onChange={e=>setIngF(p=>({...p,[k]:e.target.value}))} placeholder="0"/>
            ))}
          </div>
          <Btn variant="accent" full onClick={saveIng}>Save</Btn>
        </div>
      </Modal>
    </div>
  );
}

// ── FAT LOSS ──────────────────────────────────────────────────────────────────
function FatLoss({ log, goals, tdee, baseline, profile, weights, onSaveWeights }) {
  const [showWeightLog, setShowWeightLog] = useState(false);
  const [newWeight, setNewWeight] = useState("");
  const allDays = Object.keys(log).sort();
  const reference = tdee || +(baseline.currentCals) || goals.cal;

  const dayData = useMemo(()=>allDays.map(day=>{
    const cal=(log[day]||[]).reduce((a,e)=>a+(e.cal||0),0);
    const deficit=reference-cal;
    return {day,cal,deficit,fatG:deficit>0?deficit/FAT_KCAL:0};
  }),[log,reference,allDays]);

  const totalDeficit=dayData.reduce((a,d)=>a+Math.max(d.deficit,0),0);
  const totalFatG=totalDeficit/FAT_KCAL;
  const butterPacks=(totalFatG/100).toFixed(1);
  let streak=0;
  for(const d of [...dayData].sort((a,b)=>b.day.localeCompare(a.day))){ if(d.deficit>0)streak++; else break; }
  const last7Fat=dayData.slice(-7).reduce((a,d)=>a+d.fatG,0);
  const last30Fat=dayData.slice(-30).reduce((a,d)=>a+d.fatG,0);
  const bmi=profile.weight&&profile.height?+(profile.weight/Math.pow(profile.height/100,2)).toFixed(1):null;

  // weekly weight entries
  const weightEntries = Object.entries(weights).sort((a,b)=>a[0].localeCompare(b[0]));

  function saveWeight() {
    if (!newWeight) return;
    const today = dateStr(0);
    onSaveWeights({...weights,[today]:+newWeight});
    setNewWeight(""); setShowWeightLog(false);
  }

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
      <div style={{ background:`linear-gradient(135deg,${C.green}18,${C.accent}0a)`, border:`1px solid ${C.green}30`, borderRadius:18, padding:20 }}>
        <div style={{ fontSize:11, color:C.green, textTransform:"uppercase", letterSpacing:1.5, fontWeight:700, marginBottom:6 }}>total estimated fat burned</div>
        <div style={{ fontSize:44, fontWeight:800, color:C.green, fontFamily:"monospace", letterSpacing:-2, lineHeight:1 }}>
          {totalFatG>=1000?<>{(totalFatG/1000).toFixed(2)}<span style={{ fontSize:18 }}> kg</span></>:<>{Math.round(totalFatG)}<span style={{ fontSize:18 }}> g</span></>}
        </div>
        <div style={{ fontSize:12, color:C.sub, marginTop:6 }}>from {Math.round(totalDeficit).toLocaleString()} kcal deficit</div>
        <div style={{ fontSize:11, color:C.sub, marginTop:4 }}>= {butterPacks} packs of butter 🧈</div>
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:10 }}>
        {[{label:"Streak",value:`${streak}d`,color:C.orange,sub:"deficit days"},{label:"This week",value:`${Math.round(last7Fat)}g`,color:C.accent,sub:"fat burned"},{label:"This month",value:`${Math.round(last30Fat)}g`,color:C.blue,sub:"fat burned"}].map(s=>(
          <div key={s.label} style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:12, padding:"12px 10px", textAlign:"center" }}>
            <div style={{ fontSize:10, color:C.sub, marginBottom:4, fontWeight:700 }}>{s.label}</div>
            <div style={{ fontSize:20, fontWeight:800, color:s.color, fontFamily:"monospace" }}>{s.value}</div>
            <div style={{ fontSize:10, color:C.muted }}>{s.sub}</div>
          </div>
        ))}
      </div>

      {/* weight log */}
      <div style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:14, padding:16 }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
          <div style={{ fontSize:11, fontWeight:700, color:C.sub, textTransform:"uppercase", letterSpacing:1 }}>⚖️ Weight Log</div>
          <button onClick={()=>setShowWeightLog(p=>!p)} style={{ background:C.accentDim, border:`1px solid ${C.accent}44`, borderRadius:7, color:C.accent, fontSize:12, fontWeight:700, cursor:"pointer", padding:"5px 12px" }}>+ Log weight</button>
        </div>
        {showWeightLog&&(
          <div style={{ display:"flex", gap:8, marginBottom:12 }}>
            <input type="number" value={newWeight} onChange={e=>setNewWeight(e.target.value)} placeholder="kg"
              style={{ flex:1, background:C.bg, border:`1px solid ${C.accent}`, borderRadius:8, padding:"9px 12px", color:C.text, fontSize:13, outline:"none", fontFamily:"inherit" }}/>
            <button onClick={saveWeight} style={{ background:C.accent, border:"none", borderRadius:8, color:C.bg, fontWeight:700, fontSize:13, cursor:"pointer", padding:"9px 16px" }}>Save</button>
          </div>
        )}
        {weightEntries.length===0&&<div style={{ color:C.muted, fontSize:12, textAlign:"center", padding:"10px 0" }}>no weight logged yet. weekly check-ins recommended.</div>}
        {weightEntries.slice(-8).reverse().map(([date,kg])=>(
          <div key={date} style={{ display:"flex", justifyContent:"space-between", padding:"8px 0", borderBottom:`1px solid ${C.border}`, fontSize:13 }}>
            <span style={{ color:C.sub }}>{fmtShort(date)}</span>
            <span style={{ color:C.text, fontWeight:700, fontFamily:"monospace" }}>{kg} kg</span>
          </div>
        ))}
        {bmi&&<div style={{ marginTop:10, display:"flex", justifyContent:"space-between", fontSize:12, paddingTop:8, borderTop:`1px solid ${C.border}` }}>
          <span style={{ color:C.sub }}>BMI</span><span style={{ color:C.purple, fontWeight:700 }}>{bmi}</span>
        </div>}
        <div style={{ marginTop:10, padding:10, background:C.accentDim, borderRadius:8, fontSize:11, color:C.sub, lineHeight:1.6 }}>
          1g body fat ≈ 7.7 kcal. Estimates only. Weight moves slowly — the deficit is real even when the scale isn't.
        </div>
      </div>

      <div style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:14, padding:14 }}>
        <div style={{ fontSize:11, fontWeight:700, color:C.sub, textTransform:"uppercase", letterSpacing:1, marginBottom:12 }}>daily deficit log</div>
        {dayData.length===0&&<div style={{ color:C.muted, fontSize:13, textAlign:"center", padding:20 }}>nothing yet.</div>}
        {[...dayData].reverse().slice(0,30).map(d=>(
          <div key={d.day} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"8px 0", borderBottom:`1px solid ${C.border}` }}>
            <div>
              <div style={{ fontSize:12, fontWeight:700, color:C.text }}>{fmtShort(d.day)}</div>
              <div style={{ fontSize:11, color:C.sub }}>{Math.round(d.cal)} kcal</div>
            </div>
            <div style={{ textAlign:"right" }}>
              <div style={{ fontSize:12, fontWeight:700, color:d.deficit>300?C.green:d.deficit>0?C.accent:"#f87171" }}>
                {d.deficit>0?`−${Math.round(d.deficit)}`:`+${Math.round(-d.deficit)}`} kcal
              </div>
              {d.fatG>0&&<div style={{ fontSize:11, color:C.green }}>{d.fatG.toFixed(1)}g fat</div>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── HISTORY ───────────────────────────────────────────────────────────────────
function History({ log, steps, water, goals }) {
  const [range, setRange] = useState("30");
  const [mode, setMode] = useState("timeline");
  const [compareA, setCompareA] = useState("");
  const [compareB, setCompareB] = useState("");
  const allDays = Object.keys(log).sort((a,b)=>b.localeCompare(a));
  const months = useMemo(()=>[...new Set(allDays.map(d=>d.slice(0,7)))].sort((a,b)=>b.localeCompare(a)),[allDays]);
  const filtered = allDays.slice(0,+range);
  function monthStats(prefix) {
    return allDays.filter(d=>d.startsWith(prefix)).reduce((a,day)=>{
      const cal=(log[day]||[]).reduce((s,e)=>s+(e.cal||0),0);
      return {...a,totalCal:a.totalCal+cal,days:a.days+1,totalSteps:a.totalSteps+(steps[day]||0),totalProtein:a.totalProtein+(log[day]||[]).reduce((s,e)=>s+(e.protein||0),0)};
    },{totalCal:0,days:0,totalSteps:0,totalProtein:0});
  }
  function fmtMonth(m){if(!m)return"";const[y,mo]=m.split("-");return new Date(+y,+mo-1).toLocaleDateString("en-IN",{month:"long",year:"numeric"});}
  const statA=compareA?monthStats(compareA):null;
  const statB=compareB?monthStats(compareB):null;
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
      <div style={{ display:"flex", gap:8 }}>
        <Btn variant={mode==="timeline"?"accent":"ghost"} onClick={()=>setMode("timeline")}>📅 Timeline</Btn>
        <Btn variant={mode==="compare"?"accent":"ghost"} onClick={()=>setMode("compare")}>⚖️ Compare</Btn>
      </div>
      {mode==="timeline"&&(
        <>
          <Sel label="Show last" value={range} onChange={e=>setRange(e.target.value)}>
            <option value="7">7 days</option><option value="30">30 days</option>
            <option value="90">90 days</option><option value="365">1 year</option>
            <option value="9999">All time</option>
          </Sel>
          {allDays.length===0&&<div style={{ textAlign:"center", color:C.muted, fontSize:13, padding:40 }}>nothing logged yet.</div>}
          {filtered.map(day=>{
            const cal=(log[day]||[]).reduce((a,e)=>a+(e.cal||0),0);
            const s=steps[day]||0,w=water[day]||0,over=cal>goals.cal;
            return (
              <div key={day} style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:12, padding:14 }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:6 }}>
                  <div style={{ fontSize:13, fontWeight:700, color:C.text }}>{fmtDate(day)}</div>
                  <div style={{ fontSize:13, fontFamily:"monospace", color:over?"#f87171":C.accent, fontWeight:700 }}>{Math.round(cal)} kcal</div>
                </div>
                <div style={{ height:4, background:C.border, borderRadius:99, marginBottom:8 }}>
                  <div style={{ height:4, width:`${Math.min(cal/goals.cal*100,100)}%`, background:over?"#f87171":C.accent, borderRadius:99 }}/>
                </div>
                <div style={{ display:"flex", gap:14, fontSize:11, color:C.sub }}>
                  <span>👟 {s.toLocaleString()}</span><span>💧 {w}g</span><span>🍽 {(log[day]||[]).length} items</span>
                </div>
              </div>
            );
          })}
        </>
      )}
      {mode==="compare"&&(
        <>
          <div style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:14, padding:14 }}>
            <div style={{ fontSize:11, fontWeight:700, color:C.sub, textTransform:"uppercase", letterSpacing:1, marginBottom:12 }}>compare two months</div>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
              <Sel label="Month A" value={compareA} onChange={e=>setCompareA(e.target.value)}>
                <option value="">Select…</option>{months.map(m=><option key={m} value={m}>{fmtMonth(m)}</option>)}
              </Sel>
              <Sel label="Month B" value={compareB} onChange={e=>setCompareB(e.target.value)}>
                <option value="">Select…</option>{months.map(m=><option key={m} value={m}>{fmtMonth(m)}</option>)}
              </Sel>
            </div>
          </div>
          {statA&&statB&&(
            <div style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:14, padding:14 }}>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:4, marginBottom:12 }}>
                <div style={{ fontSize:13, fontWeight:800, color:C.accent, textAlign:"center" }}>{fmtMonth(compareA)}</div>
                <div style={{ fontSize:13, fontWeight:800, color:C.blue, textAlign:"center" }}>{fmtMonth(compareB)}</div>
              </div>
              {[
                {label:"Days logged",a:statA.days,b:statB.days,fmt:v=>v},
                {label:"Avg calories",a:statA.days?Math.round(statA.totalCal/statA.days):0,b:statB.days?Math.round(statB.totalCal/statB.days):0,fmt:v=>`${v} kcal`,lowerBetter:true},
                {label:"Avg steps",a:statA.days?Math.round(statA.totalSteps/statA.days):0,b:statB.days?Math.round(statB.totalSteps/statB.days):0,fmt:v=>v.toLocaleString()},
                {label:"Avg protein",a:statA.days?Math.round(statA.totalProtein/statA.days):0,b:statB.days?Math.round(statB.totalProtein/statB.days):0,fmt:v=>`${v}g`},
              ].map(row=>{
                const aWins=row.lowerBetter?row.a<row.b:row.a>row.b;
                return (
                  <div key={row.label} style={{ display:"grid", gridTemplateColumns:"1fr auto 1fr", gap:8, alignItems:"center", padding:"8px 0", borderBottom:`1px solid ${C.border}` }}>
                    <div style={{ fontSize:13, fontWeight:700, color:aWins?C.accent:C.sub, fontFamily:"monospace", textAlign:"right" }}>{row.fmt(row.a)}</div>
                    <div style={{ fontSize:10, color:C.muted, textAlign:"center", width:70 }}>{row.label}</div>
                    <div style={{ fontSize:13, fontWeight:700, color:!aWins?C.blue:C.sub, fontFamily:"monospace" }}>{row.fmt(row.b)}</div>
                  </div>
                );
              })}
            </div>
          )}
          {months.length<2&&<div style={{ textAlign:"center", color:C.muted, fontSize:13, padding:30 }}>need data from 2+ months to compare.</div>}
        </>
      )}
    </div>
  );
}

// ── PROFILE ───────────────────────────────────────────────────────────────────
function Profile({ profile, baseline, goals, bmr, tdee, pantry, onProfile, onBaseline, onGoals, onPantry }) {
  const [gDraft, setGDraft] = useState(goals);
  const [bDraft, setBDraft] = useState(baseline);
  const [goalsOpen, setGoalsOpen] = useState(false);
  const [newPantryItem, setNewPantryItem] = useState("");
  const bmi=profile.weight&&profile.height?+(profile.weight/Math.pow(profile.height/100,2)).toFixed(1):null;
  const bmiLabel=bmi?bmi<18.5?"Underweight":bmi<25?"Normal":bmi<30?"Overweight":"Obese":null;
  const bmiColor=bmi?bmi<18.5?C.blue:bmi<25?C.green:bmi<30?C.orange:"#f87171":C.sub;

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
      <div style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:14, padding:16 }}>
        <div style={{ fontSize:11, fontWeight:700, color:C.sub, textTransform:"uppercase", letterSpacing:1, marginBottom:14 }}>Body Stats</div>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
          <Input label="Weight (kg)" type="number" value={profile.weight} onChange={e=>onProfile("weight",+e.target.value)} placeholder="65"/>
          <Input label="Height (cm)" type="number" value={profile.height} onChange={e=>onProfile("height",+e.target.value)} placeholder="162"/>
          <Input label="Age" type="number" value={profile.age} onChange={e=>onProfile("age",+e.target.value)} placeholder="28"/>
          <Sel label="Sex" value={profile.sex} onChange={e=>onProfile("sex",e.target.value)}>
            <option value="female">Female</option><option value="male">Male</option>
          </Sel>
        </div>
        <div style={{ marginTop:10 }}>
          <Sel label="Activity level" value={profile.activity} onChange={e=>onProfile("activity",e.target.value)}>
            <option value="sedentary">Sedentary</option><option value="light">Light (1–3 days/week)</option>
            <option value="moderate">Moderate (3–5 days/week)</option><option value="active">Active (6–7 days/week)</option>
            <option value="very_active">Very active</option>
          </Sel>
        </div>
        {bmi&&(
          <div style={{ marginTop:14, padding:12, background:bmiColor+"18", border:`1px solid ${bmiColor}30`, borderRadius:10, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
            <div><div style={{ fontSize:11, color:C.sub, marginBottom:2 }}>BMI</div><div style={{ fontSize:24, fontWeight:800, color:bmiColor, fontFamily:"monospace" }}>{bmi}</div></div>
            <div style={{ fontSize:13, color:bmiColor, fontWeight:700 }}>{bmiLabel}</div>
          </div>
        )}
        {bmr>0&&(
          <div style={{ marginTop:12, display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
            <div style={{ background:C.surface, borderRadius:10, padding:12, textAlign:"center" }}>
              <div style={{ fontSize:10, color:C.sub, textTransform:"uppercase", letterSpacing:1, marginBottom:4 }}>BMR</div>
              <div style={{ fontSize:20, fontWeight:800, color:C.purple, fontFamily:"monospace" }}>{bmr}</div>
              <div style={{ fontSize:10, color:C.muted }}>kcal at rest</div>
            </div>
            <div style={{ background:C.surface, borderRadius:10, padding:12, textAlign:"center" }}>
              <div style={{ fontSize:10, color:C.sub, textTransform:"uppercase", letterSpacing:1, marginBottom:4 }}>TDEE</div>
              <div style={{ fontSize:20, fontWeight:800, color:C.accent, fontFamily:"monospace" }}>{tdee}</div>
              <div style={{ fontSize:10, color:C.muted }}>kcal with activity</div>
            </div>
          </div>
        )}
      </div>

      {/* pantry */}
      <div style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:14, padding:16 }}>
        <div style={{ fontSize:11, fontWeight:700, color:C.sub, textTransform:"uppercase", letterSpacing:1, marginBottom:10 }}>🧑‍🍳 What's in my kitchen</div>
        <div style={{ fontSize:12, color:C.sub, marginBottom:12 }}>Add ingredients you currently have. The Menu tab will show what you can make right now.</div>
        <div style={{ display:"flex", gap:8, marginBottom:10 }}>
          <input value={newPantryItem} onChange={e=>setNewPantryItem(e.target.value)}
            onKeyDown={e=>{ if(e.key==="Enter"&&newPantryItem.trim()){ onPantry([...pantry,newPantryItem.trim()]); setNewPantryItem(""); }}}
            placeholder="e.g. eggs, tuna, Greek yoghurt..."
            style={{ flex:1, background:C.bg, border:`1px solid ${C.border}`, borderRadius:8, padding:"9px 12px", color:C.text, fontSize:13, outline:"none", fontFamily:"inherit" }}/>
          <button onClick={()=>{ if(newPantryItem.trim()){ onPantry([...pantry,newPantryItem.trim()]); setNewPantryItem(""); }}}
            style={{ background:C.accent, border:"none", borderRadius:8, color:C.bg, fontWeight:700, fontSize:13, cursor:"pointer", padding:"9px 16px" }}>Add</button>
        </div>
        {pantry.length===0&&<div style={{ color:C.muted, fontSize:12, textAlign:"center", padding:"8px 0" }}>nothing added yet</div>}
        <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
          {pantry.map((item,i)=>(
            <div key={i} style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:20, padding:"5px 12px", fontSize:12, color:C.text, display:"flex", alignItems:"center", gap:6 }}>
              {item}
              <button onClick={()=>onPantry(pantry.filter((_,idx)=>idx!==i))} style={{ background:"none", border:"none", color:C.muted, cursor:"pointer", fontSize:14, lineHeight:1, padding:0 }}>×</button>
            </div>
          ))}
        </div>
      </div>

      <div style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:14, padding:16 }}>
        <div style={{ fontSize:11, fontWeight:700, color:C.sub, textTransform:"uppercase", letterSpacing:1, marginBottom:14 }}>Intake Baseline</div>
        <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
          <Input label="Current avg daily intake (kcal)" type="number" value={bDraft.currentCals} onChange={e=>setBDraft(p=>({...p,currentCals:e.target.value}))} placeholder="e.g. 2200" hint="what you normally eat — used to calc real deficit"/>
          <Input label="Override BMR (optional)" type="number" value={bDraft.bmrOverride} onChange={e=>setBDraft(p=>({...p,bmrOverride:e.target.value}))} placeholder="leave blank to auto-calculate"/>
          <Btn variant="accent" full onClick={()=>onBaseline(bDraft)}>Save</Btn>
        </div>
      </div>

      <div style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:14, padding:16 }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14 }}>
          <div style={{ fontSize:11, fontWeight:700, color:C.sub, textTransform:"uppercase", letterSpacing:1 }}>Daily Goals</div>
          <Btn variant="ghost" onClick={()=>{ setGDraft(goals); setGoalsOpen(true); }} style={{ padding:"6px 12px", fontSize:12 }}>Edit →</Btn>
        </div>
        <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
          {[["Calories",goals.cal,"kcal"],["Protein",goals.protein,"g"],["Carbs",goals.carbs,"g"],["Fat",goals.fat,"g"],["Steps",goals.steps,""],["Water",goals.water,"glasses"]].map(([l,v,u])=>(
            <div key={l} style={{ display:"flex", justifyContent:"space-between", fontSize:13 }}>
              <span style={{ color:C.sub }}>{l}</span><span style={{ color:C.text, fontFamily:"monospace", fontWeight:700 }}>{v} {u}</span>
            </div>
          ))}
        </div>
      </div>

      <Modal open={goalsOpen} onClose={()=>setGoalsOpen(false)} title="Edit Daily Goals">
        <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
            {[["cal","Calories (kcal)"],["protein","Protein (g)"],["carbs","Carbs (g)"],["fat","Fat (g)"],["fiber","Fiber (g)"],["sodium","Sodium (mg)"],["sugar","Sugar (g)"],["calcium","Calcium (mg)"],["iron","Iron (mg)"],["vitaminC","Vit C (mg)"],["vitaminD","Vit D (mcg)"],["steps","Steps"],["water","Water (glasses)"]].map(([k,l])=>(
              <Input key={k} label={l} type="number" value={gDraft[k]} onChange={e=>setGDraft(p=>({...p,[k]:+e.target.value}))}/>
            ))}
          </div>
          <Btn variant="accent" full onClick={()=>{ onGoals(gDraft); setGoalsOpen(false); }}>Save</Btn>
        </div>
      </Modal>
    </div>
  );
}
