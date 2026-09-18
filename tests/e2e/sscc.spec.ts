import { expect, test } from '@playwright/test';
import { computeCheckDigit } from '../../src/sscc';

const VALID_A = '123456789012345675'; // 实收 5，计算 5
const VALID_B = '006141411234567890'; // 实收 0，计算 0（前导零）
const BAD_CHECK = '006141411234567891'; // 实收 1，计算 0

/** 生成一条以 seed 区分的、校验位合格的 18 位 SSCC。 */
function makeValid(seed: number): string {
  const payload = '1' + String(seed).padStart(16, '0'); // 恰好 17 位且各 seed 互不相同
  return payload + computeCheckDigit(payload);
}

/** 构造 3 万行输入：行 1 格式错误、行 15000 校验错误、行 29998 与第 5 行重复；另含空行间隔。 */
function buildLargeBatch(): string {
  const lines: string[] = [];
  for (let line = 1; line <= 30_000; line += 1) {
    if (line === 1) {
      lines.push('BAD-LINE-0001!!'); // 格式错误
    } else if (line === 2 || line === 10_001) {
      lines.push(''); // 空行间隔：只造成行号间隔，不得让问题游标错位
    } else if (line === 15_000) {
      const valid = makeValid(line);
      const received = (Number(valid[17]) + 1) % 10;
      lines.push(valid.slice(0, 17) + received); // 校验位错误
    } else if (line === 29_998) {
      lines.push(makeValid(5)); // 与第 5 行重复
    } else {
      lines.push(makeValid(line));
    }
  }
  return lines.join('\n');
}

/**
 * 大批量文本（约 600 KB）用 Playwright fill 在受限环境下逐字符同步过慢，
 * 直接走原生 value setter 并派发 input 事件，React 的 onChange 照常触发。
 */
