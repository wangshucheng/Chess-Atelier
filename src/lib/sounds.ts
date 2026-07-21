// 音效引擎：使用 Web Audio API 程序化合成短促音效
// 优势：零依赖、零网络请求、体积小、可程序化控制音调/时长/包络
//
// 设计要点：
// 1) AudioContext 懒加载：浏览器自动播放策略要求用户交互后才能启动
//    首次调用 play() 时初始化，若未初始化则静默跳过
// 2) 全局开关由外部（store）通过 setSoundEnabled 注入
// 3) 每个音效由 1-3 个振荡器 + ADSR 包络合成
// 4) 所有音效 < 400ms，避免干扰用户

type SoundName =
  | 'move'      // 普通走子：短促木质音
  | 'capture'   // 吃子：重一些
  | 'check'     // 将军：警示双音
  | 'castle'    // 王车易位：双重音
  | 'promote'   // 升变：上扬音
  | 'win'       // 胜利：上行琶音
  | 'loss'      // 失败：下沉音
  | 'draw'      // 和棋：中性音
  | 'correct'   // 习题正确：清脆短音
  | 'wrong'     // 习题错误：错音
  | 'complete'  // 习题完成：庆祝和弦
  | 'click';    // UI 点击

// 全局开关：默认开启，由 store 同步
let soundEnabled = true;
export function setSoundEnabled(enabled: boolean): void {
  soundEnabled = enabled;
}
export function isSoundEnabled(): boolean {
  return soundEnabled;
}

// AudioContext 单例（懒加载）
let ctx: AudioContext | null = null;
function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (ctx) return ctx;
  const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  try {
    ctx = new Ctor();
  } catch {
    return null;
  }
  return ctx;
}

// 浏览器策略：用户交互后才能恢复 AudioContext
// 在首次 play 调用中尝试 resume，失败静默
function tryResume(audio: AudioContext): void {
  if (audio.state === 'suspended') {
    audio.resume().catch(() => { /* 静默 */ });
  }
}

interface ToneOptions {
  freq: number;          // 频率 Hz
  duration: number;      // 时长 s
  type?: OscillatorType; // 振荡器类型，默认 'sine'
  startAt?: number;      // 起始偏移 s（相对 now）
  gain?: number;         // 峰值音量 0-1，默认 0.15
  attack?: number;       // 起音时间 s，默认 0.005
  release?: number;      // 释放时间 s，默认 0.05
  detune?: number;       // 频率偏移 cents，用于增加质感
}

// 单音合成：振荡器 + ADSR 包络
function tone(audio: AudioContext, opts: ToneOptions): void {
  const {
    freq, duration, type = 'sine', startAt = 0,
    gain = 0.15, attack = 0.005, release = 0.05, detune = 0,
  } = opts;
  const t0 = audio.currentTime + startAt;
  const t1 = t0 + duration;

  const osc = audio.createOscillator();
  osc.type = type;
  osc.frequency.value = freq;
  osc.detune.value = detune;

  const g = audio.createGain();
  // 包络：attack 上升到 gain，sustain 至 t1-release，release 衰减到 0
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(gain, t0 + attack);
  g.gain.setValueAtTime(gain, Math.max(t0 + attack, t1 - release));
  g.gain.exponentialRampToValueAtTime(0.0001, t1);

  osc.connect(g).connect(audio.destination);
  osc.start(t0);
  osc.stop(t1 + 0.02);
}

// 噪声合成（用于吃子的"重击感"）
function noiseBurst(audio: AudioContext, startAt: number, duration: number, gain: number): void {
  const t0 = audio.currentTime + startAt;
  const t1 = t0 + duration;
  // 生成短噪声缓冲
  const len = Math.floor(audio.sampleRate * duration);
  const buffer = audio.createBuffer(1, len, audio.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < len; i++) {
    // 衰减式白噪声
    data[i] = (Math.random() * 2 - 1) * (1 - i / len);
  }
  const src = audio.createBufferSource();
  src.buffer = buffer;
  const g = audio.createGain();
  g.gain.setValueAtTime(gain, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t1);
  // 高通滤波让噪声更"脆"
  const hp = audio.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 800;
  src.connect(hp).connect(g).connect(audio.destination);
  src.start(t0);
  src.stop(t1 + 0.02);
}

