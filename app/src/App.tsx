import { useState, useEffect } from 'react';
import Layout from './components/Layout';
import Dashboard from './components/Dashboard';
import UpdateAllWindow from './components/UpdateAllWindow';
import { invoke } from '@tauri-apps/api/core';
import { check } from '@tauri-apps/plugin-updater';
import { ask } from '@tauri-apps/plugin-dialog';
import { relaunch } from '@tauri-apps/plugin-process';

function App() {
    const [selectedEtf, setSelectedEtf] = useState<string>('');
    const [rightPanelContent, setRightPanelContent] = useState<React.ReactNode>(null);
    const [favorites, setFavorites] = useState<Set<string>>(new Set());
    const [isChangelogOpen, setIsChangelogOpen] = useState(false);

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

    const [hash, setHash] = useState(window.location.hash);

    useEffect(() => {
        const handleHashChange = () => setHash(window.location.hash);
        window.addEventListener('hashchange', handleHashChange);
        return () => window.removeEventListener('hashchange', handleHashChange);
    }, []);

    if (hash === '#update-all') {
        return <UpdateAllWindow />;
    }

    return (
        <Layout
            onSelectEtf={setSelectedEtf}
            rightPanel={rightPanelContent}
            favorites={favorites}
            isChangelogOpen={isChangelogOpen}
            setIsChangelogOpen={setIsChangelogOpen}
        >
            <Dashboard
                etfCode={selectedEtf}
                setRightPanelContent={setRightPanelContent}
                favorites={favorites}
                onToggleFavorite={toggleFavorite}
            />
        </Layout>
    );
}

export default App;
