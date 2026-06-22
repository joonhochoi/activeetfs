import React, { useEffect, useMemo, useState } from 'react';
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

interface StockSearchRow {
    stockCode: string;
    stockName: string;
    etfCode: string;
    weight: number;
    date: string;
}

interface StockGroup {
    stockCode: string;
    stockName: string;
    etfs: { etfCode: string; weight: number; date: string }[];
}

type Tab = 'list' | 'search';

const Sidebar: React.FC<SidebarProps> = ({ onSelectEtf, favorites }) => {
    const [activeTab, setActiveTab] = useState<Tab>('list');
    // 기본은 전부 펼침. 접은 운용사만 보관한다.
    const [collapsedManagers, setCollapsedManagers] = useState<Set<string>>(new Set());
    const [enabledCodes, setEnabledCodes] = useState<Set<string> | null>(null);
    const [userEtfs, setUserEtfs] = useState<UserEtf[]>([]);

    // 검색 탭 상태
    const [searchInput, setSearchInput] = useState('');
    const [searchResults, setSearchResults] = useState<StockGroup[] | null>(null);
    const [searching, setSearching] = useState(false);
    const [searchError, setSearchError] = useState<string | null>(null);

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
        setCollapsedManagers(prev => {
            const next = new Set(prev);
            if (next.has(managerId)) next.delete(managerId);
            else next.add(managerId);
            return next;
        });
    };

    // 사용자 추가 ETF를 운용사별로 그룹화
    const userEtfsByManager = userEtfs.reduce<Record<string, UserEtf[]>>((acc, etf) => {
        if (!acc[etf.managerId]) acc[etf.managerId] = [];
        acc[etf.managerId].push(etf);
        return acc;
    }, {});

    // 검색 결과의 etf_code → 표시 이름/운용사명 매핑
    const etfNameMap = useMemo(() => {
        const map = new Map<string, { name: string; manager: string }>();
        activeEtfInfos.managers.forEach((m: any) => {
            (m.etfs as any[]).forEach(e => map.set(e.code, { name: e.name, manager: m.name }));
        });
        const managerNameById = new Map(activeEtfInfos.managers.map((m: any) => [m.id, m.name]));
        userEtfs.forEach(e => {
            if (!map.has(e.code)) {
                map.set(e.code, { name: e.name, manager: managerNameById.get(e.managerId) || '' });
            }
        });
        return map;
    }, [userEtfs]);

    const runSearch = async () => {
        const q = searchInput.trim();
        if (!q) { setSearchResults(null); setSearchError(null); return; }
        setSearching(true);
        setSearchError(null);
        try {
            const rows = await invoke<StockSearchRow[]>('search_stock_in_etfs', { query: q });
            // 종목별로 묶기
            const byStock = new Map<string, StockGroup>();
            for (const r of rows) {
                let g = byStock.get(r.stockCode);
                if (!g) {
                    g = { stockCode: r.stockCode, stockName: r.stockName, etfs: [] };
                    byStock.set(r.stockCode, g);
                }
                g.etfs.push({ etfCode: r.etfCode, weight: r.weight, date: r.date });
            }
            const groups = Array.from(byStock.values());
            // 보유 ETF 수가 많은 종목을 위로
            groups.sort((a, b) => b.etfs.length - a.etfs.length || a.stockName.localeCompare(b.stockName));
            setSearchResults(groups);
        } catch (e: any) {
            setSearchError(typeof e === 'string' ? e : (e?.message ?? '검색 실패'));
            setSearchResults(null);
        } finally {
            setSearching(false);
        }
    };

    const shortDate = (d: string) => (d.length >= 8 ? d.slice(2) : d);

    // ── List 탭 ───────────────────────────────────────────────────────────
    const renderList = () => (
        <div style={{ padding: '6px 6px 12px' }}>
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

                const isExpanded = !collapsedManagers.has(manager.id);
                return (
                    <div key={manager.id} style={{ marginBottom: '2px' }}>
                        <button
                            onClick={() => toggleManager(manager.id)}
                            style={{
                                width: '100%',
                                textAlign: 'left',
                                background: 'transparent',
                                border: 'none',
                                color: 'var(--secondary-color)',
                                cursor: 'pointer',
                                padding: '3px 6px',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '5px',
                                fontSize: '0.66rem',
                                textTransform: 'uppercase',
                                letterSpacing: '0.5px',
                                fontWeight: 700,
                            }}
                        >
                            <span style={{ fontSize: '0.55rem', opacity: 0.7, width: '8px' }}>{isExpanded ? '▼' : '▶'}</span>
                            <span style={{ flex: 1 }}>{manager.name}</span>
                            <span style={{ opacity: 0.5, fontWeight: 500 }}>{visibleEtfs.length}</span>
                        </button>

                        {isExpanded && (
                            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                                {visibleEtfs.map((etf) => {
                                    const isFav = favorites?.has(etf.code);
                                    return (
                                        <li key={etf.code}>
                                            <button
                                                onClick={() => onSelectEtf(etf.code)}
                                                title={etf.name}
                                                style={{
                                                    width: '100%',
                                                    textAlign: 'left',
                                                    padding: '3px 8px 3px 19px',
                                                    background: 'transparent',
                                                    border: 'none',
                                                    color: isFav ? '#fbbf24' : 'var(--text-color)',
                                                    borderRadius: '5px',
                                                    fontSize: '0.72rem',
                                                    lineHeight: 1.35,
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '7px',
                                                    cursor: 'pointer',
                                                    transition: 'background 0.15s',
                                                    fontWeight: isFav ? 600 : 400,
                                                }}
                                                onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.05)')}
                                                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                                            >
                                                {isFav ? (
                                                    <span style={{ color: '#fbbf24', fontSize: '0.78rem', lineHeight: 1, width: '6px', marginLeft: '-1px', flexShrink: 0 }}>★</span>
                                                ) : (
                                                    <span style={{
                                                        width: '4px',
                                                        height: '4px',
                                                        borderRadius: '50%',
                                                        backgroundColor: 'var(--primary-color)',
                                                        flexShrink: 0,
                                                    }} />
                                                )}
                                                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{etf.name}</span>
                                                {(etf as any).isUserAdded && (
                                                    <span style={{
                                                        fontSize: '0.55rem',
                                                        padding: '0 4px',
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

    // ── Search 탭 ─────────────────────────────────────────────────────────
    const renderSearch = () => (
        <div style={{ padding: '8px 8px 12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{ display: 'flex', gap: '5px' }}>
                <input
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') runSearch(); }}
                    placeholder="종목명 / 종목코드 검색"
                    style={{
                        flex: 1,
                        minWidth: 0,
                        padding: '5px 8px',
                        fontSize: '0.74rem',
                        background: 'rgba(255,255,255,0.06)',
                        border: '1px solid rgba(255,255,255,0.12)',
                        borderRadius: '6px',
                        color: 'var(--text-color)',
                        outline: 'none',
                    }}
                />
                <button
                    onClick={runSearch}
                    disabled={searching}
                    style={{
                        padding: '5px 10px',
                        fontSize: '0.72rem',
                        background: 'var(--primary-color)',
                        border: 'none',
                        borderRadius: '6px',
                        color: '#fff',
                        cursor: searching ? 'default' : 'pointer',
                        opacity: searching ? 0.6 : 1,
                        flexShrink: 0,
                    }}
                >🔍</button>
            </div>
            <div style={{ fontSize: '0.62rem', color: 'var(--secondary-color)', lineHeight: 1.4 }}>
                특정 종목을 보유한 모든 ETF를 찾습니다. (각 ETF의 최신 보유일 기준)
            </div>

            {searching && (
                <div style={{ fontSize: '0.72rem', color: 'var(--secondary-color)', padding: '6px 2px' }}>검색 중…</div>
            )}
            {searchError && (
                <div style={{ fontSize: '0.72rem', color: '#f87171', padding: '6px 2px' }}>{searchError}</div>
            )}
            {!searching && searchResults && searchResults.length === 0 && (
                <div style={{ fontSize: '0.72rem', color: 'var(--secondary-color)', padding: '6px 2px' }}>
                    "{searchInput.trim()}"에 해당하는 보유 종목이 없습니다.
                </div>
            )}

            {!searching && searchResults && searchResults.map((g) => (
                <div key={g.stockCode} style={{ background: 'rgba(255,255,255,0.03)', borderRadius: '7px', padding: '6px 8px' }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '6px', marginBottom: '4px' }}>
                        <span style={{ fontSize: '0.76rem', fontWeight: 700, color: 'var(--text-color)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {g.stockName}
                        </span>
                        <span style={{ fontSize: '0.6rem', color: 'var(--secondary-color)', flexShrink: 0 }}>{g.stockCode}</span>
                    </div>
                    <div style={{ fontSize: '0.6rem', color: 'var(--secondary-color)', marginBottom: '3px' }}>
                        보유 ETF {g.etfs.length}개
                    </div>
                    <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                        {g.etfs.map((e) => {
                            const info = etfNameMap.get(e.etfCode);
                            return (
                                <li key={e.etfCode}>
                                    <button
                                        onClick={() => onSelectEtf(e.etfCode)}
                                        title={`${info?.name ?? e.etfCode} (${shortDate(e.date)})`}
                                        style={{
                                            width: '100%',
                                            textAlign: 'left',
                                            padding: '3px 6px',
                                            background: 'transparent',
                                            border: 'none',
                                            borderRadius: '5px',
                                            color: 'var(--text-color)',
                                            cursor: 'pointer',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '6px',
                                            fontSize: '0.7rem',
                                            transition: 'background 0.15s',
                                        }}
                                        onMouseEnter={(ev) => (ev.currentTarget.style.background = 'rgba(255,255,255,0.05)')}
                                        onMouseLeave={(ev) => (ev.currentTarget.style.background = 'transparent')}
                                    >
                                        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                            {info?.name ?? e.etfCode}
                                        </span>
                                        <span style={{ fontSize: '0.68rem', fontWeight: 600, color: 'var(--primary-color)', flexShrink: 0 }}>
                                            {e.weight.toFixed(2)}%
                                        </span>
                                    </button>
                                </li>
                            );
                        })}
                    </ul>
                </div>
            ))}
        </div>
    );

    const tabBtnStyle = (active: boolean): React.CSSProperties => ({
        flex: 1,
        padding: '7px 4px',
        background: 'transparent',
        border: 'none',
        borderBottom: active ? '2px solid var(--primary-color)' : '2px solid transparent',
        color: active ? 'var(--text-color)' : 'var(--secondary-color)',
        cursor: 'pointer',
        fontSize: '0.72rem',
        fontWeight: active ? 700 : 500,
        letterSpacing: '0.5px',
    });

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            <div style={{
                display: 'flex',
                borderBottom: '1px solid rgba(255,255,255,0.08)',
                flexShrink: 0,
            }}>
                <button style={tabBtnStyle(activeTab === 'list')} onClick={() => setActiveTab('list')}>List</button>
                <button style={tabBtnStyle(activeTab === 'search')} onClick={() => setActiveTab('search')}>Search</button>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
                {activeTab === 'list' ? renderList() : renderSearch()}
            </div>
        </div>
    );
};

export default Sidebar;
