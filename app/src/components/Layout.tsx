import React from 'react';
import Sidebar from './Sidebar';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { WebviewWindow } from '@tauri-apps/api/webviewWindow';
import pkg from '../../package.json';



interface LayoutProps {
    children: React.ReactNode;
    rightPanel?: React.ReactNode;
    favorites?: Set<string>;
    onSelectEtf: (etfCode: string) => void;
}

const Layout: React.FC<LayoutProps> = ({ children, rightPanel, onSelectEtf, favorites }) => {
    const [isSidebarOpen, setIsSidebarOpen] = React.useState(true);
    const [isRightSidebarOpen, setIsRightSidebarOpen] = React.useState(true);
    const [isMenuOpen, setIsMenuOpen] = React.useState(false);

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
            height: 800,
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
                <Sidebar
                    onSelectEtf={onSelectEtf}
                    favorites={favorites}
                />

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
                                disabled
                                className="menu-item"
                            >
                                Version Check
                            </button>
                            <button
                                onClick={openUpdateAllWindow}
                                className="menu-item"
                            >
                                Update All (1day)
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
        </div>
    );
};

export default Layout;
