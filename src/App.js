import { useState, useRef, useMemo, useEffect } from "react";

const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };
const load = (k, d) => { try { const s = localStorage.getItem(k); return s ? JSON.parse(s) : d; } catch { return d; } };
const todayStr = () => new Date().toISOString().split("T")[0];
const fmtDate = (d) => new Date(d + "T12:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
const fmtShort = (d) => new Date(d + "T12:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short" });
const FAT_KCAL = 7.7;
const MEALS = ["Breakfast", "Lunch", "Dinner", "Snack", "Pre-workout", "Post-workout"];
const UNITS = ["g", "ml", "oz", "serving", "tbsp", "tsp", "cup", "piece", "katori", "roti", "bowl", "slice", "scoop"];

const C = {
  bg: "#070709", surface: "#0f0f15", card: "#141420", border: "#1e1e2e",
  accent: "#c8f04a", accentDim: "#c8f04a14",
  green: "#34d399", greenDim: "#34d39914",
  blue: "#7dd3fc", blueDim: "#7dd3fc14",
  pink: "#f9a8d4", pinkDim: "#f9a8d414",
  orange: "#fdba74", purple: "#c4b5fd", purpleDim: "#c4b5fd14",
  text: "#eeedf5", sub: "#7878a0", muted: "#33334a",
};

