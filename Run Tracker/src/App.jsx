import React, { useState, useEffect, useMemo, useRef } from 'react';
import { ChevronLeft, ChevronRight, CheckCircle, Circle, Activity, Calendar as CalendarIcon, RefreshCw, Zap, Trophy, MapPin, Clock, Home, List, Plus, Trash2 } from 'lucide-react';

// --- 訓練模式定義 (加入 Trail Run 及 Complex 標記) ---
const MODES = {
  SPRINT: { id: 'SPRINT', name: 'Sprint', color: 'bg-[#FF3B30] text-white', dotClass: 'bg-[#FF3B30]', defaultDistUnit: 'm', defaultRestUnit: 's', isComplex: true, inMain: true, isRun: true },
  VO2: { id: 'VO2', name: 'VO2 max Interval', color: 'bg-[#AF52DE] text-white', dotClass: 'bg-[#AF52DE]', defaultDistUnit: 'm', defaultRestUnit: 's', isComplex: true, inMain: true, isRun: true },
  LT_INT: { id: 'LT_INT', name: 'LT Interval', color: 'bg-[#34C759] text-white', dotClass: 'bg-[#34C759]', defaultDistUnit: 'km', defaultRestUnit: 'min', isComplex: true, inMain: true, isRun: true },
  LT_TEMPO: { id: 'LT_TEMPO', name: 'LT Tempo', color: 'bg-[#FFCC00] text-black', dotClass: 'bg-[#FFCC00]', defaultDistUnit: 'km', defaultRestUnit: 'min', isComplex: true, inMain: true, isRun: true },
  LONG: { id: 'LONG', name: 'Long Run', color: 'bg-[#0040DD] text-white', dotClass: 'bg-[#0040DD]', defaultDistUnit: 'km', defaultRestUnit: 'min', isComplex: true, inMain: true, isRun: true },
  TRAIL: { id: 'TRAIL', name: 'Trail Run', color: 'bg-gradient-to-r from-blue-500 to-green-500 text-white border-transparent', dotClass: 'bg-gradient-to-br from-blue-500 to-green-500', inMain: true, isRun: true, isComplex: false },
  EASY: { id: 'EASY', name: 'Easy Run', color: 'bg-[#5AC8FA] text-black', dotClass: 'bg-[#5AC8FA]', defaultDistUnit: 'km', defaultRestUnit: 'min', hasSets: false, isComplex: false, inMain: true, isRun: true },
  CUSTOM: { id: 'CUSTOM', name: '自定訓練', color: 'bg-gray-100 text-gray-800 ring-1 ring-gray-300', dotClass: 'bg-gray-400', inMain: true, isCustom: true },
  
  RIDE: { id: 'RIDE', name: 'Ride', color: 'bg-white text-slate-700 ring-1 ring-slate-200', dotClass: 'bg-slate-400', inMain: false, isRun: false },
  STRENGTH: { id: 'STRENGTH', name: 'Strength', color: 'bg-white text-slate-700 ring-1 ring-slate-200', dotClass: 'bg-slate-400', inMain: false, isRun: false }
};

const WEEKDAYS = ['一', '二', '三', '四', '五', '六', '日'];

const getStartOfWeek = (date) => {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); 
  return new Date(d.setDate(diff));
};

