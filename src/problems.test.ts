import { describe, expect, it } from 'vitest';
import { evaluateBatch } from './sscc';
import { listProblemLines, moveProblemCursor } from './problems';

describe('listProblemLines（稀疏原始行号 → 问题序号映射）', () => {
  it('空行造成的行号间隔不影响问题顺序，游标序号映射回原始行号', () => {
    const input = [
      '123456789012345675', // 第 1 行：合格
      '', // 第 2 行：空行，占用行号
      '12345', // 第 3 行：格式错误
      '006141411234567890', // 第 4 行：合格
      '', // 第 5 行：空行
      '', // 第 6 行：空行
      '006141411234567891', // 第 7 行：校验位错误
      '123456789012345675', // 第 8 行：与第 1 行重复
    ].join('\n');
    const result = evaluateBatch(input);

    const problems = listProblemLines(result);
    // 问题序列按输入位置给出稀疏的原始行号，而不是压缩后的连续序号
    expect(problems).toEqual([3, 7, 8]);
    // 游标序号 → 原始行号：空行间隔不得让游标错位
    expect(problems[0]).toBe(3);
    expect(problems[1]).toBe(7);
    expect(problems[2]).toBe(8);
    // 与批次结果的首个问题行一致
    expect(problems[0]).toBe(result.firstProblemLine);
  });

  it('格式、校验、重复之外的合格行不进入问题序列', () => {
    const result = evaluateBatch(
      '123456789012345675\n\n006141411234567890\n000000000000000000',
    );
    expect(listProblemLines(result)).toEqual([]);
  });

  it('空输入与仅含空行都没有问题行', () => {
    expect(listProblemLines(evaluateBatch(''))).toEqual([]);
    expect(listProblemLines(evaluateBatch('   \n\n\t\n'))).toEqual([]);
  });
});

describe('moveProblemCursor（首尾移动边界，不循环）', () => {
  it('首个问题处“上一个”返回 null：禁用且不循环到末尾', () => {
    expect(moveProblemCursor(0, 'prev', 3)).toBeNull();
  });

  it('末个问题处“下一个”返回 null：禁用且不循环到开头', () => {
    expect(moveProblemCursor(2, 'next', 3)).toBeNull();
  });

  it('中间位置可前后移动一步', () => {
    expect(moveProblemCursor(1, 'prev', 3)).toBe(0);
    expect(moveProblemCursor(1, 'next', 3)).toBe(2);
  });

  it('只有一个问题时两个方向都不可移动', () => {
    expect(moveProblemCursor(0, 'prev', 1)).toBeNull();
    expect(moveProblemCursor(0, 'next', 1)).toBeNull();
  });

  it('没有问题或游标越界时返回 null', () => {
    expect(moveProblemCursor(0, 'next', 0)).toBeNull();
    expect(moveProblemCursor(3, 'next', 3)).toBeNull();
    expect(moveProblemCursor(-1, 'prev', 3)).toBeNull();
  });
});
