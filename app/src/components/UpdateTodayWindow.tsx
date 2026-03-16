import React, { useState, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { emit } from '@tauri-apps/api/event';
import activeEtfInfos from '../data/activeetfinfos.json';

type EtfStatus = 'waiting' | 'has_data' | 'updating' | 'pass' | 'success' | 'error';

interface StockItem {
    name: string;
    weight: number;
}

interface EtfRow {
    etfCode: string;
    etfName: string;
    managerName: string;
    manager: any;
    etf: any;
    status: EtfStatus;
    compareDate: string | null;
    inStocks: StockItem[];
    outStocks: StockItem[];
    errorMsg?: string;
}

interface HoldingItem {
    date: string;
    etf_code: string;
    stock_code: string;
    name: string;
    weight: number;
    quantity: number;
    price: number;
}

const toLocalDateString = (date: Date): string => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

const STATUS_CONFIG: Record<EtfStatus, { label: string; color: string; bg: string }> = {
    waiting: { label: '대기', color: '#94a3b8', bg: 'rgba(148,163,184,0.12)' },
    has_data: { label: '데이터있음', color: '#34d399', bg: 'rgba(52,211,153,0.12)' },
    updating: { label: '업데이트 중...', color: '#60a5fa', bg: 'rgba(96,165,250,0.15)' },
    pass: { label: 'PASS', color: '#fbbf24', bg: 'rgba(251,191,36,0.13)' },
    success: { label: '완료', color: '#4ade80', bg: 'rgba(74,222,128,0.13)' },
    error: { label: '오류', color: '#f87171', bg: 'rgba(248,113,113,0.13)' },
};

const StatusBadge: React.FC<{ status: EtfStatus }> = ({ status }) => {
    const { label, color, bg } = STATUS_CONFIG[status];
    return (
        <span style={{
            display: 'inline-block',
            padding: '2px 8px',
            borderRadius: '4px',
            fontSize: '0.75rem',
            fontWeight: 'bold',
            color,
            background: bg,
            whiteSpace: 'nowrap',
        }}>
            {label}
        </span>
    );
};

const InOutCell: React.FC<{ row: EtfRow }> = ({ row }) => {
    if (row.status === 'waiting' || row.status === 'has_data' || row.status === 'updating') {
        return <span style={{ color: '#334155' }}>-</span>;
    }
    if (row.status === 'pass') {
        return <span style={{ color: '#92400e', fontSize: '0.8rem' }}>오늘 데이터 이미 존재</span>;
    }
    if (row.status === 'error') {
        return (
            <span style={{ color: '#f87171', fontSize: '0.75rem' }} title={row.errorMsg}>
                {row.errorMsg ? (row.errorMsg.length > 60 ? row.errorMsg.slice(0, 60) + '...' : row.errorMsg) : '알 수 없는 오류'}
            </span>
        );
    }
    // success
    if (!row.compareDate) {
        return <span style={{ color: '#475569', fontSize: '0.8rem' }}>비교 데이터 없음</span>;
    }
    if (row.inStocks.length === 0 && row.outStocks.length === 0) {
        return <span style={{ color: '#475569', fontSize: '0.8rem' }}>변동 없음</span>;
    }
    return (
        <div style={{ fontSize: '0.75rem', lineHeight: '1.7' }}>
            {row.inStocks.length > 0 && (
                <div>
                    <span style={{ color: '#4ade80', fontWeight: 'bold', marginRight: '4px' }}>IN</span>
                    <span style={{ color: '#86efac' }}>
                        {row.inStocks.map(s => `${s.name}(${s.weight.toFixed(2)}%)`).join(', ')}
                    </span>
                </div>
            )}
            {row.outStocks.length > 0 && (
                <div>
                    <span style={{ color: '#f87171', fontWeight: 'bold', marginRight: '4px' }}>OUT</span>
                    <span style={{ color: '#fca5a5' }}>
                        {row.outStocks.map(s => `${s.name}(${s.weight.toFixed(2)}%)`).join(', ')}
                    </span>
                </div>
            )}
        </div>
    );
};

const UpdateTodayWindow: React.FC = () => {
    const today = toLocalDateString(new Date());
    const [showTimeWarning, setShowTimeWarning] = useState(false);
    const [overwrite, setOverwrite] = useState(false);
    const [isUpdating, setIsUpdating] = useState(false);
    const [isComplete, setIsComplete] = useState(false);
    const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);
    const [rows, setRows] = useState<EtfRow[]>([]);
    const rowsRef = useRef<EtfRow[]>([]);

    useEffect(() => { rowsRef.current = rows; }, [rows]);

    useEffect(() => {
        if (new Date().getHours() < 8) {
            setShowTimeWarning(true);
        }

        const allRows: EtfRow[] = [];
        activeEtfInfos.managers.forEach((manager: any) => {
            (manager.etfs as any[]).forEach((etf: any) => {
                allRows.push({
                    etfCode: etf.code,
                    etfName: etf.name,
                    managerName: manager.name,
                    manager,
                    etf,
                    status: 'waiting',
                    compareDate: null,
                    inStocks: [],
                    outStocks: [],
                });
            });
        });
        setRows(allRows);

        // 비교 날짜 + 오늘 데이터 존재 여부 병렬 로딩
        allRows.forEach((row, idx) => {
            Promise.all([
                invoke<string | null>('get_latest_date_before', { etfCode: row.etfCode, beforeDate: today }),
                invoke<boolean>('check_holdings_exist', { etfCode: row.etfCode, date: today }),
            ]).then(([date, exists]) => {
                setRows(prev => {
                    const next = [...prev];
                    if (next[idx]) next[idx] = {
                        ...next[idx],
                        compareDate: date,
                        status: exists ? 'has_data' : 'waiting',
                    };
                    return next;
                });
            }).catch(() => { });
        });
    }, []);

    const handleUpdateToday = async () => {
        const shouldOverwrite = overwrite;
        setIsUpdating(true);
        setIsComplete(false);

        const currentRows = rowsRef.current;
        const total = currentRows.length;

        // 상태 초기화 (compareDate는 보존)
        setRows(prev => prev.map(r => ({
            ...r,
            status: 'waiting' as EtfStatus,
            inStocks: [],
            outStocks: [],
            errorMsg: undefined,
        })));
        await new Promise(r => setTimeout(r, 200));

        for (let i = 0; i < total; i++) {
            const row = currentRows[i];
            setProgress({ current: i + 1, total });

            setRows(prev => {
                const next = [...prev];
                next[i] = { ...next[i], status: 'updating' };
                return next;
            });

            const provider = row.manager.type || row.manager.id;
            const id = row.etf.id;
            const code = row.etfCode;

            try {
                const exists = await invoke<boolean>('check_holdings_exist', {
                    etfCode: code,
                    date: today,
                });

                if (exists && !shouldOverwrite) {
                    setRows(prev => {
                        const next = [...prev];
                        next[i] = { ...next[i], status: 'pass' };
                        return next;
                    });
                    await new Promise(r => setTimeout(r, 50));
                    continue;
                }

                if (i === 0) await new Promise(r => setTimeout(r, 500));

                await invoke<string>('get_etf_holdings', {
                    provider,
                    id,
                    code,
                    date: today,
                });

                // 편입/편출 비교
                const compareDate = currentRows[i].compareDate;
                let inStocks: StockItem[] = [];
                let outStocks: StockItem[] = [];

                if (compareDate) {
                    const [todayHoldings, prevHoldings] = await Promise.all([
                        invoke<HoldingItem[]>('get_holdings_by_date', { etfCode: code, date: today }),
                        invoke<HoldingItem[]>('get_holdings_by_date', { etfCode: code, date: compareDate }),
                    ]);

                    const prevCodes = new Set(prevHoldings.map(h => h.stock_code));
                    const todayCodes = new Set(todayHoldings.map(h => h.stock_code));

                    inStocks = todayHoldings
                        .filter(h => !prevCodes.has(h.stock_code))
                        .map(h => ({ name: h.name, weight: h.weight }));
                    outStocks = prevHoldings
                        .filter(h => !todayCodes.has(h.stock_code))
                        .map(h => ({ name: h.name, weight: h.weight }));
                }

                setRows(prev => {
                    const next = [...prev];
                    next[i] = { ...next[i], status: 'success', inStocks, outStocks };
                    return next;
                });
            } catch (e) {
                setRows(prev => {
                    const next = [...prev];
                    next[i] = { ...next[i], status: 'error', errorMsg: String(e) };
                    return next;
                });
            }

            await new Promise(r => setTimeout(r, 400));
        }

        setIsUpdating(false);
        setProgress(null);
        setIsComplete(true);
        emit('refresh-data').catch(e => console.error('Emit error', e));
    };

    const handleClose = async () => {
        await getCurrentWindow().close();
    };

    const doneRows = rows.filter(r => r.status !== 'waiting' && r.status !== 'updating');
    const successCount = doneRows.filter(r => r.status === 'success').length;
    const passCount = doneRows.filter(r => r.status === 'pass').length;
    const errorCount = doneRows.filter(r => r.status === 'error').length;

    return (
        <div style={{
            padding: '20px',
            height: '100vh',
            display: 'flex',
            flexDirection: 'column',
            background: '#0f172a',
            color: '#f8fafc',
            position: 'relative',
            overflow: 'hidden',
            boxSizing: 'border-box',
        }}>
            {/* 헤더 */}
            <h2 style={{ borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '10px', margin: '0 0 14px 0', fontSize: '1.2rem' }}>
                Update All Today
                <span style={{ fontSize: '0.95rem', color: '#94a3b8', marginLeft: '10px', fontWeight: 'normal' }}>
                    {today} (평일 오전 8시 이후 사용을 추천)
                </span>
            </h2>

            {/* 툴바 */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '14px', flexShrink: 0 }}>
                <button
                    onClick={handleUpdateToday}
                    disabled={isUpdating}
                    style={{
                        padding: '8px 22px',
                        background: isUpdating ? '#334155' : '#3b82f6',
                        color: 'white',
                        border: 'none',
                        borderRadius: '6px',
                        cursor: isUpdating ? 'not-allowed' : 'pointer',
                        fontSize: '0.9rem',
                        fontWeight: 'bold',
                        opacity: isUpdating ? 0.7 : 1,
                        transition: 'all 0.2s',
                        minWidth: '170px',
                        whiteSpace: 'nowrap',
                    }}
                >
                    {isUpdating
                        ? `업데이트 중... (${progress?.current ?? 0}/${progress?.total ?? 0})`
                        : '▶ 업데이트 시작'}
                </button>

                <label style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '7px',
                    cursor: isUpdating ? 'not-allowed' : 'pointer',
                    color: '#cbd5e1',
                    fontSize: '0.875rem',
                    userSelect: 'none',
                }}>
                    <input
                        type="checkbox"
                        checked={overwrite}
                        onChange={e => setOverwrite(e.target.checked)}
                        disabled={isUpdating}
                        style={{ width: '15px', height: '15px', cursor: isUpdating ? 'not-allowed' : 'pointer', accentColor: '#3b82f6' }}
                    />
                    기존 데이터 덮어쓰기
                </label>

                <span style={{ marginLeft: 'auto', color: '#64748b', fontSize: '0.8rem' }}>
                    {isComplete
                        ? `완료 — 성공 ${successCount}건 | PASS ${passCount}건 | 오류 ${errorCount}건`
                        : `총 ${rows.length}개 ETF`}
                </span>
            </div>

            {/* 테이블 */}
            <div style={{
                flex: 1,
                overflow: 'auto',
                borderRadius: '8px',
                border: '1px solid rgba(255,255,255,0.08)',
            }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.855rem' }}>
                    <thead style={{ position: 'sticky', top: 0, background: '#1e293b', zIndex: 1 }}>
                        <tr>
                            <th style={{ ...thStyle, width: '190px' }}>ETF 이름</th>
                            <th style={{ ...thStyle, width: '95px', textAlign: 'center' }}>상태</th>
                            <th style={{ ...thStyle, width: '105px', textAlign: 'center' }}>비교 날짜</th>
                            <th style={{ ...thStyle, maxWidth: '560px' }}>편입 / 편출 종목</th>
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map((row, idx) => (
                            <tr
                                key={`${row.etfCode}-${idx}`}
                                style={{
                                    borderBottom: '1px solid rgba(255,255,255,0.04)',
                                    background: row.status === 'updating'
                                        ? 'rgba(59,130,246,0.07)'
                                        : idx % 2 === 0 ? 'rgba(15,23,42,0.5)' : 'rgba(30,41,59,0.3)',
                                    transition: 'background 0.2s',
                                }}
                            >
                                <td style={tdStyle}>
                                    <div style={{ fontWeight: 500, color: '#e2e8f0' }}>{row.etfName}</div>
                                </td>
                                <td style={{ ...tdStyle, textAlign: 'center' }}>
                                    <StatusBadge status={row.status} />
                                </td>
                                <td style={{ ...tdStyle, textAlign: 'center', color: '#64748b', fontSize: '0.78rem' }}>
                                    {row.compareDate ?? <span style={{ color: '#334155' }}>-</span>}
                                </td>
                                <td style={{ ...tdStyle, maxWidth: '560px', wordBreak: 'break-word' }}>
                                    <InOutCell row={row} />
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* 시간 안내 모달 (오전 8시 이전) */}
            {showTimeWarning && (
                <div style={overlayStyle}>
                    <div style={modalStyle}>
                        <div style={{ fontSize: '2.8rem', marginBottom: '10px' }}>⏰</div>
                        <h3 style={{ margin: '0 0 12px 0', fontSize: '1.15rem', color: '#f8fafc' }}>
                            업데이트 시간 안내
                        </h3>
                        <p style={{ color: '#cbd5e1', marginBottom: '22px', lineHeight: '1.7', fontSize: '0.9rem' }}>
                            ETF 데이터는 운용사별 공시 일정에 따라 제공됩니다.<br />
                            <strong style={{ color: '#fbbf24' }}>평일 오전 8시 이후</strong>에 실행해주세요.
                        </p>
                        <button
                            onClick={handleClose}
                            style={primaryBtnStyle}
                            onMouseOver={e => e.currentTarget.style.background = '#2563eb'}
                            onMouseOut={e => e.currentTarget.style.background = '#3b82f6'}
                        >
                            확인
                        </button>
                    </div>
                </div>
            )}

        </div>
    );
};

