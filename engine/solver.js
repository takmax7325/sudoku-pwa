/* ================================================================
   engine/solver.js
   ロジックベースソルバー（人間の解法を完全再現）

   実装テクニック:
     Naked Single / Hidden Single
     Naked Pair / Hidden Pair / Naked Triple
     Pointing Pair/Triple / Box-Line Reduction
     X-Wing / Swordfish
     XY-Wing / XYZ-Wing
     Unique Rectangle / Simple Coloring

   各テクニックは nextStep(grid) → ステップオブジェクト を返す
   solveLogically(grid) → { solved, steps, finalGrid }
================================================================ */

// ---- ユーティリティ ----

/** セルのピア（同じ行・列・ボックス）一覧を返す */
function peers(row, col) {
  const res = new Set();
  for (let c = 0; c < 9; c++) if (c !== col) res.add(row * 9 + c);
  for (let r = 0; r < 9; r++) if (r !== row) res.add(r * 9 + col);
  const br = ~~(row / 3) * 3, bc = ~~(col / 3) * 3;
  for (let r = br; r < br + 3; r++) {
    for (let c = bc; c < bc + 3; c++) {
      if (r !== row || c !== col) res.add(r * 9 + c);
    }
  }
  return [...res].map(i => [~~(i / 9), i % 9]);
}

/** ボックス番号 (0-8) 内の全セル座標を返す */
function boxCells(box) {
  const cells = [];
  const br = ~~(box / 3) * 3, bc = (box % 3) * 3;
  for (let r = br; r < br + 3; r++) {
    for (let c = bc; c < bc + 3; c++) cells.push([r, c]);
  }
  return cells;
}

/** 2セルが互いに見えるか（同行・同列・同ボックス） */
function canSee(r1, c1, r2, c2) {
  if (r1 === r2 || c1 === c2) return true;
  return (~~(r1 / 3) === ~~(r2 / 3) && ~~(c1 / 3) === ~~(c2 / 3));
}

/** グリッドから候補集合を構築する */
function buildCandidates(grid) {
  const cands = Array.from({ length: 9 }, () =>
    Array.from({ length: 9 }, () => new Set([1, 2, 3, 4, 5, 6, 7, 8, 9]))
  );
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      const v = grid[r * 9 + c];
      if (v) {
        cands[r][c] = new Set();
        peers(r, c).forEach(([pr, pc]) => cands[pr][pc].delete(v));
      }
    }
  }
  return cands;
}

// ---- 各テクニック ----

/** Naked Single: 候補が1つのみのセルを確定 */
function nakedSingle(cands) {
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      if (cands[r][c].size === 1) {
        const v = [...cands[r][c]][0];
        return {
          placements: [[r, c, v]], eliminations: [],
          technique: 'Naked Single', score: 1,
          related: peers(r, c),
          explanation: `(${r + 1},${c + 1}) の候補は ${v} のみ → 確定`
        };
      }
    }
  }
}

/** Hidden Single: ある数字が行・列・ボックスで1セルにしか入らない */
function hiddenSingle(cands) {
  // 行
  for (let r = 0; r < 9; r++) {
    for (let v = 1; v <= 9; v++) {
      const cols = Array.from({ length: 9 }, (_, c) => c).filter(c => cands[r][c].has(v));
      if (cols.length === 1) {
        return {
          placements: [[r, cols[0], v]], eliminations: [],
          technique: 'Hidden Single', score: 2,
          related: Array.from({ length: 9 }, (_, c) => [r, c]),
          explanation: `行${r + 1} で ${v} が入るのは列${cols[0] + 1} のみ`
        };
      }
    }
  }
  // 列
  for (let c = 0; c < 9; c++) {
    for (let v = 1; v <= 9; v++) {
      const rows = Array.from({ length: 9 }, (_, r) => r).filter(r => cands[r][c].has(v));
      if (rows.length === 1) {
        return {
          placements: [[rows[0], c, v]], eliminations: [],
          technique: 'Hidden Single', score: 2,
          related: Array.from({ length: 9 }, (_, r) => [r, c]),
          explanation: `列${c + 1} で ${v} が入るのは行${rows[0] + 1} のみ`
        };
      }
    }
  }
  // ボックス
  for (let b = 0; b < 9; b++) {
    for (let v = 1; v <= 9; v++) {
      const cells = boxCells(b).filter(([r, c]) => cands[r][c].has(v));
      if (cells.length === 1) {
        return {
          placements: [[cells[0][0], cells[0][1], v]], eliminations: [],
          technique: 'Hidden Single', score: 2,
          related: boxCells(b),
          explanation: `ボックス${b + 1} で ${v} が入るのは(${cells[0][0] + 1},${cells[0][1] + 1})のみ`
        };
      }
    }
  }
}

