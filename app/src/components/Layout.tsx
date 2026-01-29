import React from 'react';
import Sidebar from './Sidebar';
import '../styles.css';

interface LayoutProps {
    children: React.ReactNode;
    rightPanel?: React.ReactNode;
    favorites?: Set<string>;
    onSelectEtf: (etfCode: string) => void;
}

const Layout: React.FC<LayoutProps> = ({ children, rightPanel, onSelectEtf, favorites }) => {
    const [isSidebarOpen, setIsSidebarOpen] = React.useState(true);
    const [isRightSidebarOpen, setIsRightSidebarOpen] = React.useState(true);

    return (
        <div style={{ display: 'flex', height: '100vh', width: '100vw', position: 'relative' }}>
            {/* Left Sidebar Toggle Button - Floating */}
            <button
                onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                style={{
                    position: 'absolute',
                    left: isSidebarOpen ? '260px' : '10px',
                    top: '15px',
                    zIndex: 100,
                    width: '30px',
                    height: '30px',
                    borderRadius: '50%',
                    border: 'none',
                    background: 'var(--primary-color)',
                    color: 'white',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: 'left 0.3s ease',
                    boxShadow: '0 2px 10px rgba(0,0,0,0.3)'
                }}
                title={isSidebarOpen ? "왼쪽 사이드바 접기" : "왼쪽 사이드바 펼치기"}
            >
                {isSidebarOpen ? '<<' : '>>'}
            </button>

            {/* Left Sidebar */}
            <aside
                className="glass-panel"
                style={{
                    width: isSidebarOpen ? '260px' : '0px',
                    margin: isSidebarOpen ? '16px' : '16px 0 16px 0',
                    display: 'flex',
                    flexDirection: 'column',
                    overflow: 'hidden',
                    transition: 'all 0.3s ease',
                    opacity: isSidebarOpen ? 1 : 0,
                    pointerEvents: isSidebarOpen ? 'auto' : 'none'
                }}
            >
                <div style={{ padding: '20px', borderBottom: 'var(--glass-border)', display: 'flex', justifyContent: 'center' }}>
                    <h1 style={{
                        margin: 0,
                        fontSize: '1.2rem',
                        fontWeight: 700,
                        background: 'linear-gradient(to right, #3b82f6, #f43f5e)',
                        WebkitBackgroundClip: 'text',
                        WebkitTextFillColor: 'transparent',
                        whiteSpace: 'nowrap'
                    }}>
                        Active ETF Viewer
                    </h1>
                </div>
                <div style={{ flex: 1, overflowY: 'auto' }}>
                    <Sidebar onSelectEtf={onSelectEtf} favorites={favorites} />
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
                        right: isRightSidebarOpen ? '316px' : '10px', // 300px width + 16px margin
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
                        width: isRightSidebarOpen ? '300px' : '0px',
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
