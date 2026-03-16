import React, { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import activeEtfInfos from '../data/activeetfinfos.json';

interface EtfItem {
    code: string;
    name: string;
    isEnabled: boolean;
    dataCount: number;
}

interface ManagerGroup {
    id: string;
    name: string;
    etfs: EtfItem[];
}

interface EtfSetting {
    code: string;
    isEnabled: boolean;
    dataCount: number;
}

const ToggleSwitch: React.FC<{ enabled: boolean; onChange: () => void }> = ({ enabled, onChange }) => (
    <div
        onClick={onChange}
        style={{
            width: '42px',
            height: '22px',
            borderRadius: '11px',
            background: enabled ? '#22c55e' : '#334155',
            position: 'relative',
            cursor: 'pointer',
            transition: 'background 0.2s',
            flexShrink: 0,
            border: '1px solid rgba(255,255,255,0.08)',
        }}
    >
        <div style={{
            position: 'absolute',
            top: '2px',
            left: enabled ? '22px' : '2px',
            width: '16px',
            height: '16px',
            borderRadius: '50%',
            background: 'white',
            transition: 'left 0.2s',
            boxShadow: '0 1px 3px rgba(0,0,0,0.4)',
        }} />
    </div>
);

const SelectEtfsWindow: React.FC = () => {
    const [groups, setGroups] = useState<ManagerGroup[]>([]);
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);

    useEffect(() => {
        invoke<EtfSetting[]>('get_etf_enabled_list')
            .then(dbList => {
                const dbMap = new Map(dbList.map(e => [e.code, e]));
                const built: ManagerGroup[] = (activeEtfInfos.managers as any[]).map(manager => ({
                    id: manager.id,
                    name: manager.name,
                    etfs: (manager.etfs as any[]).map(etf => {
                        const db = dbMap.get(etf.code);
                        return {
                            code: etf.code,
                            name: etf.name,
                            isEnabled: db ? db.isEnabled : true,
                            dataCount: db ? db.dataCount : 0,
                        };
                    }),
                }));
                setGroups(built);
            })
            .catch(console.error);
    }, []);

    const toggleEtf = (managerId: string, code: string) => {
        setGroups(prev => prev.map(g =>
            g.id !== managerId ? g : {
                ...g,
                etfs: g.etfs.map(e => e.code === code ? { ...e, isEnabled: !e.isEnabled } : e),
            }
        ));
        setSaved(false);
    };

    const toggleAll = (managerId: string, enable: boolean) => {
        setGroups(prev => prev.map(g =>
            g.id !== managerId ? g : {
                ...g,
                etfs: g.etfs.map(e => ({ ...e, isEnabled: enable })),
            }
        ));
        setSaved(false);
    };

    const handleSave = async () => {
        setSaving(true);
        const settings = groups.flatMap(g =>
            g.etfs.map(e => ({ code: e.code, isEnabled: e.isEnabled }))
        );
        try {
            await invoke('save_etf_enabled_list', { settings });
            setSaved(true);
            new BroadcastChannel('etf-settings').postMessage('saved');
        } catch (e) {
            console.error('저장 실패:', e);
        } finally {
            setSaving(false);
        }
    };

    const totalEnabled = groups.reduce((sum, g) => sum + g.etfs.filter(e => e.isEnabled).length, 0);
    const totalAll = groups.reduce((sum, g) => sum + g.etfs.length, 0);

    return (
        <div style={{
            padding: '20px',
            height: '100vh',
            display: 'flex',
            flexDirection: 'column',
            background: '#0f172a',
            color: '#f8fafc',
            overflow: 'hidden',
            boxSizing: 'border-box',
        }}>
            {/* 헤더 */}
            <h2 style={{ margin: '0 0 14px 0', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '10px', fontSize: '1.2rem' }}>
                Select ETFs
                <span style={{ fontSize: '0.85rem', color: '#64748b', marginLeft: '10px', fontWeight: 'normal' }}>
                    {totalEnabled} / {totalAll} 선택됨
                </span>
            </h2>

            {/* 저장 버튼 + 안내 */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '14px', flexShrink: 0 }}>
                <button
                    onClick={handleSave}
                    disabled={saving}
                    style={{
                        padding: '8px 20px',
                        background: saved ? '#16a34a' : '#3b82f6',
                        color: 'white',
                        border: 'none',
                        borderRadius: '6px',
                        cursor: saving ? 'not-allowed' : 'pointer',
                        fontSize: '0.9rem',
                        fontWeight: 'bold',
                        transition: 'all 0.2s',
                        whiteSpace: 'nowrap',
                        opacity: saving ? 0.7 : 1,
                        minWidth: '130px',
                    }}
                >
                    {saved ? '✓ 저장됨' : saving ? '저장 중...' : '변경 저장하기'}
                </button>
                <span style={{ color: '#475569', fontSize: '0.75rem', lineHeight: '1.6' }}>
                    아래 선택한 ETF들만 목록에 보여지고 업데이트 됩니다.<br />
                    변경 후 꼭 저장하기를 눌러주세요.
                </span>
            </div>

            {/* ETF 목록 */}
            <div style={{
                flex: 1,
                overflowY: 'auto',
                borderRadius: '8px',
                border: '1px solid rgba(255,255,255,0.08)',
            }}>
                {groups.map(group => {
                    const allOn = group.etfs.every(e => e.isEnabled);
                    const allOff = group.etfs.every(e => !e.isEnabled);
                    return (
                        <div key={group.id}>
                            {/* 운용사 헤더 */}
                            <div style={{
                                padding: '7px 14px',
                                background: '#1e293b',
                                borderBottom: '1px solid rgba(255,255,255,0.06)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                position: 'sticky',
                                top: 0,
                                zIndex: 1,
                            }}>
                                <span style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                    {group.name}
                                </span>
                                <div style={{ display: 'flex', gap: '6px' }}>
                                    <button
                                        onClick={() => toggleAll(group.id, true)}
                                        disabled={allOn}
                                        style={{ ...smallBtnStyle, opacity: allOn ? 0.4 : 1 }}
                                    >
                                        전체 ON
                                    </button>
                                    <button
                                        onClick={() => toggleAll(group.id, false)}
                                        disabled={allOff}
                                        style={{ ...smallBtnStyle, background: 'rgba(148,163,184,0.1)', opacity: allOff ? 0.4 : 1 }}
                                    >
                                        전체 OFF
                                    </button>
                                </div>
                            </div>

                            {/* ETF 행 */}
                            {group.etfs.map((etf, idx) => (
                                <div
                                    key={etf.code}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        padding: '8px 14px',
                                        borderBottom: '1px solid rgba(255,255,255,0.04)',
                                        background: idx % 2 === 0 ? 'rgba(15,23,42,0.5)' : 'rgba(30,41,59,0.3)',
                                        gap: '10px',
                                        transition: 'background 0.15s',
                                    }}
                                >
                                    <span style={{
                                        flex: 1,
                                        fontSize: '0.85rem',
                                        color: etf.isEnabled ? '#e2e8f0' : '#475569',
                                        transition: 'color 0.2s',
                                    }}>
                                        {etf.name}
                                    </span>
                                    <span style={{ fontSize: '0.7rem', color: '#e2e8f0', minWidth: '44px', textAlign: 'right' }}>
                                        {etf.dataCount > 0 ? `${etf.dataCount}일` : ''}
                                    </span>
                                    <ToggleSwitch
                                        enabled={etf.isEnabled}
                                        onChange={() => toggleEtf(group.id, etf.code)}
                                    />
                                </div>
                            ))}
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

const smallBtnStyle: React.CSSProperties = {
    padding: '2px 8px',
    fontSize: '0.7rem',
    background: 'rgba(59,130,246,0.2)',
    color: '#93c5fd',
    border: '1px solid rgba(59,130,246,0.3)',
    borderRadius: '4px',
    cursor: 'pointer',
};

export default SelectEtfsWindow;
