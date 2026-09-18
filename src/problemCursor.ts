/**
 * 问题游标：在批次的“未通过行原始行号”序列上按输入位置移动。
 *
 * 游标序号（index）对应的是问题在序列中的位置，而不是原始行号：
 * 空行造成的行号间隔只体现在 lineNumber 上，不会让序号错位。
 * 首尾移动只做夹取，不循环。
 */

export interface ProblemCursor {
  /** 问题序号（0 起），与原始行号无关。 */
  index: number;
  /** 待处理问题总数。 */
  total: number;
  /** 当前问题的原始行号。 */
  lineNumber: number;
  /** 已在首个问题：“上一个问题”必须禁用。 */
  isFirst: boolean;
  /** 已在末个问题：“下一个问题”必须禁用。 */
  isLast: boolean;
}

/** 由问题序号构造游标，越界序号夹取到首尾；没有失败行时返回 null。 */
export function cursorAt(
  problemLineNumbers: readonly number[],
  index: number,
): ProblemCursor | null {
  const total = problemLineNumbers.length;
  if (total === 0) {
    return null;
  }
  const clamped = Math.min(Math.max(index, 0), total - 1);
  return {
    index: clamped,
    total,
    lineNumber: problemLineNumbers[clamped],
    isFirst: clamped === 0,
    isLast: clamped === total - 1,
  };
}

/** 首个问题（序号 0）；没有失败行时为 null。 */
export function firstCursor(problemLineNumbers: readonly number[]): ProblemCursor | null {
  return cursorAt(problemLineNumbers, 0);
}

/**
 * 从当前序号相对移动 delta 个问题位置（-1 上一个、+1 下一个）。
 * 结果夹取在 [0, total-1]：首端继续向前、末端继续向后都停在原处，不循环。
 */
export function moveCursor(
  problemLineNumbers: readonly number[],
  index: number,
  delta: number,
): ProblemCursor | null {
  return cursorAt(problemLineNumbers, index + delta);
}
