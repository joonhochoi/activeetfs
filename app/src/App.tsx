import { useState, useEffect } from 'react';
import Layout from './components/Layout';
import Dashboard from './components/Dashboard';
import { invoke } from '@tauri-apps/api/core';

function App() {
    const [selectedEtf, setSelectedEtf] = useState<string>('');
    const [rightPanelContent, setRightPanelContent] = useState<React.ReactNode>(null);
    const [favorites, setFavorites] = useState<Set<string>>(new Set());

    useEffect(() => {
        // Fetch favorites on init
        invoke<string[]>('get_favorite_etfs').then((codes) => {
            setFavorites(new Set(codes));
        }).catch(console.error);
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

    return (
        <Layout
            onSelectEtf={setSelectedEtf}
            rightPanel={rightPanelContent}
            favorites={favorites}
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
