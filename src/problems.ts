/**
 * 批次问题游标：在完整批次结果之上提供“上一个 / 下一个问题”的定位能力。
 *
 * 领域结果（BatchResult）始终保存全部非空行及原始行号；这里只把未通过行的
 * 原始行号按输入顺序抽出成问题序列，游标是问题序列中的序号。空行造成的
 * 行号间隔不影响映射：游标 ↔ 原始行号的换算完全由问题序列数组完成。
 */

import { BatchResult } from './sscc';

export type ProblemDirection = 'prev' | 'next';

/**
 * 提取整批中全部未通过行的原始行号，按输入位置升序。
 * 全部合格、空输入或仅含空行时返回空数组（无待处理问题）。
 */
export function listProblemLines(result: BatchResult): number[] {
  return result.lines.filter((line) => line.status !== 'ok').map((line) => line.lineNumber);
}

/**
 * 移动问题游标。返回移动后的序号；到达首尾边界或游标非法时返回 null，
 * 调用方应保持原游标并禁用对应按钮——不循环跳转。
 */
export function moveProblemCursor(
  cursor: number,
  direction: ProblemDirection,
  problemCount: number,
): number | null {
  if (problemCount <= 0 || cursor < 0 || cursor >= problemCount) {
    return null;
  }
  const next = direction === 'prev' ? cursor - 1 : cursor + 1;
  return next >= 0 && next < problemCount ? next : null;
}