// ── micro UI ──────────────────────────────────────────────────────────────────
function Pill({ label, value, color }) {
  return (
    <div style={{ background: color+"18", border:`1px solid ${color}28`, borderRadius:10, padding:"7px 8px", textAlign:"center", flex:1, minWidth:0 }}>
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
  const v = { ghost:{bg:"transparent",color:C.sub,border:`1px solid ${C.border}`}, accent:{bg:C.accent,color:C.bg,border:"none"}, green:{bg:C.green,color:C.bg,border:"none"}, flat:{bg:C.card,color:C.text,border:`1px solid ${C.border}`}, danger:{bg:"#ef444418",color:"#f87171",border:"1px solid #ef444430"}, purple:{bg:C.purple+"22",color:C.purple,border:`1px solid ${C.purple}44`} }[variant];
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
function MicroBar({ label, val, goal, unit, color }) {
  return (
    <div>
      <div style={{ display:"flex", justifyContent:"space-between", marginBottom:3 }}>
        <span style={{ fontSize:12, color:C.sub }}>{label}</span>
        <span style={{ fontSize:12, color:C.text, fontFamily:"monospace" }}>{Math.round((val||0)*10)/10}{unit} <span style={{ color:C.muted }}>/ {goal}{unit}</span></span>
      </div>
      <div style={{ height:4, background:C.border, borderRadius:99 }}>
        <div style={{ height:4, width:`${Math.min((val||0)/goal*100,100)}%`, background:color, borderRadius:99, transition:"width 0.5s" }}/>
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

// ── nutrition math ────────────────────────────────────────────────────────────
const NUTR_KEYS = ["cal","protein","carbs","fat","fiber","sodium","sugar","calcium","iron","vitaminC","vitaminD"];
function scaleNutr(item, qty, baseQty) {
  const r = qty / (baseQty || 100);
  const out = { name:item.name, qty, unit:item.servingUnit||"g" };
  NUTR_KEYS.forEach(k => out[k] = (item[k]||0) * r);
  return out;
}
function sumNutr(entries) {
  return entries.reduce((a,e) => { NUTR_KEYS.forEach(k => a[k]=(a[k]||0)+(e[k]||0)); return a; }, {});
}

// resolve recipe: replace ingredient refs with actual values, scale to yield
function resolveRecipe(recipe, ingredients) {
  const resolved = (recipe.items||[]).map(ri => {
    const ing = ingredients.find(i => i.id === ri.ingId);
    if (!ing) return { ...ri, cal:ri.cal||0, protein:ri.protein||0, carbs:ri.carbs||0, fat:ri.fat||0, fiber:ri.fiber||0, sodium:ri.sodium||0, sugar:ri.sugar||0, calcium:ri.calcium||0, iron:ri.iron||0, vitaminC:ri.vitaminC||0, vitaminD:ri.vitaminD||0 };
    return scaleNutr(ing, ri.qty, ing.servingSize||100);
  });
  const total = sumNutr(resolved);
  const yieldG = recipe.yieldG || 100;
  // per 100g of yield
  const per100 = {};
  NUTR_KEYS.forEach(k => per100[k] = (total[k]||0) / yieldG * 100);
  return { ...recipe, per100, totalNutr: total };
}

// ── BMR ───────────────────────────────────────────────────────────────────────
function calcBMR(p) {
  if (!p.weight||!p.height||!p.age) return 0;
  const base = 10*p.weight + 6.25*p.height - 5*p.age;
  return Math.round(p.sex==="female" ? base-161 : base+5);
}
function calcTDEE(bmr, act) {
  return Math.round(bmr * ({sedentary:1.2,light:1.375,moderate:1.55,active:1.725,very_active:1.9}[act]||1.2));
}

// ── Claude API call ───────────────────────────────────────────────────────────
async function callClaude(messages, system) {
  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method:"POST", headers:{"Content-Type":"application/json"},
    body:JSON.stringify({ model:"claude-sonnet-4-20250514", max_tokens:1500,
      system: system || "You are a helpful assistant.",
      messages })
  });
  const data = await resp.json();
  return data.content?.find(b=>b.type==="text")?.text || "";
}

// ── APP ───────────────────────────────────────────────────────────────────────
export default function App() {
  const [tab, setTab] = useState("today");
  const [profile, setProfile]     = useState(()=>load("ft_profile",{weight:"",height:"",age:"",sex:"female",activity:"moderate"}));
  const [goals, setGoals]         = useState(()=>load("ft_goals",{cal:1500,protein:80,carbs:150,fat:50,fiber:25,sodium:2300,sugar:50,calcium:1000,iron:18,vitaminC:90,vitaminD:20,steps:8000,water:8}));
  const [baseline, setBaseline]   = useState(()=>load("ft_baseline",{currentCals:"",bmrOverride:""}));
  const [ingredients, setIngredients] = useState(()=>load("ft_ing",[]));
  const [recipes, setRecipes]     = useState(()=>load("ft_rec",[]));
  const [log, setLog]             = useState(()=>load("ft_log",{}));
  const [steps, setSteps]         = useState(()=>load("ft_steps",{}));
  const [water, setWater]         = useState(()=>load("ft_water",{}));

  const sp  = (k,v)=>{ const n={...profile,[k]:v}; setProfile(n); save("ft_profile",n); };
  const sG  = v=>{ setGoals(v); save("ft_goals",v); };
  const sB  = v=>{ setBaseline(v); save("ft_baseline",v); };
  const sIng= v=>{ setIngredients(v); save("ft_ing",v); };
  const sRec= v=>{ setRecipes(v); save("ft_rec",v); };
  const sLog= v=>{ setLog(v); save("ft_log",v); };
  const sSt = v=>{ setSteps(v); save("ft_steps",v); };
  const sWat= v=>{ setWater(v); save("ft_water",v); };

  const today = todayStr();
  const todayLog = log[today]||[];
  const totals = sumNutr(todayLog);
  const bmr = baseline.bmrOverride ? +baseline.bmrOverride : calcBMR(profile);
  const tdee = calcTDEE(bmr, profile.activity);

  const tabs=[
    {id:"today",  icon:"⚡", label:"Today"},
    {id:"log",    icon:"💬", label:"Log"},
    {id:"scan",   icon:"📷", label:"Scan"},
    {id:"library",icon:"📦", label:"Library"},
    {id:"fat",    icon:"🔥", label:"Fat Loss"},
    {id:"history",icon:"📈", label:"History"},
    {id:"profile",icon:"👤", label:"Profile"},
  ];

  return (
    <div style={{ background:C.bg, minHeight:"100vh", fontFamily:"'Plus Jakarta Sans','Segoe UI',sans-serif", color:C.text, width:"100%", maxWidth:"clamp(380px, 44vw, 820px)", margin:"0 auto", display:"flex", flexDirection:"column" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;700;800&display=swap');
        *{box-sizing:border-box;margin:0;padding:0;}
        html{font-size:clamp(13px,1.05vw,19px);}
        ::-webkit-scrollbar{width:3px;} ::-webkit-scrollbar-thumb{background:${C.border};border-radius:99px;}
        input[type=number]::-webkit-inner-spin-button{opacity:0;}
        input::placeholder,textarea::placeholder{color:${C.muted};}
        select option{background:${C.surface};}
        @keyframes fu{from{opacity:0;transform:translateY(8px);}to{opacity:1;transform:translateY(0);}}
        .fu{animation:fu 0.28s ease forwards;}
        @keyframes pulse{0%,100%{opacity:1;}50%{opacity:0.5;}} .pulse{animation:pulse 1.8s ease infinite;}
        @keyframes pop{0%{transform:scale(0.8);opacity:0;}100%{transform:scale(1);opacity:1;}} .pop{animation:pop 0.2s ease forwards;}
      `}</style>

      <div style={{ padding:"16px 18px 0", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
        <div>
          <div style={{ fontSize:10, color:C.sub, letterSpacing:2, textTransform:"uppercase" }}>
            {new Date().toLocaleDateString("en-IN",{weekday:"long",day:"numeric",month:"long"})}
          </div>
          <div style={{ fontSize:22, fontWeight:800, letterSpacing:-0.5 }}>Fuel <span style={{ color:C.accent }}>Log</span></div>
        </div>
        <div style={{ display:"flex", gap:8, alignItems:"center" }}>
          <div style={{ textAlign:"right" }}>
            <div style={{ fontSize:18, fontWeight:800, color:C.accent, fontFamily:"monospace" }}>{Math.round(totals.cal||0)}</div>
            <div style={{ fontSize:10, color:C.sub }}>kcal today</div>
          </div>
          <button onClick={()=>setTab("log")} style={{ background:C.accent, border:"none", borderRadius:10, color:C.bg, fontWeight:800, fontSize:12, cursor:"pointer", padding:"8px 14px", fontFamily:"inherit" }}>+ Log</button>
        </div>
      </div>

      <div style={{ display:"flex", padding:"12px 18px 0", gap:4, overflowX:"auto", scrollbarWidth:"none" }}>
        {tabs.map(t=>(
          <button key={t.id} onClick={()=>setTab(t.id)} style={{ background:tab===t.id?C.accent:"transparent", color:tab===t.id?C.bg:C.sub, border:`1px solid ${tab===t.id?C.accent:C.border}`, borderRadius:8, padding:"6px 11px", fontSize:11, fontWeight:700, cursor:"pointer", whiteSpace:"nowrap", letterSpacing:0.3, fontFamily:"inherit", flexShrink:0 }}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      <div style={{ flex:1, padding:"14px 18px 80px", overflowY:"auto" }} className="fu" key={tab}>
        {tab==="today"   && <Today totals={totals} goals={goals} todayLog={todayLog} steps={steps[today]||0} water={water[today]||0} tdee={tdee} onSteps={v=>sSt({...steps,[today]:v})} onWater={v=>sWat({...water,[today]:v})} onRemove={i=>sLog({...log,[today]:todayLog.filter((_,idx)=>idx!==i)})} onEdit={(i,e)=>sLog({...log,[today]:todayLog.map((x,idx)=>idx===i?e:x)})} onGoToLog={()=>setTab("log")}/>}
        {tab==="log"     && <ChatLog ingredients={ingredients} recipes={recipes} todayLog={todayLog} goals={goals} onAdd={e=>sLog({...log,[today]:[...todayLog,...(Array.isArray(e)?e:[e])]})} onSaveIng={sIng} onSaveRec={sRec}/>}
        {tab==="scan"    && <ScanLabel ingredients={ingredients} onSave={sIng}/>}
        {tab==="library" && <Library ingredients={ingredients} recipes={recipes} onSaveIng={sIng} onSaveRec={sRec}/>}
        {tab==="fat"     && <FatLoss log={log} goals={goals} tdee={tdee} baseline={baseline} profile={profile}/>}
        {tab==="history" && <History log={log} steps={steps} water={water} goals={goals}/>}
        {tab==="profile" && <Profile profile={profile} baseline={baseline} goals={goals} bmr={bmr} tdee={tdee} onProfile={sp} onBaseline={sB} onGoals={sG}/>}
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
  const today = todayStr();
  const todayChecked = checked[today]||{};
  const saveSupps = v=>{ setSupps(v); save("ft_supps",v); };
  function toggle(id) { const n={...todayChecked,[id]:!todayChecked[id]}; const nl={...checked,[today]:n}; setChecked(nl); save("ft_supp_log",nl); }
  function addSupp() { if(!newName.trim()) return; saveSupps([...supps,{id:Date.now(),name:newName.trim()}]); setNewName(""); setAdding(false); }
  const doneCount = supps.filter(s=>todayChecked[s.id]).length;
  return (
    <div style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:14, padding:16 }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
        <div>
          <div style={{ fontSize:11, fontWeight:700, color:C.sub, textTransform:"uppercase", letterSpacing:1 }}>💊 Supplements</div>
          {supps.length>0 && <div style={{ fontSize:11, color:doneCount===supps.length?C.green:C.sub, marginTop:2 }}>{doneCount}/{supps.length} taken {doneCount===supps.length?"✓ slaying 💅":""}</div>}
        </div>
        <button onClick={()=>setAdding(p=>!p)} style={{ background:C.accentDim, border:`1px solid ${C.accent}44`, borderRadius:7, color:C.accent, fontSize:12, fontWeight:700, cursor:"pointer", padding:"5px 12px" }}>{adding?"nvm":"+ Add"}</button>
      </div>
      {adding && (
        <div style={{ display:"flex", gap:8, marginBottom:10 }}>
          <input value={newName} onChange={e=>setNewName(e.target.value)} onKeyDown={e=>e.key==="Enter"&&addSupp()} placeholder="D3, Omega 3, B12, whatever..."
            style={{ flex:1, background:C.bg, border:`1px solid ${C.accent}`, borderRadius:8, padding:"9px 12px", color:C.text, fontSize:13, outline:"none", fontFamily:"inherit" }}/>
          <button onClick={addSupp} style={{ background:C.accent, border:"none", borderRadius:8, color:C.bg, fontWeight:700, fontSize:13, cursor:"pointer", padding:"9px 16px" }}>Add</button>
        </div>
      )}
      {supps.length===0&&!adding&&<div style={{ color:C.muted, fontSize:12, textAlign:"center", padding:"10px 0" }}>no supplements yet bestie</div>}
      <div style={{ display:"flex", flexDirection:"column", gap:7 }}>
        {supps.map(s=>{
          const done=!!todayChecked[s.id];
          return (
            <div key={s.id} onClick={()=>toggle(s.id)} style={{ display:"flex", alignItems:"center", gap:12, padding:"10px 12px", background:done?C.green+"12":C.surface, border:`1px solid ${done?C.green+"44":C.border}`, borderRadius:10, cursor:"pointer", transition:"all 0.2s" }}>
              <div style={{ width:22, height:22, borderRadius:6, border:`2px solid ${done?C.green:C.muted}`, background:done?C.green:"transparent", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0, transition:"all 0.2s" }}>
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
function Today({ totals, goals, todayLog, steps, water, tdee, onSteps, onWater, onRemove, onEdit, onGoToLog }) {
  const [showAll, setShowAll] = useState(false);
  const [editIdx, setEditIdx] = useState(null);
  const [editQty, setEditQty] = useState("");
  const calPct = (totals.cal||0)/goals.cal;
  const deficit = tdee-(totals.cal||0);
  const fatBurned = deficit>0?deficit/FAT_KCAL:0;

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
      {/* calorie arc */}
      <div style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:18, padding:20, textAlign:"center" }}>
        <div style={{ display:"flex", justifyContent:"center" }}>
          <ArcMeter pct={calPct} color={calPct>1?"#f87171":C.accent}/>
        </div>
        <div style={{ marginTop:-8 }}>
          <div style={{ fontSize:32, fontWeight:800, color:C.text, fontFamily:"monospace", letterSpacing:-1 }}>{Math.round(totals.cal||0)}</div>
          <div style={{ fontSize:12, color:C.sub }}>of {goals.cal} kcal goal</div>
          {tdee>0&&<div style={{ fontSize:12, color:C.sub, marginTop:2 }}>TDEE: <span style={{ color:C.text, fontWeight:700 }}>{tdee}</span> kcal</div>}
          <div style={{ marginTop:5 }}>
            {calPct>1
              ? <span style={{ fontSize:13, color:"#f87171", fontWeight:700 }}>⚠ {Math.round((totals.cal||0)-goals.cal)} kcal over — damn</span>
              : <span style={{ fontSize:13, color:C.accent, fontWeight:700 }}>{Math.round(goals.cal-(totals.cal||0))} kcal left, don't blow it</span>}
          </div>
        </div>
        <button onClick={onGoToLog} style={{ marginTop:14, background:C.accent, border:"none", borderRadius:10, color:C.bg, fontWeight:800, fontSize:13, cursor:"pointer", padding:"10px 28px", fontFamily:"inherit" }}>
          + Log Food
        </button>
      </div>

      {/* fat burned teaser */}
      {tdee>0&&deficit>0&&(
        <div style={{ background:`linear-gradient(135deg,${C.green}18,${C.accent}0a)`, border:`1px solid ${C.green}30`, borderRadius:14, padding:16, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
          <div>
            <div style={{ fontSize:11, color:C.green, textTransform:"uppercase", letterSpacing:1, fontWeight:700 }}>fat burned today 🔥</div>
            <div style={{ fontSize:26, fontWeight:800, color:C.green, fontFamily:"monospace", marginTop:2 }}>{fatBurned.toFixed(1)}<span style={{ fontSize:14 }}> g</span></div>
            <div style={{ fontSize:11, color:C.sub, marginTop:2 }}>from {Math.round(deficit)} kcal deficit. slay.</div>
          </div>
          <div style={{ fontSize:36 }}>🔥</div>
        </div>
      )}

      {/* steps + water */}
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
        <QuickTrack icon="👟" label="Steps" value={steps} goal={goals.steps} color={C.orange} unit="steps" onSave={onSteps}/>
        <QuickTrack icon="💧" label="Water" value={water} goal={goals.water} color={C.blue} unit="glasses" onSave={onWater}/>
      </div>

      {/* macros */}
      <div style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:14, padding:16 }}>
        <div style={{ fontSize:11, fontWeight:700, color:C.sub, textTransform:"uppercase", letterSpacing:1, marginBottom:10 }}>Macronutrients</div>
        <div style={{ display:"flex", gap:7, marginBottom:12 }}>
          <Pill label="Protein" value={`${Math.round(totals.protein||0)}g`} color={C.blue}/>
          <Pill label="Carbs"   value={`${Math.round(totals.carbs||0)}g`}   color={C.accent}/>
          <Pill label="Fat"     value={`${Math.round(totals.fat||0)}g`}     color={C.pink}/>
          <Pill label="Fiber"   value={`${Math.round(totals.fiber||0)}g`}   color={C.green}/>
        </div>
        <div style={{ display:"flex", flexDirection:"column", gap:7 }}>
          <MicroBar label="Protein" val={totals.protein||0} goal={goals.protein||80}  unit="g" color={C.blue}/>
          <MicroBar label="Carbs"   val={totals.carbs||0}   goal={goals.carbs||200}   unit="g" color={C.accent}/>
          <MicroBar label="Fat"     val={totals.fat||0}     goal={goals.fat||60}      unit="g" color={C.pink}/>
          <MicroBar label="Fiber"   val={totals.fiber||0}   goal={goals.fiber||25}    unit="g" color={C.green}/>
        </div>
      </div>

      {/* micros */}
      <div style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:14, padding:16 }}>
        <div style={{ fontSize:11, fontWeight:700, color:C.sub, textTransform:"uppercase", letterSpacing:1, marginBottom:10 }}>Micronutrients</div>
        <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
          <MicroBar label="Sodium"    val={totals.sodium}   goal={goals.sodium||2300}    unit="mg"  color={C.orange}/>
          <MicroBar label="Sugar"     val={totals.sugar}    goal={goals.sugar||50}       unit="g"   color={C.pink}/>
          <MicroBar label="Calcium"   val={totals.calcium}  goal={goals.calcium||1000}   unit="mg"  color={C.blue}/>
          <MicroBar label="Iron"      val={totals.iron}     goal={goals.iron||18}        unit="mg"  color={C.orange}/>
          <MicroBar label="Vitamin C" val={totals.vitaminC} goal={goals.vitaminC||90}    unit="mg"  color={C.accent}/>
          <MicroBar label="Vitamin D" val={totals.vitaminD} goal={goals.vitaminD||20}    unit="mcg" color={C.purple}/>
        </div>
      </div>

      <Supplements/>

      {/* today's food log */}
      {todayLog.length>0&&(
        <div style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:14, padding:14 }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
            <div style={{ fontSize:11, fontWeight:700, color:C.sub, textTransform:"uppercase", letterSpacing:1 }}>Today's food</div>
            <button onClick={()=>setShowAll(p=>!p)} style={{ background:"none", border:"none", color:C.sub, fontSize:11, cursor:"pointer" }}>{showAll?"▲ less":`▼ all ${todayLog.length}`}</button>
          </div>
          {(showAll?todayLog:todayLog.slice(-5)).map((e,vi)=>{
            const ri=showAll?vi:todayLog.length-5+vi;
            return (
              <div key={vi} style={{ padding:"8px 0", borderBottom:vi<(showAll?todayLog:todayLog.slice(-5)).length-1?`1px solid ${C.border}`:"none" }}>
                {editIdx===ri?(
                  <div style={{ display:"flex", gap:8, alignItems:"center" }}>
                    <span style={{ fontSize:12, color:C.text, flex:1 }}>{e.name}</span>
                    <input type="number" value={editQty} onChange={x=>setEditQty(x.target.value)} placeholder={String(e.qty)}
                      style={{ width:60, background:C.bg, border:`1px solid ${C.accent}`, borderRadius:6, padding:"4px 8px", color:C.text, fontSize:12, outline:"none" }}/>
                    <span style={{ fontSize:11, color:C.sub }}>{e.unit}</span>
                    <button onClick={()=>{
                      const newQ=+editQty||e.qty;
                      const r=newQ/(e.qty||1);
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

function QuickTrack({ icon, label, value, goal, color, unit, onSave }) {
  const [edit, setEdit] = useState(false);
  const [draft, setDraft] = useState("");
  const pct = Math.min(value/goal,1);
  return (
    <div style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:14, padding:14 }}>
      <div style={{ fontSize:11, color:C.sub, textTransform:"uppercase", letterSpacing:1, marginBottom:5, fontWeight:700 }}>{icon} {label}</div>
      <div style={{ fontSize:22, fontWeight:800, color, fontFamily:"monospace" }}>{value.toLocaleString()}</div>
      <div style={{ fontSize:10, color:C.muted, marginBottom:8 }}>/ {goal.toLocaleString()} {unit}</div>
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
const SYSTEM_PROMPT = `You are Fuel Log's unhinged but brilliant nutrition AI. You have the personality of a chaotic gen-Z bestie who knows way too much about macros. You use f-bombs freely, gen-Z slang, occasional "slay", "bestie", "no cap", "lowkey", "periodt", "ew lol wtf". You're supportive but brutally honest. You LOVE when someone eats well. You're SHOOK when someone eats badly but never shame them.

Your job is to parse food log messages and return structured nutrition data. You have deep knowledge of Indian food, homemade dishes, and common ingredients.

When the user logs food, respond with:
1. A short, unhinged personality comment (1-2 sentences max, funny/encouraging)
2. A JSON block wrapped in <JSON></JSON> tags with this structure:
{
  "items": [
    {
      "name": "food name",
      "qty": number,
      "unit": "g/ml/piece/etc",
      "meal": "Lunch",
      "cal": number,
      "protein": number,
      "carbs": number,
      "fat": number,
      "fiber": number,
      "sodium": number,
      "sugar": number,
      "calcium": number,
      "iron": number,
      "vitaminC": number,
      "vitaminD": number,
      "unknown": false
    }
  ],
  "unknownItems": ["list of items you couldn't identify"],
  "totalCal": number,
  "message": "your personality comment here"
}

For unknown items (things not in common knowledge AND not described enough to estimate), set "unknown": true and add to unknownItems list.

For Indian homemade food without exact recipe: make reasonable assumptions for typical home cooking (moderate oil, standard spices). Always mention your assumption in the message.

For meal calculator requests (user says "I have X calories left, what fits?"), give suggestions WITHOUT the JSON items block, just a conversational response.

All nutrition values are per the stated quantity. Sodium in mg, vitaminD in mcg, everything else in g. Use 0 if unknown micronutrient.`;

function ChatLog({ ingredients, recipes, todayLog, goals, onAdd, onSaveIng, onSaveRec }) {
  const [messages, setMessages] = useState(()=>load(`ft_chat_${todayStr()}`,[{role:"assistant", content:"okay bestie, what did you eat today? spill 👀 (or type 'i have 300 cals left, what fits?' for a vibe check)"}]));
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [meal, setMeal] = useState("Lunch");
  const [pendingItems, setPendingItems] = useState(null);
  const [unknownItem, setUnknownItem] = useState(null);
  const [confirmMsg, setConfirmMsg] = useState("");
  const bottomRef = useRef();

  useEffect(()=>{ save(`ft_chat_${todayStr()}`, messages); }, [messages]);
  useEffect(()=>{ bottomRef.current?.scrollIntoView({behavior:"smooth"}); }, [messages, loading]);

  // Build context string for Claude
  function buildContext() {
    const libNames = ingredients.map(i=>i.name).join(", ");
    const recNames = recipes.map(r=>r.name).join(", ");
    const todayCal = todayLog.reduce((a,e)=>a+(e.cal||0),0);
    const remaining = goals.cal - todayCal;
    return `User's saved ingredients: ${libNames||"none yet"}. Saved recipes: ${recNames||"none yet"}. Today so far: ${Math.round(todayCal)} kcal eaten, ${Math.round(remaining)} kcal remaining. Daily goal: ${goals.cal} kcal, protein: ${goals.protein}g, carbs: ${goals.carbs}g, fat: ${goals.fat}g. Current meal being logged: ${meal}.`;
  }

  async function send() {
    if (!input.trim()||loading) return;
    const userMsg = input.trim();
    setInput("");
    const newMessages = [...messages, {role:"user", content:userMsg}];
    setMessages(newMessages);
    setLoading(true);

    try {
      const context = buildContext();
      const apiMessages = newMessages.map(m=>({role:m.role, content:m.content}));
      // inject context into first user message
      apiMessages[apiMessages.length-1].content = `[Context: ${context}]\n\nUser says: ${userMsg}`;

      const raw = await callClaude(apiMessages, SYSTEM_PROMPT);

      // parse JSON if present
      const jsonMatch = raw.match(/<JSON>([\s\S]*?)<\/JSON>/);
      let parsed = null;
      let displayText = raw.replace(/<JSON>[\s\S]*?<\/JSON>/g,"").trim();

      if (jsonMatch) {
        try {
          parsed = JSON.parse(jsonMatch[1].trim());
          if (parsed.message) displayText = parsed.message;
        } catch(e) { /* ignore parse error, show raw */ }
      }

      setMessages(p=>[...p, {role:"assistant", content:displayText, parsed}]);

      if (parsed?.items?.length) {
        const knownItems = parsed.items.filter(i=>!i.unknown).map(i=>({...i, meal}));
        const unknowns = parsed.unknownItems||[];
        if (knownItems.length>0) setPendingItems(knownItems);
        if (unknowns.length>0) setUnknownItem(unknowns[0]);
      }
    } catch(e) {
      setMessages(p=>[...p, {role:"assistant", content:"babe something broke on my end 💀 try again? (check your connection)"}]);
    }
    setLoading(false);
  }

  function confirmLog() {
    if (!pendingItems) return;
    onAdd(pendingItems);
    setConfirmMsg(`✓ logged ${pendingItems.length} item${pendingItems.length>1?"s":""} — slay 💅`);
    setPendingItems(null);
    setTimeout(()=>setConfirmMsg(""),3000);
  }

  function discardLog() { setPendingItems(null); }

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:0, height:"calc(100vh - 160px)", minHeight:400 }}>
      {/* meal selector */}
      <div style={{ display:"flex", gap:8, marginBottom:12, alignItems:"center" }}>
        <Sel label="" value={meal} onChange={e=>setMeal(e.target.value)} style={{ flex:1, padding:"8px 12px", fontSize:12 }}>
          {MEALS.map(m=><option key={m}>{m}</option>)}
        </Sel>
        <div style={{ fontSize:11, color:C.sub, whiteSpace:"nowrap" }}>
          {Math.round(goals.cal-(todayLog.reduce((a,e)=>a+(e.cal||0),0)))} kcal left
        </div>
      </div>

      {/* chat window */}
      <div style={{ flex:1, overflowY:"auto", display:"flex", flexDirection:"column", gap:10, paddingBottom:8 }}>
        {messages.map((m,i)=>(
          <div key={i} style={{ display:"flex", justifyContent:m.role==="user"?"flex-end":"flex-start" }}>
            <div style={{
              maxWidth:"85%", padding:"10px 14px", borderRadius:m.role==="user"?"14px 14px 4px 14px":"14px 14px 14px 4px",
              background:m.role==="user"?C.accent:C.card,
              color:m.role==="user"?C.bg:C.text,
              fontSize:13, lineHeight:1.5,
              border:m.role==="assistant"?`1px solid ${C.border}`:"none"
            }}>
              {m.content}
              {/* show nutrition preview if parsed */}
              {m.parsed?.items?.filter(x=>!x.unknown).length>0&&(
                <div style={{ marginTop:10, paddingTop:10, borderTop:`1px solid ${C.border}` }}>
                  {m.parsed.items.filter(x=>!x.unknown).map((item,j)=>(
                    <div key={j} style={{ fontSize:11, color:C.sub, marginBottom:4 }}>
                      <span style={{ color:C.text, fontWeight:600 }}>{item.name}</span> {item.qty}{item.unit} —
                      <span style={{ color:C.accent }}> {Math.round(item.cal)} kcal</span>
                      <span style={{ color:C.blue }}> P:{Math.round(item.protein||0)}g</span>
                      <span> C:{Math.round(item.carbs||0)}g F:{Math.round(item.fat||0)}g</span>
                    </div>
                  ))}
                  {m.parsed.totalCal&&(
                    <div style={{ fontSize:12, fontWeight:700, color:C.accent, marginTop:6 }}>
                      Total: {Math.round(m.parsed.totalCal)} kcal
                    </div>
                  )}
                </div>
              )}
              {m.parsed?.unknownItems?.length>0&&(
                <div style={{ marginTop:8, padding:"8px 10px", background:"#f9731620", borderRadius:8, fontSize:11, color:C.orange }}>
                  wtf is {m.parsed.unknownItems.join(", ")}?? bestie give me the recipe first 🙃
                </div>
              )}
            </div>
          </div>
        ))}

        {loading&&(
          <div style={{ display:"flex", justifyContent:"flex-start" }}>
            <div style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:"14px 14px 14px 4px", padding:"12px 16px", fontSize:13, color:C.sub }} className="pulse">
              calculating your sins... 🧮
            </div>
          </div>
        )}

        {/* pending confirm */}
        {pendingItems&&(
          <div style={{ background:C.greenDim, border:`1px solid ${C.green}44`, borderRadius:12, padding:14 }} className="pop">
            <div style={{ fontSize:12, color:C.green, fontWeight:700, marginBottom:8 }}>log {pendingItems.length} item{pendingItems.length>1?"s":""}?</div>
            <div style={{ display:"flex", gap:8 }}>
              <Btn variant="green" onClick={confirmLog} style={{ flex:1, padding:"8px" }}>✓ yes slay</Btn>
              <Btn variant="ghost" onClick={discardLog} style={{ flex:1, padding:"8px" }}>nah skip</Btn>
            </div>
          </div>
        )}

        {confirmMsg&&(
          <div style={{ background:C.greenDim, border:`1px solid ${C.green}44`, borderRadius:10, padding:"10px 14px", fontSize:13, color:C.green, fontWeight:700, textAlign:"center" }} className="pop">
            {confirmMsg}
          </div>
        )}

        {unknownItem&&!pendingItems&&(
          <div style={{ background:"#f9731620", border:"1px solid #f9731640", borderRadius:12, padding:14 }} className="pop">
            <div style={{ fontSize:12, color:C.orange, fontWeight:700, marginBottom:6 }}>
              what the fuck is "{unknownItem}"?? 👀
            </div>
            <div style={{ fontSize:11, color:C.sub, marginBottom:10 }}>add it to your library and i'll clock it next time</div>
            <Btn variant="ghost" onClick={()=>setUnknownItem(null)} style={{ fontSize:11, padding:"6px 12px" }}>got it, i'll add it</Btn>
          </div>
        )}

        <div ref={bottomRef}/>
      </div>

      {/* input */}
      <div style={{ display:"flex", gap:8, paddingTop:10, borderTop:`1px solid ${C.border}` }}>
        <input value={input} onChange={e=>setInput(e.target.value)}
          onKeyDown={e=>e.key==="Enter"&&!e.shiftKey&&send()}
          placeholder="100g rice, 1 roti, 2 eggs... or 'i have 400 cals left, what fits?'"
          style={{ flex:1, background:C.card, border:`1px solid ${C.border}`, borderRadius:12, padding:"12px 16px", color:C.text, fontSize:13, outline:"none", fontFamily:"inherit", resize:"none" }}/>
        <button onClick={send} disabled={loading||!input.trim()}
          style={{ background:loading||!input.trim()?C.muted:C.accent, border:"none", borderRadius:12, color:C.bg, fontWeight:800, fontSize:13, cursor:loading||!input.trim()?"not-allowed":"pointer", padding:"12px 18px", fontFamily:"inherit", transition:"background 0.2s" }}>
          {loading?"...":"send"}
        </button>
      </div>

      {/* quick prompts */}
      <div style={{ display:"flex", gap:6, marginTop:8, flexWrap:"wrap" }}>
        {["what did i eat today?","i have 300 cals left, what fits my macros?","estimate my breakfast","undo last entry"].map(p=>(
          <button key={p} onClick={()=>setInput(p)}
            style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:20, padding:"5px 12px", fontSize:10, color:C.sub, cursor:"pointer", fontFamily:"inherit" }}>
            {p}
          </button>
        ))}
      </div>
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
      const resp = await fetch("https://api.anthropic.com/v1/messages",{
        method:"POST", headers:{"Content-Type":"application/json"},
        body:JSON.stringify({ model:"claude-sonnet-4-20250514", max_tokens:1000,
          messages:[{role:"user",content:[
            {type:"image",source:{type:"base64",media_type:"image/jpeg",data:imageB64}},
            {type:"text",text:`Read this nutrition label. Return ONLY raw JSON, no markdown:
{"name":"product name","servingSize":number,"servingUnit":"g/ml/piece","cal":number,"protein":number,"carbs":number,"fat":number,"fiber":number,"sodium":number,"sugar":number,"saturatedFat":number,"transFat":number,"cholesterol":number,"potassium":number,"calcium":number,"iron":number,"vitaminC":number,"vitaminD":number}
All numbers. sodium/calcium/iron/potassium in mg. vitaminD in mcg. others in g. Use 0 if not visible.`}
          ]}]
        })
      });
      const data = await resp.json();
      const text = data.content?.find(b=>b.type==="text")?.text||"";
      setResult(JSON.parse(text.replace(/```json|```/g,"").trim()));
    } catch { setError("couldn't read it bestie. better lighting, no glare, full panel in frame 📸"); }
    finally { setScanning(false); }
  }

  async function lookupAI() {
    if (!aiQuery.trim()) return;
    setAiLoading(true); setError(null);
    try {
      const text = await callClaude([{role:"user",content:`Give me the nutrition info for: ${aiQuery}. Return ONLY raw JSON, no markdown, no explanation:
{"name":"food name","servingSize":number,"servingUnit":"g or piece or ml","cal":number,"protein":number,"carbs":number,"fat":number,"fiber":number,"sodium":number,"sugar":number,"calcium":number,"iron":number,"vitaminC":number,"vitaminD":number}
Use standard USDA/FSSAI values. All numbers. sodium/calcium/iron in mg. vitaminD in mcg. others in g.`}], "You are a nutrition database. Return only JSON.");
      const parsed = JSON.parse(text.replace(/```json|```/g,"").trim());
      setResult(parsed); setPreview(null); setImageB64(null);
    } catch { setError("couldn't find that one. try being more specific bestie 🙃"); }
    finally { setAiLoading(false); }
  }

  const fields=[["cal","Calories"],["protein","Protein (g)"],["carbs","Carbs (g)"],["fat","Fat (g)"],["fiber","Fiber (g)"],["sodium","Sodium (mg)"],["sugar","Sugar (g)"],["saturatedFat","Sat. Fat (g)"],["cholesterol","Cholesterol (mg)"],["potassium","Potassium (mg)"],["calcium","Calcium (mg)"],["iron","Iron (mg)"],["vitaminC","Vit C (mg)"],["vitaminD","Vit D (mcg)"]];

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
      {/* AI lookup — no label needed */}
      <div style={{ background:C.card, border:`1px solid ${C.accent}44`, borderRadius:14, padding:16 }}>
        <div style={{ fontSize:11, fontWeight:700, color:C.accent, textTransform:"uppercase", letterSpacing:1, marginBottom:8 }}>🤖 Ask AI — no label needed</div>
        <div style={{ fontSize:12, color:C.sub, marginBottom:10 }}>Type anything — "150g cooked white rice", "1 medium banana", "50g raw potato", "100g gobi sabzi"</div>
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

      {/* scan */}
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
            <div style={{ fontSize:12, color:C.sub, marginBottom:14 }}>Packaged food, supplements, protein powder, anything with a Nutrition Facts panel</div>
            <Btn variant="accent" onClick={()=>fileRef.current?.click()}>Upload / Take Photo</Btn>
          </>
        )}
        <input ref={fileRef} type="file" accept="image/*" capture="environment" style={{ display:"none" }} onChange={e=>handleFile(e.target.files[0])}/>
      </div>

      {imageB64&&!result&&!scanning&&<Btn variant="accent" full onClick={scanLabel}>🔍 Scan & Extract</Btn>}
      {(scanning||aiLoading)&&<div style={{ background:C.accentDim, border:`1px solid ${C.accent}44`, borderRadius:10, padding:14, textAlign:"center", color:C.accent, fontSize:13, fontWeight:700 }} className="pulse">reading the nutritional tea... ☕</div>}
      {error&&<div style={{ background:"#ef444420", border:"1px solid #ef444438", borderRadius:10, padding:14, color:"#f87171", fontSize:13 }}>⚠️ {error}</div>}

      {result&&(
        <div style={{ background:C.card, border:`1px solid ${C.green}44`, borderRadius:16, padding:16 }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:12 }}>
            <div>
              {editing?<Input value={result.name} onChange={e=>setResult(p=>({...p,name:e.target.value}))} style={{ marginBottom:4 }}/>:<div style={{ fontSize:15, fontWeight:800, color:C.text }}>{result.name}</div>}
              <div style={{ fontSize:11, color:C.sub, marginTop:3 }}>Per {result.servingSize}{result.servingUnit}</div>
            </div>
            <span style={{ background:C.greenDim, color:C.green, border:`1px solid ${C.green}44`, borderRadius:6, padding:"3px 10px", fontSize:11, fontWeight:700 }}>got it ✓</span>
          </div>
          <div style={{ display:"flex", gap:6, marginBottom:10 }}>
            <Pill label="kcal"    value={result.cal}           color={C.accent}/>
            <Pill label="protein" value={`${result.protein}g`} color={C.blue}/>
            <Pill label="carbs"   value={`${result.carbs}g`}   color={C.green}/>
            <Pill label="fat"     value={`${result.fat}g`}     color={C.pink}/>
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
            {!saved&&<Btn variant="green" onClick={()=>{onSave([...ingredients,{...result,id:Date.now()}]);setSaved(true);}} style={{ flex:1 }}>save to library</Btn>}
          </div>
          {saved&&<div style={{ marginTop:8, background:C.greenDim, border:`1px solid ${C.green}44`, borderRadius:8, padding:10, textAlign:"center", color:C.green, fontSize:13, fontWeight:700 }}>✓ saved! now go log it in 💬 Log tab</div>}
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
  const [ingF, setIngF] = useState({name:"",servingSize:100,servingUnit:"g",cal:"",protein:"",carbs:"",fat:"",fiber:"",sodium:"",sugar:"",calcium:"",iron:"",vitaminC:"",vitaminD:""});
  const [recF, setRecF] = useState({name:"",items:[],yieldG:100,yieldUnit:"g",note:""});
  const [rSrc, setRSrc] = useState("");
  const [rQty, setRQty] = useState({});
  const [rUnit, setRUnit] = useState({});
  const [editRecIdx, setEditRecIdx] = useState(null);

  function saveIng() {
    if(!ingF.name) return;
    const n={...ingF,id:Date.now()};
    ["servingSize","cal","protein","carbs","fat","fiber","sodium","sugar","calcium","iron","vitaminC","vitaminD"].forEach(k=>n[k]=+(n[k]||0));
    onSaveIng([...ingredients,n]); setIngF({name:"",servingSize:100,servingUnit:"g",cal:"",protein:"",carbs:"",fat:"",fiber:"",sodium:"",sugar:"",calcium:"",iron:"",vitaminC:"",vitaminD:""}); setShowAddIng(false);
  }

  function addIngToRec(ing) {
    const q=+(rQty[ing.id]||ing.servingSize||100); const u=rUnit[ing.id]||ing.servingUnit||"g";
    // store ingredient reference + qty for auto-recalc
    setRecF(p=>({...p,items:[...p.items,{ingId:ing.id,name:ing.name,qty:q,unit:u}]}));
    setRSrc("");
  }

  function saveRec() {
    if(!recF.name||recF.items.length===0) return;
    // resolve with current ingredient values
    const resolved = resolveRecipe({...recF,yieldG:+recF.yieldG||100}, ingredients);
    onSaveRec([...recipes,{...resolved,id:Date.now()}]);
    setRecF({name:"",items:[],yieldG:100,yieldUnit:"g",note:""}); setShowAddRec(false);
  }

  const filtRec=ingredients.filter(i=>i.name?.toLowerCase().includes(rSrc.toLowerCase()));

  // recompute recipe totals when ingredients change
  const resolvedRecipes = useMemo(()=>recipes.map(r=>resolveRecipe(r,ingredients)),[recipes,ingredients]);

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
      <div style={{ display:"flex", gap:8 }}>
        <Btn variant={view==="ingredients"?"accent":"ghost"} onClick={()=>setView("ingredients")}>🧂 Foods ({ingredients.length})</Btn>
        <Btn variant={view==="recipes"?"accent":"ghost"} onClick={()=>setView("recipes")}>🍲 Recipes ({recipes.length})</Btn>
      </div>

      {view==="ingredients"&&(
        <>
          <Btn variant="flat" full onClick={()=>setShowAddIng(true)}>+ Add Food Manually</Btn>
          {ingredients.length===0&&<div style={{ textAlign:"center", color:C.muted, fontSize:13, padding:28 }}>empty in here bestie. scan a label or add manually 👀</div>}
          {ingredients.map(ing=>(
            <div key={ing.id} style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:12, padding:14 }}>
              <div style={{ display:"flex", justifyContent:"space-between" }}>
                <div>
                  <div style={{ fontSize:14, fontWeight:700, color:C.text }}>{ing.name}</div>
                  <div style={{ fontSize:11, color:C.sub }}>Per {ing.servingSize}{ing.servingUnit} · {ing.cal} kcal</div>
                  <div style={{ fontSize:11, color:C.muted, marginTop:2 }}>P:{ing.protein}g  C:{ing.carbs}g  F:{ing.fat}g</div>
                </div>
                <button onClick={()=>onSaveIng(ingredients.filter(i=>i.id!==ing.id))} style={{ background:"none", border:"none", color:C.muted, cursor:"pointer", fontSize:18 }}>🗑</button>
              </div>
            </div>
          ))}
        </>
      )}

      {view==="recipes"&&(
        <>
          <Btn variant="flat" full onClick={()=>setShowAddRec(true)}>+ Build a Recipe</Btn>
          <div style={{ fontSize:11, color:C.sub, padding:"0 2px" }}>💡 Recipe nutrition auto-updates if you edit an ingredient</div>
          {resolvedRecipes.length===0&&<div style={{ textAlign:"center", color:C.muted, fontSize:13, padding:28 }}>no recipes yet. build one and name it, i dare you 🧪</div>}
          {resolvedRecipes.map((rec,ri)=>(
            <div key={rec.id} style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:12, padding:14 }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:14, fontWeight:700, color:C.text }}>{rec.name}</div>
                  <div style={{ fontSize:11, color:C.sub }}>Total yield: {rec.yieldG}{rec.yieldUnit} · {Math.round(rec.totalNutr?.cal||0)} kcal total</div>
                  <div style={{ fontSize:11, color:C.sub }}>Per 100{rec.yieldUnit}: {Math.round(rec.per100?.cal||0)} kcal · P:{Math.round(rec.per100?.protein||0)}g C:{Math.round(rec.per100?.carbs||0)}g F:{Math.round(rec.per100?.fat||0)}g</div>
                  {rec.note&&<div style={{ fontSize:11, color:C.muted, fontStyle:"italic", marginTop:2 }}>{rec.note}</div>}
                  <div style={{ fontSize:10, color:C.muted, marginTop:4 }}>{rec.items?.length} ingredients</div>
                </div>
                <button onClick={()=>onSaveRec(recipes.filter(r=>r.id!==rec.id))} style={{ background:"none", border:"none", color:C.muted, cursor:"pointer", fontSize:18 }}>🗑</button>
              </div>
            </div>
          ))}
        </>
      )}

      {/* Add ingredient modal */}
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
          <Btn variant="accent" full onClick={saveIng}>Save Food</Btn>
        </div>
      </Modal>

      {/* Build recipe modal */}
      <Modal open={showAddRec} onClose={()=>setShowAddRec(false)} title="Build Recipe">
        <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
          <Input label="Recipe name" value={recF.name} onChange={e=>setRecF(p=>({...p,name:e.target.value}))} placeholder="e.g. Homecooked brown rice, Dal tadka"/>
          <div style={{ display:"flex", gap:8 }}>
            <Input label="Total yield" type="number" value={recF.yieldG} onChange={e=>setRecF(p=>({...p,yieldG:e.target.value}))} hint="total weight/volume after cooking" style={{ flex:1 }}/>
            <Sel label="Yield unit" value={recF.yieldUnit} onChange={e=>setRecF(p=>({...p,yieldUnit:e.target.value}))} style={{ flex:1 }}>
              {UNITS.map(u=><option key={u}>{u}</option>)}
            </Sel>
          </div>
          <Input label="Search your saved foods" value={rSrc} onChange={e=>setRSrc(e.target.value)} placeholder="Search library…"/>
          {rSrc.length>0&&(
            <div style={{ background:C.bg, border:`1px solid ${C.border}`, borderRadius:10, maxHeight:160, overflowY:"auto" }}>
              {filtRec.length===0&&<div style={{ padding:12, color:C.muted, fontSize:12, textAlign:"center" }}>not in library bestie</div>}
              {filtRec.map((ing,i)=>(
                <div key={i} style={{ padding:"10px 12px", borderBottom:`1px solid ${C.border}` }}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:6 }}>
                    <span style={{ fontSize:13, fontWeight:600, color:C.text }}>{ing.name}</span>
                    <Btn variant="accent" onClick={()=>addIngToRec(ing)} style={{ padding:"4px 12px", fontSize:12 }}>Add</Btn>
                  </div>
                  <div style={{ display:"flex", gap:6 }}>
                    <input type="number" defaultValue={ing.servingSize} onChange={e=>setRQty(p=>({...p,[ing.id]:+e.target.value}))}
                      style={{ width:60, background:C.surface, border:`1px solid ${C.border}`, borderRadius:6, padding:"4px 8px", color:C.text, fontSize:12, outline:"none" }}/>
                    <select defaultValue={ing.servingUnit} onChange={e=>setRUnit(p=>({...p,[ing.id]:e.target.value}))}
                      style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:6, padding:"4px 8px", color:C.text, fontSize:12, outline:"none" }}>
                      {UNITS.map(u=><option key={u}>{u}</option>)}
                    </select>
                  </div>
                </div>
              ))}
            </div>
          )}
          {recF.items.length>0&&(
            <div>
              <div style={{ fontSize:11, color:C.sub, textTransform:"uppercase", letterSpacing:1, marginBottom:8 }}>{recF.items.length} ingredients</div>
              {recF.items.map((item,i)=>(
                <div key={i} style={{ display:"flex", justifyContent:"space-between", padding:"6px 0", borderBottom:`1px solid ${C.border}`, fontSize:12 }}>
                  <span style={{ color:C.text }}>{item.name} — {item.qty}{item.unit}</span>
                  <button onClick={()=>setRecF(p=>({...p,items:p.items.filter((_,idx)=>idx!==i)}))} style={{ background:"none", border:"none", color:C.muted, cursor:"pointer", fontSize:16 }}>×</button>
                </div>
              ))}
            </div>
          )}
          <Input label="Notes (optional)" value={recF.note} onChange={e=>setRecF(p=>({...p,note:e.target.value}))} placeholder="e.g. makes 4 katoris, no oil"/>
          <Btn variant="accent" full onClick={saveRec}>Save Recipe</Btn>
        </div>
      </Modal>
    </div>
  );
}