async function fillLargeBatch(page: import('@playwright/test').Page, value: string) {
  await page.getByTestId('sscc-input').evaluate((el, nextValue) => {
    const prototype = Object.getPrototypeOf(el) as HTMLTextAreaElement;
    const setter = Object.getOwnPropertyDescriptor(prototype, 'value')!.set!;
    setter.call(el, nextValue);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }, value);
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

test('全部合格时提示可送上传送带，并逐行显示实收与计算校验位', async ({ page }) => {
  await page.getByTestId('sscc-input').fill(`${VALID_A}\n\n${VALID_B}`);
  await page.getByTestId('submit').click();

  await expect(page.getByTestId('verdict')).toHaveAttribute('data-state', 'released');
  await expect(page.getByTestId('verdict')).toContainText('可送上传送带');

  // 第 2 行为空行被忽略，原始行号保留为 1 和 3
  await expect(page.getByTestId('row-2')).toHaveCount(0);
  const row1 = page.getByTestId('row-1');
  await expect(row1).toContainText('通过');
  await expect(row1.getByTestId('received')).toHaveText('5');
  await expect(row1.getByTestId('computed')).toHaveText('5');
  const row3 = page.getByTestId('row-3');
  await expect(row3).toContainText('通过');
  await expect(row3.getByTestId('received')).toHaveText('0');
  await expect(row3.getByTestId('computed')).toHaveText('0');
});

test('校验位错误：整批阻断、聚焦首个问题行并显示实收与计算值', async ({ page }) => {
  await page.getByTestId('sscc-input').fill(`${VALID_A}\n${BAD_CHECK}`);
  await page.getByTestId('submit').click();

  await expect(page.getByTestId('verdict')).toHaveAttribute('data-state', 'blocked');
  await expect(page.getByTestId('verdict')).toContainText('整批阻断');

  const row2 = page.getByTestId('row-2');
  await expect(row2).toBeFocused();
  await expect(row2.getByTestId('received')).toHaveText('1');
  await expect(row2.getByTestId('computed')).toHaveText('0');
  await expect(row2).toContainText('实收 1');
  await expect(row2).toContainText('应为 0');
});

test('格式错误：整批阻断并聚焦首个问题行', async ({ page }) => {
  await page.getByTestId('sscc-input').fill(`${VALID_A}\n12345\n${VALID_B}`);
  await page.getByTestId('submit').click();

  await expect(page.getByTestId('verdict')).toHaveAttribute('data-state', 'blocked');
  const row2 = page.getByTestId('row-2');
  await expect(row2).toBeFocused();
  await expect(row2).toContainText('格式错误');
});

test('空输入明确拒绝放行', async ({ page }) => {
  await page.getByTestId('submit').click();
  await expect(page.getByTestId('verdict')).toHaveAttribute('data-state', 'empty');
  await expect(page.getByTestId('verdict')).toContainText('拒绝放行');
});

test('仅含空行明确拒绝放行', async ({ page }) => {
  await page.getByTestId('sscc-input').fill('   \n\n\t\n');
  await page.getByTestId('submit').click();
  await expect(page.getByTestId('verdict')).toHaveAttribute('data-state', 'empty');
  await expect(page.getByTestId('verdict')).toContainText('拒绝放行');
});

test('输入改变立即清除旧结论', async ({ page }) => {
  await page.getByTestId('sscc-input').fill(VALID_A);
  await page.getByTestId('submit').click();
  await expect(page.getByTestId('verdict')).toHaveAttribute('data-state', 'released');

  await page.getByTestId('sscc-input').fill(`${VALID_A}\n${VALID_B}`);
  await expect(page.getByTestId('verdict')).toHaveCount(0);
  await expect(page.getByTestId('row-1')).toHaveCount(0);
});

test('重新提交只显示当前批次的完整结果', async ({ page }) => {
  await page.getByTestId('sscc-input').fill(`${BAD_CHECK}\n12345`);
  await page.getByTestId('submit').click();
  await expect(page.getByTestId('verdict')).toHaveAttribute('data-state', 'blocked');
  await expect(page.getByTestId('row-2')).toContainText('格式错误');

  await page.getByTestId('sscc-input').fill(VALID_B);
  await page.getByTestId('submit').click();
  await expect(page.getByTestId('verdict')).toHaveAttribute('data-state', 'released');
  await expect(page.getByTestId('row-1')).toContainText('通过');
  await expect(page.getByTestId('row-2')).toHaveCount(0);
});

test('逐行粘贴多条 SSCC 的真实批量流程', async ({ page }) => {
  const batch = ['000000000000000000', VALID_A, VALID_B].join('\n');
  await page.getByTestId('sscc-input').fill(batch);
  await page.getByTestId('submit').click();

  await expect(page.getByTestId('verdict')).toContainText('全部 3 行校验通过');
  await expect(page.getByTestId('verdict')).toContainText('可送上传送带');
});

test('批内重复：整批阻断、汇总重复行数并聚焦首个重复行', async ({ page }) => {
  await page.getByTestId('sscc-input').fill(`${VALID_A}\n\n${VALID_A}`);
  await page.getByTestId('submit').click();

  await expect(page.getByTestId('verdict')).toHaveAttribute('data-state', 'blocked');
  await expect(page.getByTestId('verdict')).toContainText('整批阻断');
  await expect(page.getByTestId('verdict')).toContainText('批内重复 1 行');

  // 首次出现保留通过，跨空行的重复行显示“与第 N 行重复”并被聚焦
  await expect(page.getByTestId('row-1')).toContainText('通过');
  const row3 = page.getByTestId('row-3');
  await expect(row3).toContainText('与第 1 行重复');
  await expect(row3).toBeFocused();
});

test('重复批次修正重复项后恢复放行', async ({ page }) => {
  await page.getByTestId('sscc-input').fill(`${VALID_A}\n${VALID_A}`);
  await page.getByTestId('submit').click();
  await expect(page.getByTestId('verdict')).toHaveAttribute('data-state', 'blocked');
  await expect(page.getByTestId('row-2')).toContainText('与第 1 行重复');

  // 修改输入立即清除旧结论
  await page.getByTestId('sscc-input').fill(`${VALID_A}\n${VALID_B}`);
  await expect(page.getByTestId('verdict')).toHaveCount(0);

  // 重新提交只反映当前文本：重复项已修正，整批放行
  await page.getByTestId('submit').click();
  await expect(page.getByTestId('verdict')).toHaveAttribute('data-state', 'released');
  await expect(page.getByTestId('row-1')).toContainText('通过');
  await expect(page.getByTestId('row-2')).toContainText('通过');
});

test.describe('三万条窗口化明细', () => {
  test('只挂载视口与缓冲区数据行（始终不超过 120 个），汇总基于完整批次', async ({
    page,
  }) => {
    await fillLargeBatch(page, buildLargeBatch());
    await page.getByTestId('submit').click();

    // 汇总基于完整 30000 个非空行：3 行失败（格式 / 校验 / 重复各一）
    await expect(page.getByTestId('verdict')).toHaveAttribute('data-state', 'blocked');
    await expect(page.getByTestId('verdict')).toContainText('3 行未通过');
    await expect(page.getByTestId('verdict')).toContainText('批内重复 1 行');
    await expect(page.getByTestId('verdict')).toContainText('第 1 行');

    const dataRows = page.locator('.result-table tbody tr[data-testid^="row-"]');
    await expect(dataRows.first()).toBeVisible();
    expect(await dataRows.count()).toBeLessThanOrEqual(120);
    // 屏外行未挂载，但滚动高度由底部占位撑起
    await expect(page.getByTestId('row-29998')).toHaveCount(0);
    await expect(page.getByTestId('bottom-spacer')).toHaveCount(1);

    // 手动滚动到中部、底部：任何滚动位置数据行节点都不超过 120
    const scroller = page.getByTestId('result-scroll');
    await scroller.evaluate((el) => {
      el.scrollTop = 15_000 * 38;
    });
    await expect(page.getByTestId('row-15000')).toHaveCount(1);
    expect(await dataRows.count()).toBeLessThanOrEqual(120);
    await expect(page.getByTestId('top-spacer')).toHaveCount(1);

    await scroller.evaluate((el) => {
      el.scrollTop = el.scrollHeight;
    });
    await expect(page.getByTestId('row-30000')).toHaveCount(1);
    expect(await dataRows.count()).toBeLessThanOrEqual(120);
  });

  test('游标从首个失败行开始，跳向屏外混合错误后准确聚焦；首尾禁用且不循环', async ({
    page,
  }) => {
    await fillLargeBatch(page, buildLargeBatch());
    await page.getByTestId('submit').click();

    const prev = page.getByTestId('prev-problem');
    const next = page.getByTestId('next-problem');
    const position = page.getByTestId('problem-position');

    // 阻断后游标从首个失败行（第 1 行，格式错误）开始
    await expect(page.getByTestId('row-1')).toBeFocused();
    await expect(position).toHaveText('问题 1 / 3（第 1 行）');
    await expect(prev).toBeDisabled();
    await expect(next).toBeEnabled();

    // 下一个：屏外的校验位错误行（第 15000 行，空行间隔不影响序号）
    await next.click();
    const middle = page.getByTestId('row-15000');
    await expect(middle).toBeFocused();
    await expect(middle).toContainText('校验位不符');
    await expect(position).toHaveText('问题 2 / 3（第 15000 行）');
    await expect(prev).toBeEnabled();
    await expect(next).toBeEnabled();

    // 下一个：屏外的重复行（第 29998 行，与第 5 行重复）
    await next.click();
    const last = page.getByTestId('row-29998');
    await expect(last).toBeFocused();
    await expect(last).toContainText('与第 5 行重复');
    await expect(position).toHaveText('问题 3 / 3（第 29998 行）');
    await expect(next).toBeDisabled();

    // 末尾按钮禁用：强制点击也不会改变游标，不会循环回开头
    await next.click({ force: true });
    await expect(position).toHaveText('问题 3 / 3（第 29998 行）');
    await expect(next).toBeDisabled();
    await expect(last).toHaveAttribute('data-cursor', 'true');

    // 上一个：滚动回去并准确聚焦中部问题
    await prev.click();
    await expect(page.getByTestId('row-15000')).toBeFocused();
    await expect(position).toHaveText('问题 2 / 3（第 15000 行）');

    // 再上一个回到首个问题，首端按钮禁用且不会越过开头
    await prev.click();
    await expect(page.getByTestId('row-1')).toBeFocused();
    await expect(prev).toBeDisabled();
    await prev.click({ force: true });
    await expect(position).toHaveText('问题 1 / 3（第 1 行）');
    await expect(page.getByTestId('row-1')).toHaveAttribute('data-cursor', 'true');
  });

  test('编辑输入时结果、窗口与问题游标一并清除', async ({ page }) => {
    await fillLargeBatch(page, buildLargeBatch());
    await page.getByTestId('submit').click();
    await expect(page.getByTestId('problem-nav')).toHaveCount(1);
    await expect(page.getByTestId('row-1')).toBeFocused();

    // 跳到屏外问题后修改输入
    await page.getByTestId('next-problem').click();
    await expect(page.getByTestId('row-15000')).toBeFocused();
    await page.getByTestId('sscc-input').press('End');
    await page.getByTestId('sscc-input').type('\n' + VALID_A);

    await expect(page.getByTestId('verdict')).toHaveCount(0);
    await expect(page.getByTestId('problem-nav')).toHaveCount(0);
    await expect(page.getByTestId('result-scroll')).toHaveCount(0);
  });

  test('普通批次放行时导航显示无待处理问题且不可跳转', async ({ page }) => {
    await page
      .getByTestId('sscc-input')
      .fill(`${VALID_A}\n\n${VALID_B}\n000000000000000000`);
    await page.getByTestId('submit').click();

    await expect(page.getByTestId('verdict')).toHaveAttribute('data-state', 'released');
    await expect(page.getByTestId('problem-position')).toHaveText('无待处理问题');
    await expect(page.getByTestId('prev-problem')).toBeDisabled();
    await expect(page.getByTestId('next-problem')).toBeDisabled();
    // 放行不抢焦点，明细仍窗口化挂载
    expect(
      await page.locator('.result-table tbody tr[data-testid^="row-"]').count(),
    ).toBeLessThanOrEqual(120);
    await expect(page.getByTestId('row-1')).toContainText('通过');
    await expect(page.getByTestId('row-3')).toContainText('通过');
  });
});
