import { expect, test } from '@playwright/test';

const VALID_A = '123456789012345675'; // 实收 5，计算 5
const VALID_B = '006141411234567890'; // 实收 0，计算 0（前导零）
const BAD_CHECK = '006141411234567891'; // 实收 1，计算 0

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
