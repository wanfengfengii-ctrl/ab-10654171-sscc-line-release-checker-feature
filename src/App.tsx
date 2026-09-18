import { FormEvent, useState } from 'react';
import { BatchResult, evaluateBatch } from './sscc';
import { cursorAt, moveCursor } from './problemCursor';
import VirtualResultTable from './VirtualResultTable';

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

export default function App() {
  const [input, setInput] = useState('');
  const [result, setResult] = useState<BatchResult | null>(null);
  /** 当前问题在 problemLineNumbers 中的序号（0 起）；无结果或无失败行时为 null。 */
  const [cursorIndex, setCursorIndex] = useState<number | null>(null);
  /** 每次提交递增，作为明细表的 key：新批次从顶部窗口开始，不继承旧滚动位置。 */
  const [batchNonce, setBatchNonce] = useState(0);

  const cursor = result && cursorIndex !== null ? cursorAt(result.problemLineNumbers, cursorIndex) : null;
  const focusLineNumber = cursor ? cursor.lineNumber : null;

  function handleChange(value: string) {
    setInput(value);
    // 输入发生修改：结果、窗口位置（明细表随结果卸载）与问题游标一并清除
    setResult(null);
    setCursorIndex(null);
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const next = evaluateBatch(input); // 领域结果仍保存全部非空行及原始行号
    setResult(next);
    setBatchNonce((n) => n + 1);
    // 阻断后问题游标从首个失败行开始；没有失败行则不设游标
    setCursorIndex(next.problemLineNumbers.length > 0 ? 0 : null);
  }

  function step(delta: number) {
    if (!result || cursorIndex === null) {
      return;
    }
    const next = moveCursor(result.problemLineNumbers, cursorIndex, delta);
    if (next) {
      setCursorIndex(next.index);
    }
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
            <>
              <div className="problem-nav" data-testid="problem-nav">
                <button
                  type="button"
                  data-testid="prev-problem"
                  onClick={() => step(-1)}
                  disabled={cursor === null || cursor.isFirst}
                >
                  上一个问题
                </button>
                <button
                  type="button"
                  data-testid="next-problem"
                  onClick={() => step(1)}
                  disabled={cursor === null || cursor.isLast}
                >
                  下一个问题
                </button>
                <span className="problem-position" data-testid="problem-position">
                  {cursor
                    ? `问题 ${cursor.index + 1} / ${cursor.total}（第 ${cursor.lineNumber} 行）`
                    : '无待处理问题'}
                </span>
              </div>
              <VirtualResultTable
                key={batchNonce}
                lines={result.lines}
                focusLineNumber={focusLineNumber}
              />
            </>
          )}
        </section>
      )}
    </main>
  );
}
