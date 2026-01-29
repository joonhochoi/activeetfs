import React, { useState } from 'react';
import DatePicker from 'react-datepicker';
import "react-datepicker/dist/react-datepicker.css";
import { Holding } from '../types';

interface HoldingsTableProps {
    date: string;
    holdings: Holding[];
    onStockClick: (stockName: string) => void;

    // Comparison Props
    comparisonHoldings?: Holding[];
    onCompare?: (date: string) => void;
    availableDates?: Set<string>;
    compareDate?: string;
}

const HoldingsTable: React.FC<HoldingsTableProps> = ({
    date,
    holdings,
    onStockClick,
    comparisonHoldings,
    onCompare,
    availableDates = new Set(),
    compareDate
}) => {
    const [selectedCompareDate, setSelectedCompareDate] = useState<Date | null>(
        compareDate ? new Date(compareDate) : null
    );

    // Sort buy weight descending
    const sortedHoldings = React.useMemo(() => {
        return [...holdings].sort((a, b) => b.weight - a.weight);
    }, [holdings]);

    // Create a map for quick lookup of comparison holdings
    const comparisonMap = React.useMemo(() => {
        if (!comparisonHoldings) return new Map<string, number>();
        const map = new Map<string, number>();
        comparisonHoldings.forEach(h => map.set(h.name, h.weight));
        return map;
    }, [comparisonHoldings]);

    const handleCompareClick = () => {
        if (selectedCompareDate && onCompare) {
            const year = selectedCompareDate.getFullYear();
            const month = String(selectedCompareDate.getMonth() + 1).padStart(2, '0');
            const day = String(selectedCompareDate.getDate()).padStart(2, '0');
            onCompare(`${year}-${month}-${day}`);
        }
    };

    return (
        <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            <style>{`
                 .comp-datepicker-wrapper .react-datepicker-wrapper { width: auto; }
                 .comp-datepicker-wrapper .react-datepicker__input-container input {
                     width: 130px;
                     background: rgba(255,255,255,0.1);
                     border: 1px solid rgba(255,255,255,0.2);
                     color: white;
                     padding: 8px;
                     border-radius: 4px;
                     text-align: center;
                 }
                 .day-has-data {
                    background-color: #3b82f6 !important;
                    color: white !important;
                    font-weight: bold;
                    border-radius: 50%;
                }
            `}</style>

            <div style={{
                padding: '15px',
                borderBottom: 'var(--glass-border)',
                background: 'rgba(0,0,0,0.2)'
            }}>
                <h3 style={{ margin: 0, fontSize: '1rem', color: 'var(--text-color)' }}>
                    {date} 종목 구성
                </h3>
                <div style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.5)', marginTop: '5px' }}>
                    총 {holdings.length}개 종목
                </div>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '10px' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                    <thead>
                        <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.6)' }}>
                            <th style={{ padding: '8px', textAlign: 'left', fontWeight: 'normal' }}>종목명</th>
                            <th style={{ padding: '8px', textAlign: 'right', fontWeight: 'normal' }}>비중(%)</th>
                        </tr>
                    </thead>
                    <tbody>
                        {sortedHoldings.map((h, idx) => {
                            const isNew = comparisonHoldings && !comparisonMap.has(h.name);
                            const oldWeight = comparisonMap.get(h.name);
                            const diff = oldWeight !== undefined ? h.weight - oldWeight : 0;

                            return (
                                <tr
                                    key={`${h.stock_code}-${idx}`}
                                    onClick={() => onStockClick(h.name)}
                                    style={{
                                        cursor: 'pointer',
                                        transition: 'background 0.2s',
                                        borderBottom: '1px solid rgba(255,255,255,0.05)'
                                    }}
                                    onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
                                    onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                                >
                                    <td style={{ padding: '10px 8px' }}>
                                        <div style={{ fontWeight: 500, display: 'flex', alignItems: 'center', gap: '6px' }}>
                                            {h.name}
                                            {isNew && <span style={{ fontSize: '0.6rem', background: '#eab308', color: 'black', padding: '1px 3px', borderRadius: '2px', fontWeight: 'bold' }}>NEW</span>}
                                        </div>
                                        <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.4)' }}>{h.stock_code}</div>
                                    </td>
                                    <td style={{ padding: '10px 8px', textAlign: 'right', fontFamily: 'monospace' }}>
                                        <div>{h.weight.toFixed(2)}%</div>
                                        {comparisonHoldings && !isNew && Math.abs(diff) > 0.001 && (
                                            <div style={{
                                                fontSize: '0.75rem',
                                                color: diff > 0 ? '#f43f5e' : '#3b82f6',
                                                fontWeight: 600
                                            }}>
                                                {diff > 0 ? '+' : ''}{diff.toFixed(2)}%
                                            </div>
                                        )}
                                    </td>
                                </tr>
                            );
                        })}
                        {sortedHoldings.length === 0 && (
                            <tr>
                                <td colSpan={2} style={{ padding: '20px', textAlign: 'center', color: 'rgba(255,255,255,0.3)' }}>
                                    데이터 없음
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

            {/* Comparison Footer */}
            {onCompare && (
                <div style={{
                    padding: '15px',
                    borderTop: 'var(--glass-border)',
                    background: 'rgba(0,0,0,0.2)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '5px'
                }}>
                    <div style={{ fontSize: '0.85rem', color: '#cbd5e1' }}>비교 대상 날짜 선택</div>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        <div className="comp-datepicker-wrapper" style={{ flex: 1 }}>
                            <DatePicker
                                selected={selectedCompareDate}
                                onChange={(date: Date | null) => setSelectedCompareDate(date)}
                                dateFormat="yyyy-MM-dd"
                                placeholderText="날짜 선택"
                                dayClassName={(date: Date) => {
                                    const year = date.getFullYear();
                                    const month = String(date.getMonth() + 1).padStart(2, '0');
                                    const day = String(date.getDate()).padStart(2, '0');
                                    const dateStr = `${year}-${month}-${day}`;
                                    return availableDates.has(dateStr) ? "day-has-data" : "";
                                }}
                            />
                        </div>
                        <button
                            onClick={handleCompareClick}
                            style={{
                                width: 'auto',
                                padding: '8px 12px',
                                background: 'var(--primary-color)',
                                color: 'white',
                                border: 'none',
                                borderRadius: '4px',
                                cursor: 'pointer',
                                fontWeight: 600,
                                whiteSpace: 'nowrap'
                            }}
                        >
                            비교
                        </button>
                    </div>
                    {compareDate && (
                        <div style={{ fontSize: '0.8rem', textAlign: 'center', color: 'rgba(255,255,255,0.6)', marginTop: '2px' }}>
                            현재 {compareDate} 데이터와 비교 중
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default HoldingsTable;
