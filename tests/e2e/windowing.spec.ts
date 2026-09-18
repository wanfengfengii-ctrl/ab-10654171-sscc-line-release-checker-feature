import { expect, test, type Page } from '@playwright/test';
import { computeCheckDigit } from '../../src/sscc';

/** 生成第 sequence 条合法 SSCC（前 17 位为零填充序号 + 正确校验位），批内唯一。 */
function validSscc(sequence: number): string {
  const payload = String(sequence).padStart(17, '0');
  return `${payload}${computeCheckDigit(payload)}`;
}

const BAD_CHECK = '006141411234567891'; // 实收 1，计算 0

/**
 * 录入大段清单：等价于粘贴——通过原生 setter 写值并派发 input 事件，
 * 走与键入完全相同的 React onChange 路径，但避免逐行布局数万行文本的耗时。
 */
async function enterSsccList(page: Page, text: string) {
  await page.getByTestId('sscc-input').evaluate((element, value) => {
    const descriptor = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value');
    descriptor?.set?.call(element, value);
    element.dispatchEvent(new Event('input', { bubbles: true }));
  }, text);
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

test('三万条结果：明细窗口化，数据行 DOM 节点始终不超过 120 个', async ({ page }) => {
  test.setTimeout(60_000);
  const lines: string[] = [];
  for (let i = 0; i < 30_000; i += 1) {
    lines.push(validSscc(i));
  }
  await enterSsccList(page, lines.join('\n'));
  await page.getByTestId('submit').click();

  // 汇总与放行结论仍基于完整批次
  await expect(page.getByTestId('verdict')).toHaveAttribute('data-state', 'released');
  await expect(page.getByTestId('verdict')).toContainText('全部 30000 行校验通过');
  await expect(page.getByTestId('problem-nav')).toContainText('无待处理问题');

  const dataRows = page.locator('tbody tr[data-status]');
  const viewport = page.getByTestId('result-viewport');

  // 顶部：只挂载视口与缓冲区内的行
  await expect(page.getByTestId('row-1')).toHaveCount(1);
  await expect.poll(() => dataRows.count()).toBeLessThanOrEqual(120);

  // 滚动到中部，节点数仍不超上限
  await viewport.evaluate((el) => {
    el.scrollTop = 600_000;
  });
  await expect(page.getByTestId('row-15000')).toHaveCount(1);
  await expect.poll(() => dataRows.count()).toBeLessThanOrEqual(120);

  // 滚动到底部，节点数仍不超上限
  await viewport.evaluate((el) => {
    el.scrollTop = el.scrollHeight;
  });
  await expect(page.getByTestId('row-30000')).toHaveCount(1);
  await expect.poll(() => dataRows.count()).toBeLessThanOrEqual(120);
});

test('屏外混合错误：问题游标按输入位置跳转并准确聚焦，首尾禁用不循环', async ({ page }) => {
  test.setTimeout(60_000);
  const rows: string[] = [];
  for (let i = 0; i < 3000; i += 1) {
    rows.push(validSscc(i));
    if ((i + 1) % 500 === 0) {
      rows.push(''); // 空行制造稀疏原始行号（第 501、1002、1503、2004、2505、3006 行）
    }
  }
  rows[1499] = '12345'; // 第 1500 行：格式错误
  rows[2499] = BAD_CHECK; // 第 2500 行：校验位错误
  rows[2600] = validSscc(0); // 第 2601 行：与第 1 行重复
  await enterSsccList(page, rows.join('\n'));
  await page.getByTestId('submit').click();

  // 汇总基于完整批次：3 行未通过，其中批内重复 1 行
  await expect(page.getByTestId('verdict')).toHaveAttribute('data-state', 'blocked');
  await expect(page.getByTestId('verdict')).toContainText('批内重复 1 行');

  // 阻断后游标从首个失败行开始（空行间隔未让游标错位）
  await expect(page.getByTestId('row-1500')).toBeFocused();
  await expect(page.getByTestId('problem-position')).toContainText('第 1 / 3 个问题（第 1500 行）');
  await expect(page.getByTestId('prev-problem')).toBeDisabled();
  await expect(page.getByTestId('next-problem')).toBeEnabled();

  // 目标尚未挂载：先滚动再聚焦对应行
  await expect(page.getByTestId('row-2500')).toHaveCount(0);
  await page.getByTestId('next-problem').click();
  await expect(page.getByTestId('row-2500')).toBeFocused();
  await expect(page.getByTestId('problem-position')).toContainText('第 2 / 3 个问题（第 2500 行）');

  await page.getByTestId('next-problem').click();
  await expect(page.getByTestId('row-2601')).toBeFocused();
  await expect(page.getByTestId('problem-position')).toContainText('第 3 / 3 个问题（第 2601 行）');
  await expect(page.getByTestId('next-problem')).toBeDisabled();

  // 末位再点“下一个问题”不循环（禁用按钮不触发跳转，游标停留在末位问题行）
  await page.getByTestId('next-problem').click({ force: true });
  await expect(page.getByTestId('problem-position')).toContainText('第 3 / 3 个问题（第 2601 行）');
  await expect(page.getByTestId('row-2601')).toHaveClass(/current-problem/);

  // 回退：按输入位置逐个回到上一个问题
  await page.getByTestId('prev-problem').click();
  await expect(page.getByTestId('row-2500')).toBeFocused();
  await page.getByTestId('prev-problem').click();
  await expect(page.getByTestId('row-1500')).toBeFocused();
  await expect(page.getByTestId('problem-position')).toContainText('第 1 / 3 个问题（第 1500 行）');
  await expect(page.getByTestId('prev-problem')).toBeDisabled();

  // 首位再点“上一个问题”不循环（游标停留在首位问题行）
  await page.getByTestId('prev-problem').click({ force: true });
  await expect(page.getByTestId('problem-position')).toContainText('第 1 / 3 个问题（第 1500 行）');
  await expect(page.getByTestId('row-1500')).toHaveClass(/current-problem/);
});

test('输入修改：结果、窗口位置与问题游标一并清除', async ({ page }) => {
  test.setTimeout(60_000);
  const rows: string[] = [];
  for (let i = 0; i < 3000; i += 1) {
    rows.push(validSscc(i));
  }
  rows[2500] = '12345'; // 第 2501 行：格式错误
  await enterSsccList(page, rows.join('\n'));
  await page.getByTestId('submit').click();

  await expect(page.getByTestId('verdict')).toHaveAttribute('data-state', 'blocked');
  await expect(page.getByTestId('row-2501')).toBeFocused();
  await expect(page.getByTestId('problem-position')).toContainText('第 1 / 1 个问题（第 2501 行）');
  const viewport = page.getByTestId('result-viewport');
  expect(await viewport.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);

  // 修改输入：旧结论、窗口位置与问题游标立即清除
  await page.getByTestId('sscc-input').fill(`${validSscc(100_000)}\n${validSscc(100_001)}`);
  await expect(page.getByTestId('verdict')).toHaveCount(0);
  await expect(page.getByTestId('problem-nav')).toHaveCount(0);
  await expect(page.getByTestId('row-2501')).toHaveCount(0);

  // 重新提交普通批次：放行、导航显示无待处理问题、窗口回到顶部
  await page.getByTestId('submit').click();
  await expect(page.getByTestId('verdict')).toHaveAttribute('data-state', 'released');
  await expect(page.getByTestId('problem-nav')).toContainText('无待处理问题');
  await expect(page.getByTestId('row-1')).toBeVisible();
  expect(await viewport.evaluate((el) => el.scrollTop)).toBe(0);
});

test('普通小批次放行：全部行挂载且导航显示无待处理问题', async ({ page }) => {
  await page
    .getByTestId('sscc-input')
    .fill([validSscc(200_000), validSscc(200_001), validSscc(200_002)].join('\n'));
  await page.getByTestId('submit').click();

  await expect(page.getByTestId('verdict')).toHaveAttribute('data-state', 'released');
  await expect(page.getByTestId('verdict')).toContainText('可送上传送带');
  await expect(page.getByTestId('problem-nav')).toContainText('无待处理问题');
  await expect(page.locator('tbody tr[data-status]')).toHaveCount(3);
  await expect(page.getByTestId('row-3')).toContainText('通过');
});