/** Naked Pair: 2セルが同じ2候補 → 同ユニット他セルから除去 */
function nakedPair(cands) {
  function check(cells, unitName) {
    const pairs = cells.filter(([r, c]) => cands[r][c].size === 2);
    for (let i = 0; i < pairs.length; i++) {
      for (let j = i + 1; j < pairs.length; j++) {
        const [r1, c1] = pairs[i], [r2, c2] = pairs[j];
        const s1 = cands[r1][c1], s2 = cands[r2][c2];
        if (s1.size === s2.size && [...s1].every(v => s2.has(v))) {
          const digits = [...s1];
          const elims = [];
          cells.forEach(([r, c]) => {
            if ((r === r1 && c === c1) || (r === r2 && c === c2)) return;
            digits.forEach(d => { if (cands[r][c].has(d)) elims.push([r, c, d]); });
          });
          if (elims.length) {
            return {
              placements: [], eliminations: elims,
              technique: 'Naked Pair', score: 4,
              related: [[r1, c1], [r2, c2]],
              explanation: `${unitName} で Naked Pair [${digits}] → 他セルから候補除去`
            };
          }
        }
      }
    }
  }
  for (let r = 0; r < 9; r++) { const s = check(Array.from({ length: 9 }, (_, c) => [r, c]), `行${r + 1}`); if (s) return s; }
  for (let c = 0; c < 9; c++) { const s = check(Array.from({ length: 9 }, (_, r) => [r, c]), `列${c + 1}`); if (s) return s; }
  for (let b = 0; b < 9; b++) { const s = check(boxCells(b), `ボックス${b + 1}`); if (s) return s; }
}

/** Hidden Pair: 2数字が同ユニット内で同じ2セルにのみ存在 → 余分な候補除去 */
function hiddenPair(cands) {
  function check(cells, unitName) {
    for (let d1 = 1; d1 <= 8; d1++) {
      for (let d2 = d1 + 1; d2 <= 9; d2++) {
        const c1 = cells.filter(([r, c]) => cands[r][c].has(d1));
        const c2 = cells.filter(([r, c]) => cands[r][c].has(d2));
        if (c1.length !== 2 || c2.length !== 2) continue;
        const key1 = c1.map(x => x[0] * 9 + x[1]).sort().join();
        const key2 = c2.map(x => x[0] * 9 + x[1]).sort().join();
        if (key1 !== key2) continue;
        const elims = [];
        c1.forEach(([r, c]) => {
          for (let d = 1; d <= 9; d++) {
            if (d !== d1 && d !== d2 && cands[r][c].has(d)) elims.push([r, c, d]);
          }
        });
        if (elims.length) {
          return {
            placements: [], eliminations: elims,
            technique: 'Hidden Pair', score: 5,
            related: c1,
            explanation: `${unitName} で Hidden Pair (${d1},${d2}) → 余分な候補除去`
          };
        }
      }
    }
  }
  for (let r = 0; r < 9; r++) { const s = check(Array.from({ length: 9 }, (_, c) => [r, c]), `行${r + 1}`); if (s) return s; }
  for (let c = 0; c < 9; c++) { const s = check(Array.from({ length: 9 }, (_, r) => [r, c]), `列${c + 1}`); if (s) return s; }
  for (let b = 0; b < 9; b++) { const s = check(boxCells(b), `ボックス${b + 1}`); if (s) return s; }
}

