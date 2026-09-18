import { FormEvent, UIEvent, useEffect, useMemo, useRef, useState } from 'react';
import { BatchResult, LineResult, evaluateBatch } from './sscc';
import { ProblemDirection, listProblemLines, moveProblemCursor } from './problems';

const STATUS_LABEL: Record<LineResult['status'], string> = {
  ok: '通过',
  'format-error': '格式错误：须为恰好 18 个数字',
  'check-error': '校验位不符',
  duplicate: '重复',
};

/**
 * 窗口化明细的固定几何参数（与 styles.css 中的行高、表头高保持一致）：
 * 页面只挂载视口及前后缓冲区内的行，三万条结果时数据行 DOM 节点不超过
 * (480 / 40 + 1) + 2 × 24 = 61 个，远低于 120 的上限。
 */
const ROW_HEIGHT = 40;
const HEADER_HEIGHT = 40;
const VIEWPORT_HEIGHT = 480;
const OVERSCAN_ROWS = 24;

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
  isCurrentProblem,
  registerRow,
}: {
  line: LineResult;
  isCurrentProblem: boolean;
  registerRow: (lineNumber: number, element: HTMLTableRowElement | null) => void;
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
      ref={(element) => registerRow(line.lineNumber, element)}
      tabIndex={isCurrentProblem ? -1 : undefined}
      className={isCurrentProblem ? 'current-problem' : undefined}
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
  const [scrollTop, setScrollTop] = useState(0);
  const [cursor, setCursor] = useState<number | null>(null);
  const [focusLine, setFocusLine] = useState<number | null>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const rowRefs = useRef(new Map<number, HTMLTableRowElement>());

  // 领域结果保存全部非空行；窗口化只决定挂载哪一段
  const lines = useMemo(() => result?.lines ?? [], [result]);
  const lineIndex = useMemo(() => {
    const map = new Map<number, number>();
    lines.forEach((line, index) => map.set(line.lineNumber, index));
    return map;
  }, [lines]);
  // 问题序列：未通过行的原始行号按输入位置升序，空行间隔不影响游标
  const problemLines = useMemo(() => (result ? listProblemLines(result) : []), [result]);

  // 视口 + 缓冲区对应的 lines 下标区间
  const total = lines.length;
  const firstVisible = Math.max(0, Math.floor((scrollTop - HEADER_HEIGHT) / ROW_HEIGHT));
  const lastVisible = Math.min(
    total - 1,
    Math.floor((scrollTop + VIEWPORT_HEIGHT - HEADER_HEIGHT) / ROW_HEIGHT),
  );
  const start = Math.max(0, firstVisible - OVERSCAN_ROWS);
  const end = Math.min(total, Math.max(firstVisible, lastVisible) + 1 + OVERSCAN_ROWS);

  function registerRow(lineNumber: number, element: HTMLTableRowElement | null) {
    if (element) {
      rowRefs.current.set(lineNumber, element);
    } else {
      rowRefs.current.delete(lineNumber);
    }
  }

  /** 让指定原始行号进入视口（已可见则不滚动），并登记为待聚焦行。 */
  function revealLine(lineNumber: number) {
    const index = lineIndex.get(lineNumber);
    if (index === undefined) {
      return;
    }
    const viewport = viewportRef.current;
    if (viewport) {
      const top = HEADER_HEIGHT + index * ROW_HEIGHT;
      const visibleTop = viewport.scrollTop + HEADER_HEIGHT; // 粘性表头遮住的部分
      const visibleBottom = viewport.scrollTop + VIEWPORT_HEIGHT;
      if (top < visibleTop || top + ROW_HEIGHT > visibleBottom) {
        viewport.scrollTop = index * ROW_HEIGHT; // 滚动后该行恰好位于粘性表头下方
      }
    }
    setFocusLine(lineNumber);
  }

  // 待聚焦行挂载后立即聚焦；尚未挂载时等待滚动触发的窗口更新
  useEffect(() => {
    if (focusLine === null) {
      return;
    }
    const element = rowRefs.current.get(focusLine);
    if (element) {
      element.focus();
      setFocusLine(null);
    }
  }, [focusLine, start, end, result]);

  // 新批次：阻断时问题游标从首个失败行开始并聚焦；无问题则窗口回到顶部
  useEffect(() => {
    if (!result) {
      return;
    }
    if (result.firstProblemLine !== null) {
      setCursor(0);
      revealLine(result.firstProblemLine);
    } else {
      setCursor(null);
      setFocusLine(null);
      if (viewportRef.current) {
        viewportRef.current.scrollTop = 0;
      }
      setScrollTop(0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result]);

  function handleChange(value: string) {
    setInput(value);
    // 输入改变：结果、窗口位置与问题游标一并清除
    setResult(null);
    setScrollTop(0);
    setCursor(null);
    setFocusLine(null);
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    // 只保留当前批次的完整结果；窗口位置由提交后的 effect 按首个问题行统一校正，
    // 这里不重置 scrollTop，避免状态与仍挂载的视口元素脱节导致目标行无法挂载。
    setResult(evaluateBatch(input));
  }

  function goToProblem(direction: ProblemDirection) {
    if (cursor === null) {
      return;
    }
    const next = moveProblemCursor(cursor, direction, problemLines.length);
    if (next === null) {
      return; // 首尾边界：不移动、不循环
    }
    setCursor(next);
    revealLine(problemLines[next]);
  }

  function handleScroll(event: UIEvent<HTMLDivElement>) {
    setScrollTop(event.currentTarget.scrollTop);
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
        // 判定结论由 Verdict 的 role="alert"/role="status" 自行播报；滚动窗口会频繁挂载行，
        // 整个 section 不再设 aria-live，避免屏幕阅读器被行挂载事件刷屏。
        <section>
          <Verdict result={result} />
          <div className="problem-nav" data-testid="problem-nav">
            {problemLines.length === 0 ? (
              <span data-testid="problem-position" className="problem-position">
                无待处理问题
              </span>
            ) : (
              <>
                <button
                  type="button"
                  data-testid="prev-problem"
                  disabled={cursor === null || cursor <= 0}
                  onClick={() => goToProblem('prev')}
                >
                  上一个问题
                </button>
                <span data-testid="problem-position" className="problem-position" aria-live="polite">
                  第 {(cursor ?? 0) + 1} / {problemLines.length} 个问题（第{' '}
                  {problemLines[cursor ?? 0]} 行）
                </span>
                <button
                  type="button"
                  data-testid="next-problem"
                  disabled={cursor === null || cursor >= problemLines.length - 1}
                  onClick={() => goToProblem('next')}
                >
                  下一个问题
                </button>
              </>
            )}
          </div>
          {total > 0 && (
            <div
              className="result-viewport"
              data-testid="result-viewport"
              ref={viewportRef}
              onScroll={handleScroll}
              style={{ maxHeight: VIEWPORT_HEIGHT }}
            >
              <table className="result-table">
                <colgroup>
                  <col className="col-line" />
                  <col className="col-sscc" />
                  <col className="col-digit" />
                  <col className="col-digit" />
                  <col className="col-status" />
                </colgroup>
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
                  {start > 0 && (
                    <tr className="spacer" aria-hidden="true">
                      <td colSpan={5} style={{ height: start * ROW_HEIGHT }} />
                    </tr>
                  )}
                  {lines.slice(start, end).map((line) => (
                    <ResultRow
                      key={line.lineNumber}
                      line={line}
                      isCurrentProblem={
                        cursor !== null && problemLines[cursor] === line.lineNumber
                      }
                      registerRow={registerRow}
                    />
                  ))}
                  {end < total && (
                    <tr className="spacer" aria-hidden="true">
                      <td colSpan={5} style={{ height: (total - end) * ROW_HEIGHT }} />
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </main>
  );
}