// ── FAT LOSS ──────────────────────────────────────────────────────────────────
function FatLoss({ log, goals, tdee, baseline, profile }) {
  const allDays = Object.keys(log).sort();
  const reference = tdee || +(baseline.currentCals) || goals.cal;

  const dayData = useMemo(()=>allDays.map(day=>{
    const cal=( log[day]||[]).reduce((a,e)=>a+(e.cal||0),0);
    const deficit=reference-cal;
    return {day,cal,deficit,fatG:deficit>0?deficit/FAT_KCAL:0};
  }),[log,reference,allDays]);

  const totalDeficit = dayData.reduce((a,d)=>a+Math.max(d.deficit,0),0);
  const totalFatG = totalDeficit/FAT_KCAL;
  const butterPacks = (totalFatG/100).toFixed(1);
  let streak=0;
  for(const d of [...dayData].sort((a,b)=>b.day.localeCompare(a.day))) { if(d.deficit>0)streak++; else break; }
  const last7Fat = dayData.slice(-7).reduce((a,d)=>a+d.fatG,0);
  const last30Fat = dayData.slice(-30).reduce((a,d)=>a+d.fatG,0);
  const bmi = profile.weight&&profile.height ? +(profile.weight/Math.pow(profile.height/100,2)).toFixed(1) : null;

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
      <div style={{ background:`linear-gradient(135deg,${C.green}18,${C.accent}0a)`, border:`1px solid ${C.green}30`, borderRadius:18, padding:20 }}>
        <div style={{ fontSize:11, color:C.green, textTransform:"uppercase", letterSpacing:1.5, fontWeight:700, marginBottom:6 }}>total fat burned (estimated)</div>
        <div style={{ fontSize:44, fontWeight:800, color:C.green, fontFamily:"monospace", letterSpacing:-2, lineHeight:1 }}>
          {totalFatG>=1000?<>{(totalFatG/1000).toFixed(2)}<span style={{ fontSize:18 }}> kg</span></>:<>{Math.round(totalFatG)}<span style={{ fontSize:18 }}> g</span></>}
        </div>
        <div style={{ fontSize:12, color:C.sub, marginTop:6 }}>from {Math.round(totalDeficit).toLocaleString()} kcal total deficit</div>
        <div style={{ fontSize:11, color:C.sub, marginTop:4 }}>that's <span style={{ color:C.accent, fontWeight:700 }}>{butterPacks} packs of butter</span> dissolved off ur body no cap 🧈</div>
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:10 }}>
        {[{label:"Streak 🔥",value:`${streak}d`,color:C.orange,sub:"deficit days"},{label:"This week",value:`${Math.round(last7Fat)}g`,color:C.accent,sub:"fat burned"},{label:"This month",value:`${Math.round(last30Fat)}g`,color:C.blue,sub:"fat burned"}].map(s=>(
          <div key={s.label} style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:12, padding:"12px 10px", textAlign:"center" }}>
            <div style={{ fontSize:10, color:C.sub, marginBottom:4, fontWeight:700 }}>{s.label}</div>
            <div style={{ fontSize:20, fontWeight:800, color:s.color, fontFamily:"monospace" }}>{s.value}</div>
            <div style={{ fontSize:10, color:C.muted }}>{s.sub}</div>
          </div>
        ))}
      </div>

      <div style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:14, padding:14 }}>
        <div style={{ fontSize:11, fontWeight:700, color:C.sub, textTransform:"uppercase", letterSpacing:1, marginBottom:10 }}>deficit baseline</div>
        <div style={{ display:"flex", justifyContent:"space-between", fontSize:13, marginBottom:6 }}>
          <span style={{ color:C.sub }}>Reference</span><span style={{ color:C.text, fontWeight:700 }}>{reference.toLocaleString()} kcal/day</span>
        </div>
        {bmi&&<div style={{ display:"flex", justifyContent:"space-between", fontSize:12, paddingTop:8, borderTop:`1px solid ${C.border}`, marginTop:6 }}>
          <span style={{ color:C.sub }}>BMI</span><span style={{ color:C.purple, fontWeight:700 }}>{bmi}</span>
        </div>}
        <div style={{ marginTop:10, padding:10, background:C.accentDim, borderRadius:8, fontSize:11, color:C.sub, lineHeight:1.6 }}>
          💡 1g body fat ≈ 7.7 kcal. Estimates only — actual results depend on hormones, water, muscle. The trend is what matters, not the daily number.
        </div>
      </div>

      <div style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:14, padding:14 }}>
        <div style={{ fontSize:11, fontWeight:700, color:C.sub, textTransform:"uppercase", letterSpacing:1, marginBottom:12 }}>daily deficit log</div>
        {dayData.length===0&&<div style={{ color:C.muted, fontSize:13, textAlign:"center", padding:20 }}>nothing logged yet bestie</div>}
        {[...dayData].reverse().slice(0,30).map(d=>(
          <div key={d.day} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"8px 0", borderBottom:`1px solid ${C.border}` }}>
            <div>
              <div style={{ fontSize:12, fontWeight:700, color:C.text }}>{fmtShort(d.day)}</div>
              <div style={{ fontSize:11, color:C.sub }}>{Math.round(d.cal)} kcal eaten</div>
            </div>
            <div style={{ textAlign:"right" }}>
              <div style={{ fontSize:12, fontWeight:700, color:d.deficit>300?C.green:d.deficit>0?C.accent:"#f87171" }}>
                {d.deficit>0?`−${Math.round(d.deficit)}`:`+${Math.round(-d.deficit)}`} kcal
              </div>
              {d.fatG>0&&<div style={{ fontSize:11, color:C.green }}>🔥 {d.fatG.toFixed(1)}g fat</div>}
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
          {allDays.length===0&&<div style={{ textAlign:"center", color:C.muted, fontSize:13, padding:40 }}>nothing here yet. go eat something and log it 🙄</div>}
          {filtered.map(day=>{
            const cal=(log[day]||[]).reduce((a,e)=>a+(e.cal||0),0);
            const s=steps[day]||0, w=water[day]||0;
            const over=cal>goals.cal;
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
                {label:"Days logged",    a:statA.days,     b:statB.days,     fmt:v=>v},
                {label:"Avg calories",   a:statA.days?Math.round(statA.totalCal/statA.days):0, b:statB.days?Math.round(statB.totalCal/statB.days):0, fmt:v=>`${v} kcal`,lowerBetter:true},
                {label:"Avg steps",      a:statA.days?Math.round(statA.totalSteps/statA.days):0, b:statB.days?Math.round(statB.totalSteps/statB.days):0, fmt:v=>v.toLocaleString()},
                {label:"Avg protein",    a:statA.days?Math.round(statA.totalProtein/statA.days):0, b:statB.days?Math.round(statB.totalProtein/statB.days):0, fmt:v=>`${v}g`},
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
          {months.length<2&&<div style={{ textAlign:"center", color:C.muted, fontSize:13, padding:30 }}>need data from 2+ months to compare bestie</div>}
        </>
      )}
    </div>
  );
}

