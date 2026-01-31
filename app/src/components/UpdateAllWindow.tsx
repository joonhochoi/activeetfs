import React, { useState, useEffect, useRef } from 'react';
import DatePicker from 'react-datepicker';
import "react-datepicker/dist/react-datepicker.css";
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { emit } from '@tauri-apps/api/event';
import activeEtfInfos from '../data/activeetfinfos.json';

interface LogItem {
    time: string;
    message: string;
    status: 'pending' | 'success' | 'error';
}

const UpdateAllWindow: React.FC = () => {
    const [selectedDate, setSelectedDate] = useState<Date>(new Date());
    const [logs, setLogs] = useState<LogItem[]>([]);
    const [isUpdating, setIsUpdating] = useState(false);
    const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);
    const logsEndRef = useRef<HTMLDivElement>(null);

    const [isComplete, setIsComplete] = useState(false);

    // Auto-scroll logs
    useEffect(() => {
        logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [logs]);

    const addLog = (message: string, status: 'pending' | 'success' | 'error' = 'pending') => {
        const time = new Date().toLocaleTimeString();
        setLogs(prev => [...prev, { time, message, status }]);
    };

    const toLocalDateString = (date: Date) => {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    };

    const handleUpdateAll = async () => {
        setIsUpdating(true);
        setLogs([]);

        const allEtfs: { manager: any, etf: any }[] = [];
        activeEtfInfos.managers.forEach(manager => {
            manager.etfs.forEach(etf => {
                allEtfs.push({ manager, etf });
            });
        });

        const total = allEtfs.length;
        const targetDateStr = toLocalDateString(selectedDate);
        setProgress({ current: 0, total });

        addLog(`Starting batch update for date: ${targetDateStr}...`, 'pending');

        for (let i = 0; i < total; i++) {
            const { manager, etf } = allEtfs[i];
            const currentCount = i + 1;
            setProgress({ current: currentCount, total });

            try {
                // Construct args
                // Extract arguments
                const commonArgs = (manager as any).common_args || [];
                const etfArgs = etf.args || [];

                // Helper to find value after a flag
                const findArg = (args: string[], flag: string) => {
                    const idx = args.indexOf(flag);
                    return idx !== -1 && idx + 1 < args.length ? args[idx + 1] : "";
                };

                const provider = findArg(commonArgs, "--type") || manager.id;
                const id = findArg(etfArgs, "--id");
                const code = findArg(etfArgs, "--code") || etf.code;

                await invoke<string>('get_etf_holdings', {
                    provider,
                    id,
                    code,
                    date: targetDateStr
                });

                addLog(`[${etf.name}] 데이터 가져오기 ... [성공]`, 'success');
            } catch (e) {
                addLog(`[${etf.name}] 데이터 가져오기 ... [실패: ${e}]`, 'error');
                console.error(`Update failed for ${etf.name}:`, e);
            }

            // Small delay to prevent UI freezing and ensure sequential execution is stable
            await new Promise(r => setTimeout(r, 200));
        }

        setIsUpdating(false);
        setProgress(null);
        setIsComplete(true);
        // Fire and forget refresh
        emit('refresh-data').catch(e => console.error("Emit error", e));
    };

    const handleClose = async () => {
        await getCurrentWindow().close();
    };

    return (
        <div style={{
            padding: '20px',
            height: '100vh',
            display: 'flex',
            flexDirection: 'column',
            background: '#0f172a', /* Keep dark theme */
            color: '#f8fafc',
            position: 'relative'
        }}>
            <h2 style={{ borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '10px' }}>
                Update All (1day)
            </h2>

            <div style={{ display: 'flex', gap: '20px', marginBottom: '20px', alignItems: 'flex-start' }}>
                <div>
                    <label style={{ display: 'block', marginBottom: '8px', color: '#94a3b8' }}>Select Date:</label>
                    <DatePicker
                        selected={selectedDate}
                        onChange={(date: Date | null) => { if (date) setSelectedDate(date); }}
                        inline
                    />
                    <style>{`
                        .react-datepicker {
                            font-family: 'Inter', system-ui, sans-serif;
                            background-color: #1e293b;
                            border: 1px solid rgba(255, 255, 255, 0.1);
                            color: #f8fafc;
                        }
                        .react-datepicker__header {
                            background-color: #0f172a;
                            border-bottom: 1px solid rgba(255, 255, 255, 0.1);
                        }
                        .react-datepicker__current-month, .react-datepicker__day-name {
                            color: #f8fafc;
                        }
                        .react-datepicker__day {
                            color: #cbd5e1;
                        }
                        .react-datepicker__day:hover {
                            background-color: rgba(59, 130, 246, 0.5);
                        }
                        .react-datepicker__day--selected {
                            background-color: #3b82f6;
                            color: white;
                        }
                        .react-datepicker__day--keyboard-selected {
                            background-color: rgba(59, 130, 246, 0.5);
                        }

                        /* Hide weekends (Sunday is 1st, Saturday is 7th child in default locale rows) */
                        .react-datepicker__day-name:first-child,
                        .react-datepicker__day-name:last-child,
                        .react-datepicker__week .react-datepicker__day:first-child,
                        .react-datepicker__week .react-datepicker__day:last-child {
                            display: none;
                        }
                        
                        /* Allow container to shrink since we removed columns */
                        .react-datepicker {
                            width: auto !important; 
                        }
                        .react-datepicker__month {
                            margin: 0.4rem;
                        }
                    `}</style>
                </div>

                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '10px', height: '100%' }}>
                    <div style={{
                        background: 'rgba(30, 41, 59, 0.5)',
                        border: '1px solid rgba(255,255,255,0.1)',
                        borderRadius: '8px',
                        padding: '15px',
                        height: '420px', // Fixed height to enable scrolling
                        overflowY: 'auto', // Force scroll
                        overflowX: 'hidden',
                        display: 'flex',
                        flexDirection: 'column'
                    }}>
                        <div style={{ marginBottom: '10px', color: '#94a3b8', fontSize: '0.9rem' }}>
                            Progress Log
                            {progress && <span style={{ float: 'right', color: '#60a5fa' }}>
                                Processing: {progress.current} / {progress.total}
                            </span>}
                        </div>
                        <div style={{
                            flex: 1,
                            overflowY: 'auto',
                            fontFamily: 'monospace',
                            fontSize: '0.85rem',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '4px'
                        }}>
                            {logs.map((log, idx) => (
                                <div key={idx} style={{
                                    color: log.status === 'success' ? '#4ade80' :
                                        log.status === 'error' ? '#f87171' : '#e2e8f0'
                                }}>
                                    <span style={{ color: '#64748b', marginRight: '8px' }}>[{log.time}]</span>
                                    {log.message}
                                </div>
                            ))}
                            <div ref={logsEndRef} />
                        </div>
                    </div>

                    <button
                        onClick={handleUpdateAll}
                        disabled={isUpdating}
                        style={{
                            padding: '12px',
                            background: isUpdating ? '#475569' : '#3b82f6',
                            color: 'white',
                            border: 'none',
                            borderRadius: '6px',
                            cursor: isUpdating ? 'not-allowed' : 'pointer',
                            fontSize: '1rem',
                            fontWeight: 'bold',
                            marginTop: 'auto'
                        }}
                    >
                        {isUpdating ? `Updating... (${progress?.current}/${progress?.total})` : 'Update All'}
                    </button>
                    <p style={{ fontSize: '0.8rem', color: '#94a3b8', marginTop: '5px' }}>
                        * 여러 ETF를 순차적으로 업데이트하므로 시간이 소요될 수 있습니다.
                    </p>
                </div>
            </div>

            {/* Success Modal Overlay */}
            {isComplete && (
                <div style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    background: 'rgba(0, 0, 0, 0.7)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 9999,
                    backdropFilter: 'blur(3px)'
                }}>
                    <div style={{
                        background: '#1e293b',
                        border: '1px solid rgba(255, 255, 255, 0.2)',
                        borderRadius: '12px',
                        padding: '30px',
                        textAlign: 'center',
                        boxShadow: '0 10px 25px rgba(0,0,0,0.5)',
                        maxWidth: '400px',
                        width: '90%'
                    }}>
                        <div style={{ fontSize: '3rem', marginBottom: '10px' }}>✅</div>
                        <h3 style={{ margin: '0 0 10px 0', fontSize: '1.5rem', color: '#f8fafc' }}>
                            완료!
                        </h3>
                        <p style={{ color: '#cbd5e1', marginBottom: '25px' }}>
                            모든 ETF의 업데이트가 성공적으로 완료되었습니다.
                        </p>
                        <button
                            onClick={handleClose}
                            style={{
                                background: '#3b82f6',
                                color: 'white',
                                border: 'none',
                                padding: '12px 30px',
                                borderRadius: '6px',
                                fontSize: '1rem',
                                fontWeight: 'bold',
                                cursor: 'pointer',
                                transition: 'background 0.2s',
                                width: '100%'
                            }}
                            onMouseOver={(e) => e.currentTarget.style.background = '#2563eb'}
                            onMouseOut={(e) => e.currentTarget.style.background = '#3b82f6'}
                        >
                            닫기
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default UpdateAllWindow;
