import React from 'react';
import activeEtfInfos from '../data/activeetfinfos.json';

interface SidebarProps {
    onSelectEtf: (code: string) => void;
    favorites?: Set<string>;
}

const Sidebar: React.FC<SidebarProps> = ({ onSelectEtf, favorites }) => {
    // Default to expanding the first manager
    const [expandedManagers, setExpandedManagers] = React.useState<Set<string>>(new Set());

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

    return (
        <div style={{ padding: '10px' }}>
            {activeEtfInfos.managers.map((manager) => {
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
                                {manager.etfs.map((etf) => {
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
                                                    color: isFav ? '#fbbf24' : 'var(--text-color)', // Gold text for favorites
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
                                                {etf.name}
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