// 各音效的具体合成实现
const synthesizers: Record<SoundName, (audio: AudioContext) => void> = {
  // 普通走子：方波短音，模拟木质棋子落子
  move: (a) => {
    tone(a, { freq: 220, duration: 0.08, type: 'square', gain: 0.12, attack: 0.002, release: 0.04 });
    tone(a, { freq: 110, duration: 0.06, type: 'sine', gain: 0.08, startAt: 0.01 });
  },
  // 吃子：方波 + 噪声，更厚重
  capture: (a) => {
    tone(a, { freq: 180, duration: 0.12, type: 'square', gain: 0.16, attack: 0.002, release: 0.06 });
    tone(a, { freq: 90, duration: 0.1, type: 'sine', gain: 0.12, startAt: 0.01 });
    noiseBurst(a, 0, 0.06, 0.08);
  },
  // 将军：双音叠加警示
  check: (a) => {
    tone(a, { freq: 660, duration: 0.12, type: 'triangle', gain: 0.14 });
    tone(a, { freq: 880, duration: 0.18, type: 'triangle', gain: 0.12, startAt: 0.1 });
  },
  // 王车易位：双重音，象征王和车同时移动
  castle: (a) => {
    tone(a, { freq: 330, duration: 0.08, type: 'square', gain: 0.12 });
    tone(a, { freq: 440, duration: 0.1, type: 'square', gain: 0.12, startAt: 0.06 });
  },
  // 升变：上扬四音
  promote: (a) => {
    tone(a, { freq: 440, duration: 0.1, type: 'triangle', gain: 0.14 });
    tone(a, { freq: 554, duration: 0.1, type: 'triangle', gain: 0.14, startAt: 0.08 });
    tone(a, { freq: 659, duration: 0.1, type: 'triangle', gain: 0.14, startAt: 0.16 });
    tone(a, { freq: 880, duration: 0.18, type: 'triangle', gain: 0.16, startAt: 0.24 });
  },
  // 胜利：C-E-G-C 上行琶音
  win: (a) => {
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((f, i) => {
      tone(a, { freq: f, duration: 0.18, type: 'triangle', gain: 0.16, startAt: i * 0.1 });
    });
  },
  // 失败：下行音
  loss: (a) => {
    tone(a, { freq: 330, duration: 0.2, type: 'sine', gain: 0.14 });
    tone(a, { freq: 247, duration: 0.25, type: 'sine', gain: 0.14, startAt: 0.15 });
    tone(a, { freq: 165, duration: 0.35, type: 'sine', gain: 0.14, startAt: 0.3 });
  },
  // 和棋：中性双音
  draw: (a) => {
    tone(a, { freq: 440, duration: 0.18, type: 'sine', gain: 0.14 });
    tone(a, { freq: 440, duration: 0.18, type: 'sine', gain: 0.14, startAt: 0.15 });
  },
  // 习题正确：清脆短音
  correct: (a) => {
    tone(a, { freq: 880, duration: 0.1, type: 'sine', gain: 0.16, attack: 0.002, release: 0.06 });
    tone(a, { freq: 1318, duration: 0.12, type: 'sine', gain: 0.14, startAt: 0.06 });
  },
  // 习题错误：低音错音
  wrong: (a) => {
    tone(a, { freq: 220, duration: 0.15, type: 'sawtooth', gain: 0.14 });
    tone(a, { freq: 207, duration: 0.2, type: 'sawtooth', gain: 0.14, startAt: 0.1 });
  },
  // 习题完成：庆祝和弦
  complete: (a) => {
    tone(a, { freq: 523.25, duration: 0.25, type: 'triangle', gain: 0.14 });
    tone(a, { freq: 659.25, duration: 0.25, type: 'triangle', gain: 0.12, startAt: 0.05 });
    tone(a, { freq: 783.99, duration: 0.3, type: 'triangle', gain: 0.12, startAt: 0.1 });
    tone(a, { freq: 1046.5, duration: 0.35, type: 'triangle', gain: 0.14, startAt: 0.18 });
  },
  // UI 点击：极短促
  click: (a) => {
    tone(a, { freq: 600, duration: 0.04, type: 'sine', gain: 0.08, attack: 0.001, release: 0.02 });
  },
};

// 播放音效：外部统一入口
// 若音效关闭 / AudioContext 不可用 / 处于 SSR，则静默
export function play(name: SoundName): void {
  if (!soundEnabled) return;
  const audio = getCtx();
  if (!audio) return;
  tryResume(audio);
  const synth = synthesizers[name];
  if (!synth) return;
  try {
    synth(audio);
  } catch {
    // 播放失败不影响业务逻辑
  }
}
