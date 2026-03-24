/* ================================================================
   engine/analyzer.js
   難易度判定・解法分析エンジン

   - STEP_SCORES        : テクニック別スコアテーブル
   - evaluateDifficulty : ステップ配列 → 難易度文字列
   - analyzeGrid        : グリッド → 完全分析レポート
================================================================ */

/** テクニック別スコア（大きいほど難しい） */
const STEP_SCORES = {
  'Naked Single':      1,
  'Hidden Single':     2,
  'Naked Pair':        4,
  'Hidden Pair':       5,
  'Naked Triple':      6,
  'Pointing Pair':     4,
  'Box-Line Reduction':5,
  'Simple Coloring':   8,
  'X-Wing':           10,
  'Swordfish':        20,
  'XY-Wing':          25,
  'XYZ-Wing':         28,
  'Unique Rectangle': 30,
};

/**
 * 解法ステップ配列から難易度を判定する
 *
 * スコア合計だけでなく「使われたテクニックの種類」も参照し、
 * 人間が感じる「論理的な難しさ」を正確に反映する。
 *
 * @param {object[]} steps   solveLogically() が返すステップ配列
 * @returns {string}  'easy' | 'normal' | 'hard' | 'expert' | 'insane'
 */
function evaluateDifficulty(steps) {
  if (!steps || steps.length === 0) return 'easy';

  const score = steps.reduce((acc, s) => acc + (STEP_SCORES[s.technique] || 3), 0);
  const used = new Set(steps.map(s => s.technique));

  // Insane: 非常に高度なテクニックの組み合わせ + 高スコア
  if (score >= 250 ||
      (used.has('Swordfish') && score >= 150) ||
      (used.has('XY-Wing') && used.has('X-Wing') && score >= 180) ||
      (used.has('XYZ-Wing') && score >= 200)) {
    return 'insane';
  }

  // Expert: 高度テクニック使用
  if (score >= 120 ||
      used.has('Swordfish') ||
      (used.has('X-Wing') && used.has('XY-Wing')) ||
      used.has('Unique Rectangle') ||
      used.has('XYZ-Wing')) {
    return 'expert';
  }

  // Hard: X-Wing / XY-Wing / Box-Line などの中〜高度手法
  if (score >= 60 ||
      used.has('X-Wing') ||
      used.has('XY-Wing') ||
      (used.has('Box-Line Reduction') && used.has('Naked Pair')) ||
      used.has('Simple Coloring')) {
    return 'hard';
  }

  // Normal: Naked/Hidden Pair, Pointing Pair など
  if (score >= 20 ||
      used.has('Naked Pair') ||
      used.has('Hidden Pair') ||
      used.has('Naked Triple') ||
      used.has('Pointing Pair')) {
    return 'normal';
  }

  // Easy: Naked/Hidden Single のみ
  return 'easy';
}

/**
 * グリッドを完全分析して詳細レポートを返す
 *
 * @param {number[]} grid   長さ81の1次元配列（0=空）
 * @returns {{
 *   solved:     boolean,        ロジックのみで解けたか
 *   difficulty: string,         難易度 ('easy'~'insane')
 *   score:      number,         合計スコア
 *   steps:      object[],       解法ステップ配列
 *   stepCounts: object,         テクニック別使用回数
 *   finalGrid:  number[],       最終グリッド
 *   clueCount:  number,         ヒント数（初期配置済みセル数）
 *   topTechnique: string|null,  最も高スコアなテクニック
 * }}
 */
function analyzeGrid(grid) {
  const clueCount = grid.filter(v => v !== 0).length;
  const { solved, steps, finalGrid } = solveLogically(grid);
  const score = steps.reduce((acc, s) => acc + (STEP_SCORES[s.technique] || 3), 0);
  const difficulty = evaluateDifficulty(steps);

  // テクニック使用回数
  const stepCounts = {};
  steps.forEach(s => {
    stepCounts[s.technique] = (stepCounts[s.technique] || 0) + 1;
  });

  // 最高スコアテクニック
  let topTechnique = null;
  let topScore = 0;
  for (const [tech, cnt] of Object.entries(stepCounts)) {
    const ts = STEP_SCORES[tech] || 0;
    if (ts > topScore) { topScore = ts; topTechnique = tech; }
  }

  return { solved, difficulty, score, steps, stepCounts, finalGrid, clueCount, topTechnique };
}