/** Naked Triple: 3セルの候補の和が3種類 → 同ユニット他セルから除去 */
function nakedTriple(cands) {
  function check(cells, unitName) {
    const small = cells.filter(([r, c]) => cands[r][c].size >= 1 && cands[r][c].size <= 3);
    for (let i = 0; i < small.length; i++) {
      for (let j = i + 1; j < small.length; j++) {
        for (let k = j + 1; k < small.length; k++) {
          const union = new Set([
            ...cands[small[i][0]][small[i][1]],
            ...cands[small[j][0]][small[j][1]],
            ...cands[small[k][0]][small[k][1]]
          ]);
          if (union.size !== 3) continue;
          const triple = [small[i], small[j], small[k]];
          const elims = [];
          cells.forEach(([r, c]) => {
            if (triple.some(([tr, tc]) => tr === r && tc === c)) return;
            union.forEach(d => { if (cands[r][c].has(d)) elims.push([r, c, d]); });
          });
          if (elims.length) {
            return {
              placements: [], eliminations: elims,
              technique: 'Naked Triple', score: 6,
              related: triple,
              explanation: `${unitName} で Naked Triple [${[...union]}] → 他セルから候補除去`
            };
          }
        }
      }
    }
  }
  for (let r = 0; r < 9; r++) { const s = check(Array.from({ length: 9 }, (_, c) => [r, c]), `行${r + 1}`); if (s) return s; }
  for (let c = 0; c < 9; c++) { const s = check(Array.from({ length: 9 }, (_, r) => [r, c]), `列${c + 1}`); if (s) return s; }
  for (let b = 0; b < 9; b++) { const s = check(boxCells(b), `ボックス${b + 1}`); if (s) return s; }
}

/** Pointing Pair/Triple: ボックス内で候補が1行または1列に集中 → ボックス外から除去 */
function pointingPair(cands) {
  for (let b = 0; b < 9; b++) {
    const br = ~~(b / 3) * 3, bc = (b % 3) * 3;
    for (let v = 1; v <= 9; v++) {
      const pos = boxCells(b).filter(([r, c]) => cands[r][c].has(v));
      if (pos.length < 2 || pos.length > 3) continue;
      const rows = new Set(pos.map(x => x[0])), cols = new Set(pos.map(x => x[1]));

      if (rows.size === 1) {
        const r = [...rows][0];
        const elims = [];
        for (let c = 0; c < 9; c++) {
          if (c < bc || c >= bc + 3) {
            if (cands[r][c].has(v)) elims.push([r, c, v]);
          }
        }
        if (elims.length) {
          return {
            placements: [], eliminations: elims,
            technique: 'Pointing Pair', score: 4,
            related: pos,
            explanation: `ボックス${b + 1} で ${v} は行${r + 1} に限定 → 行の他セルから除去`
          };
        }
      }

      if (cols.size === 1) {
        const c = [...cols][0];
        const elims = [];
        for (let r = 0; r < 9; r++) {
          if (r < br || r >= br + 3) {
            if (cands[r][c].has(v)) elims.push([r, c, v]);
          }
        }
        if (elims.length) {
          return {
            placements: [], eliminations: elims,
            technique: 'Pointing Pair', score: 4,
            related: pos,
            explanation: `ボックス${b + 1} で ${v} は列${c + 1} に限定 → 列の他セルから除去`
          };
        }
      }
    }
  }
}

/** Box-Line Reduction: 行・列でボックス内にのみ候補が集中 → ボックス内他行/列から除去 */
function boxLineReduction(cands) {
  // 行スキャン
  for (let r = 0; r < 9; r++) {
    for (let v = 1; v <= 9; v++) {
      const cols = Array.from({ length: 9 }, (_, c) => c).filter(c => cands[r][c].has(v));
      if (cols.length < 2 || cols.length > 3) continue;
      const bCols = new Set(cols.map(c => ~~(c / 3)));
      if (bCols.size !== 1) continue;
      const bCol = [...bCols][0] * 3, bRow = ~~(r / 3) * 3;
      const elims = [];
      for (let row = bRow; row < bRow + 3; row++) {
        if (row === r) continue;
        for (let c = bCol; c < bCol + 3; c++) {
          if (cands[row][c].has(v)) elims.push([row, c, v]);
        }
      }
      if (elims.length) {
        return {
          placements: [], eliminations: elims,
          technique: 'Box-Line Reduction', score: 5,
          related: cols.map(c => [r, c]),
          explanation: `行${r + 1} で ${v} はボックス内に限定 → ボックス他行から除去`
        };
      }
    }
  }
  // 列スキャン
  for (let c = 0; c < 9; c++) {
    for (let v = 1; v <= 9; v++) {
      const rows = Array.from({ length: 9 }, (_, r) => r).filter(r => cands[r][c].has(v));
      if (rows.length < 2 || rows.length > 3) continue;
      const bRows = new Set(rows.map(r => ~~(r / 3)));
      if (bRows.size !== 1) continue;
      const bRow = [...bRows][0] * 3, bCol = ~~(c / 3) * 3;
      const elims = [];
      for (let r = bRow; r < bRow + 3; r++) {
        for (let col = bCol; col < bCol + 3; col++) {
          if (col !== c && cands[r][col].has(v)) elims.push([r, col, v]);
        }
      }
      if (elims.length) {
        return {
          placements: [], eliminations: elims,
          technique: 'Box-Line Reduction', score: 5,
          related: rows.map(r => [r, c]),
          explanation: `列${c + 1} で ${v} はボックス内に限定 → ボックス他列から除去`
        };
      }
    }
  }
}

