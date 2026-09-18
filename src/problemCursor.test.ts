import { describe, expect, it } from 'vitest';
import { cursorAt, firstCursor, moveCursor } from './problemCursor';
import { evaluateBatch } from './sscc';

describe('稀疏原始行号到问题序号的映射', () => {
  it('空行造成的行号间隔不改变问题序号', () => {
    // 行 2、5、9、14 为失败行（其余为空行或合格行），问题序号仍连续为 0..3
    const input = [
      '', // 1
      '12345', // 2 格式错误
      '123456789012345675', // 3 合格
      '', // 4
      '006141411234567891', // 5 校验错误
      '', // 6
      '', // 7
      '', // 8
      '123456789012345675', // 9 与第 3 行重复
      '',
      '',
      '',
      '', // 10-13 空
      'bad', // 14 格式错误
    ].join('\n');
    const result = evaluateBatch(input);
    expect(result.problemLineNumbers).toEqual([2, 5, 9, 14]);
    expect(result.firstProblemLine).toBe(2);

    expect(cursorAt(result.problemLineNumbers, 0)?.lineNumber).toBe(2);
    expect(cursorAt(result.problemLineNumbers, 1)?.lineNumber).toBe(5);
    expect(cursorAt(result.problemLineNumbers, 2)?.lineNumber).toBe(9);
    expect(cursorAt(result.problemLineNumbers, 3)?.lineNumber).toBe(14);
  });

  it('游标序号按数组位置计，与行号差值无关', () => {
    // 即使问题行号间隔上千，序号也只递增 1
    const sparse = [1, 1500, 29999];
    const cursor = cursorAt(sparse, 2);
    expect(cursor).toEqual({
      index: 2,
      total: 3,
      lineNumber: 29999,
      isFirst: false,
      isLast: true,
    });
  });

  it('批内重复行同样进入问题序号序列', () => {
    const result = evaluateBatch('123456789012345675\n\n123456789012345675\n\n123456789012345675');
    expect(result.problemLineNumbers).toEqual([3, 5]);
  });

  it('没有失败行时问题序列为空', () => {
    const released = evaluateBatch('123456789012345675\n\n006141411234567890');
    expect(released.problemLineNumbers).toEqual([]);
    expect(released.firstProblemLine).toBeNull();
    expect(cursorAt(released.problemLineNumbers, 0)).toBeNull();
    expect(firstCursor(released.problemLineNumbers)).toBeNull();
  });
});

describe('firstCursor / cursorAt 边界夹取', () => {
  const problems = [2, 5, 9];

  it('阻断后游标从首个失败行开始', () => {
    expect(firstCursor(problems)).toEqual({
      index: 0,
      total: 3,
      lineNumber: 2,
      isFirst: true,
      isLast: false,
    });
  });

  it('负序号夹取到首个问题', () => {
    expect(cursorAt(problems, -5)?.index).toBe(0);
  });

  it('越界序号夹取到末个问题', () => {
    const cursor = cursorAt(problems, 99);
    expect(cursor?.index).toBe(2);
    expect(cursor?.lineNumber).toBe(9);
    expect(cursor?.isLast).toBe(true);
  });

  it('单一问题同时为首尾', () => {
    const cursor = firstCursor([7]);
    expect(cursor?.isFirst).toBe(true);
    expect(cursor?.isLast).toBe(true);
  });
});

describe('moveCursor 首尾移动边界（不循环）', () => {
  const problems = [2, 5, 9];

  it('按输入位置逐个前进，序号连续', () => {
    const second = moveCursor(problems, 0, 1);
    expect(second?.index).toBe(1);
    expect(second?.lineNumber).toBe(5);
    const third = moveCursor(problems, 1, 1);
    expect(third?.index).toBe(2);
    expect(third?.lineNumber).toBe(9);
  });

  it('逐个后退', () => {
    const second = moveCursor(problems, 2, -1);
    expect(second?.index).toBe(1);
    expect(second?.lineNumber).toBe(5);
    expect(moveCursor(problems, 1, -1)?.index).toBe(0);
  });

  it('在首个问题继续向前停在原处，不绕到末尾', () => {
    const still = moveCursor(problems, 0, -1);
    expect(still?.index).toBe(0);
    expect(still?.lineNumber).toBe(2);
    expect(still?.isFirst).toBe(true);
  });

  it('在末个问题继续向后停在原处，不绕回开头', () => {
    const still = moveCursor(problems, 2, 1);
    expect(still?.index).toBe(2);
    expect(still?.lineNumber).toBe(9);
    expect(still?.isLast).toBe(true);
  });

  it('多步移动同样被夹取', () => {
    expect(moveCursor(problems, 1, 100)?.index).toBe(2);
    expect(moveCursor(problems, 1, -100)?.index).toBe(0);
  });

  it('空问题序列移动返回 null', () => {
    expect(moveCursor([], 0, 1)).toBeNull();
  });
});
