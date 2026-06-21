import React, { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import activeEtfInfos from '../data/activeetfinfos.json';

interface EtfItem {
    code: string;
    name: string;
    isEnabled: boolean;
    dataCount: number;
    lastDate: string | null;
    isUserAdded: boolean;
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
    lastDate: string | null;
}

interface UserEtf {
    code: string;
    name: string;
    managerId: string;
    etfId: string;
}

// '2026-06-02' → '26-06-02'
const shortDate = (d: string | null): string => (d ? d.slice(2) : '');

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
    // 삭제 확인 모달 대상 (사용자 추가 ETF 전용)
    const [deleteTarget, setDeleteTarget] = useState<{ code: string; name: string } | null>(null);
    const [deleting, setDeleting] = useState(false);
    const [deleteError, setDeleteError] = useState<string | null>(null);

    const loadGroups = async () => {
        const [dbList, userEtfs] = await Promise.all([
            invoke<EtfSetting[]>('get_etf_enabled_list').catch(() => [] as EtfSetting[]),
            invoke<UserEtf[]>('get_user_added_etfs').catch(() => [] as UserEtf[]),
        ]);
        const dbMap = new Map(dbList.map(e => [e.code, e]));
        const userByManager = userEtfs.reduce<Record<string, UserEtf[]>>((acc, ue) => {
            (acc[ue.managerId] ||= []).push(ue);
            return acc;
        }, {});

        const toItem = (code: string, name: string, isUserAdded: boolean): EtfItem => {
            const db = dbMap.get(code);
            return {
                code,
                name,
                isEnabled: db ? db.isEnabled : true,
                dataCount: db ? db.dataCount : 0,
                lastDate: db ? db.lastDate : null,
                isUserAdded,
            };
        };

        const built: ManagerGroup[] = (activeEtfInfos.managers as any[]).map(manager => ({
            id: manager.id,
            name: manager.name,
            etfs: [
                ...(manager.etfs as any[]).map(etf => toItem(etf.code, etf.name, false)),
                ...(userByManager[manager.id] || []).map(ue => toItem(ue.code, ue.name, true)),
            ],
        }));
        setGroups(built);
    };

    useEffect(() => {
        loadGroups().catch(console.error);
    }, []);

    const confirmDelete = async () => {
        if (!deleteTarget) return;
        setDeleting(true);
        setDeleteError(null);
        try {
            await invoke('remove_user_etf', { code: deleteTarget.code });
            // 사이드바 등 다른 창 갱신
            const ch = new BroadcastChannel('etf-settings');
            ch.postMessage('deleted');
            ch.close();
            setDeleteTarget(null);
            await loadGroups();
        } catch (e) {
            setDeleteError(String(e));
        } finally {
            setDeleting(false);
        }
    };

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
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '6px',
                                    }}>
                                        {etf.name}
                                        {etf.isUserAdded && (
                                            <span style={{
                                                fontSize: '0.6rem',
                                                padding: '1px 5px',
                                                borderRadius: '3px',
                                                background: 'rgba(99,102,241,0.3)',
                                                color: '#a5b4fc',
                                                fontWeight: 600,
                                                flexShrink: 0,
                                            }}>추가</span>
                                        )}
                                    </span>
                                    <span style={{ fontSize: '0.7rem', color: '#e2e8f0', minWidth: '110px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                                        {etf.dataCount > 0
                                            ? `${etf.dataCount}일${etf.lastDate ? ` (${shortDate(etf.lastDate)})` : ''}`
                                            : ''}
                                    </span>
                                    <ToggleSwitch
                                        enabled={etf.isEnabled}
                                        onChange={() => toggleEtf(group.id, etf.code)}
                                    />
                                    {etf.isUserAdded ? (
                                        <button
                                            onClick={() => { setDeleteError(null); setDeleteTarget({ code: etf.code, name: etf.name }); }}
                                            title="사용자 추가 ETF 삭제"
                                            style={deleteBtnStyle}
                                        >
                                            삭제
                                        </button>
                                    ) : (
                                        // 정렬 유지를 위한 자리 채움(카탈로그 ETF는 삭제 불가)
                                        <span style={{ width: '38px', flexShrink: 0 }} />
                                    )}
                                </div>
                            ))}
                        </div>
                    );
                })}
            </div>

            {/* 삭제 확인 모달 (사용자 추가 ETF 전용) */}
            {deleteTarget && (
                <div
                    style={{
                        position: 'fixed', inset: 0,
                        background: 'rgba(0,0,0,0.65)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        zIndex: 9999, backdropFilter: 'blur(3px)',
                    }}
                    onClick={(e) => { if (e.target === e.currentTarget && !deleting) setDeleteTarget(null); }}
                >
                    <div style={{
                        background: '#1e293b',
                        border: '1px solid rgba(255,255,255,0.15)',
                        borderRadius: '12px',
                        padding: '26px 28px',
                        width: '380px', maxWidth: '90vw',
                        boxShadow: '0 20px 50px rgba(0,0,0,0.6)',
                        textAlign: 'center',
                    }}>
                        <div style={{ fontSize: '2.4rem', marginBottom: '10px' }}>🗑️</div>
                        <h3 style={{ margin: '0 0 10px 0', fontSize: '1.1rem', color: '#f1f5f9' }}>ETF 삭제</h3>
                        <p style={{ color: '#cbd5e1', fontSize: '0.9rem', lineHeight: 1.6, marginBottom: '6px' }}>
                            <b style={{ color: '#fff' }}>{deleteTarget.name}</b> 을(를) 목록에서 삭제할까요?
                        </p>
                        <p style={{ color: '#fbbf24', fontSize: '0.78rem', marginBottom: '20px' }}>
                            수집된 보유 종목 데이터도 함께 삭제되며 되돌릴 수 없습니다.
                        </p>
                        {deleteError && (
                            <div style={{ color: '#f87171', fontSize: '0.78rem', marginBottom: '14px' }}>
                                삭제 실패: {deleteError}
                            </div>
                        )}
                        <div style={{ display: 'flex', gap: '10px' }}>
                            <button
                                onClick={() => setDeleteTarget(null)}
                                disabled={deleting}
                                style={{
                                    flex: 1, padding: '10px', borderRadius: '6px',
                                    background: 'rgba(148,163,184,0.15)', color: '#cbd5e1',
                                    border: '1px solid rgba(255,255,255,0.1)',
                                    cursor: deleting ? 'not-allowed' : 'pointer', fontWeight: 600,
                                }}
                            >
                                취소
                            </button>
                            <button
                                onClick={confirmDelete}
                                disabled={deleting}
                                style={{
                                    flex: 1, padding: '10px', borderRadius: '6px',
                                    background: '#dc2626', color: 'white', border: 'none',
                                    cursor: deleting ? 'not-allowed' : 'pointer', fontWeight: 700,
                                    opacity: deleting ? 0.7 : 1,
                                }}
                            >
                                {deleting ? '삭제 중...' : '삭제'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
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

const deleteBtnStyle: React.CSSProperties = {
    width: '38px',
    flexShrink: 0,
    padding: '3px 0',
    fontSize: '0.7rem',
    background: 'rgba(220,38,38,0.15)',
    color: '#fca5a5',
    border: '1px solid rgba(220,38,38,0.35)',
    borderRadius: '4px',
    cursor: 'pointer',
};

export default SelectEtfsWindow;