/** X-Wing: 2行(列)で同数字が同じ2列(行)に存在 → 他行(列)から除去 */
function xWing(cands) {
  for (let v = 1; v <= 9; v++) {
    // 行ベース
    const rData = {};
    for (let r = 0; r < 9; r++) {
      const cols = Array.from({ length: 9 }, (_, c) => c).filter(c => cands[r][c].has(v));
      if (cols.length === 2) rData[r] = cols;
    }
    const rows = Object.keys(rData).map(Number);
    for (let i = 0; i < rows.length; i++) {
      for (let j = i + 1; j < rows.length; j++) {
        const [r1, r2] = [rows[i], rows[j]];
        if (rData[r1].join() !== rData[r2].join()) continue;
        const elims = [];
        for (let r = 0; r < 9; r++) {
          if (r !== r1 && r !== r2) {
            rData[r1].forEach(c => { if (cands[r][c].has(v)) elims.push([r, c, v]); });
          }
        }
        if (elims.length) {
          return {
            placements: [], eliminations: elims,
            technique: 'X-Wing', score: 10,
            related: [[r1, rData[r1][0]], [r1, rData[r1][1]], [r2, rData[r2][0]], [r2, rData[r2][1]]],
            explanation: `X-Wing: 行${r1 + 1},${r2 + 1} 列${rData[r1].map(c => c + 1)} で ${v} → 列の他セルから除去`
          };
        }
      }
    }
    // 列ベース
    const cData = {};
    for (let c = 0; c < 9; c++) {
      const rs = Array.from({ length: 9 }, (_, r) => r).filter(r => cands[r][c].has(v));
      if (rs.length === 2) cData[c] = rs;
    }
    const cols = Object.keys(cData).map(Number);
    for (let i = 0; i < cols.length; i++) {
      for (let j = i + 1; j < cols.length; j++) {
        const [c1, c2] = [cols[i], cols[j]];
        if (cData[c1].join() !== cData[c2].join()) continue;
        const elims = [];
        for (let c = 0; c < 9; c++) {
          if (c !== c1 && c !== c2) {
            cData[c1].forEach(r => { if (cands[r][c].has(v)) elims.push([r, c, v]); });
          }
        }
        if (elims.length) {
          return {
            placements: [], eliminations: elims,
            technique: 'X-Wing', score: 10,
            related: [[cData[c1][0], c1], [cData[c1][1], c1], [cData[c2][0], c2], [cData[c2][1], c2]],
            explanation: `X-Wing (列ベース): 列${c1 + 1},${c2 + 1} 行${cData[c1].map(r => r + 1)} で ${v}`
          };
        }
      }
    }
  }
}