const thStyle: React.CSSProperties = {
    padding: '9px 14px',
    textAlign: 'left',
    color: '#64748b',
    fontWeight: 600,
    fontSize: '0.75rem',
    borderBottom: '1px solid rgba(255,255,255,0.08)',
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
};

const tdStyle: React.CSSProperties = {
    padding: '9px 14px',
    verticalAlign: 'middle',
};

const overlayStyle: React.CSSProperties = {
    position: 'fixed',
    top: 0, left: 0, right: 0, bottom: 0,
    background: 'rgba(0,0,0,0.72)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 9999,
    backdropFilter: 'blur(3px)',
};

const modalStyle: React.CSSProperties = {
    background: '#1e293b',
    border: '1px solid rgba(255,255,255,0.15)',
    borderRadius: '12px',
    padding: '30px',
    textAlign: 'center',
    boxShadow: '0 10px 30px rgba(0,0,0,0.6)',
    maxWidth: '370px',
    width: '90%',
};

const primaryBtnStyle: React.CSSProperties = {
    background: '#3b82f6',
    color: 'white',
    border: 'none',
    padding: '11px 28px',
    borderRadius: '6px',
    fontSize: '0.95rem',
    fontWeight: 'bold',
    cursor: 'pointer',
    width: '100%',
    transition: 'background 0.2s',
};

export default UpdateTodayWindow;
