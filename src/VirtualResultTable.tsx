import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { LineResult } from './sscc';

/**
 * 窗口化明细：领域结果保留全部非空行，但本表只挂载视口与缓冲区附近的行。
 * 数据行高度固定，未挂载区域用两个空白占位行撑起滚动高度。
 */

/** 单个数据行的固定像素高度（与样式表中的高度保持一致）。 */
export const ROW_HEIGHT = 38;
/** 视口上下额外挂载的缓冲行数。 */
const BUFFER_ROWS = 8;
/** 滚动视口高度。 */
const VIEWPORT_HEIGHT = 460;
/** 任何时刻挂载的数据行 DOM 节点硬上限。 */
export const MAX_MOUNTED_ROWS = 120;

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

interface VirtualResultTableProps {
  /** 完整批次的全部非空行（按原始行号升序），不在此处做裁剪。 */
  lines: LineResult[];
  /** 问题游标当前指向的原始行号；null 表示无游标（如整批放行）。 */
  focusLineNumber: number | null;
}

export default function VirtualResultTable({
  lines,
  focusLineNumber,
}: VirtualResultTableProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLTableSectionElement>(null);
  const rowRefs = useRef(new Map<number, HTMLTableRowElement>());
  /** 等待窗口挂载后需要聚焦的行号；普通滚动不会重提焦点。 */
  const pendingFocusRef = useRef<number | null>(null);

  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(VIEWPORT_HEIGHT);
  const [headerHeight, setHeaderHeight] = useState(0);

  const indexByLineNumber = useMemo(() => {
    const map = new Map<number, number>();
    lines.forEach((line, index) => map.set(line.lineNumber, index));
    return map;
  }, [lines]);

  const focusIndex =
    focusLineNumber == null ? -1 : indexByLineNumber.get(focusLineNumber) ?? -1;

  // 视口与表头实际高度（表头为 sticky，占位仍计入滚动内容）
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) {
      return;
    }
    const measure = () => {
      setViewportHeight(el.clientHeight || VIEWPORT_HEIGHT);
      setHeaderHeight(headerRef.current?.offsetHeight ?? 0);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  /**
   * 计算挂载窗口 [start, end)：只由滚动位置决定，覆盖视口与上下缓冲区，
   * 挂载行数始终不超过 MAX_MOUNTED_ROWS（30000 行时同样成立）。
   * 游标跳转时由下方 effect 直接设置 scrollTop，窗口随之自然移动，
   * 因此手动滚动不会被游标拽回。
   */
  const { start, end } = useMemo(() => {
    const count = lines.length;
    if (count === 0) {
      return { start: 0, end: 0 };
    }
    const visibleCount = Math.max(1, Math.ceil(viewportHeight / ROW_HEIGHT));
    const span = Math.min(count, visibleCount + BUFFER_ROWS * 2, MAX_MOUNTED_ROWS);
    const scrolled = Math.max(0, scrollTop - headerHeight);
    const firstVisible = Math.floor(scrolled / ROW_HEIGHT);
    const windowStart = clamp(firstVisible - BUFFER_ROWS, 0, Math.max(0, count - span));
    return { start: windowStart, end: Math.min(count, windowStart + span) };
  }, [lines.length, scrollTop, headerHeight, viewportHeight]);

  // 游标移动：目标不在视口内时先滚动（窗口随之重算），再由下方 effect 聚焦
  useLayoutEffect(() => {
    if (focusLineNumber == null || focusIndex < 0) {
      return;
    }
    const el = scrollRef.current;
    if (!el) {
      return;
    }
    pendingFocusRef.current = focusLineNumber;
    const rowTop = headerHeight + focusIndex * ROW_HEIGHT;
    const inView =
      rowTop >= scrollTop && rowTop + ROW_HEIGHT <= scrollTop + viewportHeight;
    if (!inView) {
      const maxScroll = Math.max(
        0,
        headerHeight + lines.length * ROW_HEIGHT - viewportHeight,
      );
      const nextTop = clamp(
        rowTop - (viewportHeight - ROW_HEIGHT) / 2,
        0,
        maxScroll,
      );
      el.scrollTop = nextTop;
      setScrollTop(nextTop);
    }
    // 仅在游标目标变化时触发，滚动本身不应抢焦点
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusLineNumber]);

  // 目标行挂载后聚焦（可能因为上面的滚动而推迟到新窗口渲染之后）
  useEffect(() => {
    const target = pendingFocusRef.current;
    if (target == null) {
      return;
    }
    const node = rowRefs.current.get(target);
    if (node) {
      node.focus();
      pendingFocusRef.current = null;
    }
  }, [focusLineNumber, start, end]);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (el) {
      setScrollTop(el.scrollTop);
    }
  }, []);

  const mountedLines = lines.slice(start, end);

  return (
    <div
      className="result-scroll"
      ref={scrollRef}
      onScroll={handleScroll}
      data-testid="result-scroll"
    >
      <table className="result-table">
        <colgroup>
          <col className="col-line" />
          <col className="col-sscc" />
          <col className="col-digit" />
          <col className="col-digit" />
          <col className="col-status" />
        </colgroup>
        <thead ref={headerRef}>
          <tr>
            <th>行号</th>
            <th>SSCC</th>
            <th>实收校验位</th>
            <th>计算校验位</th>
            <th>状态</th>
          </tr>
        </thead>
        <tbody>
          {/* 未挂载的上部区域：单行占位撑起高度，行号间隔不影响游标 */}
          {start > 0 && (
            <tr className="row-spacer" aria-hidden="true" data-testid="top-spacer">
              <td colSpan={5} style={{ height: start * ROW_HEIGHT }} />
            </tr>
          )}
          {mountedLines.map((line) => {
            const isCursorRow = line.lineNumber === focusLineNumber;
            const statusText =
              line.status === 'check-error'
                ? `校验位不符：实收 ${line.received}，应为 ${line.computed}`
                : line.status === 'duplicate'
                  ? `与第 ${line.duplicateOf} 行重复`
                  : STATUS_LABEL[line.status];
            return (
              <tr
                key={line.lineNumber}
                data-testid={`row-${line.lineNumber}`}
                data-status={line.status}
                data-cursor={isCursorRow ? 'true' : undefined}
                ref={(node) => {
                  if (node) {
                    rowRefs.current.set(line.lineNumber, node);
                  } else {
                    rowRefs.current.delete(line.lineNumber);
                  }
                }}
                tabIndex={isCursorRow ? -1 : undefined}
                className={isCursorRow ? 'current-problem' : undefined}
              >
                <td>{line.lineNumber}</td>
                <td>
                  <code>{line.raw}</code>
                </td>
                <td data-testid="received">{line.received ?? '—'}</td>
                <td data-testid="computed">{line.computed ?? '—'}</td>
                <td className="status-cell">{statusText}</td>
              </tr>
            );
          })}
          {end < lines.length && (
            <tr className="row-spacer" aria-hidden="true" data-testid="bottom-spacer">
              <td colSpan={5} style={{ height: (lines.length - end) * ROW_HEIGHT }} />
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

const STATUS_LABEL: Record<LineResult['status'], string> = {
  ok: '通过',
  'format-error': '格式错误：须为恰好 18 个数字',
  'check-error': '校验位不符',
  duplicate: '重复',
};
