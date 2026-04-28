import React, { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import activeEtfInfos from '../data/activeetfinfos.json';

interface UserEtf {
    code: string;
    name: string;
    managerId: string;
    etfId: string;
}

interface SidebarProps {
    onSelectEtf: (code: string) => void;
    favorites?: Set<string>;
}

const Sidebar: React.FC<SidebarProps> = ({ onSelectEtf, favorites }) => {
    const [expandedManagers, setExpandedManagers] = React.useState<Set<string>>(new Set());
    const [enabledCodes, setEnabledCodes] = useState<Set<string> | null>(null);
    const [userEtfs, setUserEtfs] = useState<UserEtf[]>([]);

    const fetchEnabledCodes = () => {
        invoke<{ code: string; isEnabled: boolean }[]>('get_etf_enabled_list')
            .then(list => setEnabledCodes(new Set(list.filter(e => e.isEnabled).map(e => e.code))))
            .catch(() => setEnabledCodes(null));
    };

    const fetchUserEtfs = () => {
        invoke<UserEtf[]>('get_user_added_etfs')
            .then(setUserEtfs)
            .catch(() => {});
    };

    useEffect(() => {
        fetchEnabledCodes();
        fetchUserEtfs();
        const channel = new BroadcastChannel('etf-settings');
        channel.onmessage = () => { fetchEnabledCodes(); fetchUserEtfs(); };
        return () => channel.close();
    }, []);

    const toggleManager = (managerId: string) => {
        setExpandedManagers(prev => {
            const next = new Set(prev);
            if (next.has(managerId)) {
                next.delete(managerId);
            } else {
                next.add(managerId);
            }
            return next;
        });
    };

    // 사용자 추가 ETF를 운용사별로 그룹화
    const userEtfsByManager = userEtfs.reduce<Record<string, UserEtf[]>>((acc, etf) => {
        if (!acc[etf.managerId]) acc[etf.managerId] = [];
        acc[etf.managerId].push(etf);
        return acc;
    }, {});

    return (
        <div style={{ padding: '10px' }}>
            {activeEtfInfos.managers.map((manager) => {
                const staticEtfs = (manager.etfs as any[]).filter(etf =>
                    enabledCodes === null || enabledCodes.has(etf.code)
                );
                const addedEtfs = (userEtfsByManager[manager.id] || []).filter(etf =>
                    enabledCodes === null || enabledCodes.has(etf.code)
                );
                const visibleEtfs: { code: string; name: string; isUserAdded?: boolean }[] = [
                    ...staticEtfs,
                    ...addedEtfs.map(e => ({ ...e, isUserAdded: true })),
                ];
                if (visibleEtfs.length === 0) return null;

                const isExpanded = expandedManagers.has(manager.id);
                return (
                    <div key={manager.id} style={{ marginBottom: '10px' }}>
                        <button
                            onClick={() => toggleManager(manager.id)}
                            style={{
                                width: '100%',
                                textAlign: 'left',
                                background: 'transparent',
                                border: 'none',
                                color: 'var(--secondary-color)',
                                cursor: 'pointer',
                                padding: '5px 10px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                fontSize: '0.75rem',
                                textTransform: 'uppercase',
                                letterSpacing: '1px',
                                fontWeight: 600
                            }}
                        >
                            <span>{manager.name}</span>
                            <span>{isExpanded ? '▼' : '▶'}</span>
                        </button>

                        {isExpanded && (
                            <ul style={{ listStyle: 'none', padding: 0, margin: '5px 0 10px 0' }}>
                                {visibleEtfs.map((etf) => {
                                    const isFav = favorites?.has(etf.code);
                                    return (
                                        <li key={etf.code}>
                                            <button
                                                onClick={() => onSelectEtf(etf.code)}
                                                style={{
                                                    width: '100%',
                                                    textAlign: 'left',
                                                    padding: '8px 15px 8px 25px',
                                                    background: 'transparent',
                                                    border: 'none',
                                                    color: isFav ? '#fbbf24' : 'var(--text-color)',
                                                    borderRadius: '8px',
                                                    fontSize: '0.8rem',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '10px',
                                                    cursor: 'pointer',
                                                    transition: 'background 0.2s',
                                                    fontWeight: isFav ? 600 : 400
                                                }}
                                                onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.05)')}
                                                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                                            >
                                                {isFav ? (
                                                    <span style={{ color: '#fbbf24', fontSize: '0.9rem', lineHeight: 1, marginRight: '-2px' }}>★</span>
                                                ) : (
                                                    <span style={{
                                                        width: '6px',
                                                        height: '6px',
                                                        borderRadius: '50%',
                                                        backgroundColor: 'var(--primary-color)',
                                                        flexShrink: 0
                                                    }} />
                                                )}
                                                <span style={{ flex: 1 }}>{etf.name}</span>
                                                {(etf as any).isUserAdded && (
                                                    <span style={{
                                                        fontSize: '0.6rem',
                                                        padding: '1px 5px',
                                                        borderRadius: '3px',
                                                        background: 'rgba(99,102,241,0.3)',
                                                        color: '#a5b4fc',
                                                        fontWeight: 600,
                                                        flexShrink: 0,
                                                    }}>NEW</span>
                                                )}
                                            </button>
                                        </li>
                                    );
                                })}
                            </ul>
                        )}
                    </div>
                );
            })}
        </div>
    );
};

export default Sidebar;
