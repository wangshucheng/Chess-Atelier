// 棋理讲解生成器：将评估值与局面特征转译为人类可读的解说
// 文本全部通过传入的 t（翻译函数）生成，实现与具体语言解耦。

import { Chess } from 'chess.js';
import { evaluatePosition } from './evaluation';
import { MATE_SCORE, MATE_THRESHOLD } from './constants';
import type { Explanation, MoveQuality, SearchCandidate } from '@/types';
import type { Translate } from '@/i18n';

// 评估值转人类可读分数（类似 Stockfish 的 +1.2 / -0.8）
// 将杀编码：±(MATE_SCORE - distanceToMate)，距离越近分数绝对值越大
export function evalToText(evalScore: number): string {
  if (Math.abs(evalScore) > MATE_SCORE - MATE_THRESHOLD) {
    // 将杀：反推距离 = MATE_SCORE - |score|
    const distance = MATE_SCORE - Math.abs(evalScore);
    const movesToMate = Math.max(1, Math.ceil(distance / 2)); // 半步转整步
    const sign = evalScore > 0 ? '+' : '-';
    return `${sign}M${movesToMate}`;
  }
  const pawns = (evalScore / 100).toFixed(2);
  return (evalScore > 0 ? '+' : '') + pawns;
}

// 走法质量分级：依据从走子方视角的评估 delta（正=好，负=差）
// 阈值参考：>0 最佳；>-50 良好；>-100 可疑；>-300 失误；其余 败着
export function classifyMoveQuality(delta: number): MoveQuality {
  if (delta < -300) return 'blunder';
  if (delta < -100) return 'mistake';
  if (delta < -50) return 'dubious';
  if (delta < 50) return 'good';
  return 'best';
}

// 子力显示分值（用于讲解器的子力对比，单位：兵=1）
const PIECE_DISPLAY_VALUES: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

// 主题键（对应 i18n engine.themes.*），作为内部检测与展示的中间表达
type ThemeKey =
  | 'check'
  | 'opening'
  | 'middlegame'
  | 'endgame'
  | 'whiteCenter'
  | 'blackCenter'
  | 'whiteMaterial'
  | 'blackMaterial'
  | 'capture'
  | 'mate'
  | 'promotion'
  | 'castleK'
  | 'castleQ';

// 检测当前局面的战术主题（返回与语言无关的键）
function detectThemes(game: Chess, bestMove?: SearchCandidate): ThemeKey[] {
  const themes = new Set<ThemeKey>();
  const board = game.board();

  if (game.inCheck()) themes.add('check');

  const history = game.history();
  if (history.length < 12) themes.add('opening');
  else if (history.length < 30) themes.add('middlegame');
  else themes.add('endgame');

  const centerSquares = [
    { f: 3, r: 3 }, { f: 4, r: 3 }, { f: 3, r: 4 }, { f: 4, r: 4 },
  ];
  let whiteCenter = 0, blackCenter = 0;
  for (const { f, r } of centerSquares) {
    const p = board[r][f];
    if (p) {
      if (p.color === 'w') whiteCenter++;
      else blackCenter++;
    }
  }
  if (whiteCenter > blackCenter) themes.add('whiteCenter');
  else if (blackCenter > whiteCenter) themes.add('blackCenter');

  let whiteMaterial = 0, blackMaterial = 0;
  for (const row of board) {
    for (const p of row) {
      if (!p) continue;
      const val = PIECE_DISPLAY_VALUES[p.type];
      if (p.color === 'w') whiteMaterial += val;
      else blackMaterial += val;
    }
  }
  if (whiteMaterial > blackMaterial + 1) themes.add('whiteMaterial');
  else if (blackMaterial > whiteMaterial + 1) themes.add('blackMaterial');

  if (bestMove) {
    if (bestMove.move.includes('x')) themes.add('capture');
    if (bestMove.move.includes('+')) themes.add('check');
    if (bestMove.move.includes('#')) themes.add('mate');
    if (bestMove.move.includes('=Q') || bestMove.move.includes('=R')) themes.add('promotion');
    if (bestMove.move === 'O-O') themes.add('castleK');
    if (bestMove.move === 'O-O-O') themes.add('castleQ');
  }

  return Array.from(themes);
}

// 评估风险等级
function assessRisk(evalScore: number, turn: 'w' | 'b'): 'low' | 'medium' | 'high' {
  const abs = Math.abs(evalScore);
  const advantage = turn === 'w' ? evalScore : -evalScore;
  if (advantage > 300 || abs > 800) return 'high';
  if (advantage > 100 || abs > 300) return 'medium';
  return 'low';
}

// 生成讲解（文本经 t 生成，随语言切换）
export function explainPosition(game: Chess, bestMove: SearchCandidate | undefined, t: Translate): Explanation {
  const evalScore = evaluatePosition(game);
  const turn = game.turn();
  const themes = detectThemes(game, bestMove);
  const riskLevel = assessRisk(evalScore, turn);

  const evalText = evalToText(evalScore);
  const sideKey = evalScore > 50 ? 'white' : evalScore < -50 ? 'black' : 'equal';
  const sideStr = t(`engine.side.${sideKey}` as const);

  const summary = bestMove
    ? t('engine.summary.withBest', {
        eval: evalText,
        side: sideStr,
        move: bestMove.move,
        advantage: t(bestMove.move.includes('x') ? 'engine.advantage.material' : 'engine.advantage.position'),
      })
    : t('engine.summary.noBest', {
        eval: evalText,
        side: sideStr,
        status: t(Math.abs(evalScore) > 100 ? 'engine.status.leading' : 'engine.status.even'),
      });

  const details: string[] = [];

  const phaseKey: ThemeKey = themes.includes('opening')
    ? 'opening'
    : themes.includes('middlegame')
      ? 'middlegame'
      : 'endgame';
  if (phaseKey === 'opening') {
    details.push(t('engine.detail.opening', { moves: game.history().length }));
  } else if (phaseKey === 'middlegame') {
    details.push(t('engine.detail.middlegame'));
  } else {
    details.push(t('engine.detail.endgame'));
  }

  if (themes.includes('whiteCenter')) details.push(t('engine.detail.whiteCenter'));
  else if (themes.includes('blackCenter')) details.push(t('engine.detail.blackCenter'));

  if (themes.includes('whiteMaterial')) details.push(t('engine.detail.whiteMaterial'));
  else if (themes.includes('blackMaterial')) details.push(t('engine.detail.blackMaterial', { side: sideStr }));

  if (riskLevel === 'high') details.push(t('engine.detail.riskHigh'));
  else if (riskLevel === 'medium') details.push(t('engine.detail.riskMedium'));
  else details.push(t('engine.detail.riskLow'));

  if (bestMove) {
    if (bestMove.move.includes('#')) details.push(t('engine.detail.mate', { move: bestMove.move }));
    else if (bestMove.move.includes('+')) details.push(t('engine.detail.check', { move: bestMove.move }));
    else if (bestMove.move.includes('x')) details.push(t('engine.detail.capture', { move: bestMove.move }));
    else if (bestMove.move === 'O-O' || bestMove.move === 'O-O-O')
      details.push(t('engine.detail.castle', { move: bestMove.move }));
    else details.push(t('engine.detail.improve', { move: bestMove.move }));
  }

  // 展示用主题（已本地化）
  const themesDisplay = themes.map((key) => t(`engine.themes.${key}` as const));

  return {
    themes: themesDisplay,
    summary,
    details,
    riskLevel,
  };
}
