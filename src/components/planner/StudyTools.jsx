// src/components/planner/StudyTools.jsx
// 스탑워치/타이머/하가다
import React from "react";

export default function StudyTools({
  // 스탑워치
  formatTime,
  elapsedMs,
  isRunning,
  startStopwatch,
  stopStopwatch,
  resetStopwatch,

  // 타이머
  TIMER_PRESETS,
  timerMin,
  setTimerMin,
  timerRunning,
  formatMMSS,
  remainingSec,
  startTimer,
  pauseTimer,
  resetTimer,

  // 타이머 사운드 토글
  timerSoundOn,
  setTimerSoundOn,

  // 하가다
  hagadaCount,
  increaseHagada,
  resetHagada,
}) {
  return (
    <div className="study-tools">
      {/* 1) 스탑워치 */}
      <div className="tool-row">
        <div className="tool-title">스탑워치</div>
        <div className="tool-display">{formatTime(elapsedMs)}</div>
        <div className="tool-actions">
          <button onClick={startStopwatch} disabled={isRunning}>시작</button>
          <button onClick={stopStopwatch} disabled={!isRunning}>멈춤</button>
          <button onClick={resetStopwatch}>처음부터</button>
        </div>
      </div>

      {/* 2) 타이머 */}
      <div className="tool-row">
        <div className="tool-title tool-title-with-toggle">
          <span>타이머</span>

          <button
            type="button"
            className="timer-sound-toggle"
            onClick={() => setTimerSoundOn((v) => !v)}
            aria-label={timerSoundOn ? "타이머 소리 끄기" : "타이머 소리 켜기"}
            title={timerSoundOn ? "타이머 소리 끄기" : "타이머 소리 켜기"}
          >
            {timerSoundOn ? "🔊" : "🔇"}
          </button>
        </div>

        <div className="tool-display tool-display-timer">
          <select
            value={timerMin}
            onChange={(e) => setTimerMin(Number(e.target.value))}
            disabled={timerRunning}
            aria-label="타이머 시간 선택"
          >
            {TIMER_PRESETS.map((m) => (
              <option key={m} value={m}>{m}분</option>
            ))}
          </select>

          <span className="timer-value">{formatMMSS(remainingSec)}</span>
        </div>

        <div className="tool-actions">
          <button onClick={startTimer} disabled={timerRunning || remainingSec <= 0}>시작</button>
          <button onClick={pauseTimer} disabled={!timerRunning}>멈춤</button>
          <button onClick={resetTimer}>처음부터</button>
        </div>
      </div>

      {/* 3) 하가다 */}
      <div className="tool-row">
        <div className="tool-title">하가다</div>
        <div className="tool-display">{hagadaCount}</div>
        <div className="tool-actions">
          <button onClick={increaseHagada}>한번 더하기</button>
          <button onClick={resetHagada}>처음부터</button>
        </div>
      </div>
      
    </div>
  );
}