const formatDate = (date) => {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const addDays = (date, days) => {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
};

// AI 距離感應邏輯
const extractDistance = (text) => {
  if (!text) return 0;
  try {
    const mathRegex = /[\d\.\(\)\+\*xX\skm公里公尺]+/g;
    const matches = text.match(mathRegex);
    if (!matches) return 0;

    let totalKm = 0;
    matches.forEach(matchStr => {
      let expr = matchStr.toLowerCase()
        .replace(/公里|km|k/g, ' * 1000 ')
        .replace(/公尺|m/g, ' * 1 ')
        .replace(/x/g, '*')
        .replace(/[^0-9\.\+\*\(\)\s]/g, ''); 
      
      if (/[0-9]/.test(expr)) {
        try {
          const resultMeters = new Function(`"use strict"; return (${expr})`)();
          if (resultMeters && !isNaN(resultMeters)) totalKm += (resultMeters / 1000);
        } catch (e) { }
      }
    });
    return totalKm;
  } catch(e) { return 0; }
};

// 統一計算各種模式的里數
const getWorkoutDistance = (w) => {
  if (!w || !w.mode) return 0;
  
  if (w.mode === 'CUSTOM') {
    const subMode = w.customSubMode ? MODES[w.customSubMode] : null;
    if (!subMode || subMode.isRun) return extractDistance(w.notes);
    return 0;
  }
  
  if (w.mode === 'TRAIL') {
    return parseFloat(w.distance) || 0;
  }
  
  if (MODES[w.mode]?.isComplex && w.rounds) {
    let total = 0;
    total += (parseFloat(w.warmupDist) || 0) * (w.warmupUnit === 'm' ? 0.001 : 1);
    total += (parseFloat(w.cooldownDist) || 0) * (w.cooldownUnit === 'm' ? 0.001 : 1);
    
    let roundsTotal = 0;
    w.rounds.forEach(r => {
      if (r.type === 'run') {
        const dist = (parseFloat(r.distance) || 0) * (r.distUnit === 'm' ? 0.001 : 1);
        roundsTotal += dist * (parseInt(r.sets) || 1);
      } else if (r.type === 'rest' && (r.unit === 'm' || r.unit === 'km')) {
        roundsTotal += (parseFloat(r.value) || 0) * (r.unit === 'm' ? 0.001 : 1);
      }
    });
    
    total += roundsTotal * (parseInt(w.repeats) || 1);
    return total;
  }
  
  // 舊有數據或簡易模式 (Easy Run) Fallback
  const val = (parseFloat(w.distance) || 0) * (parseFloat(w.sets) || 1);
  return w.distUnit === 'm' ? val / 1000 : val;
};

export default function App() {
  const [activeTab, setActiveTab] = useState('home');
  const [currentDate, setCurrentDate] = useState(getStartOfWeek(new Date()));
  const [workouts, setWorkouts] = useState({});
  const [races, setRaces] = useState([]);
  
  const [selectedDay, setSelectedDay] = useState(null);
  const [isWorkoutModalOpen, setIsWorkoutModalOpen] = useState(false);
  const [isRaceModalOpen, setIsRaceModalOpen] = useState(false);
  
  const [animatingDir, setAnimatingDir] = useState(''); 
  const touchStartX = useRef(0);
  const touchStartY = useRef(0);
  const isScrolling = useRef(false);
  const [swipeOffset, setSwipeOffset] = useState(0);

  const pageTouchStartX = useRef(0);
  const [pageSwipeOffset, setPageSwipeOffset] = useState(0);

  useEffect(() => {
    const savedWorkouts = localStorage.getItem('run_tracker_v5_workouts');
    const savedRaces = localStorage.getItem('run_tracker_v5_races');
    if (savedWorkouts) setWorkouts(JSON.parse(savedWorkouts));
    if (savedRaces) setRaces(JSON.parse(savedRaces));
  }, []);

  useEffect(() => {
    localStorage.setItem('run_tracker_v5_workouts', JSON.stringify(workouts));
    localStorage.setItem('run_tracker_v5_races', JSON.stringify(races));
  }, [workouts, races]);

  const changeWeek = (direction) => {
    setAnimatingDir(direction === 1 ? 'exit-left' : 'exit-right');
    setTimeout(() => {
      setCurrentDate(prev => addDays(prev, direction * 7));
      setAnimatingDir(direction === 1 ? 'enter-right' : 'enter-left');
      setSwipeOffset(0);
      setTimeout(() => setAnimatingDir(''), 300);
    }, 200);
  };

  const handleScheduleTouchStart = (e) => {
    e.stopPropagation(); 
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
    isScrolling.current = false;
  };

  const handleScheduleTouchMove = (e) => {
    e.stopPropagation();
    const diffX = e.touches[0].clientX - touchStartX.current;
    const diffY = e.touches[0].clientY - touchStartY.current;
    if (!isScrolling.current && Math.abs(diffY) > Math.abs(diffX)) isScrolling.current = true;
    if (!isScrolling.current) setSwipeOffset(diffX * 0.35);
  };

  const handleScheduleTouchEnd = (e) => {
    e.stopPropagation();
    if (isScrolling.current) { setSwipeOffset(0); return; }
    const distance = touchStartX.current - e.changedTouches[0].clientX;
    if (distance > 80) changeWeek(1);
    else if (distance < -80) changeWeek(-1);
    else setSwipeOffset(0);
  };

  const handlePageTouchStart = (e) => { pageTouchStartX.current = e.touches[0].clientX; };
  const handlePageTouchMove = (e) => { setPageSwipeOffset(e.touches[0].clientX - pageTouchStartX.current); };
  const handlePageTouchEnd = (e) => {
    const distance = pageTouchStartX.current - e.changedTouches[0].clientX;
    if (distance > 100 && activeTab === 'home') setActiveTab('schedule');
    else if (distance < -100 && activeTab === 'schedule') setActiveTab('home');
    setPageSwipeOffset(0);
  };

  const weekDays = useMemo(() => Array.from({ length: 7 }).map((_, i) => addDays(currentDate, i)), [currentDate]);
  
  const m1 = weekDays[0].getMonth() + 1;
  const m2 = weekDays[6].getMonth() + 1;
  const monthDisplay = m1 === m2 ? `${m1}月` : `${m1}/${m2}月`;

  const calculateTotal = (startDate, days) => {
    let planned = 0, completed = 0;
    for (let i = 0; i < days; i++) {
      const dStr = formatDate(addDays(startDate, i));
      const w = workouts[dStr];
      if (w && w.mode) {
        const km = getWorkoutDistance(w);
        planned += km;
        if (w.completed) completed += km;
      }
    }
    return { planned: planned.toFixed(1), completed: completed.toFixed(1) };
  };

  const weekStats = useMemo(() => calculateTotal(currentDate, 7), [currentDate, workouts]);
  const monthStats = useMemo(() => calculateTotal(new Date(currentDate.getFullYear(), currentDate.getMonth(), 1), 31), [currentDate, workouts]);

  // 渲染進階課表的摘要字串 (只顯示 Run 的回合，排除熱身和冷卻)
  const renderComplexSummary = (w) => {
    if (!w.rounds) return <span className="text-sm font-black text-slate-800 truncate">{w.distance}{w.distUnit} {w.sets > 1 ? `x ${w.sets}組` : ''}</span>;
    const runRounds = w.rounds.filter(r => r.type === 'run');
    if (runRounds.length === 0) return <span className="text-sm font-black text-slate-800">無跑步內容</span>;

    const content = runRounds.map((r, idx) => (
      <span key={idx} className="inline-flex items-center">
        {idx > 0 && <span className="text-slate-400 mx-1 font-bold">+</span>}
        <span className="text-blue-600 font-black">{r.distance}{r.distUnit}</span>
        {r.sets > 1 && <span className="text-orange-500 font-black ml-0.5">*{r.sets}</span>}
        {r.pace && <span className="text-emerald-600 font-bold ml-1">@{r.pace}</span>}
      </span>
    ));

    return (
      <div className="text-sm text-slate-800 truncate flex items-center flex-wrap">
        <span className="font-black mr-2">{MODES[w.mode].name}</span>
        {w.repeats > 1 && <span className="text-slate-500 font-bold mr-0.5">(</span>}
        {content}
        {w.repeats > 1 && <><span className="text-slate-500 font-bold ml-0.5">)*</span><span className="text-purple-600 font-black">{w.repeats}</span></>}
      </div>
    );
  };

  return (
    <div 
      className="min-h-screen bg-[#E8F0F7] text-slate-900 font-sans flex flex-col relative overflow-hidden"
      onTouchStart={handlePageTouchStart}
      onTouchMove={handlePageTouchMove}
      onTouchEnd={handlePageTouchEnd}
    >
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        <div className="absolute top-[-10%] left-[-10%] w-[70%] h-[60%] bg-blue-300/20 rounded-full blur-[120px]"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-[60%] h-[50%] bg-indigo-300/20 rounded-full blur-[100px]"></div>
      </div>

      <div className="relative z-10 flex flex-col flex-1 pb-20">
        {/* --- 主頁 --- */}
        {activeTab === 'home' && (
          <div className="flex-1 flex flex-col animate-in fade-in slide-in-from-left-4 duration-300">
            <header className="pt-10 pb-6 px-6 bg-white/30 backdrop-blur-2xl border-b border-white/40 shadow-sm">
              <div className="flex justify-between items-center mb-4">
                <div className="flex items-center gap-2">
                  <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center shadow-lg"><Activity className="text-white" size={22} /></div>
                  <h1 className="text-2xl font-black tracking-tighter text-slate-800">主頁總覽</h1>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 mb-4">
                <StatBox label="本周完成" completed={weekStats.completed} total={weekStats.planned} color="bg-blue-600" />
                <StatBox label="本月目標" completed={monthStats.completed} total={monthStats.planned} color="bg-indigo-600" />
              </div>
              <div className="bg-white/60 backdrop-blur-md rounded-2xl p-4 border border-white shadow-sm">
                <h3 className="text-[11px] font-black text-slate-400 uppercase tracking-widest mb-2">本週訓練曲線 (km)</h3>
                <WeeklyChart weekDays={weekDays} workouts={workouts} getWorkoutDistance={getWorkoutDistance} />
                <div className="flex gap-4 justify-center mt-2">
                  <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-slate-300"></div><span className="text-[10px] font-bold text-slate-400">計畫里數</span></div>
                  <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-blue-500"></div><span className="text-[10px] font-bold text-slate-600">完成里數</span></div>
                </div>
              </div>
            </header>

            <div className="flex-1 px-5 pt-6 pb-10 overflow-y-auto">
              <div className="flex justify-between items-end mb-4 px-1">
                <h2 className="text-lg font-black text-slate-800">我的比賽日程</h2>
                <button onClick={() => setIsRaceModalOpen(true)} className="text-sm font-bold text-blue-600 bg-blue-100/50 px-3 py-1 rounded-full">+ 新增比賽</button>
              </div>
              <div className="space-y-3">
                {races.length === 0 ? (
                  <div className="text-center py-10 bg-white/40 border border-white/50 rounded-2xl">
                    <Trophy className="mx-auto mb-2 text-slate-300" size={32} />
                    <p className="text-sm font-bold text-slate-400">尚未加入任何比賽</p>
                  </div>
                ) : (
                  races.sort((a,b) => new Date(a.date) - new Date(b.date)).map(race => (
                    <RaceCard key={race.id} race={race} onDelete={(id) => setRaces(races.filter(r => r.id !== id))} />
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {/* --- 訓練課表 --- */}
        {activeTab === 'schedule' && (
          <div className="flex-1 flex flex-col animate-in fade-in slide-in-from-right-4 duration-300">
             <header className="pt-10 pb-3 px-6 bg-white/30 backdrop-blur-2xl border-b border-white/40 shadow-sm flex-shrink-0 flex flex-col items-center">
               <h1 className="text-xl font-black tracking-tighter text-slate-800 leading-tight">本周課表</h1>
               <div className="mt-1.5 flex items-center bg-blue-50/80 border border-blue-100 px-3 py-1 rounded-full">
                  <span className="text-[11px] font-black text-slate-500 mr-2 uppercase tracking-widest">里數進度</span>
                  <span className="text-sm font-black text-blue-600">{weekStats.completed} <span className="text-slate-400 font-bold mx-0.5">/</span> {weekStats.planned} km</span>
               </div>
             </header>

            <nav className="flex justify-between items-center px-6 py-4 flex-shrink-0">
              <button onClick={() => changeWeek(-1)} className="p-2.5 bg-white/60 backdrop-blur-md rounded-full shadow-sm border border-white/80 active:scale-90 transition"><ChevronLeft size={20}/></button>
              <div className="text-center">
                  <span className="block text-sm font-black text-slate-700">{currentDate.getFullYear()}年 {monthDisplay}</span>
                  <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">{weekDays[0].getDate()} - {weekDays[6].getDate()} 日</span>
              </div>
              <button onClick={() => changeWeek(1)} className="p-2.5 bg-white/60 backdrop-blur-md rounded-full shadow-sm border border-white/80 active:scale-90 transition"><ChevronRight size={20}/></button>
            </nav>

            <main 
              className={`flex-1 overflow-y-auto px-4 pb-12 flex flex-col gap-2 transition-all duration-300 ease-out ${
                animatingDir.includes('exit') ? 'opacity-0 scale-[0.98]' : 'opacity-100 scale-100'
              }`}
              style={{ transform: animatingDir === '' ? `translateX(${swipeOffset}px)` : undefined }}
              onTouchStart={handleScheduleTouchStart}
              onTouchMove={handleScheduleTouchMove}
              onTouchEnd={handleScheduleTouchEnd}
            >
              {weekDays.map((date, i) => {
                const dStr = formatDate(date);
                const w = workouts[dStr];
                const isToday = formatDate(new Date()) === dStr;
                
                let dotClass = 'bg-slate-200';
                let displayTitle = 'REST DAY';
                let dailyDist = 0;

                if (w?.mode) {
                   dailyDist = getWorkoutDistance(w);
                   if (w.mode === 'CUSTOM') {
                       const subMode = w.customSubMode ? MODES[w.customSubMode] : null;
                       dotClass = subMode ? subMode.dotClass : MODES.CUSTOM.dotClass;
                       displayTitle = subMode ? subMode.name : '自定訓練';
                   } else if (w.mode === 'TRAIL') {
                       dotClass = MODES.TRAIL.dotClass;
                       displayTitle = `${MODES.TRAIL.name} ${w.distance ? w.distance+'km' : ''} ${w.elevation ? '▲'+w.elevation+'m' : ''}`;
                   } else {
                       dotClass = MODES[w.mode].dotClass;
                       displayTitle = `${MODES[w.mode].name} ${w.distance}${w.distUnit}`;
                       if (w.sets > 1) displayTitle += ` x ${w.sets}組`;
                   }
                }

                return (
                  <div 
                    key={dStr}
                    onClick={() => { setSelectedDay(dStr); setIsWorkoutModalOpen(true); }}
                    className={`flex-shrink-0 min-h-[82px] flex items-center bg-white/40 backdrop-blur-xl border border-white/50 rounded-[22px] px-4 py-3 shadow-sm active:scale-[0.98] transition-all cursor-pointer relative ${isToday ? 'bg-white/70 ring-2 ring-blue-500/30' : ''}`}
                  >
                    <div className="w-10 border-r border-slate-200/40 pr-3 text-center shrink-0">
                      <span className={`text-sm font-black ${isToday ? 'text-blue-600' : 'text-slate-400'}`}>{WEEKDAYS[i]}</span>
                      <div className="text-[10px] font-bold text-slate-300">{date.getDate()}</div>
                    </div>
                    
                    <div className="flex-1 px-4 overflow-hidden flex flex-col justify-center">
                      {w?.mode ? (
                        <>
                          <div className="flex items-center gap-2 mb-1">
                            <div className={`w-2 h-4 rounded-full shrink-0 ${dotClass} ring-1 ring-black/5`}></div>
                            {MODES[w.mode]?.isComplex && w.rounds ? (
                                renderComplexSummary(w)
                            ) : (
                                <span className="text-sm font-black text-slate-800 truncate">{displayTitle}</span>
                            )}
                          </div>
                          
                          <div className="flex flex-col gap-0.5 pl-4">
                            {w.mode !== 'TRAIL' && w.pace && !MODES[w.mode]?.isComplex && <span className="text-[10px] text-emerald-600 font-black uppercase tracking-tighter">Pace: {w.pace}</span>}
                            {w.mode === 'TRAIL' && w.eph && <span className="text-[10px] text-blue-600 font-black uppercase tracking-tighter">EPH: {w.eph}</span>}
                            {w.notes && <span className="text-[11px] text-slate-500 font-medium leading-tight line-clamp-2 italic">{w.notes}</span>}
                            
                            {dailyDist > 0 && (
                               <div className="inline-block self-start mt-0.5">
                                 <span className="text-[10px] font-black text-slate-600 bg-slate-200/50 px-1.5 py-0.5 rounded-md">總里數: {dailyDist.toFixed(1)} km</span>
                               </div>
                            )}
                          </div>
                        </>
                      ) : (
                        <span className="text-sm text-slate-300 font-bold tracking-widest italic ml-4">{displayTitle}</span>
                      )}
                    </div>

                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        setWorkouts(prev => ({ ...prev, [dStr]: { ...prev[dStr], completed: !prev[dStr]?.completed } }));
                      }}
                      className="pl-3 border-l border-slate-200/40 shrink-0"
                    >
                      {w?.completed ? <CheckCircle size={26} className="text-green-500 fill-green-50" /> : <Circle size={26} className="text-slate-200" />}
                    </button>
                  </div>
                );
              })}
            </main>
          </div>
        )}
      </div>

      {/* 底部導航列 */}
      <div className="fixed bottom-0 left-0 right-0 h-20 bg-white/70 backdrop-blur-2xl border-t border-white/50 px-6 flex justify-around items-center z-50 shadow-[0_-10px_40px_rgba(0,0,0,0.03)]">
        <button onClick={() => setActiveTab('home')} className={`flex flex-col items-center gap-1 transition-all ${activeTab === 'home' ? 'text-blue-600 scale-110' : 'text-slate-400 hover:text-slate-600'}`}>
          <Home size={24} strokeWidth={activeTab === 'home' ? 2.5 : 2} />
          <span className="text-[10px] font-black">主頁</span>
        </button>
        <button onClick={() => setActiveTab('schedule')} className={`flex flex-col items-center gap-1 transition-all ${activeTab === 'schedule' ? 'text-blue-600 scale-110' : 'text-slate-400 hover:text-slate-600'}`}>
          <List size={24} strokeWidth={activeTab === 'schedule' ? 2.5 : 2} />
          <span className="text-[10px] font-black">課表</span>
        </button>
      </div>

      {isWorkoutModalOpen && (
        <WorkoutModal 
          dateStr={selectedDay} 
          data={workouts[selectedDay] || {}}
          onSave={(data) => { setWorkouts(prev => ({ ...prev, [selectedDay]: data })); setIsWorkoutModalOpen(false); }}
          onClose={() => setIsWorkoutModalOpen(false)}
        />
      )}

      {isRaceModalOpen && (
        <RaceModal 
          onSave={(race) => { setRaces([...races, race]); setIsRaceModalOpen(false); }}
          onClose={() => setIsRaceModalOpen(false)}
        />
      )}
    </div>
  );
}

// --- 圖表使用新的里數計算函數 ---
function WeeklyChart({ weekDays, workouts, getWorkoutDistance }) {
  const chartData = weekDays.map((date) => {
    const dStr = formatDate(date);
    const w = workouts[dStr];
    let planned = w ? getWorkoutDistance(w) : 0;
    let completed = w?.completed ? planned : 0;
    return { planned, completed };
  });

  const width = 300, height = 120, padTop = 15, padBottom = 25, padX = 20;
  const maxVal = Math.max(...chartData.map(d => Math.max(d.planned, d.completed)), 10);
  
  const getX = (index) => padX + (index * ((width - padX * 2) / 6));
  const getY = (val) => height - padBottom - ((val / maxVal) * (height - padTop - padBottom));

  const plannedPath = chartData.map((d, i) => `${i === 0 ? 'M' : 'L'} ${getX(i)} ${getY(d.planned)}`).join(' ');
  const completedPath = chartData.map((d, i) => `${i === 0 ? 'M' : 'L'} ${getX(i)} ${getY(d.completed)}`).join(' ');

  return (
    <div className="w-full flex justify-center">
      <svg width="100%" viewBox={`0 0 ${width} ${height}`} className="overflow-visible font-sans">
        {[0, 0.5, 1].map(ratio => (
          <line key={ratio} x1={padX} y1={getY(maxVal * ratio)} x2={width - padX} y2={getY(maxVal * ratio)} stroke="#E2E8F0" strokeWidth="1" strokeDasharray="4 4" />
        ))}
        {WEEKDAYS.map((day, i) => (
          <text key={day} x={getX(i)} y={height - 5} fontSize="10" fill="#94A3B8" textAnchor="middle" fontWeight="bold">{day}</text>
        ))}
        <path d={plannedPath} fill="none" stroke="#CBD5E1" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        <path d={completedPath} fill="none" stroke="#2563EB" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
        {chartData.map((d, i) => (
          <g key={i}>
            <circle cx={getX(i)} cy={getY(d.planned)} r="3" fill="#CBD5E1" />
            {d.completed > 0 && <circle cx={getX(i)} cy={getY(d.completed)} r="4" fill="#2563EB" stroke="white" strokeWidth="1.5" />}
          </g>
        ))}
      </svg>
    </div>
  );
}

function RaceCard({ race, onDelete }) {
  const diffTime = new Date(race.date) - new Date();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  
  return (
    <div className="bg-white/60 backdrop-blur-md rounded-[24px] p-5 border border-white shadow-sm relative overflow-hidden group">
      <div className="flex justify-between items-start mb-3">
        <div>
          <span className={`text-[10px] font-black uppercase tracking-widest px-2 py-1 rounded-md mb-2 inline-block ${race.type === '路賽' ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'}`}>
            {race.type} • {race.distance}
          </span>
          <h3 className="text-lg font-black text-slate-800 leading-tight">{race.name}</h3>
        </div>
        <div className="text-center bg-slate-900 text-white rounded-xl px-3 py-2 shadow-lg">
          <span className="block text-2xl font-black leading-none">{diffDays >= 0 ? diffDays : '-'}</span>
          <span className="text-[9px] font-bold uppercase tracking-widest opacity-70">Days</span>
        </div>
      </div>
      
      <div className="space-y-1.5 mt-4 pt-4 border-t border-slate-200/50">
        <div className="flex items-center gap-2 text-sm text-slate-600 font-medium"><CalendarIcon size={14} className="text-slate-400"/> <span>{race.date}</span></div>
        <div className="flex items-center gap-2 text-sm text-slate-600 font-medium"><Clock size={14} className="text-slate-400"/> <span>{race.time} 起步</span></div>
        <div className="flex items-center gap-2 text-sm text-slate-600 font-medium"><MapPin size={14} className="text-slate-400"/> <span>{race.location}</span></div>
      </div>
      <button onClick={() => onDelete(race.id)} className="absolute top-4 right-20 text-[11px] text-red-400 font-bold opacity-0 group-hover:opacity-100 transition">刪除</button>
    </div>
  );
}

function StatBox({ label, completed, total, color }) {
  const percent = Math.min((completed / total) * 100, 100) || 0;
  return (
    <div className="bg-white/60 backdrop-blur-md p-3.5 rounded-2xl border border-white shadow-sm overflow-hidden">
      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">{label}</p>
      <div className="flex items-baseline gap-1">
        <span className="text-xl font-black text-slate-800">{completed}</span>
        <span className="text-[10px] font-bold text-slate-400 italic">/ {total} km</span>
      </div>
      <div className="mt-2 h-1 w-full bg-slate-200/50 rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full transition-all duration-1000`} style={{ width: `${percent}%` }}></div>
      </div>
    </div>
  );
}

function RaceModal({ onSave, onClose }) {
  const [form, setForm] = useState({ name: '', type: '路賽', date: '', time: '', location: '' });
  const [distMode, setDistMode] = useState('');
  const [customDist, setCustomDist] = useState('');
  const presets = ['3km', '5km', '10km', '半馬', '全馬', '自設距離'];

  const handleSave = () => {
    const finalDist = distMode === '自設距離' ? customDist : distMode;
    onSave({ ...form, distance: finalDist || '-', id: Date.now().toString() });
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-slate-900/40 backdrop-blur-md p-0 sm:p-4">
      <div className="bg-white w-full max-w-lg rounded-t-[40px] sm:rounded-[40px] shadow-2xl overflow-hidden flex flex-col animate-in slide-in-from-bottom duration-300">
        <div className="px-8 py-6 border-b border-slate-50 flex justify-between items-center bg-white/80">
          <button onClick={onClose} className="text-slate-400 text-sm font-bold">取消</button>
          <div className="text-center"><h2 className="text-lg font-black text-slate-800">新增比賽</h2></div>
          <button onClick={handleSave} className="text-blue-600 font-black px-5 py-1.5 bg-blue-50 rounded-full" disabled={!form.name || !form.date || !distMode}>新增</button>
        </div>
        <div className="flex-1 overflow-y-auto p-8 space-y-5 max-h-[75vh]">
          <div className="space-y-2">
            <label className="text-[11px] font-black text-slate-400 uppercase tracking-widest">賽事名稱</label>
            <input type="text" value={form.name} onChange={e => setForm({...form, name: e.target.value})} className="w-full bg-slate-50 py-3.5 px-4 rounded-2xl border border-slate-100 outline-none focus:ring-2 focus:ring-blue-500 font-bold" placeholder="e.g. 渣打馬拉松" />
          </div>
          <div className="space-y-2">
            <label className="text-[11px] font-black text-slate-400 uppercase tracking-widest">性質</label>
            <div className="flex gap-3">
              <button onClick={()=>setForm({...form, type: '路賽'})} className={`flex-1 py-3 rounded-xl font-black text-sm transition-all border-2 ${form.type === '路賽' ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-transparent bg-slate-50 text-slate-500'}`}>路賽</button>
              <button onClick={()=>setForm({...form, type: '山賽'})} className={`flex-1 py-3 rounded-xl font-black text-sm transition-all border-2 ${form.type === '山賽' ? 'border-green-500 bg-green-50 text-green-700' : 'border-transparent bg-slate-50 text-slate-500'}`}>山賽</button>
            </div>
          </div>
          <div className="space-y-3">
            <label className="text-[11px] font-black text-slate-400 uppercase tracking-widest">距離</label>
            <div className="flex flex-wrap gap-2">
              {presets.map(p => (
                <button key={p} onClick={() => setDistMode(p)} className={`px-4 py-2 rounded-full text-sm font-bold transition-all border-2 ${distMode === p ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-transparent bg-slate-50 text-slate-500'}`}>
                  {p}
                </button>
              ))}
            </div>
            {distMode === '自設距離' && (
              <input type="text" value={customDist} onChange={e => setCustomDist(e.target.value)} className="w-full bg-slate-50 py-3.5 px-4 rounded-2xl border border-blue-200 outline-none focus:ring-2 focus:ring-blue-500 font-bold animate-in fade-in" placeholder="輸入距離 (e.g. 15km)" />
            )}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-[11px] font-black text-slate-400 uppercase tracking-widest">日期</label>
              <input type="date" value={form.date} onChange={e => setForm({...form, date: e.target.value})} className="w-full bg-slate-50 py-3.5 px-4 rounded-2xl border border-slate-100 outline-none font-bold text-sm" />
            </div>
            <div className="space-y-2">
              <label className="text-[11px] font-black text-slate-400 uppercase tracking-widest">起步時間</label>
              <input type="time" value={form.time} onChange={e => setForm({...form, time: e.target.value})} className="w-full bg-slate-50 py-3.5 px-4 rounded-2xl border border-slate-100 outline-none font-bold text-sm" />
            </div>
          </div>
          <div className="space-y-2 pb-10">
            <label className="text-[11px] font-black text-slate-400 uppercase tracking-widest">地點</label>
            <input type="text" value={form.location} onChange={e => setForm({...form, location: e.target.value})} className="w-full bg-slate-50 py-3.5 px-4 rounded-2xl border border-slate-100 outline-none font-bold" placeholder="e.g. 尖沙咀彌敦道" />
          </div>
        </div>
      </div>
    </div>
  );
}

// --- 更新：WorkoutModal 支援 Trail Run 及 進階間歇訓練編排 ---
function WorkoutModal({ dateStr, data, onSave, onClose }) {
  const [form, setForm] = useState({
    mode: '', customSubMode: '', distance: '', distUnit: 'km', sets: '1', pace: '', rest: '', restUnit: 'min', notes: '', 
    elevation: '', timeHours: '', timeMinutes: '', eph: '', // Trail Run fields
    warmupDist: '', warmupUnit: 'km', cooldownDist: '', cooldownUnit: 'km', repeats: '1', rounds: null, // Complex fields
    ...data
  });

  const [trailLastEdited, setTrailLastEdited] = useState(null);

  // 當切換到進階模式時，自動升級/初始化 rounds 結構
  useEffect(() => {
    if (form.mode && MODES[form.mode]?.isComplex && !form.rounds) {
      setForm(prev => ({
        ...prev,
        warmupDist: '', warmupUnit: 'km', cooldownDist: '', cooldownUnit: 'km', repeats: '1',
        rounds: [{ id: Date.now(), type: 'run', distance: prev.distance || '', distUnit: prev.distUnit || 'km', sets: prev.sets || '1', pace: prev.pace || '', value: '', unit: 'min' }]
      }));
    }
  }, [form.mode]);

  // Trail Run: EPH 與時間互相計算邏輯
  useEffect(() => {
    if (form.mode !== 'TRAIL') return;
    const dist = parseFloat(form.distance) || 0;
    const ele = parseFloat(form.elevation) || 0;
    const effortDist = dist + (ele * 0.01);

    if (trailLastEdited === 'time') {
      const hrs = (parseFloat(form.timeHours) || 0) + (parseFloat(form.timeMinutes) || 0) / 60;
      if (hrs > 0) {
        const calculatedEph = (effortDist / hrs).toFixed(2);
        if (calculatedEph !== form.eph) setForm(prev => ({ ...prev, eph: calculatedEph }));
      }
    } else if (trailLastEdited === 'eph') {
      const currentEph = parseFloat(form.eph);
      if (currentEph > 0) {
        const hrs = effortDist / currentEph;
        const h = Math.floor(hrs);
        const m = Math.round((hrs - h) * 60);
        if (h !== parseFloat(form.timeHours) || m !== parseFloat(form.timeMinutes)) {
          setForm(prev => ({ ...prev, timeHours: h.toString(), timeMinutes: m.toString() }));
        }
      }
    }
  }, [form.distance, form.elevation, form.timeHours, form.timeMinutes, form.eph, trailLastEdited]);

  const update = (key, val) => {
    setForm(prev => {
      const next = { ...prev, [key]: val };
      if (key === 'mode' && MODES[val]) {
        next.distUnit = MODES[val].defaultDistUnit || 'km';
        next.restUnit = MODES[val].defaultRestUnit || 'min';
      }
      return next;
    });
  };

  const addRound = (type) => {
    setForm(prev => ({
      ...prev,
      rounds: [...(prev.rounds || []), { id: Date.now(), type, distance: '', distUnit: 'm', sets: '1', pace: '', value: '', unit: 'min' }]
    }));
  };

  const updateRound = (id, key, val) => {
    setForm(prev => ({
      ...prev,
      rounds: prev.rounds.map(r => r.id === id ? { ...r, [key]: val } : r)
    }));
  };

  const removeRound = (id) => {
    setForm(prev => ({ ...prev, rounds: prev.rounds.filter(r => r.id !== id) }));
  };

  const mainModes = Object.entries(MODES).filter(([_, cfg]) => cfg.inMain);
  const customSubModes = Object.entries(MODES).filter(([id, _]) => id !== 'CUSTOM');

  return (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-slate-900/40 backdrop-blur-md p-0 sm:p-4">
      <div className="bg-white w-full max-w-lg rounded-t-[40px] sm:rounded-[40px] shadow-2xl overflow-hidden flex flex-col animate-in slide-in-from-bottom duration-300">
        <div className="px-8 py-6 border-b border-slate-50 flex justify-between items-center bg-white/80">
          <button onClick={onClose} className="text-slate-400 text-sm font-bold">取消</button>
          <div className="text-center"><h2 className="text-lg font-black text-slate-800">{dateStr}</h2></div>
          <button onClick={() => onSave(form)} className="text-blue-600 font-black px-5 py-1.5 bg-blue-50 rounded-full shadow-sm">儲存</button>
        </div>
        
        <div className="flex-1 overflow-y-auto p-8 space-y-8 max-h-[75vh]">
          {/* 模式選單 */}
          <div className="space-y-4">
            <label className="text-[11px] font-black text-slate-300 uppercase tracking-widest px-1">選擇訓練模式</label>
            <div className="grid grid-cols-2 gap-2.5">
              {mainModes.map(([id, cfg]) => (
                <button
                  key={id} onClick={() => { update('mode', id); if(id !== 'CUSTOM') update('customSubMode', ''); }}
                  className={`py-4 px-3 rounded-2xl text-[13px] font-black transition-all border-2 ${
                    form.mode === id ? `${cfg.color} shadow-lg shadow-blue-100 scale-[1.02]` : 'bg-slate-50 border-slate-50 text-slate-500 hover:bg-slate-100'
                  }`}
                >
                  {cfg.name}
                </button>
              ))}
            </div>
          </div>

          {/* CUSTOM 子模式選擇 */}
          {form.mode === 'CUSTOM' && (
            <div className="space-y-4 p-4 bg-slate-50 rounded-[24px] border border-slate-100 animate-in fade-in slide-in-from-top-2">
              <label className="text-[11px] font-black text-slate-400 uppercase tracking-widest px-1">標記訓練類型 (影響 AI 計算)</label>
              <div className="flex flex-wrap gap-2">
                {customSubModes.map(([id, cfg]) => (
                  <button
                    key={id} onClick={() => update('customSubMode', id)}
                    className={`px-3 py-2 rounded-xl text-[11px] font-black transition-all border-2 ${
                      form.customSubMode === id ? `${cfg.color} border-transparent shadow-md ring-2 ring-blue-500/30` : 'bg-white border-transparent text-slate-500 shadow-sm'
                    }`}
                  >
                    {cfg.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* --- Trail Run 介面 --- */}
          {form.mode === 'TRAIL' && (
            <div className="space-y-5 animate-in fade-in duration-500">
               <div className="grid grid-cols-2 gap-6">
                 <div className="space-y-2">
                   <label className="text-[11px] font-black text-slate-400 uppercase tracking-widest">距離</label>
                   <div className="flex bg-slate-50 rounded-2xl border border-slate-100 focus-within:ring-2 focus-within:ring-blue-500">
                     <input type="number" value={form.distance} onChange={e => update('distance', e.target.value)} className="w-full bg-transparent py-3.5 px-4 outline-none font-black text-lg" placeholder="0" />
                     <span className="flex items-center px-4 text-xs font-black text-slate-400">km</span>
                   </div>
                 </div>
                 <div className="space-y-2">
                   <label className="text-[11px] font-black text-slate-400 uppercase tracking-widest">總爬升</label>
                   <div className="flex bg-slate-50 rounded-2xl border border-slate-100 focus-within:ring-2 focus-within:ring-green-500">
                     <input type="number" value={form.elevation} onChange={e => update('elevation', e.target.value)} className="w-full bg-transparent py-3.5 px-4 outline-none font-black text-lg" placeholder="0" />
                     <span className="flex items-center px-4 text-xs font-black text-slate-400">m</span>
                   </div>
                 </div>
               </div>

               <div className="bg-blue-50/50 p-4 rounded-3xl border border-blue-100/50 space-y-4">
                 <div className="space-y-2">
                   <label className="text-[11px] font-black text-blue-400 uppercase tracking-widest">預計時間 / 完成時間</label>
                   <div className="flex gap-2">
                     <div className="flex-1 flex bg-white rounded-2xl border border-blue-100 focus-within:ring-2 focus-within:ring-blue-400">
                        <input type="number" value={form.timeHours} onFocus={()=>setTrailLastEdited('time')} onChange={e => update('timeHours', e.target.value)} className="w-full bg-transparent py-3 px-3 outline-none font-black text-center" placeholder="0" />
                        <span className="flex items-center pr-3 text-xs font-bold text-slate-400">小時</span>
                     </div>
                     <div className="flex-1 flex bg-white rounded-2xl border border-blue-100 focus-within:ring-2 focus-within:ring-blue-400">
                        <input type="number" value={form.timeMinutes} onFocus={()=>setTrailLastEdited('time')} onChange={e => update('timeMinutes', e.target.value)} className="w-full bg-transparent py-3 px-3 outline-none font-black text-center" placeholder="0" />
                        <span className="flex items-center pr-3 text-xs font-bold text-slate-400">分鐘</span>
                     </div>
                   </div>
                 </div>

                 <div className="space-y-2">
                   <label className="text-[11px] font-black text-blue-400 uppercase tracking-widest flex justify-between">
                     <span>EPH (等效配速)</span>
                     <span className="text-[9px] text-blue-300 font-bold lowercase tracking-normal">eph=(km+m*0.01)/hr</span>
                   </label>
                   <input type="number" step="0.1" value={form.eph} onFocus={()=>setTrailLastEdited('eph')} onChange={e => update('eph', e.target.value)} className="w-full bg-white py-3.5 px-4 rounded-2xl border border-blue-100 outline-none focus:ring-2 focus:ring-blue-400 font-black text-blue-600" placeholder="自動計算或輸入以推算時間" />
                 </div>
               </div>
            </div>
          )}

          {/* --- 進階訓練介面 (Sprint, VO2, LT, Long) --- */}
          {form.mode && MODES[form.mode]?.isComplex && form.rounds && (
            <div className="space-y-6 animate-in fade-in duration-500">
               {/* 1. 熱身 */}
               <div className="bg-orange-50/50 p-4 rounded-3xl border border-orange-100/50 flex items-center justify-between">
                  <div>
                    <h4 className="text-sm font-black text-orange-700">Warm Up</h4>
                    <p className="text-[10px] text-orange-400 font-bold">熱身里數 (計算入總里數)</p>
                  </div>
                  <div className="flex bg-white rounded-xl border border-orange-200 focus-within:ring-2 focus-within:ring-orange-400 w-32">
                     <input type="number" value={form.warmupDist} onChange={e => update('warmupDist', e.target.value)} className="w-full bg-transparent py-2 px-3 outline-none font-black text-center text-orange-700" placeholder="0" />
                     <select value={form.warmupUnit} onChange={e => update('warmupUnit', e.target.value)} className="bg-transparent pr-2 text-xs font-black text-orange-400 outline-none">
                        <option value="km">km</option><option value="m">m</option>
                     </select>
                  </div>
               </div>

               {/* 2. 訓練回合 */}
               <div className="space-y-3">
                 <h4 className="text-[11px] font-black text-slate-400 uppercase tracking-widest px-1">核心課表編排</h4>
                 {form.rounds.map((r, idx) => (
                   <div key={r.id} className="bg-white border border-slate-200 rounded-[24px] p-4 shadow-sm relative group">
                      <div className="flex justify-between items-center mb-3">
                         <span className={`text-[10px] font-black uppercase tracking-widest px-2 py-1 rounded-md ${r.type === 'run' ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-500'}`}>
                           第 {idx + 1} 回 : {r.type === 'run' ? '跑步' : '休息 / 舒緩跑'}
                         </span>
                         {form.rounds.length > 1 && (
                            <button onClick={() => removeRound(r.id)} className="text-slate-300 hover:text-red-500 transition-colors p-1"><Trash2 size={16}/></button>
                         )}
                      </div>

                      {r.type === 'run' ? (
                        <div className="grid grid-cols-2 gap-3">
                          <div className="flex bg-slate-50 rounded-xl border border-slate-100 focus-within:ring-2 focus-within:ring-blue-500">
                            <input type="number" value={r.distance} onChange={e => updateRound(r.id, 'distance', e.target.value)} className="w-full bg-transparent py-2.5 px-3 outline-none font-black" placeholder="距離" />
                            <select value={r.distUnit} onChange={e => updateRound(r.id, 'distUnit', e.target.value)} className="bg-transparent pr-2 text-xs font-black text-slate-400 outline-none">
                              <option value="km">km</option><option value="m">m</option>
                            </select>
                          </div>
                          <div className="flex bg-slate-50 rounded-xl border border-slate-100 focus-within:ring-2 focus-within:ring-orange-400">
                            <input type="number" value={r.sets} onChange={e => updateRound(r.id, 'sets', e.target.value)} className="w-full bg-transparent py-2.5 px-3 outline-none font-black text-center" placeholder="組數" />
                            <span className="flex items-center pr-3 text-xs font-bold text-slate-400">組</span>
                          </div>
                          <div className="col-span-2">
                            <input type="text" value={r.pace} onChange={e => updateRound(r.id, 'pace', e.target.value)} className="w-full bg-slate-50 py-2.5 px-4 rounded-xl border border-slate-100 outline-none focus:ring-2 focus:ring-emerald-500 font-bold text-sm" placeholder="速度 (e.g. 4:30/km, 90s/lap)" />
                          </div>
                        </div>
                      ) : (
                        <div className="flex bg-slate-50 rounded-xl border border-slate-100 focus-within:ring-2 focus-within:ring-slate-400 w-full">
                          <input type="number" value={r.value} onChange={e => updateRound(r.id, 'value', e.target.value)} className="w-full bg-transparent py-2.5 px-3 outline-none font-black" placeholder="時間或距離" />
                          <select value={r.unit} onChange={e => updateRound(r.id, 'unit', e.target.value)} className="bg-transparent pr-2 text-xs font-black text-slate-500 outline-none border-l border-slate-200 pl-2 ml-1">
                            <option value="s">秒 (s)</option><option value="min">分鐘 (min)</option>
                            <option value="m">公尺 (m)</option><option value="km">公里 (km)</option>
                          </select>
                        </div>
                      )}
                   </div>
                 ))}
                 
                 {/* 新增回合按鈕 */}
                 <div className="flex gap-2 pt-1">
                   <button onClick={() => addRound('run')} className="flex-1 py-3 bg-blue-50 text-blue-600 rounded-xl font-black text-xs flex justify-center items-center gap-1 hover:bg-blue-100 transition"><Plus size={14}/> 跑步</button>
                   <button onClick={() => addRound('rest')} className="flex-1 py-3 bg-slate-100 text-slate-600 rounded-xl font-black text-xs flex justify-center items-center gap-1 hover:bg-slate-200 transition"><Plus size={14}/> 休息/舒緩跑</button>
                 </div>
               </div>

               {/* 3. 訓練重覆次數 */}
               <div className="bg-purple-50/50 p-4 rounded-3xl border border-purple-100/50 flex items-center justify-between">
                  <div>
                    <h4 className="text-sm font-black text-purple-700">Repeats</h4>
                    <p className="text-[10px] text-purple-400 font-bold">以上核心訓練重覆次數</p>
                  </div>
                  <div className="flex bg-white rounded-xl border border-purple-200 focus-within:ring-2 focus-within:ring-purple-400 w-24">
                     <input type="number" value={form.repeats} onChange={e => update('repeats', e.target.value)} className="w-full bg-transparent py-2 px-3 outline-none font-black text-center text-purple-700" placeholder="1" />
                  </div>
               </div>

               {/* 4. 冷卻跑 */}
               <div className="bg-teal-50/50 p-4 rounded-3xl border border-teal-100/50 flex items-center justify-between">
                  <div>
                    <h4 className="text-sm font-black text-teal-700">Cool Down</h4>
                    <p className="text-[10px] text-teal-400 font-bold">冷卻跑里數 (計算入總里數)</p>
                  </div>
                  <div className="flex bg-white rounded-xl border border-teal-200 focus-within:ring-2 focus-within:ring-teal-400 w-32">
                     <input type="number" value={form.cooldownDist} onChange={e => update('cooldownDist', e.target.value)} className="w-full bg-transparent py-2 px-3 outline-none font-black text-center text-teal-700" placeholder="0" />
                     <select value={form.cooldownUnit} onChange={e => update('cooldownUnit', e.target.value)} className="bg-transparent pr-2 text-xs font-black text-teal-400 outline-none">
                        <option value="km">km</option><option value="m">m</option>
                     </select>
                  </div>
               </div>
            </div>
          )}

          {/* --- 傳統簡單介面 (Easy Run) --- */}
          {form.mode && !MODES[form.mode]?.isComplex && form.mode !== 'TRAIL' && form.mode !== 'CUSTOM' && (
            <div className="grid grid-cols-2 gap-x-6 gap-y-6 animate-in fade-in duration-500">
              <div className="space-y-2">
                <label className="text-[11px] font-black text-slate-300 uppercase tracking-widest">距離</label>
                <div className="flex bg-slate-50 rounded-2xl border border-slate-100 focus-within:ring-2 focus-within:ring-blue-500 focus-within:bg-white transition-all">
                  <input type="number" value={form.distance} onChange={e => update('distance', e.target.value)} className="w-full bg-transparent py-3.5 px-4 outline-none font-black text-lg" placeholder="0" />
                  <span className="flex items-center px-4 text-xs font-black text-slate-400 border-l border-slate-100">{form.distUnit}</span>
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-[11px] font-black text-slate-300 uppercase tracking-widest">配速</label>
                <input type="text" value={form.pace} onChange={e => update('pace', e.target.value)} className="w-full bg-slate-50 py-3.5 px-4 rounded-2xl border border-slate-100 outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white font-black" placeholder="e.g. 4:30" />
              </div>
            </div>
          )}

          <div className="space-y-2 pb-10">
            <label className="text-[11px] font-black text-slate-300 uppercase tracking-widest">
              {form.mode === 'CUSTOM' ? '訓練詳情 / 算式' : '備註'}
            </label>
            <textarea 
              value={form.notes} 
              onChange={e => update('notes', e.target.value)}
              className="w-full bg-slate-50 p-5 rounded-[24px] border border-slate-100 outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white font-medium min-h-[120px] resize-none text-sm"
              placeholder={form.mode === 'CUSTOM' ? "輸入算式自動計算：(2k + 1k x 2) x 2" : "填寫今天的狀態或心得..."}
            />
          </div>
        </div>
      </div>
    </div>
  );
}