// ── PROFILE ───────────────────────────────────────────────────────────────────
function Profile({ profile, baseline, goals, bmr, tdee, onProfile, onBaseline, onGoals }) {
  const [gDraft, setGDraft] = useState(goals);
  const [bDraft, setBDraft] = useState(baseline);
  const [goalsOpen, setGoalsOpen] = useState(false);
  const bmi = profile.weight&&profile.height ? +(profile.weight/Math.pow(profile.height/100,2)).toFixed(1) : null;
  const bmiLabel = bmi ? bmi<18.5?"Underweight":bmi<25?"Normal weight":bmi<30?"Overweight":"Obese" : null;
  const bmiColor = bmi ? bmi<18.5?C.blue:bmi<25?C.green:bmi<30?C.orange:"#f87171" : C.sub;

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
            <option value="sedentary">Sedentary (desk job, no exercise)</option>
            <option value="light">Light (1–3 days/week)</option>
            <option value="moderate">Moderate (3–5 days/week)</option>
            <option value="active">Active (6–7 days/week)</option>
            <option value="very_active">Very active (2x/day or physical job)</option>
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
              <div style={{ fontSize:10, color:C.muted }}>kcal/day (at rest)</div>
            </div>
            <div style={{ background:C.surface, borderRadius:10, padding:12, textAlign:"center" }}>
              <div style={{ fontSize:10, color:C.sub, textTransform:"uppercase", letterSpacing:1, marginBottom:4 }}>TDEE</div>
              <div style={{ fontSize:20, fontWeight:800, color:C.accent, fontFamily:"monospace" }}>{tdee}</div>
              <div style={{ fontSize:10, color:C.muted }}>kcal/day (with activity)</div>
            </div>
          </div>
        )}
      </div>

      <div style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:14, padding:16 }}>
        <div style={{ fontSize:11, fontWeight:700, color:C.sub, textTransform:"uppercase", letterSpacing:1, marginBottom:14 }}>Intake Baseline</div>
        <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
          <Input label="Current avg daily intake (kcal)" type="number" value={bDraft.currentCals} onChange={e=>setBDraft(p=>({...p,currentCals:e.target.value}))} placeholder="e.g. 2200 — what you eat on a normal day" hint="Used to calc your real deficit"/>
          <Input label="Override BMR manually (optional)" type="number" value={bDraft.bmrOverride} onChange={e=>setBDraft(p=>({...p,bmrOverride:e.target.value}))} placeholder="Leave blank to auto-calculate" hint="If you have a clinical reading"/>
          <Btn variant="accent" full onClick={()=>onBaseline(bDraft)}>Save Baseline</Btn>
        </div>
      </div>

      <div style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:14, padding:16 }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14 }}>
          <div style={{ fontSize:11, fontWeight:700, color:C.sub, textTransform:"uppercase", letterSpacing:1 }}>Daily Goals</div>
          <Btn variant="ghost" onClick={()=>{setGDraft(goals);setGoalsOpen(true);}} style={{ padding:"6px 12px", fontSize:12 }}>Edit →</Btn>
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
          <Btn variant="accent" full onClick={()=>{onGoals(gDraft);setGoalsOpen(false);}}>Save Goals</Btn>
        </div>
      </Modal>
    </div>
  );
}
