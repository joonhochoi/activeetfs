import React from 'react';
import Sidebar from './Sidebar';
import ChangelogModal from './ChangelogModal';
import AddEtfModal from './AddEtfModal';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { WebviewWindow } from '@tauri-apps/api/webviewWindow';
import { invoke } from '@tauri-apps/api/core';
import { emit } from '@tauri-apps/api/event';
import { save, open } from '@tauri-apps/plugin-dialog';
import pkg from '../../package.json';



interface LayoutProps {
    children: React.ReactNode;
    rightPanel?: React.ReactNode;
    favorites?: Set<string>;
    onSelectEtf: (etfCode: string) => void;
    onCompareEtfs?: (codes: string[], highlight: string[]) => void;
    isChangelogOpen: boolean;
    setIsChangelogOpen: (open: boolean) => void;
}

const Layout: React.FC<LayoutProps> = ({ children, rightPanel, onSelectEtf, onCompareEtfs, favorites, isChangelogOpen, setIsChangelogOpen }) => {
    const [isSidebarOpen, setIsSidebarOpen] = React.useState(true);
    const [isRightSidebarOpen, setIsRightSidebarOpen] = React.useState(true);
    const [isMenuOpen, setIsMenuOpen] = React.useState(false);
    const [isAddEtfOpen, setIsAddEtfOpen] = React.useState(false);
    const [sidebarKey, setSidebarKey] = React.useState(0);
    // 데이터 백업/복원
    const [backupBusy, setBackupBusy] = React.useState(false);
    const [importPath, setImportPath] = React.useState<string | null>(null); // 모드 선택 모달 표시용
    const [backupMsg, setBackupMsg] = React.useState<string | null>(null);   // 결과 안내

    const todayStamp = () => {
        const d = new Date();
        const p = (n: number) => String(n).padStart(2, '0');
        return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`;
    };

    const handleExport = async () => {
        setIsMenuOpen(false);
        try {
            const path = await save({
                title: '데이터 내보내기',
                defaultPath: `activeetfs-backup-${todayStamp()}.aetf`,
                filters: [{ name: 'Active ETFs 백업', extensions: ['aetf', 'gz', 'json'] }],
            });
            if (!path) return;
            setBackupBusy(true);
            const res = await invoke<{ message: string }>('export_database', { path });
            setBackupMsg(res.message);
        } catch (e) {
            setBackupMsg('내보내기 실패: ' + String(e));
        } finally {
            setBackupBusy(false);
        }
    };

    const handleImportPick = async () => {
        setIsMenuOpen(false);
        try {
            const selected = await open({
                title: '데이터 가져오기',
                multiple: false,
                filters: [{ name: 'Active ETFs 백업', extensions: ['aetf', 'gz', 'json'] }],
            });
            if (!selected || typeof selected !== 'string') return;
            setImportPath(selected); // 모드 선택 모달 열기
        } catch (e) {
            setBackupMsg('파일 선택 실패: ' + String(e));
        }
    };

    const runImport = async (mode: 'overwrite' | 'fill') => {
        if (!importPath) return;
        setBackupBusy(true);
        try {
            const res = await invoke<{ message: string }>('import_database', { path: importPath, mode });
            setImportPath(null);
            setBackupMsg(res.message);
            // 사이드바/대시보드 갱신
            const ch = new BroadcastChannel('etf-settings');
            ch.postMessage('imported');
            ch.close();
            emit('refresh-data').catch(() => {});
            setSidebarKey(k => k + 1);
        } catch (e) {
            setBackupMsg('가져오기 실패: ' + String(e));
        } finally {
            setBackupBusy(false);
        }
    };

    const openHelpWindow = async () => {
        setIsMenuOpen(false);
        const webview = new WebviewWindow('help', {
            url: '/help.html',
            title: 'Active ETF Viewer 도움말',
            width: 950,
            height: 900,
            resizable: true,
            visible: true
        });

        webview.once('tauri://created', function () {
            // webview window successfully created
        });

        webview.once('tauri://error', function (e) {
            // an error happened creating the webview window
            console.error('Failed to open help window', e);
        });
    };

    const openUpdateAllWindow = async () => {
        setIsMenuOpen(false);
        const webview = new WebviewWindow('update-all', {
            url: '/index.html#update-all',
            title: 'Update All ETFs',
            width: 900,
            height: 650,
            resizable: true,
            visible: true,
            center: true,
            alwaysOnTop: true
        });

        webview.once('tauri://created', function () {
            // webview window successfully created
        });

        webview.once('tauri://error', function (e) {
            console.error('Failed to open help window', e);
        });
    }

    const openSelectEtfsWindow = async () => {
        setIsMenuOpen(false);
        const webview = new WebviewWindow('select-etfs', {
            url: '/index.html#select-etfs',
            title: 'Select ETFs',
            width: 680,
            height: 750,
            resizable: true,
            visible: true,
            center: true,
            alwaysOnTop: true
        });
        webview.once('tauri://error', (e) => console.error('Failed to open select-etfs window', e));
    }

    const openUpdateTodayWindow = async () => {
        setIsMenuOpen(false);
        const webview = new WebviewWindow('update-today', {
            url: '/index.html#update-today',
            title: 'Update Today',
            width: 1050,
            height: 700,
            resizable: true,
            visible: true,
            center: true,
            alwaysOnTop: true
        });

        webview.once('tauri://created', function () {
            // webview window successfully created
        });

        webview.once('tauri://error', function (e) {
            console.error('Failed to open update-today window', e);
        });
    }

    return (
        <div style={{ display: 'flex', height: '100vh', width: '100vw', position: 'relative' }}>
            {/* Left Sidebar Toggle Button - Floating */}
            <button
                style={{
                    position: 'absolute',
                    top: '20px',
                    left: isSidebarOpen ? '260px' : '20px',
                    zIndex: 100,
                    background: 'rgba(30, 41, 59, 0.8)',
                    color: '#94a3b8',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    borderRadius: '50%',
                    width: '32px',
                    height: '32px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: 'left 0.3s ease'
                }}
                onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                title={isSidebarOpen ? "왼쪽 사이드바 접기" : "왼쪽 사이드바 펼치기"}
            >
                {isSidebarOpen ? '❮' : '❯'}
            </button>

            {/* Sidebar */}
            <aside style={{
                width: isSidebarOpen ? '250px' : '0',
                overflow: 'hidden',
                transition: 'width 0.3s ease',
                background: 'var(--sidebar-bg)',
                borderRight: 'var(--glass-border)',
                display: 'flex',
                flexDirection: 'column'
            }}>
                <div style={{ height: '20px' }}></div>
                <div style={{ flex: 1, overflowY: 'auto' }}>
                    <Sidebar
                        key={sidebarKey}
                        onSelectEtf={onSelectEtf}
                        onCompareEtfs={onCompareEtfs}
                        favorites={favorites}
                    />
                </div>

                {/* Sidebar Footer */}
                <div style={{
                    padding: '15px',
                    borderTop: 'var(--glass-border)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    position: 'relative' // For absolute menu positioning
                }}>
                    <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.4)' }}>
                        Active Etfs v{pkg.version}
                    </div>

                    <button
                        onClick={() => setIsMenuOpen(!isMenuOpen)}
                        style={{
                            background: 'rgba(255,255,255,0.1)',
                            border: '1px solid rgba(255,255,255,0.2)',
                            color: 'white',
                            padding: '4px 8px',
                            borderRadius: '4px',
                            fontSize: '0.8rem',
                            cursor: 'pointer'
                        }}
                    >
                        Menu
                    </button>

                    {/* Menu Popup */}
                    {isMenuOpen && (
                        <div style={{
                            position: 'absolute',
                            bottom: '50px', // Above the footer
                            right: '5px',
                            background: '#1e293b',
                            border: '1px solid rgba(255,255,255,0.2)',
                            borderRadius: '8px',
                            padding: '5px',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '2px',
                            boxShadow: '0 4px 15px rgba(0,0,0,0.5)',
                            zIndex: 1000,
                            width: '150px'
                        }}>
                            <button
                                onClick={openHelpWindow}
                                className="menu-item"
                            >
                                Help
                            </button>
                            <button
                                onClick={() => {
                                    setIsMenuOpen(false);
                                    setIsChangelogOpen(true);
                                }}
                                className="menu-item"
                            >
                                Changelog
                            </button>
                            <div style={{ height: '1px', background: 'rgba(255,255,255,0.1)', margin: '4px 0' }} />
                            <div style={{
                                padding: '4px 8px 2px',
                                fontSize: '0.7rem',
                                color: 'rgba(255,255,255,0.35)',
                                letterSpacing: '0.05em',
                                userSelect: 'none',
                            }}>
                                Settings
                            </div>
                            <button
                                onClick={openSelectEtfsWindow}
                                className="menu-item"
                                style={{ paddingLeft: '16px' }}
                            >
                                Select ETFs
                            </button>
                            <button
                                onClick={() => { setIsMenuOpen(false); setIsAddEtfOpen(true); }}
                                className="menu-item"
                                style={{ paddingLeft: '16px' }}
                            >
                                Add New ETF
                            </button>
                            <div style={{ height: '1px', background: 'rgba(255,255,255,0.1)', margin: '4px 0' }} />
                            <div style={{
                                padding: '4px 8px 2px',
                                fontSize: '0.7rem',
                                color: 'rgba(255,255,255,0.35)',
                                letterSpacing: '0.05em',
                                userSelect: 'none',
                            }}>
                                데이터
                            </div>
                            <button
                                onClick={handleExport}
                                className="menu-item"
                                style={{ paddingLeft: '16px' }}
                            >
                                내보내기 (백업)
                            </button>
                            <button
                                onClick={handleImportPick}
                                className="menu-item"
                                style={{ paddingLeft: '16px' }}
                            >
                                가져오기 (복원)
                            </button>
                            <div style={{ height: '1px', background: 'rgba(255,255,255,0.1)', margin: '4px 0' }} />
                            <button
                                onClick={openUpdateAllWindow}
                                className="menu-item"
                            >
                                UpdateAll Days
                            </button>
                            <button
                                onClick={openUpdateTodayWindow}
                                className="menu-item"
                            >
                                UpdateAll Today
                            </button>
                            <div style={{ height: '1px', background: 'rgba(255,255,255,0.1)', margin: '4px 0' }} />
                            <button
                                onClick={async () => {
                                    setIsMenuOpen(false);
                                    await getCurrentWindow().close();
                                }}
                                className="menu-item"
                            >
                                Exit
                            </button>
                        </div>
                    )}
                </div>
            </aside>

            {/* Main Content */}
            <main
                className="glass-panel"
                style={{
                    flex: 1,
                    margin: '16px 0', // Vertical margin only, horizontal handled by sidebars
                    marginLeft: isSidebarOpen ? '16px' : '16px', // Keep left margin consistent relative to window/sidebar
                    marginRight: isRightSidebarOpen ? '16px' : '16px', // Right margin consistent
                    overflow: 'hidden',
                    position: 'relative',
                    transition: 'all 0.3s ease'
                }}
            >
                {children}
            </main>

            {/* Right Sidebar Toggle Button - Floating */}
            {rightPanel && (
                <button
                    onClick={() => setIsRightSidebarOpen(!isRightSidebarOpen)}
                    style={{
                        position: 'absolute',
                        right: isRightSidebarOpen ? '276px' : '10px', // 260px width + 16px margin
                        top: '15px',
                        zIndex: 100,
                        width: '30px',
                        height: '30px',
                        borderRadius: '50%',
                        border: 'none',
                        background: 'var(--secondary-color)',
                        color: 'white',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        transition: 'right 0.3s ease',
                        boxShadow: '0 2px 10px rgba(0,0,0,0.3)'
                    }}
                    title={isRightSidebarOpen ? "오른쪽 사이드바 접기" : "오른쪽 사이드바 펼치기"}
                >
                    {isRightSidebarOpen ? '>>' : '<<'}
                </button>
            )}

            {/* Right Sidebar */}
            {rightPanel && (
                <aside
                    className="glass-panel"
                    style={{
                        width: isRightSidebarOpen ? '260px' : '0px',
                        margin: isRightSidebarOpen ? '16px' : '16px 0 16px 0',
                        display: 'flex',
                        flexDirection: 'column',
                        overflow: 'hidden',
                        transition: 'all 0.3s ease',
                        opacity: isRightSidebarOpen ? 1 : 0,
                        pointerEvents: isRightSidebarOpen ? 'auto' : 'none'
                    }}
                >
                    <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
                        {rightPanel}
                    </div>
                </aside>
            )}
            <AddEtfModal
                isOpen={isAddEtfOpen}
                onClose={() => setIsAddEtfOpen(false)}
                onEtfAdded={() => setSidebarKey(k => k + 1)}
            />
            <ChangelogModal
                isOpen={isChangelogOpen}
                onClose={() => setIsChangelogOpen(false)}
            />

            {/* 가져오기 모드 선택 모달 */}
            {importPath && (
                <div style={backupOverlayStyle} onClick={(e) => { if (e.target === e.currentTarget && !backupBusy) setImportPath(null); }}>
                    <div style={{ ...backupModalStyle, width: '440px' }}>
                        <h3 style={{ margin: '0 0 6px 0', fontSize: '1.15rem', color: '#f1f5f9' }}>데이터 가져오기</h3>
                        <p style={{ color: '#94a3b8', fontSize: '0.8rem', marginBottom: '18px', wordBreak: 'break-all' }}>
                            {importPath}
                        </p>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', textAlign: 'left' }}>
                            <button onClick={() => runImport('fill')} disabled={backupBusy} style={importChoiceStyle}>
                                <div style={{ fontWeight: 700, color: '#e2e8f0' }}>빈 날짜만 채우기 (권장)</div>
                                <div style={{ fontSize: '0.78rem', color: '#94a3b8', marginTop: '3px' }}>
                                    현재 데이터는 그대로 두고, 비어 있는 날짜·ETF만 추가합니다.
                                </div>
                            </button>
                            <button onClick={() => runImport('overwrite')} disabled={backupBusy} style={importChoiceStyle}>
                                <div style={{ fontWeight: 700, color: '#fca5a5' }}>전체 덮어쓰기</div>
                                <div style={{ fontSize: '0.78rem', color: '#94a3b8', marginTop: '3px' }}>
                                    같은 날짜·ETF가 있으면 백업 데이터로 덮어씁니다. 즐겨찾기·활성화 상태도 백업 기준으로 반영됩니다.
                                </div>
                            </button>
                        </div>
                        <div style={{ marginTop: '16px', textAlign: 'right' }}>
                            <button onClick={() => setImportPath(null)} disabled={backupBusy} style={backupCancelStyle}>
                                {backupBusy ? '처리 중...' : '취소'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* 진행 중 / 결과 안내 */}
            {(backupBusy && !importPath) && (
                <div style={backupOverlayStyle}>
                    <div style={backupModalStyle}>
                        <div style={{ fontSize: '1.6rem', marginBottom: '10px' }}>⏳</div>
                        <div style={{ color: '#cbd5e1' }}>처리 중...</div>
                    </div>
                </div>
            )}
            {backupMsg && !backupBusy && (
                <div style={backupOverlayStyle} onClick={(e) => { if (e.target === e.currentTarget) setBackupMsg(null); }}>
                    <div style={backupModalStyle}>
                        <div style={{ fontSize: '2rem', marginBottom: '10px' }}>💾</div>
                        <p style={{ color: '#e2e8f0', fontSize: '0.92rem', lineHeight: 1.6, marginBottom: '20px' }}>{backupMsg}</p>
                        <button onClick={() => setBackupMsg(null)} style={{ ...backupCancelStyle, background: '#3b82f6', color: 'white', border: 'none' }}>
                            확인
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

const backupOverlayStyle: React.CSSProperties = {
    position: 'fixed', inset: 0,
    background: 'rgba(0,0,0,0.65)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 10000, backdropFilter: 'blur(3px)',
};

const backupModalStyle: React.CSSProperties = {
    background: '#1e293b',
    border: '1px solid rgba(255,255,255,0.15)',
    borderRadius: '12px',
    padding: '26px 28px',
    width: '360px', maxWidth: '90vw',
    boxShadow: '0 20px 50px rgba(0,0,0,0.6)',
    textAlign: 'center',
};

const importChoiceStyle: React.CSSProperties = {
    width: '100%',
    padding: '12px 14px',
    background: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: '8px',
    cursor: 'pointer',
    textAlign: 'left',
};

const backupCancelStyle: React.CSSProperties = {
    padding: '9px 22px',
    borderRadius: '6px',
    background: 'rgba(148,163,184,0.15)',
    color: '#cbd5e1',
    border: '1px solid rgba(255,255,255,0.1)',
    cursor: 'pointer',
    fontWeight: 600,
};

export default Layout;
