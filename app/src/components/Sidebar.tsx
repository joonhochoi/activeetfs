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
    onCompareEtfs?: (codes: string[], highlight: string[]) => void;
}

// 비교 뷰에서 동시에 볼 수 있는 ETF 최대 개수
const MAX_COMPARE = 5;

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

const Sidebar: React.FC<SidebarProps> = ({ onSelectEtf, favorites, onCompareEtfs }) => {
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
    // 비교용 선택(검색 결과 ETF code 집합)
    const [selected, setSelected] = useState<Set<string>>(new Set());
    // 검색으로 찾은 종목코드 누적(비교 뷰에서 강조 표시용)
    const [searchedStocks, setSearchedStocks] = useState<Set<string>>(new Set());

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
            // 검색으로 찾은 종목코드를 누적(비교 뷰 강조용)
            if (groups.length > 0) {
                setSearchedStocks(prev => {
                    const next = new Set(prev);
                    groups.forEach(g => next.add(g.stockCode));
                    return next;
                });
            }
        } catch (e: any) {
            setSearchError(typeof e === 'string' ? e : (e?.message ?? '검색 실패'));
            setSearchResults(null);
        } finally {
            setSearching(false);
        }
    };

    const shortDate = (d: string) => (d.length >= 8 ? d.slice(2) : d);

    const toggleSelect = (code: string) => {
        setSelected(prev => {
            const next = new Set(prev);
            if (next.has(code)) {
                next.delete(code);
            } else {
                if (next.size >= MAX_COMPARE) return prev; // 최대 개수 초과 시 무시
                next.add(code);
            }
            return next;
        });
    };

    const runCompare = () => {
        if (selected.size < 2) return;
        onCompareEtfs?.(Array.from(selected), Array.from(searchedStocks));
    };

    const clearSelection = () => {
        setSelected(new Set());
        setSearchedStocks(new Set());
    };

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

                // 모든 ETF명이 브랜드 접두어(TIME/KoAct/KODEX…)로 시작하므로,
                // 운용사 헤더에는 그 브랜드를 표시하고 ETF명에서는 접두어를 잘라 정보 밀도를 높인다.
                const brand = visibleEtfs[0]?.name.split(/\s+/)[0] || manager.name;
                const stripBrand = (name: string) =>
                    name.startsWith(brand + ' ') ? name.slice(brand.length + 1) : name;

                const isExpanded = !collapsedManagers.has(manager.id);
                return (
                    <div key={manager.id} style={{ marginBottom: '4px' }}>
                        <button
                            onClick={() => toggleManager(manager.id)}
                            style={{
                                width: '100%',
                                textAlign: 'left',
                                background: '#1e40af',
                                border: 'none',
                                color: '#fff',
                                cursor: 'pointer',
                                padding: '5px 8px',
                                borderRadius: '6px',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px',
                                fontSize: '0.74rem',
                                letterSpacing: '0.3px',
                                fontWeight: 700,
                                boxShadow: '0 1px 3px rgba(0,0,0,0.25)',
                            }}
                        >
                            <span style={{ fontSize: '0.58rem', opacity: 0.85, width: '8px' }}>{isExpanded ? '▼' : '▶'}</span>
                            <span style={{ flex: 1 }}>{brand}</span>
                            <span style={{
                                fontSize: '0.66rem',
                                fontWeight: 700,
                                padding: '0 6px',
                                borderRadius: '9px',
                                background: 'rgba(255,255,255,0.25)',
                                color: '#fff',
                            }}>{visibleEtfs.length}</span>
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
                                                    padding: '4px 8px 4px 22px',
                                                    background: 'transparent',
                                                    border: 'none',
                                                    color: isFav ? '#fbbf24' : 'var(--text-color)',
                                                    borderRadius: '6px',
                                                    fontSize: '0.8rem',
                                                    lineHeight: 1.4,
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '8px',
                                                    cursor: 'pointer',
                                                    transition: 'background 0.15s',
                                                    fontWeight: isFav ? 600 : 400,
                                                }}
                                                onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.05)')}
                                                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                                            >
                                                {isFav ? (
                                                    <span style={{ color: '#fbbf24', fontSize: '0.85rem', lineHeight: 1, width: '6px', marginLeft: '-1px', flexShrink: 0 }}>★</span>
                                                ) : (
                                                    <span style={{
                                                        width: '5px',
                                                        height: '5px',
                                                        borderRadius: '50%',
                                                        backgroundColor: 'var(--primary-color)',
                                                        flexShrink: 0,
                                                    }} />
                                                )}
                                                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{stripBrand(etf.name)}</span>
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
                검색 종목 보유 ETF 찾기 (각 ETF 최신 보유일 기준) , 검색후 선택 ETF 비교 가능
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
                            const isSel = selected.has(e.etfCode);
                            const atMax = !isSel && selected.size >= MAX_COMPARE;
                            return (
                                <li key={e.etfCode} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                    <input
                                        type="checkbox"
                                        checked={isSel}
                                        disabled={atMax}
                                        onChange={() => toggleSelect(e.etfCode)}
                                        title={atMax ? `비교는 최대 ${MAX_COMPARE}개까지 선택` : '비교 대상으로 선택'}
                                        style={{ flexShrink: 0, cursor: atMax ? 'not-allowed' : 'pointer', accentColor: 'var(--primary-color)' }}
                                    />
                                    <button
                                        onClick={() => onSelectEtf(e.etfCode)}
                                        title={`${info?.name ?? e.etfCode} (${shortDate(e.date)})`}
                                        style={{
                                            flex: 1,
                                            minWidth: 0,
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

            {selected.size > 0 && (
                <div style={{
                    position: 'sticky',
                    bottom: 0,
                    marginTop: 'auto',
                    background: 'var(--sidebar-bg, #1a1a1a)',
                    borderTop: '1px solid rgba(255,255,255,0.12)',
                    padding: '8px 2px 2px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '6px',
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.66rem', color: 'var(--secondary-color)' }}>
                        <span>비교 선택 {selected.size} / {MAX_COMPARE}</span>
                        <button
                            onClick={clearSelection}
                            style={{ background: 'transparent', border: 'none', color: 'var(--secondary-color)', cursor: 'pointer', fontSize: '0.66rem', textDecoration: 'underline' }}
                        >해제</button>
                    </div>
                    <button
                        onClick={runCompare}
                        disabled={selected.size < 2}
                        title={selected.size < 2 ? '2개 이상 선택하면 비교할 수 있습니다' : '선택한 ETF 구성 비교'}
                        style={{
                            width: '100%',
                            padding: '7px',
                            background: selected.size < 2 ? 'rgba(255,255,255,0.08)' : 'var(--primary-color)',
                            border: 'none',
                            borderRadius: '6px',
                            color: selected.size < 2 ? 'var(--secondary-color)' : '#fff',
                            cursor: selected.size < 2 ? 'default' : 'pointer',
                            fontSize: '0.74rem',
                            fontWeight: 700,
                        }}
                    >📊 선택 ETF 비교</button>
                </div>
            )}
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
