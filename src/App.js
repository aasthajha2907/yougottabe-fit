import { useState, useRef, useMemo } from "react";

// ─── persistence ──────────────────────────────────────────────────────────────
const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };
const load = (k, d) => { try { const s = localStorage.getItem(k); return s ? JSON.parse(s) : d; } catch { return d; } };
const todayStr = () => new Date().toISOString().split("T")[0];
const fmtDate = (d) => new Date(d + "T12:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
const fmtShort = (d) => new Date(d + "T12:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short" });

// ─── design tokens ────────────────────────────────────────────────────────────
const C = {
  bg: "#070709", surface: "#0f0f15", card: "#141420", border: "#1e1e2e",
  borderHi: "#2e2e44", accent: "#c8f04a", accentDim: "#c8f04a14",
  green: "#34d399", greenDim: "#34d39914", blue: "#7dd3fc", blueDim: "#7dd3fc14",
  pink: "#f9a8d4", pinkDim: "#f9a8d414", orange: "#fdba74", orangeDim: "#fdba7414",
  purple: "#c4b5fd", purpleDim: "#c4b5fd14",
  text: "#eeedf5", sub: "#7878a0", muted: "#33334a",
};

// fat loss math: 1g body fat ≈ 7700 kcal / 1000 = 7.7 kcal per gram
const FAT_KCAL_PER_GRAM = 7.7;