/** Swordfish: X-Wingの3行・3列版 */
function swordfish(cands) {
  for (let v = 1; v <= 9; v++) {
    // 行ベース
    const rData = {};
    for (let r = 0; r < 9; r++) {
      const cols = Array.from({ length: 9 }, (_, c) => c).filter(c => cands[r][c].has(v));
      if (cols.length >= 2 && cols.length <= 3) rData[r] = cols;
    }
    const rows = Object.keys(rData).map(Number);
    if (rows.length >= 3) {
      for (let i = 0; i < rows.length - 2; i++) {
        for (let j = i + 1; j < rows.length - 1; j++) {
          for (let k = j + 1; k < rows.length; k++) {
            const [r1, r2, r3] = [rows[i], rows[j], rows[k]];
            const colSet = new Set([...rData[r1], ...rData[r2], ...rData[r3]]);
            if (colSet.size !== 3) continue;
            const colArr = [...colSet];
            const elims = [];
            for (let r = 0; r < 9; r++) {
              if (r !== r1 && r !== r2 && r !== r3) {
                colArr.forEach(c => { if (cands[r][c].has(v)) elims.push([r, c, v]); });
              }
            }
            if (elims.length) {
              return {
                placements: [], eliminations: elims,
                technique: 'Swordfish', score: 20,
                related: [r1, r2, r3].flatMap(r => colArr.map(c => [r, c])),
                explanation: `Swordfish: 行${r1 + 1},${r2 + 1},${r3 + 1} で ${v} → 列から除去`
              };
            }
          }
        }
      }
    }
    // 列ベース
    const cData = {};
    for (let c = 0; c < 9; c++) {
      const rs = Array.from({ length: 9 }, (_, r) => r).filter(r => cands[r][c].has(v));
      if (rs.length >= 2 && rs.length <= 3) cData[c] = rs;
    }
    const cols2 = Object.keys(cData).map(Number);
    if (cols2.length >= 3) {
      for (let i = 0; i < cols2.length - 2; i++) {
        for (let j = i + 1; j < cols2.length - 1; j++) {
          for (let k = j + 1; k < cols2.length; k++) {
            const [c1, c2, c3] = [cols2[i], cols2[j], cols2[k]];
            const rowSet = new Set([...cData[c1], ...cData[c2], ...cData[c3]]);
            if (rowSet.size !== 3) continue;
            const rowArr = [...rowSet];
            const elims = [];
            for (let c = 0; c < 9; c++) {
              if (c !== c1 && c !== c2 && c !== c3) {
                rowArr.forEach(r => { if (cands[r][c].has(v)) elims.push([r, c, v]); });
              }
            }
            if (elims.length) {
              return {
                placements: [], eliminations: elims,
                technique: 'Swordfish', score: 20,
                related: rowArr.flatMap(r => [c1, c2, c3].map(c => [r, c])),
                explanation: `Swordfish (列ベース): 列${c1 + 1},${c2 + 1},${c3 + 1} で ${v} → 行から除去`
              };
            }
          }
        }
      }
    }
  }
}

/** XY-Wing: ピボット(AB) + ウィング(AC) + ウィング(BC) → 共通ピアからCを除去 */
function xyWing(cands) {
  for (let pr = 0; pr < 9; pr++) {
    for (let pc = 0; pc < 9; pc++) {
      const pivot = cands[pr][pc];
      if (pivot.size !== 2) continue;
      const [x, y] = [...pivot];
      const pp = peers(pr, pc);

      for (let z = 1; z <= 9; z++) {
        if (z === x || z === y) continue;
        const p1s = pp.filter(([r, c]) => cands[r][c].size === 2 && cands[r][c].has(x) && cands[r][c].has(z));
        const p2s = pp.filter(([r, c]) => cands[r][c].size === 2 && cands[r][c].has(y) && cands[r][c].has(z));

        for (const p1 of p1s) {
          for (const p2 of p2s) {
            if (p1[0] === p2[0] && p1[1] === p2[1]) continue;
            const pp1 = new Set(peers(p1[0], p1[1]).map(([r, c]) => r * 9 + c));
            const pp2 = new Set(peers(p2[0], p2[1]).map(([r, c]) => r * 9 + c));
            const common = [...pp1].filter(i => pp2.has(i));
            const elims = [];
            common.forEach(i => {
              const r = ~~(i / 9), c = i % 9;
              if (cands[r][c].has(z)) elims.push([r, c, z]);
            });
            if (elims.length) {
              return {
                placements: [], eliminations: elims,
                technique: 'XY-Wing', score: 25,
                related: [[pr, pc], p1, p2],
                explanation: `XY-Wing: ピボット(${pr + 1},${pc + 1})[${x},${y}] → 共通ピアから${z}除去`
              };
            }
          }
        }
      }
    }
  }
}

