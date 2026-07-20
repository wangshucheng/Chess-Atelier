// 棋理讲解生成器：将评估值与局面特征转译为人类可读的解说

import { Chess } from 'chess.js';
import { evaluatePosition } from './evaluation';
import type { Explanation, SearchCandidate } from '@/types';

// 评估值转人类可读分数（类似 Stockfish 的 +1.2 / -0.8）
export function evalToText(evalScore: number): string {
  if (Math.abs(evalScore) > 90000) {
    // 将杀
    const movesToMate = Math.ceil((Math.abs(evalScore) - 90000) / 1);
    const sign = evalScore > 0 ? '+' : '-';
    return `${sign}M${movesToMate}`;
  }
  const pawns = (evalScore / 100).toFixed(2);
  return (evalScore > 0 ? '+' : '') + pawns;
}

// 检测当前局面的战术主题
function detectThemes(game: Chess, bestMove?: SearchCandidate): string[] {
  const themes: string[] = [];
  const board = game.board();

  // 是否将军
  if (game.inCheck()) themes.push('将军');

  // 是否在开局阶段
  const history = game.history();
  if (history.length < 12) themes.push('开局阶段');
  else if (history.length < 30) themes.push('中局阶段');
  else themes.push('残局阶段');

  // 中心控制
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
  if (whiteCenter > blackCenter) themes.push('白方控制中心');
  else if (blackCenter > whiteCenter) themes.push('黑方控制中心');

  // 子力对比
  let whiteMaterial = 0, blackMaterial = 0;
  for (const row of board) {
    for (const p of row) {
      if (!p) continue;
      const val = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 }[p.type];
      if (p.color === 'w') whiteMaterial += val;
      else blackMaterial += val;
    }
  }
  if (whiteMaterial > blackMaterial + 1) themes.push('白方子力优势');
  else if (blackMaterial > whiteMaterial + 1) themes.push('黑方子力优势');

  // 走子特征
  if (bestMove) {
    if (bestMove.move.includes('x')) themes.push('吃子');
    if (bestMove.move.includes('+')) themes.push('将军');
    if (bestMove.move.includes('#')) themes.push('将杀');
    if (bestMove.move.includes('=Q') || bestMove.move.includes('=R')) themes.push('升变');
    const san = bestMove.move;
    // 短易位 / 长易位
    if (san === 'O-O') themes.push('短易位');
    if (san === 'O-O-O') themes.push('长易位');
  }

  return themes;
}

// 评估风险等级
function assessRisk(evalScore: number, turn: 'w' | 'b'): 'low' | 'medium' | 'high' {
  const abs = Math.abs(evalScore);
  const advantage = turn === 'w' ? evalScore : -evalScore;
  if (advantage > 300 || abs > 800) return 'high';
  if (advantage > 100 || abs > 300) return 'medium';
  return 'low';
}

// 生成讲解
export function explainPosition(game: Chess, bestMove?: SearchCandidate): Explanation {
  const evalScore = evaluatePosition(game);
  const turn = game.turn();
  const themes = detectThemes(game, bestMove);
  const riskLevel = assessRisk(evalScore, turn);

  const sideName = turn === 'w' ? '白方' : '黑方';
  const evalText = evalToText(evalScore);
  const advantageSide = evalScore > 50 ? '白方' : evalScore < -50 ? '黑方' : '双方均势';

  const summary = bestMove
    ? `当前局面评估 ${evalText}（${advantageSide}略优），推荐走法 ${bestMove.move}，期望延续${bestMove.move.includes('x') ? '子力' : '局面'}优势。`
    : `当前局面评估 ${evalText}，${advantageSide}${Math.abs(evalScore) > 100 ? '略占优势' : '势均力敌'}。`;

  const details: string[] = [];

  // 阶段说明
  if (themes.includes('开局阶段')) {
    details.push(`当前处于开局阶段（${game.history().length} 手），核心目标为：抢占中心、轻子力出动、王车易位保障王安全。`);
  } else if (themes.includes('中局阶段')) {
    details.push(`已进入中局，应关注子力协调与战术机会（牵制、双重攻击、闪击）。`);
  } else {
    details.push(`残局阶段，王应主动参与，关注兵的升变通路与对方王的限制。`);
  }

  // 中心
  if (themes.includes('白方控制中心')) {
    details.push(`白方在中心 e4/d4/e5/d5 区域拥有更多子力，掌握空间主动权。`);
  } else if (themes.includes('黑方控制中心')) {
    details.push(`黑方中心部署稳固，白方需寻找反击点（如侧翼突破或 c/f 文件进攻）。`);
  }

  // 子力
  if (themes.includes('白方子力优势')) {
    details.push(`白方子力领先，应避免兑子以保持优势，寻找简化局面的机会。`);
  } else if (themes.includes('黑方子力优势')) {
    details.push(`黑方子力占优，${sideName}需主动寻求战术补偿或长将和棋机会。`);
  }

  // 风险
  if (riskLevel === 'high') {
    details.push(`⚠ 当前局面风险较高，需谨慎应对，避免冒险进攻导致防守漏洞。`);
  } else if (riskLevel === 'medium') {
    details.push(`局面存在一定张力，双方均需精确计算关键变着。`);
  } else {
    details.push(`局面相对平稳，可按计划推进战略部署。`);
  }

  // 推荐走法说明
  if (bestMove) {
    if (bestMove.move.includes('#')) {
      details.push(`推荐走法 ${bestMove.move} 为将杀，可直接结束对局。`);
    } else if (bestMove.move.includes('+')) {
      details.push(`推荐走法 ${bestMove.move} 为将军，迫使对方应将，可获取主动权。`);
    } else if (bestMove.move.includes('x')) {
      details.push(`推荐走法 ${bestMove.move} 为吃子，可获取子力优势。`);
    } else if (bestMove.move === 'O-O' || bestMove.move === 'O-O-O') {
      details.push(`推荐走法 ${bestMove.move} 为王车易位，强化王的安全并连通车。`);
    } else {
      details.push(`推荐走法 ${bestMove.move} 旨在改善子力位置或控制关键格。`);
    }
  }

  return {
    themes,
    summary,
    details,
    riskLevel,
  };
}

// 复盘走子评级
export function classifyMove(evalBefore: number, evalAfter: number, bestEval: number, turn: 'w' | 'b'): {
  quality: 'best' | 'good' | 'dubious' | 'mistake' | 'blunder';
  isBest: boolean;
} {
  // 评估值始终白方视角，需根据走子方转换
  // 走子方走完后，若 evalAfter 较 bestEval 差，则该走子有损失
  const perspective = turn === 'w' ? 1 : -1;
  const loss = (bestEval - evalAfter) * perspective; // 越大越差

  const isBest = Math.abs(loss) < 10;
  if (isBest) return { quality: 'best', isBest: true };
  if (loss < 30) return { quality: 'good', isBest: false };
  if (loss < 80) return { quality: 'dubious', isBest: false };
  if (loss < 200) return { quality: 'mistake', isBest: false };
  return { quality: 'blunder', isBest: false };
}