// ─── tiny helpers ─────────────────────────────────────────────────────────────
function Pill({ label, value, color }) {
  return (
    <div style={{ background: color + "18", border: `1px solid ${color}28`, borderRadius: 10, padding: "8px 10px", textAlign: "center", flex: 1, minWidth: 0 }}>
      <div style={{ fontSize: 13, fontWeight: 800, color, fontFamily: "monospace", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{value}</div>
      <div style={{ fontSize: 9, color: C.sub, marginTop: 2, textTransform: "uppercase", letterSpacing: 0.8 }}>{label}</div>
    </div>
  );
}

function Input({ label, hint, ...props }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      {label && <span style={{ fontSize: 11, color: C.sub, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase" }}>{label}</span>}
      <input {...props}
        style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8, padding: "10px 13px", color: C.text, fontSize: 14, outline: "none", width: "100%", boxSizing: "border-box", fontFamily: "inherit", ...(props.style || {}) }}
        onFocus={e => e.target.style.borderColor = C.accent}
        onBlur={e => e.target.style.borderColor = C.border}
      />
      {hint && <span style={{ fontSize: 11, color: C.sub }}>{hint}</span>}
    </label>
  );
}

function Sel({ label, children, ...props }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      {label && <span style={{ fontSize: 11, color: C.sub, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase" }}>{label}</span>}
      <select {...props} style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8, padding: "10px 13px", color: C.text, fontSize: 14, outline: "none", width: "100%", boxSizing: "border-box", fontFamily: "inherit", ...(props.style || {}) }}>
        {children}
      </select>
    </label>
  );
}

function Btn({ children, onClick, variant = "ghost", full, disabled, style: s = {} }) {
  const v = {
    ghost:  { bg: "transparent",   color: C.sub,   border: `1px solid ${C.border}` },
    accent: { bg: C.accent,        color: C.bg,    border: "none" },
    green:  { bg: C.green,         color: C.bg,    border: "none" },
    flat:   { bg: C.card,          color: C.text,  border: `1px solid ${C.border}` },
    danger: { bg: "#ef444418",     color: "#f87171", border: "1px solid #ef444430" },
    purple: { bg: C.purple+"22",   color: C.purple,  border: `1px solid ${C.purple}44` },
  }[variant];
  return (
    <button onClick={onClick} disabled={disabled}
      style={{ background: v.bg, color: v.color, border: v.border, borderRadius: 8, padding: "10px 18px", fontSize: 13, fontWeight: 700, cursor: disabled ? "not-allowed" : "pointer", width: full ? "100%" : undefined, letterSpacing: 0.3, fontFamily: "inherit", opacity: disabled ? 0.5 : 1, ...s }}>
      {children}
    </button>
  );
}

function Modal({ open, onClose, title, children }) {
  if (!open) return null;
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "#00000099", zIndex: 200, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
      <div onClick={e => e.stopPropagation()} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: "20px 20px 0 0", padding: "24px 20px 40px", width: "100%", maxWidth: 520, maxHeight: "92vh", overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <span style={{ fontSize: 17, fontWeight: 800, color: C.text }}>{title}</span>
          <button onClick={onClose} style={{ background: "none", border: "none", color: C.sub, fontSize: 24, cursor: "pointer", lineHeight: 1 }}>×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function MicroBar({ label, val, goal, unit, color }) {
  const pct = Math.min((val || 0) / goal * 100, 100);
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
        <span style={{ fontSize: 12, color: C.sub }}>{label}</span>
        <span style={{ fontSize: 12, color: C.text, fontFamily: "monospace" }}>
          {Math.round((val || 0) * 10) / 10}{unit} <span style={{ color: C.muted }}>/ {goal}{unit}</span>
        </span>
      </div>
      <div style={{ height: 4, background: C.border, borderRadius: 99 }}>
        <div style={{ height: 4, width: `${pct}%`, background: color, borderRadius: 99, transition: "width 0.5s ease" }} />
      </div>
    </div>
  );
}

function ArcMeter({ pct, color, size = 130, sw = 10 }) {
  const r = (size - sw) / 2;
  const circ = Math.PI * r;
  const filled = Math.min(pct, 1) * circ;
  return (
    <svg width={size} height={size / 2 + sw} viewBox={`0 0 ${size} ${size / 2 + sw}`}>
      <path d={`M${sw/2},${size/2} A${r},${r} 0 0,1 ${size-sw/2},${size/2}`} fill="none" stroke={C.border} strokeWidth={sw} strokeLinecap="round" />
      <path d={`M${sw/2},${size/2} A${r},${r} 0 0,1 ${size-sw/2},${size/2}`} fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round"
        strokeDasharray={`${filled} ${circ}`} style={{ transition: "stroke-dasharray 0.7s cubic-bezier(.4,0,.2,1)" }} />
    </svg>
  );
}

// ─── BMR helpers ──────────────────────────────────────────────────────────────
function calcBMR(profile) {
  const { weight, height, age, sex } = profile;
  if (!weight || !height || !age) return 0;
  // Mifflin-St Jeor
  const base = 10 * weight + 6.25 * height - 5 * age;
  return Math.round(sex === "female" ? base - 161 : base + 5);
}

function calcTDEE(bmr, activity) {
  const mults = { sedentary: 1.2, light: 1.375, moderate: 1.55, active: 1.725, very_active: 1.9 };
  return Math.round(bmr * (mults[activity] || 1.2));
}

// ─── App shell ────────────────────────────────────────────────────────────────
export default function App() {
  const [tab, setTab] = useState("today");

  const [profile, setProfile] = useState(() => load("ft_profile", { weight: "", height: "", age: "", sex: "female", activity: "moderate" }));
  const [goals, setGoals] = useState(() => load("ft_goals", { cal: 1500, protein: 80, carbs: 150, fat: 50, fiber: 25, sodium: 2300, sugar: 50, calcium: 1000, iron: 18, vitaminC: 90, vitaminD: 20, steps: 8000, water: 8 }));
  const [baseline, setBaseline] = useState(() => load("ft_baseline", { currentCals: "", bmrOverride: "" }));

  const [ingredients, setIngredients] = useState(() => load("ft_ing", []));
  const [recipes, setRecipes] = useState(() => load("ft_rec", []));
  const [log, setLog] = useState(() => load("ft_log", {}));
  const [steps, setSteps] = useState(() => load("ft_steps", {}));
  const [water, setWater] = useState(() => load("ft_water", {}));

  const sp = (k, v) => { const n = {...profile,[k]:v}; setProfile(n); save("ft_profile",n); };
  const sg = (v) => { setGoals(v); save("ft_goals",v); };
  const sb = (v) => { setBaseline(v); save("ft_baseline",v); };
  const sIng = v => { setIngredients(v); save("ft_ing",v); };
  const sRec = v => { setRecipes(v); save("ft_rec",v); };
  const sLog = v => { setLog(v); save("ft_log",v); };
  const sSt  = v => { setSteps(v); save("ft_steps",v); };
  const sWat = v => { setWater(v); save("ft_water",v); };

  const today = todayStr();
  const todayLog = log[today] || [];
  const totals = todayLog.reduce((a, e) => {
    const keys = ["cal","protein","carbs","fat","fiber","sodium","sugar","calcium","iron","vitaminC","vitaminD"];
    keys.forEach(k => a[k] = (a[k]||0) + (e[k]||0));
    return a;
  }, {});

  const bmr = baseline.bmrOverride ? +baseline.bmrOverride : calcBMR(profile);
  const tdee = calcTDEE(bmr, profile.activity);

  const tabs = [
    { id: "today",   icon: "⚡", label: "Today" },
    { id: "log",     icon: "🥗", label: "Log" },
    { id: "scan",    icon: "📷", label: "Scan" },
    { id: "library", icon: "📦", label: "Library" },
    { id: "fat",     icon: "🔥", label: "Fat Loss" },
    { id: "history", icon: "📈", label: "History" },
    { id: "profile", icon: "👤", label: "Profile" },
  ];

  return (
    <div style={{ background: C.bg, minHeight: "100vh", fontFamily: "'Plus Jakarta Sans','Segoe UI',sans-serif", color: C.text, maxWidth: 540, margin: "0 auto", display: "flex", flexDirection: "column" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;700;800&display=swap');
        *{box-sizing:border-box;margin:0;padding:0;}
        ::-webkit-scrollbar{width:3px;} ::-webkit-scrollbar-thumb{background:${C.border};border-radius:99px;}
        input[type=number]::-webkit-inner-spin-button{opacity:0;}
        input::placeholder,textarea::placeholder{color:${C.muted};}
        select option{background:${C.surface};}
        @keyframes fu{from{opacity:0;transform:translateY(8px);}to{opacity:1;transform:translateY(0);}}
        .fu{animation:fu 0.28s ease forwards;}
        @keyframes pulse{0%,100%{opacity:1;}50%{opacity:0.5;}} .pulse{animation:pulse 1.8s ease infinite;}
      `}</style>

      {/* header */}
      <div style={{ padding: "18px 18px 0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div style={{ fontSize: 10, color: C.sub, letterSpacing: 2, textTransform: "uppercase" }}>
            {new Date().toLocaleDateString("en-IN",{weekday:"long",day:"numeric",month:"long"})}
          </div>
          <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: -0.5 }}>Fuel <span style={{ color: C.accent }}>Log</span></div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 20, fontWeight: 800, color: C.accent, fontFamily: "monospace" }}>{Math.round(totals.cal || 0)}</div>
          <div style={{ fontSize: 10, color: C.sub }}>kcal logged</div>
        </div>
      </div>

      {/* tabs */}
      <div style={{ display: "flex", padding: "12px 18px 0", gap: 4, overflowX: "auto", scrollbarWidth: "none" }}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{ background: tab===t.id ? C.accent : "transparent", color: tab===t.id ? C.bg : C.sub, border: `1px solid ${tab===t.id ? C.accent : C.border}`, borderRadius: 8, padding: "6px 11px", fontSize: 11, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap", letterSpacing: 0.3, fontFamily: "inherit", flexShrink: 0 }}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* content */}
      <div style={{ flex: 1, padding: "14px 18px 80px", overflowY: "auto" }} className="fu" key={tab}>
        {tab === "today"   && <Today   totals={totals} goals={goals} todayLog={todayLog} steps={steps[today]||0} water={water[today]||0} bmr={bmr} tdee={tdee} baseline={baseline} onSteps={v=>sSt({...steps,[today]:v})} onWater={v=>sWat({...water,[today]:v})} onRemove={i=>sLog({...log,[today]:todayLog.filter((_,idx)=>idx!==i)})} />}
        {tab === "log"     && <LogFood ingredients={ingredients} recipes={recipes} onAdd={e=>sLog({...log,[today]:[...todayLog,e]})} />}
        {tab === "scan"    && <ScanLabel ingredients={ingredients} onSave={sIng} />}
        {tab === "library" && <Library ingredients={ingredients} recipes={recipes} onSaveIng={sIng} onSaveRec={sRec} />}
        {tab === "fat"     && <FatLoss log={log} goals={goals} tdee={tdee} baseline={baseline} profile={profile} />}
        {tab === "history" && <History log={log} steps={steps} water={water} goals={goals} />}
        {tab === "profile" && <Profile profile={profile} baseline={baseline} goals={goals} bmr={bmr} tdee={tdee} onProfile={sp} onBaseline={sb} onGoals={sg} />}
      </div>
    </div>
  );
}

// ─── TODAY ────────────────────────────────────────────────────────────────────
function Today({ totals, goals, todayLog, steps, water, bmr, tdee, baseline, onSteps, onWater, onRemove }) {
  const [showAll, setShowAll] = useState(false);
  const calPct = (totals.cal || 0) / goals.cal;
  const deficit = tdee - (totals.cal || 0);
  const fatBurned = deficit > 0 ? deficit / FAT_KCAL_PER_GRAM : 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* calorie arc */}
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 18, padding: 20, textAlign: "center" }}>
        <div style={{ display: "flex", justifyContent: "center" }}>
          <ArcMeter pct={calPct} color={calPct > 1 ? "#f87171" : C.accent} />
        </div>
        <div style={{ marginTop: -8 }}>
          <div style={{ fontSize: 32, fontWeight: 800, color: C.text, fontFamily: "monospace", letterSpacing: -1 }}>{Math.round(totals.cal || 0)}</div>
          <div style={{ fontSize: 12, color: C.sub }}>of {goals.cal} kcal goal</div>
          {tdee > 0 && (
            <div style={{ fontSize: 12, color: C.sub, marginTop: 2 }}>
              TDEE: <span style={{ color: C.text, fontWeight: 700 }}>{tdee}</span> kcal
            </div>
          )}
          <div style={{ marginTop: 6 }}>
            {calPct > 1
              ? <span style={{ fontSize: 13, color: "#f87171", fontWeight: 700 }}>⚠ {Math.round((totals.cal||0) - goals.cal)} kcal over goal</span>
              : <span style={{ fontSize: 13, color: C.accent, fontWeight: 700 }}>{Math.round(goals.cal - (totals.cal||0))} kcal remaining</span>
            }
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
          <Pill label="Protein" value={`${Math.round(totals.protein||0)}g`} color={C.blue} />
          <Pill label="Carbs"   value={`${Math.round(totals.carbs  ||0)}g`} color={C.accent} />
          <Pill label="Fat"     value={`${Math.round(totals.fat    ||0)}g`} color={C.pink} />
        </div>
      </div>

      {/* today's fat burned teaser */}
      {tdee > 0 && deficit > 0 && (
        <div style={{ background: `linear-gradient(135deg, ${C.green}18, ${C.accent}0a)`, border: `1px solid ${C.green}30`, borderRadius: 14, padding: 16, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 11, color: C.green, textTransform: "uppercase", letterSpacing: 1, fontWeight: 700 }}>Today's fat burned</div>
            <div style={{ fontSize: 26, fontWeight: 800, color: C.green, fontFamily: "monospace", marginTop: 2 }}>
              {fatBurned.toFixed(1)}<span style={{ fontSize: 14 }}> g</span>
            </div>
            <div style={{ fontSize: 11, color: C.sub, marginTop: 2 }}>from {Math.round(deficit)} kcal deficit</div>
          </div>
          <div style={{ fontSize: 36 }}>🔥</div>
        </div>
      )}

      {/* steps + water */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <QuickTrack icon="👟" label="Steps" value={steps} goal={goals.steps} color={C.orange} unit="steps" onSave={onSteps} />
        <QuickTrack icon="💧" label="Water" value={water} goal={goals.water} color={C.blue} unit="glasses" onSave={onWater} />
      </div>

      {/* micros */}
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 16 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: C.sub, textTransform: "uppercase", letterSpacing: 1, marginBottom: 12 }}>Micronutrients</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
          <MicroBar label="Fiber"     val={totals.fiber}    goal={goals.fiber    || 25}   unit="g"   color={C.green} />
          <MicroBar label="Sodium"    val={totals.sodium}   goal={goals.sodium   || 2300} unit="mg"  color={C.orange} />
          <MicroBar label="Sugar"     val={totals.sugar}    goal={goals.sugar    || 50}   unit="g"   color={C.pink} />
          <MicroBar label="Calcium"   val={totals.calcium}  goal={goals.calcium  || 1000} unit="mg"  color={C.blue} />
          <MicroBar label="Iron"      val={totals.iron}     goal={goals.iron     || 18}   unit="mg"  color={C.orange} />
          <MicroBar label="Vitamin C" val={totals.vitaminC} goal={goals.vitaminC || 90}   unit="mg"  color={C.accent} />
          <MicroBar label="Vitamin D" val={totals.vitaminD} goal={goals.vitaminD || 20}   unit="mcg" color={C.purple} />
        </div>
      </div>

      {/* food log */}
      {todayLog.length > 0 && (
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.sub, textTransform: "uppercase", letterSpacing: 1 }}>Today's Food</div>
            <button onClick={() => setShowAll(p => !p)} style={{ background: "none", border: "none", color: C.sub, fontSize: 11, cursor: "pointer" }}>{showAll ? "▲ less" : `▼ all ${todayLog.length}`}</button>
          </div>
          {(showAll ? todayLog : todayLog.slice(-4)).map((e, vi) => {
            const ri = showAll ? vi : todayLog.length - 4 + vi;
            return (
              <div key={vi} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: vi < Math.min(showAll ? todayLog.length : 4, todayLog.length) - 1 ? `1px solid ${C.border}` : "none" }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{e.name}</div>
                  <div style={{ fontSize: 11, color: C.sub }}>{e.qty}{e.unit} · {e.meal} · P:{Math.round(e.protein||0)}g C:{Math.round(e.carbs||0)}g F:{Math.round(e.fat||0)}g</div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: C.accent, fontFamily: "monospace" }}>{Math.round(e.cal)}</span>
                  <button onClick={() => onRemove(ri)} style={{ background: "none", border: "none", color: C.muted, cursor: "pointer", fontSize: 18, lineHeight: 1 }}>×</button>
                </div>
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
  const [draft, setDraft] = useState(value);
  const pct = Math.min(value / goal, 1);
  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 14 }}>
      <div style={{ fontSize: 11, color: C.sub, textTransform: "uppercase", letterSpacing: 1, marginBottom: 5, fontWeight: 700 }}>{icon} {label}</div>
      <div style={{ fontSize: 22, fontWeight: 800, color, fontFamily: "monospace" }}>{value.toLocaleString()}</div>
      <div style={{ fontSize: 10, color: C.muted, marginBottom: 8 }}>/ {goal.toLocaleString()} {unit}</div>
      <div style={{ height: 4, background: C.border, borderRadius: 99, marginBottom: 10 }}>
        <div style={{ height: 4, width: `${pct * 100}%`, background: color, borderRadius: 99, transition: "width 0.5s" }} />
      </div>
      {edit ? (
        <div style={{ display: "flex", gap: 6 }}>
          <input type="number" value={draft} onChange={e => setDraft(+e.target.value)}
            style={{ flex: 1, width: 0, background: C.bg, border: `1px solid ${color}`, borderRadius: 6, padding: "5px 8px", color: C.text, fontSize: 12, outline: "none", fontFamily: "inherit" }} />
          <button onClick={() => { onSave(draft); setEdit(false); }}
            style={{ background: color, border: "none", borderRadius: 6, color: C.bg, fontWeight: 700, fontSize: 12, cursor: "pointer", padding: "5px 10px" }}>✓</button>
        </div>
      ) : (
        <button onClick={() => { setDraft(value); setEdit(true); }}
          style={{ background: color + "22", border: `1px solid ${color}44`, borderRadius: 6, color, fontSize: 11, fontWeight: 700, cursor: "pointer", padding: "5px 10px", width: "100%" }}>
          + Update
        </button>
      )}
    </div>
  );
}

// ─── FAT LOSS ─────────────────────────────────────────────────────────────────
function FatLoss({ log, goals, tdee, baseline, profile }) {
  const allDays = Object.keys(log).sort();

  // For each day, calculate deficit vs TDEE (or baseline currentCals if no TDEE)
  const reference = tdee || +(baseline.currentCals) || goals.cal;

  const dayData = useMemo(() => allDays.map(day => {
    const entries = log[day] || [];
    const cal = entries.reduce((a, e) => a + (e.cal || 0), 0);
    const deficit = reference - cal;
    const fatG = deficit > 0 ? deficit / FAT_KCAL_PER_GRAM : 0;
    return { day, cal, deficit, fatG };
  }), [log, reference]);

  const totalDeficit = dayData.reduce((a, d) => a + Math.max(d.deficit, 0), 0);
  const totalFatG = totalDeficit / FAT_KCAL_PER_GRAM;
  const totalFatKg = totalFatG / 1000;

  // streak: consecutive deficit days up to today
  const today = todayStr();
  let streak = 0;
  const sorted = [...dayData].sort((a, b) => b.day.localeCompare(a.day));
  for (const d of sorted) {
    if (d.deficit > 0) streak++;
    else break;
  }

  // 7-day rolling
  const last7 = dayData.slice(-7);
  const last7Fat = last7.reduce((a, d) => a + d.fatG, 0);
  const last30 = dayData.slice(-30);
  const last30Fat = last30.reduce((a, d) => a + d.fatG, 0);

  // motivational equivalents
  const butterPacks = (totalFatG / 100).toFixed(1); // 100g butter packs
  const oilBottles  = (totalFatG / 500).toFixed(2); // 500ml cooking oil

  const bmi = profile.weight && profile.height
    ? (profile.weight / Math.pow(profile.height / 100, 2)).toFixed(1)
    : null;

  function deficitColor(def) {
    if (def > 300) return C.green;
    if (def > 0)   return C.accent;
    return "#f87171";
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* hero */}
      <div style={{ background: `linear-gradient(135deg, ${C.green}18 0%, ${C.accent}0c 100%)`, border: `1px solid ${C.green}30`, borderRadius: 18, padding: 20 }}>
        <div style={{ fontSize: 11, color: C.green, textTransform: "uppercase", letterSpacing: 1.5, fontWeight: 700, marginBottom: 6 }}>Total fat burned (estimated)</div>
        <div style={{ fontSize: 44, fontWeight: 800, color: C.green, fontFamily: "monospace", letterSpacing: -2, lineHeight: 1 }}>
          {totalFatG >= 1000
            ? <>{totalFatKg.toFixed(2)}<span style={{ fontSize: 18 }}> kg</span></>
            : <>{Math.round(totalFatG)}<span style={{ fontSize: 18 }}> g</span></>
          }
        </div>
        <div style={{ fontSize: 12, color: C.sub, marginTop: 6 }}>from {Math.round(totalDeficit).toLocaleString()} kcal total deficit</div>
        <div style={{ fontSize: 11, color: C.sub, marginTop: 4 }}>
          That's <span style={{ color: C.accent, fontWeight: 700 }}>{butterPacks} packs of butter</span> worth of fat gone 🧈
        </div>
      </div>

      {/* streak + stats */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
        {[
          { label: "Streak 🔥", value: `${streak}d`, color: C.orange, sub: "deficit days" },
          { label: "This week", value: `${Math.round(last7Fat)}g`, color: C.accent, sub: "fat burned" },
          { label: "This month", value: `${Math.round(last30Fat)}g`, color: C.blue, sub: "fat burned" },
        ].map(s => (
          <div key={s.label} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: "12px 10px", textAlign: "center" }}>
            <div style={{ fontSize: 10, color: C.sub, marginBottom: 4, fontWeight: 700 }}>{s.label}</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: s.color, fontFamily: "monospace" }}>{s.value}</div>
            <div style={{ fontSize: 10, color: C.muted }}>{s.sub}</div>
          </div>
        ))}
      </div>

      {/* deficit reference info */}
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 14 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: C.sub, textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>Deficit baseline</div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 6 }}>
          <span style={{ color: C.sub }}>Using as reference</span>
          <span style={{ color: C.text, fontWeight: 700 }}>{reference.toLocaleString()} kcal/day</span>
        </div>
        {tdee > 0 && (
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 4 }}>
            <span style={{ color: C.sub }}>TDEE (calculated)</span>
            <span style={{ color: C.accent }}>{tdee} kcal</span>
          </div>
        )}
        {baseline.currentCals && (
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 4 }}>
            <span style={{ color: C.sub }}>Your baseline intake</span>
            <span style={{ color: C.orange }}>{baseline.currentCals} kcal</span>
          </div>
        )}
        {bmi && (
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, paddingTop: 8, borderTop: `1px solid ${C.border}`, marginTop: 6 }}>
            <span style={{ color: C.sub }}>Current BMI</span>
            <span style={{ color: C.purple, fontWeight: 700 }}>{bmi}</span>
          </div>
        )}
        <div style={{ marginTop: 10, padding: 10, background: C.accentDim, borderRadius: 8, fontSize: 11, color: C.sub, lineHeight: 1.6 }}>
          💡 Fat loss calculation: 1g body fat ≈ 7.7 kcal. These are estimates — actual fat loss depends on hormones, water retention, and muscle mass. Trend matters more than daily numbers.
        </div>
      </div>

      {/* daily log */}
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 14 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: C.sub, textTransform: "uppercase", letterSpacing: 1, marginBottom: 12 }}>Daily deficit log</div>
        {dayData.length === 0 && <div style={{ color: C.muted, fontSize: 13, textAlign: "center", padding: 20 }}>No days logged yet</div>}
        {[...dayData].reverse().slice(0, 30).map(d => (
          <div key={d.day} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: `1px solid ${C.border}` }}>
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: C.text }}>{fmtShort(d.day)}</div>
              <div style={{ fontSize: 11, color: C.sub }}>{Math.round(d.cal)} kcal eaten</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: deficitColor(d.deficit) }}>
                {d.deficit > 0 ? `−${Math.round(d.deficit)}` : `+${Math.round(-d.deficit)}`} kcal
              </div>
              {d.fatG > 0 && <div style={{ fontSize: 11, color: C.green }}>🔥 {d.fatG.toFixed(1)}g fat</div>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── HISTORY ──────────────────────────────────────────────────────────────────
function History({ log, steps, water, goals }) {
  const [range, setRange] = useState("30");
  const [compareA, setCompareA] = useState("");
  const [compareB, setCompareB] = useState("");
  const [mode, setMode] = useState("timeline"); // timeline | compare

  const allDays = Object.keys(log).sort((a, b) => b.localeCompare(a));

  // get months for compare
  const months = useMemo(() => {
    const ms = new Set();
    allDays.forEach(d => ms.add(d.slice(0, 7)));
    return [...ms].sort((a, b) => b.localeCompare(a));
  }, [allDays]);

  const filtered = allDays.slice(0, +range);

  function monthStats(prefix) {
    const days = allDays.filter(d => d.startsWith(prefix));
    return days.reduce((a, day) => {
      const entries = log[day] || [];
      const cal = entries.reduce((s, e) => s + (e.cal || 0), 0);
      a.totalCal += cal;
      a.days++;
      a.totalSteps += steps[day] || 0;
      a.totalWater += water[day] || 0;
      a.totalProtein += entries.reduce((s, e) => s + (e.protein || 0), 0);
      return a;
    }, { totalCal: 0, days: 0, totalSteps: 0, totalWater: 0, totalProtein: 0 });
  }

  const statA = compareA ? monthStats(compareA) : null;
  const statB = compareB ? monthStats(compareB) : null;

  function fmtMonth(m) {
    if (!m) return "";
    const [y, mo] = m.split("-");
    return new Date(+y, +mo - 1).toLocaleDateString("en-IN", { month: "long", year: "numeric" });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", gap: 8 }}>
        <Btn variant={mode === "timeline" ? "accent" : "ghost"} onClick={() => setMode("timeline")}>📅 Timeline</Btn>
        <Btn variant={mode === "compare" ? "accent" : "ghost"} onClick={() => setMode("compare")}>⚖️ Compare</Btn>
      </div>

      {mode === "timeline" && (
        <>
          <Sel label="Show last" value={range} onChange={e => setRange(e.target.value)}>
            <option value="7">7 days</option>
            <option value="30">30 days</option>
            <option value="90">90 days</option>
            <option value="365">1 year</option>
            <option value="9999">All time</option>
          </Sel>

          {allDays.length === 0 && <div style={{ textAlign: "center", color: C.muted, fontSize: 13, padding: 40 }}>Nothing logged yet.</div>}

          {filtered.map(day => {
            const entries = log[day] || [];
            const cal = entries.reduce((a, e) => a + (e.cal || 0), 0);
            const s = steps[day] || 0;
            const w = water[day] || 0;
            const pct = Math.min(cal / goals.cal, 1);
            const over = cal > goals.cal;
            return (
              <div key={day} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 14 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{fmtDate(day)}</div>
                  <div style={{ fontSize: 13, fontFamily: "monospace", color: over ? "#f87171" : C.accent, fontWeight: 700 }}>{Math.round(cal)} kcal</div>
                </div>
                <div style={{ height: 4, background: C.border, borderRadius: 99, marginBottom: 8 }}>
                  <div style={{ height: 4, width: `${pct * 100}%`, background: over ? "#f87171" : C.accent, borderRadius: 99, transition: "width 0.4s" }} />
                </div>
                <div style={{ display: "flex", gap: 14, fontSize: 11, color: C.sub }}>
                  <span>👟 {s.toLocaleString()}</span>
                  <span>💧 {w}g</span>
                  <span>🍽 {entries.length} items</span>
                </div>
              </div>
            );
          })}
        </>
      )}

      {mode === "compare" && (
        <>
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.sub, textTransform: "uppercase", letterSpacing: 1, marginBottom: 12 }}>Compare two months</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <Sel label="Month A" value={compareA} onChange={e => setCompareA(e.target.value)}>
                <option value="">Select…</option>
                {months.map(m => <option key={m} value={m}>{fmtMonth(m)}</option>)}
              </Sel>
              <Sel label="Month B" value={compareB} onChange={e => setCompareB(e.target.value)}>
                <option value="">Select…</option>
                {months.map(m => <option key={m} value={m}>{fmtMonth(m)}</option>)}
              </Sel>
            </div>
          </div>

          {statA && statB && (
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 14 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4, marginBottom: 12 }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: C.accent, textAlign: "center" }}>{fmtMonth(compareA)}</div>
                <div style={{ fontSize: 13, fontWeight: 800, color: C.blue, textAlign: "center" }}>{fmtMonth(compareB)}</div>
              </div>
              {[
                { label: "Days logged",    a: statA.days,     b: statB.days,     fmt: v => v },
                { label: "Avg calories",   a: statA.days ? Math.round(statA.totalCal/statA.days) : 0,     b: statB.days ? Math.round(statB.totalCal/statB.days) : 0,     fmt: v => `${v} kcal`, lowerBetter: true },
                { label: "Avg steps",      a: statA.days ? Math.round(statA.totalSteps/statA.days) : 0,   b: statB.days ? Math.round(statB.totalSteps/statB.days) : 0,   fmt: v => v.toLocaleString() },
                { label: "Avg protein",    a: statA.days ? Math.round(statA.totalProtein/statA.days) : 0, b: statB.days ? Math.round(statB.totalProtein/statB.days) : 0, fmt: v => `${v}g` },
                { label: "Total cal deficit (est)", a: Math.max(0, goals.cal*statA.days - statA.totalCal), b: Math.max(0, goals.cal*statB.days - statB.totalCal), fmt: v => `${Math.round(v)} kcal` },
              ].map(row => {
                const aWins = row.lowerBetter ? row.a < row.b : row.a > row.b;
                return (
                  <div key={row.label} style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", gap: 8, alignItems: "center", padding: "8px 0", borderBottom: `1px solid ${C.border}` }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: aWins ? C.accent : C.sub, fontFamily: "monospace", textAlign: "right" }}>{row.fmt(row.a)}</div>
                    <div style={{ fontSize: 10, color: C.muted, textAlign: "center", width: 70 }}>{row.label}</div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: !aWins ? C.blue : C.sub, fontFamily: "monospace" }}>{row.fmt(row.b)}</div>
                  </div>
                );
              })}
            </div>
          )}

          {months.length < 2 && (
            <div style={{ textAlign: "center", color: C.muted, fontSize: 13, padding: 30 }}>Need data from at least 2 months to compare.</div>
          )}
        </>
      )}
    </div>
  );
}

// ─── PROFILE ──────────────────────────────────────────────────────────────────
function Profile({ profile, baseline, goals, bmr, tdee, onProfile, onBaseline, onGoals }) {
  const [gDraft, setGDraft] = useState(goals);
  const [bDraft, setBDraft] = useState(baseline);
  const [goalsOpen, setGoalsOpen] = useState(false);

  const bmi = profile.weight && profile.height
    ? +(profile.weight / Math.pow(profile.height / 100, 2)).toFixed(1)
    : null;

  const bmiLabel = bmi
    ? bmi < 18.5 ? "Underweight" : bmi < 25 ? "Normal weight" : bmi < 30 ? "Overweight" : "Obese"
    : null;

  const bmiColor = bmi
    ? bmi < 18.5 ? C.blue : bmi < 25 ? C.green : bmi < 30 ? C.orange : "#f87171"
    : C.sub;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* body stats */}
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 16 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: C.sub, textTransform: "uppercase", letterSpacing: 1, marginBottom: 14 }}>Body Stats</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <Input label="Weight (kg)" type="number" value={profile.weight} onChange={e => onProfile("weight", +e.target.value)} placeholder="e.g. 65" />
          <Input label="Height (cm)" type="number" value={profile.height} onChange={e => onProfile("height", +e.target.value)} placeholder="e.g. 162" />
          <Input label="Age" type="number" value={profile.age} onChange={e => onProfile("age", +e.target.value)} placeholder="e.g. 28" />
          <Sel label="Sex" value={profile.sex} onChange={e => onProfile("sex", e.target.value)}>
            <option value="female">Female</option>
            <option value="male">Male</option>
          </Sel>
        </div>
        <div style={{ marginTop: 10 }}>
          <Sel label="Activity level" value={profile.activity} onChange={e => onProfile("activity", e.target.value)}>
            <option value="sedentary">Sedentary (desk job, no exercise)</option>
            <option value="light">Light (1-3 days/week)</option>
            <option value="moderate">Moderate (3-5 days/week)</option>
            <option value="active">Active (6-7 days/week)</option>
            <option value="very_active">Very active (2x/day or physical job)</option>
          </Sel>
        </div>

        {bmi && (
          <div style={{ marginTop: 14, padding: 12, background: bmiColor + "18", border: `1px solid ${bmiColor}30`, borderRadius: 10, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ fontSize: 11, color: C.sub, marginBottom: 2 }}>BMI</div>
              <div style={{ fontSize: 24, fontWeight: 800, color: bmiColor, fontFamily: "monospace" }}>{bmi}</div>
            </div>
            <div style={{ fontSize: 13, color: bmiColor, fontWeight: 700 }}>{bmiLabel}</div>
          </div>
        )}

        {bmr > 0 && (
          <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <div style={{ background: C.surface, borderRadius: 10, padding: 12, textAlign: "center" }}>
              <div style={{ fontSize: 10, color: C.sub, textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>BMR</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: C.purple, fontFamily: "monospace" }}>{bmr}</div>
              <div style={{ fontSize: 10, color: C.muted }}>kcal/day (at rest)</div>
            </div>
            <div style={{ background: C.surface, borderRadius: 10, padding: 12, textAlign: "center" }}>
              <div style={{ fontSize: 10, color: C.sub, textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>TDEE</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: C.accent, fontFamily: "monospace" }}>{tdee}</div>
              <div style={{ fontSize: 10, color: C.muted }}>kcal/day (with activity)</div>
            </div>
          </div>
        )}
      </div>

      {/* baseline */}
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 16 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: C.sub, textTransform: "uppercase", letterSpacing: 1, marginBottom: 14 }}>Intake Baseline</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <Input label="Current avg daily intake (kcal)" type="number" value={bDraft.currentCals}
            onChange={e => setBDraft(p => ({ ...p, currentCals: e.target.value }))}
            placeholder="e.g. 2200 — what you eat on a normal day"
            hint="Used to calculate your real deficit vs your actual eating habits" />
          <Input label="Override BMR manually (optional)" type="number" value={bDraft.bmrOverride}
            onChange={e => setBDraft(p => ({ ...p, bmrOverride: e.target.value }))}
            placeholder="Leave blank to auto-calculate from body stats"
            hint="If you've had a clinical BMR test or have a doctor's figure" />
          <Btn variant="accent" full onClick={() => onBaseline(bDraft)}>Save Baseline</Btn>
        </div>
      </div>

      {/* goals */}
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.sub, textTransform: "uppercase", letterSpacing: 1 }}>Daily Goals</div>
          <Btn variant="ghost" onClick={() => { setGDraft(goals); setGoalsOpen(true); }} style={{ padding: "6px 12px", fontSize: 12 }}>Edit →</Btn>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {[["Calories", goals.cal, "kcal"], ["Protein", goals.protein, "g"], ["Carbs", goals.carbs, "g"], ["Fat", goals.fat, "g"], ["Steps", goals.steps, ""], ["Water", goals.water, "glasses"]].map(([l, v, u]) => (
            <div key={l} style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
              <span style={{ color: C.sub }}>{l}</span>
              <span style={{ color: C.text, fontFamily: "monospace", fontWeight: 700 }}>{v} {u}</span>
            </div>
          ))}
        </div>
      </div>

      <Modal open={goalsOpen} onClose={() => setGoalsOpen(false)} title="Edit Daily Goals">
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            {[["cal","Calories (kcal)"],["protein","Protein (g)"],["carbs","Carbs (g)"],["fat","Fat (g)"],["fiber","Fiber (g)"],["sodium","Sodium (mg)"],["sugar","Sugar (g)"],["calcium","Calcium (mg)"],["iron","Iron (mg)"],["vitaminC","Vit C (mg)"],["vitaminD","Vit D (mcg)"],["steps","Steps"],["water","Water (glasses)"]].map(([k,l]) => (
              <Input key={k} label={l} type="number" value={gDraft[k]} onChange={e => setGDraft(p => ({ ...p, [k]: +e.target.value }))} />
            ))}
          </div>
          <Btn variant="accent" full onClick={() => { onGoals(gDraft); setGoalsOpen(false); }}>Save Goals</Btn>
        </div>
      </Modal>
    </div>
  );
}

// ─── LOG FOOD ─────────────────────────────────────────────────────────────────
function LogFood({ ingredients, recipes, onAdd }) {
  const [mode, setMode] = useState("library");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState(null);
  const [qty, setQty] = useState(100);
  const [unit, setUnit] = useState("g");
  const [meal, setMeal] = useState("Lunch");
  const [manual, setManual] = useState({ name:"",cal:"",protein:"",carbs:"",fat:"",fiber:"",sodium:"",sugar:"",calcium:"",iron:"",vitaminC:"",vitaminD:"" });
  const [mQty, setMQty] = useState(1);
  const [mUnit, setMUnit] = useState("serving");

  const all = [...ingredients.map(i => ({...i,_t:"food"})), ...recipes.map(r => ({...r,_t:"recipe"}))];
  const filtered = all.filter(i => i.name?.toLowerCase().includes(search.toLowerCase()));
  const UNITS = ["g","ml","oz","serving","tbsp","tsp","cup","piece","katori","roti","bowl"];

  function calcEntry(item, q, u) {
    const ratio = q / (item.servingSize || 100);
    return { name:item.name, qty:q, unit:u, meal,
      cal:(item.cal||0)*ratio, protein:(item.protein||0)*ratio, carbs:(item.carbs||0)*ratio,
      fat:(item.fat||0)*ratio, fiber:(item.fiber||0)*ratio, sodium:(item.sodium||0)*ratio,
      sugar:(item.sugar||0)*ratio, calcium:(item.calcium||0)*ratio, iron:(item.iron||0)*ratio,
      vitaminC:(item.vitaminC||0)*ratio, vitaminD:(item.vitaminD||0)*ratio };
  }

  function addLib() {
    if (!selected) return;
    onAdd(calcEntry(selected, qty, unit));
    setSelected(null); setSearch(""); setQty(100);
  }

  function addManual() {
    if (!manual.name) return;
    onAdd({ name:manual.name, qty:mQty, unit:mUnit, meal, cal:+(manual.cal||0), protein:+(manual.protein||0), carbs:+(manual.carbs||0), fat:+(manual.fat||0), fiber:+(manual.fiber||0), sodium:+(manual.sodium||0), sugar:+(manual.sugar||0), calcium:+(manual.calcium||0), iron:+(manual.iron||0), vitaminC:+(manual.vitaminC||0), vitaminD:+(manual.vitaminD||0) });
    setManual({ name:"",cal:"",protein:"",carbs:"",fat:"",fiber:"",sodium:"",sugar:"",calcium:"",iron:"",vitaminC:"",vitaminD:"" });
  }

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
      <div style={{ display:"flex", gap:8 }}>
        <Btn variant={mode==="library"?"accent":"ghost"} onClick={()=>setMode("library")}>📦 Library</Btn>
        <Btn variant={mode==="manual"?"accent":"ghost"} onClick={()=>setMode("manual")}>✏️ Manual</Btn>
      </div>
      <Sel label="Meal" value={meal} onChange={e=>setMeal(e.target.value)}>
        {["Breakfast","Lunch","Dinner","Snack","Pre-workout","Post-workout"].map(m=><option key={m}>{m}</option>)}
      </Sel>

      {mode==="library" ? (
        <>
          <Input label="Search food or recipe" value={search} onChange={e=>{setSearch(e.target.value);setSelected(null);}} placeholder="dal, roti, eggs, whey…"/>
          {search.length>0 && !selected && (
            <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:10, overflow:"hidden" }}>
              {filtered.length===0 && <div style={{ padding:16, color:C.muted, fontSize:13, textAlign:"center" }}>Not in library. Scan or add manually.</div>}
              {filtered.map((item,i)=>(
                <div key={i} onClick={()=>{setSelected(item);setUnit(item.servingUnit||"g");setQty(item.servingSize||100);}}
                  style={{ padding:"12px 14px", cursor:"pointer", borderBottom:`1px solid ${C.border}`, display:"flex", justifyContent:"space-between", alignItems:"center" }}
                  onMouseEnter={e=>e.currentTarget.style.background=C.card}
                  onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                  <div>
                    <div style={{ fontSize:14, fontWeight:600, color:C.text }}>{item.name}</div>
                    <div style={{ fontSize:11, color:C.sub }}>{item.cal} kcal / {item.servingSize}{item.servingUnit}</div>
                  </div>
                  <span style={{ background:item._t==="recipe"?C.pinkDim:C.blueDim, color:item._t==="recipe"?C.pink:C.blue, border:`1px solid ${item._t==="recipe"?C.pink:C.blue}44`, borderRadius:6, padding:"3px 8px", fontSize:10, fontWeight:700 }}>
                    {item._t==="recipe"?"Recipe":"Food"}
                  </span>
                </div>
              ))}
            </div>
          )}
          {selected && (
            <div style={{ background:C.card, border:`1px solid ${C.accent}44`, borderRadius:12, padding:16 }}>
              <div style={{ fontSize:15, fontWeight:700, color:C.text, marginBottom:12 }}>{selected.name}</div>
              <div style={{ display:"flex", gap:8, marginBottom:12 }}>
                <Input label="Qty" type="number" value={qty} onChange={e=>setQty(+e.target.value)} style={{ flex:1 }}/>
                <Sel label="Unit" value={unit} onChange={e=>setUnit(e.target.value)} style={{ flex:1 }}>
                  {UNITS.map(u=><option key={u}>{u}</option>)}
                </Sel>
              </div>
              {(()=>{ const e=calcEntry(selected,qty,unit); return (
                <div style={{ display:"flex", gap:6, marginBottom:14 }}>
                  <Pill label="kcal"    value={Math.round(e.cal)}     color={C.accent}/>
                  <Pill label="protein" value={`${Math.round(e.protein)}g`} color={C.blue}/>
                  <Pill label="carbs"   value={`${Math.round(e.carbs)}g`}   color={C.green}/>
                  <Pill label="fat"     value={`${Math.round(e.fat)}g`}     color={C.pink}/>
                </div>
              ); })()}
              <Btn variant="accent" full onClick={addLib}>+ Add to Today</Btn>
            </div>
          )}
        </>
      ) : (
        <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
          <Input label="Food name" value={manual.name} onChange={e=>setManual(p=>({...p,name:e.target.value}))} placeholder="e.g. Maa ki dal"/>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
            {[["cal","Calories"],["protein","Protein (g)"],["carbs","Carbs (g)"],["fat","Fat (g)"],["fiber","Fiber (g)"],["sodium","Sodium (mg)"],["sugar","Sugar (g)"],["calcium","Calcium (mg)"],["iron","Iron (mg)"],["vitaminC","Vit C (mg)"],["vitaminD","Vit D (mcg)"]].map(([k,l])=>(
              <Input key={k} label={l} type="number" value={manual[k]} onChange={e=>setManual(p=>({...p,[k]:e.target.value}))} placeholder="0"/>
            ))}
          </div>
          <div style={{ display:"flex", gap:8 }}>
            <Input label="Qty" type="number" value={mQty} onChange={e=>setMQty(+e.target.value)} style={{ flex:1 }}/>
            <Sel label="Unit" value={mUnit} onChange={e=>setMUnit(e.target.value)} style={{ flex:1 }}>
              {UNITS.map(u=><option key={u}>{u}</option>)}
            </Sel>
          </div>
          <Btn variant="accent" full onClick={addManual}>+ Add to Today</Btn>
        </div>
      )}
    </div>
  );
}

// ─── SCAN LABEL ───────────────────────────────────────────────────────────────
function ScanLabel({ ingredients, onSave }) {
  const [preview, setPreview] = useState(null);
  const [imageB64, setImageB64] = useState(null);
  const [scanning, setScanning] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [saved, setSaved] = useState(false);
  const [editing, setEditing] = useState(false);
  const fileRef = useRef();

  function handleFile(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = e => { setPreview(e.target.result); setImageB64(e.target.result.split(",")[1]); setResult(null); setSaved(false); setError(null); setEditing(false); };
    reader.readAsDataURL(file);
  }

  async function scanLabel() {
    if (!imageB64) return;
    setScanning(true); setError(null);
    try {
      const resp = await fetch("https://api.anthropic.com/v1/messages", {
        method:"POST", headers:{"Content-Type":"application/json"},
        body:JSON.stringify({ model:"claude-sonnet-4-20250514", max_tokens:1000,
          messages:[{ role:"user", content:[
            { type:"image", source:{ type:"base64", media_type:"image/jpeg", data:imageB64 } },
            { type:"text", text:`Read this nutrition label. Return ONLY raw JSON, no markdown or backticks:
{"name":"product name","servingSize":number,"servingUnit":"g/ml/piece","cal":number,"protein":number,"carbs":number,"fat":number,"fiber":number,"sodium":number,"sugar":number,"saturatedFat":number,"transFat":number,"cholesterol":number,"potassium":number,"calcium":number,"iron":number,"vitaminC":number,"vitaminD":number}
All values are numbers. sodium/calcium/iron/potassium in mg. vitaminD in mcg. others in g. Use 0 if not visible.` }
          ]}]
        })
      });
      const data = await resp.json();
      const text = data.content?.find(b=>b.type==="text")?.text||"";
      setResult(JSON.parse(text.replace(/```json|```/g,"").trim()));
    } catch { setError("Couldn't read the label. Try a clearer, well-lit photo."); }
    finally { setScanning(false); }
  }

  const fields=[["cal","Calories"],["protein","Protein (g)"],["carbs","Carbs (g)"],["fat","Fat (g)"],["fiber","Fiber (g)"],["sodium","Sodium (mg)"],["sugar","Sugar (g)"],["saturatedFat","Sat. Fat (g)"],["cholesterol","Cholesterol (mg)"],["potassium","Potassium (mg)"],["calcium","Calcium (mg)"],["iron","Iron (mg)"],["vitaminC","Vit C (mg)"],["vitaminD","Vit D (mcg)"]];

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
      <div style={{ background:C.card, border:`2px dashed ${preview?C.accent+"55":C.border}`, borderRadius:16, padding:preview?14:28, textAlign:"center", transition:"border-color 0.3s" }}>
        {preview ? (
          <>
            <img src={preview} alt="label" style={{ maxWidth:"100%", maxHeight:180, borderRadius:10, objectFit:"contain", marginBottom:10 }}/>
            <div style={{ display:"flex", gap:8, justifyContent:"center" }}>
              <Btn onClick={()=>{setPreview(null);setImageB64(null);setResult(null);setSaved(false);}} variant="ghost">Remove</Btn>
              <Btn onClick={()=>fileRef.current?.click()} variant="flat">Change</Btn>
            </div>
          </>
        ) : (
          <>
            <div style={{ fontSize:40, marginBottom:8 }}>📷</div>
            <div style={{ fontSize:14, fontWeight:700, color:C.text, marginBottom:5 }}>Photograph a nutrition label</div>
            <div style={{ fontSize:12, color:C.sub, marginBottom:16, lineHeight:1.6 }}>Packaged food, supplements, protein powder, eggs, bread, milk — anything with a Nutrition Facts panel</div>
            <Btn variant="accent" onClick={()=>fileRef.current?.click()}>Upload / Take Photo</Btn>
          </>
        )}
        <input ref={fileRef} type="file" accept="image/*" capture="environment" style={{ display:"none" }} onChange={e=>handleFile(e.target.files[0])}/>
      </div>

      {imageB64 && !result && !scanning && <Btn variant="accent" full onClick={scanLabel}>🔍 Scan & Extract Nutrients</Btn>}
      {scanning && (
        <div style={{ background:C.accentDim, border:`1px solid ${C.accent}44`, borderRadius:10, padding:14, textAlign:"center" }}>
          <div className="pulse" style={{ color:C.accent, fontSize:13, fontWeight:700 }}>🔍 Reading label…</div>
        </div>
      )}
      {error && <div style={{ background:"#ef444420", border:"1px solid #ef444438", borderRadius:10, padding:14, color:"#f87171", fontSize:13 }}>⚠️ {error}</div>}

      {result && (
        <div style={{ background:C.card, border:`1px solid ${C.green}44`, borderRadius:16, padding:16 }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:14 }}>
            <div>
              {editing ? <Input value={result.name} onChange={e=>setResult(p=>({...p,name:e.target.value}))} style={{ marginBottom:4 }}/> : <div style={{ fontSize:15, fontWeight:800, color:C.text }}>{result.name}</div>}
              <div style={{ fontSize:11, color:C.sub, marginTop:4 }}>Per {result.servingSize}{result.servingUnit}</div>
            </div>
            <span style={{ background:C.greenDim, color:C.green, border:`1px solid ${C.green}44`, borderRadius:6, padding:"3px 10px", fontSize:11, fontWeight:700 }}>Scanned ✓</span>
          </div>
          <div style={{ display:"flex", gap:6, marginBottom:12 }}>
            <Pill label="kcal"    value={result.cal}           color={C.accent}/>
            <Pill label="protein" value={`${result.protein}g`} color={C.blue}/>
            <Pill label="carbs"   value={`${result.carbs}g`}   color={C.green}/>
            <Pill label="fat"     value={`${result.fat}g`}     color={C.pink}/>
          </div>
          {editing ? (
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginBottom:12 }}>
              {fields.map(([k,l])=><Input key={k} label={l} type="number" value={result[k]||0} onChange={e=>setResult(p=>({...p,[k]:+e.target.value}))}/>)}
            </div>
          ) : (
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:5, marginBottom:12 }}>
              {fields.filter(([k])=>result[k]>0).map(([k,l])=>(
                <div key={k} style={{ display:"flex", justifyContent:"space-between", background:C.surface, borderRadius:7, padding:"6px 10px" }}>
                  <span style={{ fontSize:11, color:C.sub }}>{l.split(" (")[0]}</span>
                  <span style={{ fontSize:11, color:C.text, fontFamily:"monospace" }}>{result[k]}</span>
                </div>
              ))}
            </div>
          )}
          <div style={{ display:"flex", gap:8 }}>
            <Btn variant="flat" onClick={()=>setEditing(p=>!p)} style={{ flex:1 }}>{editing?"✓ Done":"✏️ Edit"}</Btn>
            {!saved && <Btn variant="green" onClick={()=>{ onSave([...ingredients,{...result,id:Date.now()}]); setSaved(true); }} style={{ flex:1 }}>Save to Library</Btn>}
          </div>
          {saved && <div style={{ marginTop:8, background:C.greenDim, border:`1px solid ${C.green}44`, borderRadius:8, padding:10, textAlign:"center", color:C.green, fontSize:13, fontWeight:700 }}>✓ Saved! Log it from the "Log" tab.</div>}
        </div>
      )}
    </div>
  );
}

// ─── LIBRARY ──────────────────────────────────────────────────────────────────
function Library({ ingredients, recipes, onSaveIng, onSaveRec }) {
  const [view, setView] = useState("ingredients");
  const [showAddIng, setShowAddIng] = useState(false);
  const [showAddRec, setShowAddRec] = useState(false);
  const [ingF, setIngF] = useState({name:"",servingSize:100,servingUnit:"g",cal:"",protein:"",carbs:"",fat:"",fiber:"",sodium:"",sugar:"",calcium:"",iron:"",vitaminC:"",vitaminD:""});
  const [recF, setRecF] = useState({name:"",items:[],note:""});
  const [rSrc, setRSrc] = useState("");
  const [rQty, setRQty] = useState({});
  const [rUnit, setRUnit] = useState({});

  function saveIng() {
    if (!ingF.name) return;
    const n={...ingF,id:Date.now()};
    ["servingSize","cal","protein","carbs","fat","fiber","sodium","sugar","calcium","iron","vitaminC","vitaminD"].forEach(k=>n[k]=+(n[k]||0));
    onSaveIng([...ingredients,n]); setIngF({name:"",servingSize:100,servingUnit:"g",cal:"",protein:"",carbs:"",fat:"",fiber:"",sodium:"",sugar:"",calcium:"",iron:"",vitaminC:"",vitaminD:""}); setShowAddIng(false);
  }

  function addIngToRec(ing) {
    const q=+(rQty[ing.id]||ing.servingSize||100); const u=rUnit[ing.id]||ing.servingUnit||"g"; const r=q/(ing.servingSize||100);
    setRecF(p=>({...p,items:[...p.items,{...ing,qty:q,unit:u,cal:(ing.cal||0)*r,protein:(ing.protein||0)*r,carbs:(ing.carbs||0)*r,fat:(ing.fat||0)*r,fiber:(ing.fiber||0)*r,sodium:(ing.sodium||0)*r,sugar:(ing.sugar||0)*r,calcium:(ing.calcium||0)*r,iron:(ing.iron||0)*r,vitaminC:(ing.vitaminC||0)*r,vitaminD:(ing.vitaminD||0)*r}]}));
    setRSrc("");
  }

  function saveRec() {
    if (!recF.name||recF.items.length===0) return;
    const t=recF.items.reduce((a,i)=>({cal:a.cal+(i.cal||0),protein:a.protein+(i.protein||0),carbs:a.carbs+(i.carbs||0),fat:a.fat+(i.fat||0),fiber:a.fiber+(i.fiber||0),sodium:a.sodium+(i.sodium||0),sugar:a.sugar+(i.sugar||0),calcium:a.calcium+(i.calcium||0),iron:a.iron+(i.iron||0),vitaminC:a.vitaminC+(i.vitaminC||0),vitaminD:a.vitaminD+(i.vitaminD||0)}),{cal:0,protein:0,carbs:0,fat:0,fiber:0,sodium:0,sugar:0,calcium:0,iron:0,vitaminC:0,vitaminD:0});
    onSaveRec([...recipes,{...recF,...t,servingSize:1,servingUnit:"serving",id:Date.now()}]); setRecF({name:"",items:[],note:""}); setShowAddRec(false);
  }

  const filtRec=ingredients.filter(i=>i.name?.toLowerCase().includes(rSrc.toLowerCase()));
  const UNITS=["g","ml","piece","tbsp","tsp","cup","serving","roti","katori"];

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
      <div style={{ display:"flex", gap:8 }}>
        <Btn variant={view==="ingredients"?"accent":"ghost"} onClick={()=>setView("ingredients")}>🧂 Foods ({ingredients.length})</Btn>
        <Btn variant={view==="recipes"?"accent":"ghost"} onClick={()=>setView("recipes")}>🍲 Recipes ({recipes.length})</Btn>
      </div>

      {view==="ingredients" && (
        <>
          <Btn variant="flat" full onClick={()=>setShowAddIng(true)}>+ Add Food Manually</Btn>
          {ingredients.length===0&&<div style={{ textAlign:"center", color:C.muted, fontSize:13, padding:32 }}>No foods yet. Scan a label or add manually.</div>}
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

      {view==="recipes" && (
        <>
          <Btn variant="flat" full onClick={()=>setShowAddRec(true)}>+ Build a Recipe</Btn>
          {recipes.length===0&&<div style={{ textAlign:"center", color:C.muted, fontSize:13, padding:32 }}>No recipes yet.</div>}
          {recipes.map(rec=>(
            <div key={rec.id} style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:12, padding:14 }}>
              <div style={{ display:"flex", justifyContent:"space-between" }}>
                <div>
                  <div style={{ fontSize:14, fontWeight:700, color:C.text }}>{rec.name}</div>
                  <div style={{ fontSize:11, color:C.sub }}>{rec.items?.length} items · {Math.round(rec.cal)} kcal</div>
                  <div style={{ fontSize:11, color:C.muted, marginTop:2 }}>P:{Math.round(rec.protein)}g  C:{Math.round(rec.carbs)}g  F:{Math.round(rec.fat)}g</div>
                  {rec.note&&<div style={{ fontSize:11, color:C.sub, fontStyle:"italic", marginTop:2 }}>{rec.note}</div>}
                </div>
                <button onClick={()=>onSaveRec(recipes.filter(r=>r.id!==rec.id))} style={{ background:"none", border:"none", color:C.muted, cursor:"pointer", fontSize:18 }}>🗑</button>
              </div>
            </div>
          ))}
        </>
      )}

      <Modal open={showAddIng} onClose={()=>setShowAddIng(false)} title="Add Food">
        <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
          <Input label="Name" value={ingF.name} onChange={e=>setIngF(p=>({...p,name:e.target.value}))} placeholder="e.g. Amul Full Cream Milk"/>
          <div style={{ display:"flex", gap:8 }}>
            <Input label="Serving" type="number" value={ingF.servingSize} onChange={e=>setIngF(p=>({...p,servingSize:e.target.value}))} style={{ flex:1 }}/>
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

      <Modal open={showAddRec} onClose={()=>setShowAddRec(false)} title="Build Recipe">
        <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
          <Input label="Recipe name" value={recF.name} onChange={e=>setRecF(p=>({...p,name:e.target.value}))} placeholder="e.g. Dal tadka"/>
          <Input label="Search foods" value={rSrc} onChange={e=>setRSrc(e.target.value)} placeholder="Search library…"/>
          {rSrc.length>0 && (
            <div style={{ background:C.bg, border:`1px solid ${C.border}`, borderRadius:10, maxHeight:170, overflowY:"auto" }}>
              {filtRec.length===0&&<div style={{ padding:12, color:C.muted, fontSize:12, textAlign:"center" }}>Not found</div>}
              {filtRec.map((ing,i)=>(
                <div key={i} style={{ padding:"10px 12px", borderBottom:`1px solid ${C.border}` }}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:6 }}>
                    <span style={{ fontSize:13, fontWeight:600, color:C.text }}>{ing.name}</span>
                    <Btn variant="accent" onClick={()=>addIngToRec(ing)} style={{ padding:"4px 12px", fontSize:12 }}>Add</Btn>
                  </div>
                  <div style={{ display:"flex", gap:6 }}>
                    <input type="number" defaultValue={ing.servingSize} onChange={e=>setRQty(p=>({...p,[ing.id]:+e.target.value}))} style={{ width:60, background:C.surface, border:`1px solid ${C.border}`, borderRadius:6, padding:"4px 8px", color:C.text, fontSize:12, outline:"none" }}/>
                    <select defaultValue={ing.servingUnit} onChange={e=>setRUnit(p=>({...p,[ing.id]:e.target.value}))} style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:6, padding:"4px 8px", color:C.text, fontSize:12, outline:"none" }}>
                      {UNITS.map(u=><option key={u}>{u}</option>)}
                    </select>
                  </div>
                </div>
              ))}
            </div>
          )}
          {recF.items.length>0 && (
            <div>
              <div style={{ fontSize:11, color:C.sub, textTransform:"uppercase", letterSpacing:1, marginBottom:8 }}>{recF.items.length} items added</div>
              {recF.items.map((item,i)=>(
                <div key={i} style={{ display:"flex", justifyContent:"space-between", padding:"6px 0", borderBottom:`1px solid ${C.border}`, fontSize:12 }}>
                  <span style={{ color:C.text }}>{item.name} — {item.qty}{item.unit}</span>
                  <div style={{ display:"flex", gap:10, alignItems:"center" }}>
                    <span style={{ color:C.accent, fontFamily:"monospace" }}>{Math.round(item.cal)} kcal</span>
                    <button onClick={()=>setRecF(p=>({...p,items:p.items.filter((_,idx)=>idx!==i)}))} style={{ background:"none", border:"none", color:C.muted, cursor:"pointer", fontSize:16 }}>×</button>
                  </div>
                </div>
              ))}
              <div style={{ marginTop:8, fontSize:13, fontWeight:700, color:C.text }}>Total: {Math.round(recF.items.reduce((a,i)=>a+(i.cal||0),0))} kcal</div>
            </div>
          )}
          <Input label="Notes (optional)" value={recF.note} onChange={e=>setRecF(p=>({...p,note:e.target.value}))} placeholder="e.g. makes 4 katoris"/>
          <Btn variant="accent" full onClick={saveRec}>Save Recipe</Btn>
        </div>
      </Modal>
    </div>
  );
}
