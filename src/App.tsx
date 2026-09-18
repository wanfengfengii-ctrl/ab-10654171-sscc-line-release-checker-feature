import { FormEvent, RefObject, useEffect, useRef, useState } from 'react';
import { BatchResult, LineResult, evaluateBatch } from './sscc';

const STATUS_LABEL: Record<LineResult['status'], string> = {
  ok: '通过',
  'format-error': '格式错误：须为恰好 18 个数字',
  'check-error': '校验位不符',
  duplicate: '重复',
};

function Verdict({ result }: { result: BatchResult }) {
  if (!result.hasLines) {
    return (
      <p data-testid="verdict" data-state="empty" role="alert" className="verdict verdict-empty">
        拒绝放行：输入为空或仅含空行，没有可复核的 SSCC。
      </p>
    );
  }
  if (!result.canRelease) {
    const failed = result.lines.filter((line) => line.status !== 'ok').length;
    return (
      <p
        data-testid="verdict"
        data-state="blocked"
        role="alert"
        className="verdict verdict-blocked"
      >
        整批阻断：{failed} 行未通过（批内重复 {result.duplicateCount} 行），已聚焦首个问题行（第{' '}
        {result.firstProblemLine} 行），禁止放行。
      </p>
    );
  }
  return (
    <p data-testid="verdict" data-state="released" role="status" className="verdict verdict-ok">
      全部 {result.lines.length} 行校验通过，可送上传送带。
    </p>
  );
}

function ResultRow({
  line,
  isFirstProblem,
  problemRef,
}: {
  line: LineResult;
  isFirstProblem: boolean;
  problemRef: RefObject<HTMLTableRowElement>;
}) {
  const statusText =
    line.status === 'check-error'
      ? `校验位不符：实收 ${line.received}，应为 ${line.computed}`
      : line.status === 'duplicate'
        ? `与第 ${line.duplicateOf} 行重复`
        : STATUS_LABEL[line.status];
  return (
    <tr
      data-testid={`row-${line.lineNumber}`}
      data-status={line.status}
      ref={isFirstProblem ? problemRef : undefined}
      tabIndex={isFirstProblem ? -1 : undefined}
      className={isFirstProblem ? 'first-problem' : undefined}
    >
      <td>{line.lineNumber}</td>
      <td>
        <code>{line.raw}</code>
      </td>
      <td data-testid="received">{line.received ?? '—'}</td>
      <td data-testid="computed">{line.computed ?? '—'}</td>
      <td>{statusText}</td>
    </tr>
  );
}

export default function App() {
  const [input, setInput] = useState('');
  const [result, setResult] = useState<BatchResult | null>(null);
  const firstProblemRef = useRef<HTMLTableRowElement>(null);

  // 提交后若存在未通过行，把焦点移到首个问题行
  useEffect(() => {
    firstProblemRef.current?.focus();
  }, [result]);

  function handleChange(value: string) {
    setInput(value);
    setResult(null); // 输入改变，立即清除旧结论
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setResult(evaluateBatch(input)); // 只保留当前批次的完整结果
  }

  return (
    <main className="page">
      <h1>SSCC 出库复核</h1>
      <p className="hint">
        逐行粘贴或键入 18 位 SSCC（磨损标签请按实际识读结果补录），提交后整批判定能否放行。
      </p>
      <form onSubmit={handleSubmit}>
        <label htmlFor="sscc-input">SSCC 清单（每行一条，空行自动忽略）</label>
        <textarea
          id="sscc-input"
          data-testid="sscc-input"
          rows={10}
          value={input}
          onChange={(event) => handleChange(event.target.value)}
          placeholder={'例如：\n006141411234567890\n123456789012345675'}
          spellCheck={false}
        />
        <button type="submit" data-testid="submit">
          复核并判定放行
        </button>
      </form>

      {result && (
        <section aria-live="polite">
          <Verdict result={result} />
          {result.lines.length > 0 && (
            <table>
              <thead>
                <tr>
                  <th>行号</th>
                  <th>SSCC</th>
                  <th>实收校验位</th>
                  <th>计算校验位</th>
                  <th>状态</th>
                </tr>
              </thead>
              <tbody>
                {result.lines.map((line) => (
                  <ResultRow
                    key={line.lineNumber}
                    line={line}
                    isFirstProblem={line.lineNumber === result.firstProblemLine}
                    problemRef={firstProblemRef}
                  />
                ))}
              </tbody>
            </table>
          )}
        </section>
      )}
    </main>
  );
}
