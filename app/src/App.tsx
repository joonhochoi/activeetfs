import { useState, useEffect } from 'react';
import Layout from './components/Layout';
import Dashboard from './components/Dashboard';
import CompareView from './components/CompareView';
import UpdateAllWindow from './components/UpdateAllWindow';
import UpdateTodayWindow from './components/UpdateTodayWindow';
import SelectEtfsWindow from './components/SelectEtfsWindow';
import { invoke } from '@tauri-apps/api/core';
import { check } from '@tauri-apps/plugin-updater';
import { ask } from '@tauri-apps/plugin-dialog';
import { relaunch } from '@tauri-apps/plugin-process';

function App() {
    const [selectedEtf, setSelectedEtf] = useState<string>('');
    const [rightPanelContent, setRightPanelContent] = useState<React.ReactNode>(null);
    const [favorites, setFavorites] = useState<Set<string>>(new Set());
    const [isChangelogOpen, setIsChangelogOpen] = useState(false);
    // 검색 탭에서 선택한 ETF 비교(메인 뷰에 차트 대신 표시). null이면 일반 대시보드.
    const [compareState, setCompareState] = useState<{ codes: string[]; highlight: string[] } | null>(null);

    useEffect(() => {
        // Fetch favorites on init
        invoke<string[]>('get_favorite_etfs').then((codes) => {
            setFavorites(new Set(codes));
        }).catch(console.error);

        // Check for updates
        const checkForUpdates = async () => {
            try {
                const update = await check();
                if (update) {
                    const yes = await ask(`새로운 버전(${update.version})이 존재합니다.\n업데이트하시겠습니까?`, {
                        title: '업데이트 알림',
                        kind: 'info',
                    });
                    if (yes) {
                        await update.downloadAndInstall();
                        await relaunch();
                    }
                }
            } catch (error) {
                console.error('Failed to check for updates:', error);
            }
        };
        checkForUpdates();

        // Check for version change (automatic changelog)
        invoke<boolean>('check_and_update_version')
            .then(isUpdated => {
                if (isUpdated) {
                    setIsChangelogOpen(true);
                }
            })
            .catch(console.error);
    }, []);

    const toggleFavorite = async (etfCode: string) => {
        try {
            const newState = await invoke<boolean>('toggle_etf_favorite', { etfCode });
            setFavorites(prev => {
                const next = new Set(prev);
                if (newState) {
                    next.add(etfCode);
                } else {
                    next.delete(etfCode);
                }
                return next;
            });
        } catch (err) {
            console.error('Failed to toggle favorite:', err);
        }
    };

    // 검색 탭에서 선택한 ETF들의 구성을 메인 뷰에서 비교한다.
    const handleCompareEtfs = (codes: string[], highlight: string[] = []) => {
        setRightPanelContent(null); // 비교 모드에서는 우측 패널 비움
        setCompareState({ codes, highlight });
    };

    // 사이드바에서 개별 ETF를 고르면 비교 모드를 해제하고 일반 대시보드로 전환.
    const handleSelectEtf = (code: string) => {
        setCompareState(null);
        setSelectedEtf(code);
    };

    const [hash, setHash] = useState(window.location.hash);

    useEffect(() => {
        const handleHashChange = () => setHash(window.location.hash);
        window.addEventListener('hashchange', handleHashChange);
        return () => window.removeEventListener('hashchange', handleHashChange);
    }, []);

    if (hash === '#update-all') {
        return <UpdateAllWindow />;
    }

    if (hash === '#update-today') {
        return <UpdateTodayWindow />;
    }

    if (hash === '#select-etfs') {
        return <SelectEtfsWindow />;
    }

    return (
        <Layout
            onSelectEtf={handleSelectEtf}
            onCompareEtfs={handleCompareEtfs}
            rightPanel={rightPanelContent}
            favorites={favorites}
            isChangelogOpen={isChangelogOpen}
            setIsChangelogOpen={setIsChangelogOpen}
        >
            {compareState ? (
                <CompareView
                    codes={compareState.codes}
                    highlightStocks={compareState.highlight}
                    onClose={() => setCompareState(null)}
                />
            ) : (
                <Dashboard
                    etfCode={selectedEtf}
                    setRightPanelContent={setRightPanelContent}
                    favorites={favorites}
                    onToggleFavorite={toggleFavorite}
                />
            )}
        </Layout>
    );
}

export default App;