/** XYZ-Wing: ピボット(ABC) + ウィング(AB) + ウィング(AC) → 共通ピアからCを除去 */
function xyzWing(cands) {
  for (let pr = 0; pr < 9; pr++) {
    for (let pc = 0; pc < 9; pc++) {
      const pivot = cands[pr][pc];
      if (pivot.size !== 3) continue;
      const pp = peers(pr, pc);
      const wings = pp.filter(([r, c]) =>
        cands[r][c].size === 2 && [...cands[r][c]].every(v => pivot.has(v))
      );
      for (let i = 0; i < wings.length - 1; i++) {
        for (let j = i + 1; j < wings.length; j++) {
          const w1 = wings[i], w2 = wings[j];
          const union = new Set([...cands[w1[0]][w1[1]], ...cands[w2[0]][w2[1]]]);
          if (union.size !== 3 || ![...union].every(v => pivot.has(v))) continue;
          const z = [...cands[w1[0]][w1[1]]].find(v => cands[w2[0]][w2[1]].has(v));
          if (!z) continue;
          const ppP = new Set(peers(pr, pc).map(([r, c]) => r * 9 + c));
          const pp1 = new Set(peers(w1[0], w1[1]).map(([r, c]) => r * 9 + c));
          const pp2 = new Set(peers(w2[0], w2[1]).map(([r, c]) => r * 9 + c));
          const common = [...ppP].filter(i => pp1.has(i) && pp2.has(i));
          const elims = [];
          common.forEach(i => {
            const r = ~~(i / 9), c = i % 9;
            if (cands[r][c].has(z)) elims.push([r, c, z]);
          });
          if (elims.length) {
            return {
              placements: [], eliminations: elims,
              technique: 'XYZ-Wing', score: 28,
              related: [[pr, pc], w1, w2],
              explanation: `XYZ-Wing: ピボット(${pr + 1},${pc + 1})[${[...pivot]}] → 共通ピアから${z}除去`
            };
          }
        }
      }
    }
  }
}

/** Unique Rectangle Type 1: 3セルが同じ2候補ペア → 4つ目のセルからペアを除去 */
function uniqueRectangle(cands) {
  for (let r1 = 0; r1 < 8; r1++) {
    for (let r2 = r1 + 1; r2 < 9; r2++) {
      if (~~(r1 / 3) === ~~(r2 / 3)) continue; // 同じボックス行はスキップ
      for (let c1 = 0; c1 < 8; c1++) {
        for (let c2 = c1 + 1; c2 < 9; c2++) {
          if (~~(c1 / 3) === ~~(c2 / 3)) continue; // 同じボックス列はスキップ
          const corners = [[r1, c1], [r1, c2], [r2, c1], [r2, c2]];
          const base = cands[r1][c1];
          if (base.size !== 2) continue;
          const floor = corners.filter(([r, c]) =>
            cands[r][c].size === 2 &&
            [...base].every(v => cands[r][c].has(v)) &&
            [...cands[r][c]].every(v => base.has(v))
          );
          if (floor.length !== 3) continue;
          const roof = corners.find(([r, c]) => !floor.some(([fr, fc]) => fr === r && fc === c));
          if (!roof || ![...base].every(v => cands[roof[0]][roof[1]].has(v))) continue;
          const elims = [...base].map(d => [roof[0], roof[1], d]);
          if (elims.length) {
            return {
              placements: [], eliminations: elims,
              technique: 'Unique Rectangle', score: 30,
              related: corners,
              explanation: `Unique Rectangle: (${r1 + 1},${c1 + 1})等 → (${roof[0] + 1},${roof[1] + 1})から除去`
            };
          }
        }
      }
    }
  }
}

/** Simple Coloring: 共役連鎖で同色が同ユニットに2つ → 矛盾色を除去 */
function simpleColoring(cands) {
  for (let v = 1; v <= 9; v++) {
    const graph = {};
    const cells = [];
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        if (cands[r][c].has(v)) cells.push([r, c]);
      }
    }
    cells.forEach(([r, c]) => { graph[r * 9 + c] = []; });

    for (let r = 0; r < 9; r++) {
      const rc = cells.filter(([cr]) => cr === r);
      if (rc.length === 2) {
        const [a, b] = [rc[0][0] * 9 + rc[0][1], rc[1][0] * 9 + rc[1][1]];
        graph[a].push(b); graph[b].push(a);
      }
    }
    for (let c = 0; c < 9; c++) {
      const cc = cells.filter(([, cc]) => cc === c);
      if (cc.length === 2) {
        const [a, b] = [cc[0][0] * 9 + cc[0][1], cc[1][0] * 9 + cc[1][1]];
        graph[a].push(b); graph[b].push(a);
      }
    }

    const color = {};
    cells.forEach(([r, c]) => {
      const k = r * 9 + c;
      if (color[k] !== undefined || !graph[k] || !graph[k].length) return;
      const q = [k]; color[k] = 0;
      while (q.length) {
        const cur = q.shift();
        (graph[cur] || []).forEach(nb => {
          if (color[nb] === undefined) { color[nb] = 1 - color[cur]; q.push(nb); }
        });
      }
    });

    const allUnits = [
      ...Array.from({ length: 9 }, (_, r) => Array.from({ length: 9 }, (_, c) => [r, c])),
      ...Array.from({ length: 9 }, (_, c) => Array.from({ length: 9 }, (_, r) => [r, c])),
      ...Array.from({ length: 9 }, (_, b) => boxCells(b))
    ];
    for (const unit of allUnits) {
      for (let col = 0; col <= 1; col++) {
        const same = unit.filter(([r, c]) => color[r * 9 + c] === col && cands[r][c].has(v));
        if (same.length >= 2) {
          const elims = cells.filter(([r, c]) => color[r * 9 + c] === col).map(([r, c]) => [r, c, v]);
          if (elims.length) {
            return {
              placements: [], eliminations: elims,
              technique: 'Simple Coloring', score: 8,
              related: cells,
              explanation: `Simple Coloring: ${v} の同色が同ユニットに2つ → 矛盾色を除去`
            };
          }
        }
      }
    }
  }
}

