import React, { useEffect, useMemo, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import activeEtfInfos from '../data/activeetfinfos.json';
import { Holding } from '../types';

interface UserEtf {
    code: string;
    name: string;
    managerId: string;
    etfId: string;
}

interface CompareViewProps {
    codes: string[];
    highlightStocks?: string[]; // 검색에서 찾은 종목코드(강조 표시)
    onClose: () => void;
}

interface EtfColumn {
    code: string;
    name: string;
    date: string;
    holdings: Holding[]; // 비중 내림차순
    top5: number;
    top10: number;
}

const HL_BG = 'rgba(251, 191, 36, 0.18)';
const HL_TEXT = '#fbbf24';

const CompareView: React.FC<CompareViewProps> = ({ codes, highlightStocks, onClose }) => {
    const [columns, setColumns] = useState<EtfColumn[] | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const highlightSet = useMemo(() => new Set(highlightStocks ?? []), [highlightStocks]);

    // code → 표시 이름 매핑(카탈로그 + 사용자 추가)
    const [userEtfs, setUserEtfs] = useState<UserEtf[]>([]);
    useEffect(() => {
        invoke<UserEtf[]>('get_user_added_etfs').then(setUserEtfs).catch(() => {});
    }, []);

    const nameMap = useMemo(() => {
        const map = new Map<string, string>();
        activeEtfInfos.managers.forEach((m: any) =>
            (m.etfs as any[]).forEach(e => map.set(e.code, e.name))
        );
        userEtfs.forEach(e => { if (!map.has(e.code)) map.set(e.code, e.name); });
        return map;
    }, [userEtfs]);

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        setError(null);
        (async () => {
            try {
                const cols = await Promise.all(codes.map(async (code) => {
                    const holdings = await invoke<Holding[]>('get_latest_holdings', { etfCode: code });
                    const sorted = [...holdings].sort((a, b) => b.weight - a.weight);
                    const sum = (n: number) => sorted.slice(0, n).reduce((acc, h) => acc + h.weight, 0);
                    return {
                        code,
                        name: nameMap.get(code) ?? code,
                        date: sorted[0]?.date ?? '',
                        holdings: sorted,
                        top5: sum(5),
                        top10: sum(10),
                    } as EtfColumn;
                }));
                if (!cancelled) setColumns(cols);
            } catch (e: any) {
                if (!cancelled) setError(typeof e === 'string' ? e : (e?.message ?? '비교 데이터를 불러오지 못했습니다.'));
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, [codes, nameMap]);

    const maxRows = useMemo(
        () => (columns ? columns.reduce((m, c) => Math.max(m, c.holdings.length), 0) : 0),
        [columns]
    );

    const labelCellStyle: React.CSSProperties = {
        position: 'sticky',
        left: 0,
        background: 'var(--card-bg)',
        backdropFilter: 'blur(8px)',
        color: 'var(--secondary-color)',
        fontSize: '0.8rem',
        fontWeight: 600,
        padding: '10px 12px',
        textAlign: 'left',
        whiteSpace: 'nowrap',
        zIndex: 1,
        borderBottom: '1px solid var(--border-color)',
    };

    const valueCellStyle: React.CSSProperties = {
        padding: '10px 12px',
        textAlign: 'center',
        borderBottom: '1px solid var(--border-color)',
        fontSize: '0.9rem',
        color: 'var(--text-color)',
        minWidth: '120px',
    };

    const renderSummaryRow = (label: string, render: (c: EtfColumn) => React.ReactNode) => (
        <tr>
            <td style={labelCellStyle}>{label}</td>
            {columns!.map(c => (
                <td key={c.code} style={valueCellStyle}>{render(c)}</td>
            ))}
        </tr>
    );

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, padding: '12px 20px 20px 20px', boxSizing: 'border-box' }}>
            {/* 헤더 */}
            <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '4px 4px 12px',
                flexShrink: 0,
            }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px' }}>
                    <h2 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 700, color: 'var(--text-color)' }}>ETF 비교</h2>
                    <span style={{ fontSize: '0.85rem', color: 'var(--secondary-color)' }}>
                        구성종목 {codes.length}개 ETF
                    </span>
                </div>
                <button
                    onClick={onClose}
                    style={{
                        background: 'rgba(255,255,255,0.06)',
                        border: '1px solid var(--border-color)',
                        borderRadius: '8px',
                        color: 'var(--text-color)',
                        padding: '6px 12px',
                        cursor: 'pointer',
                        fontSize: '0.82rem',
                    }}
                >✕ 차트로 돌아가기</button>
            </div>

            {loading && (
                <div style={{ padding: '20px', color: 'var(--secondary-color)' }}>불러오는 중…</div>
            )}
            {error && (
                <div style={{ padding: '20px', color: '#f87171' }}>{error}</div>
            )}

            {!loading && !error && columns && (
                <div style={{ flex: 1, overflow: 'auto', minHeight: 0 }}>
                    <table style={{ borderCollapse: 'collapse', width: '100%' }}>
                        <thead>
                            <tr>
                                <th style={{ ...labelCellStyle, position: 'sticky', top: 0, left: 0, zIndex: 3, color: 'var(--text-color)' }}>종목</th>
                                {columns.map(c => (
                                    <th key={c.code} style={{
                                        position: 'sticky',
                                        top: 0,
                                        zIndex: 2,
                                        background: 'var(--card-bg)',
                                        backdropFilter: 'blur(8px)',
                                        padding: '10px 12px',
                                        textAlign: 'center',
                                        fontSize: '0.85rem',
                                        fontWeight: 700,
                                        color: 'var(--text-color)',
                                        borderBottom: '2px solid var(--primary-color)',
                                        minWidth: '120px',
                                    }}>{c.name}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {renderSummaryRow('기준일', c => c.date || '-')}
                            {renderSummaryRow('구성종목수', c => `${c.holdings.length}`)}
                            {renderSummaryRow('상위5 비중', c => (
                                <span style={{ fontWeight: 700, color: 'var(--primary-color)' }}>{c.top5.toFixed(2)}%</span>
                            ))}
                            {renderSummaryRow('상위10 비중', c => (
                                <span style={{ fontWeight: 700, color: 'var(--primary-color)' }}>{c.top10.toFixed(2)}%</span>
                            ))}

                            {/* 종목비중 구분 행 */}
                            <tr>
                                <td colSpan={columns.length + 1} style={{
                                    padding: '10px 12px',
                                    fontSize: '0.85rem',
                                    fontWeight: 700,
                                    color: 'var(--text-color)',
                                    background: 'rgba(255,255,255,0.03)',
                                    borderBottom: '1px solid var(--border-color)',
                                    position: 'sticky',
                                    left: 0,
                                }}>종목비중</td>
                            </tr>

                            {Array.from({ length: maxRows }).map((_, i) => (
                                <tr key={i}>
                                    <td style={labelCellStyle}>구성종목{i + 1}</td>
                                    {columns.map(c => {
                                        const h = c.holdings[i];
                                        if (!h) return <td key={c.code} style={valueCellStyle} />;
                                        const hot = highlightSet.has(h.stock_code);
                                        return (
                                            <td
                                                key={c.code}
                                                title={h.name}
                                                style={{
                                                    ...valueCellStyle,
                                                    background: hot ? HL_BG : undefined,
                                                }}
                                            >
                                                <div style={{
                                                    fontSize: '0.85rem',
                                                    fontWeight: hot ? 700 : 500,
                                                    color: hot ? HL_TEXT : 'var(--text-color)',
                                                    overflow: 'hidden',
                                                    textOverflow: 'ellipsis',
                                                    whiteSpace: 'nowrap',
                                                    maxWidth: '160px',
                                                    margin: '0 auto',
                                                }}>{h.name}</div>
                                                <div style={{
                                                    fontSize: '0.78rem',
                                                    color: hot ? HL_TEXT : 'var(--secondary-color)',
                                                    fontWeight: hot ? 600 : 400,
                                                }}>{h.weight.toFixed(2)}%</div>
                                            </td>
                                        );
                                    })}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
};

export default CompareView;