// ---- メインAPI ----

/**
 * グリッドの次の1ステップを返す（ヒント機能用）
 * @param {number[]} grid  長さ81の1次元配列
 * @returns {object|null}  ステップオブジェクト、または null（進めない場合）
 */
function nextStep(grid) {
  const cands = buildCandidates(grid);
  return nakedSingle(cands) || hiddenSingle(cands) ||
    nakedPair(cands) || hiddenPair(cands) || nakedTriple(cands) ||
    pointingPair(cands) || boxLineReduction(cands) ||
    xWing(cands) || swordfish(cands) || xyWing(cands) || xyzWing(cands) ||
    uniqueRectangle(cands) || simpleColoring(cands) || null;
}

/**
 * ロジックのみで数独を解く（難易度分析用）
 * @param {number[]} grid
 * @returns {{ solved: boolean, steps: object[], finalGrid: number[] }}
 */
function solveLogically(grid) {
  const g = [...grid];
  const steps = [];
  let cands = buildCandidates(g);

  function applyCands() {
    // 候補を現在のgに同期
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        if (g[r * 9 + c] !== 0) continue;
        const cSet = cands[r][c];
        if (cSet.size === 0) return false; // 矛盾
      }
    }
    return true;
  }

  while (true) {
    const step = nakedSingle(cands) || hiddenSingle(cands) ||
      nakedPair(cands) || hiddenPair(cands) || nakedTriple(cands) ||
      pointingPair(cands) || boxLineReduction(cands) ||
      xWing(cands) || swordfish(cands) || xyWing(cands) || xyzWing(cands) ||
      uniqueRectangle(cands) || simpleColoring(cands);

    if (!step) break;

    steps.push(step);

    // 確定処理
    step.placements.forEach(([r, c, v]) => {
      g[r * 9 + c] = v;
      cands[r][c] = new Set();
      peers(r, c).forEach(([pr, pc]) => cands[pr][pc].delete(v));
    });

    // 候補除去処理
    step.eliminations.forEach(([r, c, d]) => {
      cands[r][c].delete(d);
    });

    if (!applyCands()) break;
  }

  const solved = g.every(v => v !== 0);
  return { solved, steps, finalGrid: g };
}

/**
 * バックトラッキングによる完全解（Import検証用）
 * @param {number[]} grid
 * @returns {number[]|null}
 */
function solveGrid(grid) {
  const g = [...grid];
  function bt() {
    let best = -1, bestCnt = 10;
    for (let i = 0; i < 81; i++) {
      if (g[i]) continue;
      let cnt = 0;
      const r = ~~(i / 9), c = i % 9;
      for (let v = 1; v <= 9; v++) if (isPlacementValid(g, r, c, v)) cnt++;
      if (!cnt) return false;
      if (cnt < bestCnt) { bestCnt = cnt; best = i; }
    }
    if (best === -1) return true;
    const r = ~~(best / 9), c = best % 9;
    for (let v = 1; v <= 9; v++) {
      if (isPlacementValid(g, r, c, v)) {
        g[best] = v;
        if (bt()) return true;
        g[best] = 0;
      }
    }
    return false;
  }
  return bt() ? g : null;
}
